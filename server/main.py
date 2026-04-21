"""
FastAPI backend for the smart security camera system.
"""

import errno
import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse

BASE_DIR = Path(__file__).resolve().parent
ALERTS_PATH = BASE_DIR / "alerts.json"
RECORDINGS_DIR = BASE_DIR / "recordings"

# ESP32-CAM MJPEG endpoint.
stream_url = "http://10.2.10.176:81/stream"

# Shared live frame state for API access.
latest_frame = None
frame_lock = threading.Lock()

# Motion detection settings.
MAX_DISPLAY_WIDTH = 960
GAUSSIAN_KERNEL = (5, 5)
DIFF_THRESHOLD = 25
MIN_CONTOUR_AREA = 800
DILATE_ITERATIONS = 1

# Recording settings.
NO_MOTION_SECONDS = 5.0
OUTPUT_FPS = 15.0

# Alerts write lock and retry behavior.
_alerts_lock = threading.Lock()
_RENAME_ATTEMPTS = 10
_RENAME_DELAY_SEC = 0.05

app = FastAPI(title="Smart Security Camera API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _replace_with_retry(src: Path, dst: Path) -> bool:
    """Replace dst with src, retrying transient Windows lock errors."""
    for attempt in range(_RENAME_ATTEMPTS):
        try:
            os.replace(src, dst)
            return True
        except OSError as exc:
            err = getattr(exc, "errno", None)
            transient = isinstance(exc, PermissionError) or err in (
                errno.EACCES,
                errno.EPERM,
                errno.EBUSY,
                errno.EAGAIN,
            )
            if not transient:
                raise
            if attempt < _RENAME_ATTEMPTS - 1:
                time.sleep(_RENAME_DELAY_SEC * (attempt + 1))
    return False


def _write_alerts_payload(payload: str, tmp_path: Path | None) -> None:
    """Persist JSON payload atomically when possible."""
    parent = ALERTS_PATH.parent
    parent.mkdir(parents=True, exist_ok=True)
    temp_file = (
        tmp_path
        if tmp_path is not None
        else parent / f"{ALERTS_PATH.stem}.{uuid.uuid4().hex}.tmp"
    )
    try:
        with open(temp_file, "w", encoding="utf-8", newline="\n") as tmp_f:
            tmp_f.write(payload)
            tmp_f.flush()
            os.fsync(tmp_f.fileno())
        replaced = _replace_with_retry(temp_file, ALERTS_PATH)
        if not replaced:
            with open(ALERTS_PATH, "w", encoding="utf-8", newline="\n") as out_f:
                out_f.write(payload)
                out_f.flush()
                os.fsync(out_f.fileno())
    finally:
        try:
            if temp_file.exists():
                temp_file.unlink()
        except OSError:
            pass


def _append_alert_to_file(entry: dict) -> None:
    """Append one alert entry into alerts.json."""
    data = []
    if ALERTS_PATH.exists():
        try:
            with open(ALERTS_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, list):
                data = loaded
        except (json.JSONDecodeError, OSError):
            data = []
    data.append(entry)
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    tmp_path = ALERTS_PATH.parent / f"{ALERTS_PATH.stem}.{uuid.uuid4().hex}.tmp"
    _write_alerts_payload(payload, tmp_path)


def schedule_alert_log(entry: dict) -> None:
    """Write an alert on a daemon thread so capture is not blocked."""

    def _run() -> None:
        with _alerts_lock:
            try:
                _append_alert_to_file(entry)
            except OSError as exc:
                print(f"Error: could not write alerts: {exc}", file=sys.stderr)
            except (TypeError, ValueError) as exc:
                print(f"Error: invalid alert data: {exc}", file=sys.stderr)

    threading.Thread(target=_run, daemon=True).start()


def run_stream_processor() -> None:
    """Continuously capture frames, detect motion, and record clips."""
    global latest_frame
    # pylint: disable=no-member
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)

    prev_gray = None
    writer = None
    last_motion_time = None

    try:
        while True:
            if not cap.isOpened():
                print("Stream lost, reconnecting...", file=sys.stderr)
                try:
                    cap.release()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(2)
                cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                prev_gray = None
                if writer is not None:
                    writer.release()
                    writer = None
                    last_motion_time = None
                continue

            ok, frame = cap.read()
            if not ok or frame is None:
                print("Stream lost, reconnecting...", file=sys.stderr)
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                prev_gray = None
                if writer is not None:
                    writer.release()
                    writer = None
                    last_motion_time = None
                continue

            h, w = frame.shape[:2]
            if w > MAX_DISPLAY_WIDTH:
                scale = MAX_DISPLAY_WIDTH / float(w)
                new_h = max(1, int(round(h * scale)))
                frame = cv2.resize(
                    frame, (MAX_DISPLAY_WIDTH, new_h), interpolation=cv2.INTER_AREA
                )

            original_frame = frame.copy()
            display_frame = frame.copy()
            gray = cv2.cvtColor(display_frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, GAUSSIAN_KERNEL, 0)

            if prev_gray is None:
                prev_gray = gray
                with frame_lock:
                    latest_frame = original_frame.copy()
                continue

            frame_diff = cv2.absdiff(prev_gray, gray)
            _, thresh = cv2.threshold(
                frame_diff, DIFF_THRESHOLD, 255, cv2.THRESH_BINARY
            )
            thresh = cv2.dilate(thresh, dilate_kernel, iterations=DILATE_ITERATIONS)

            contours, _ = cv2.findContours(
                thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            motion_detected = False
            for contour in contours:
                if cv2.contourArea(contour) < MIN_CONTOUR_AREA:
                    continue
                motion_detected = True
                x, y, cw, ch = cv2.boundingRect(contour)
                cv2.rectangle(display_frame, (x, y), (x + cw, y + ch), (0, 255, 0), 2)

            if motion_detected:
                cv2.putText(
                    display_frame,
                    "Motion Detected",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA,
                )

            now = time.monotonic()
            if motion_detected:
                last_motion_time = now
                if writer is None:
                    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    out_path = str(RECORDINGS_DIR / f"recording_{ts}.mp4")
                    height, width = original_frame.shape[:2]
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    writer = cv2.VideoWriter(
                        out_path, fourcc, OUTPUT_FPS, (width, height)
                    )
                    if not writer.isOpened():
                        print(
                            f"Error: could not open video writer for {out_path}",
                            file=sys.stderr,
                        )
                        writer = None
                        last_motion_time = None
                    else:
                        schedule_alert_log(
                            {
                                "timestamp": datetime.now().isoformat(timespec="seconds"),
                                "video_filename": Path(out_path).name,
                                "event_type": "motion_detected",
                            }
                        )

            if writer is not None:
                writer.write(original_frame)
                if last_motion_time is not None and (
                    now - last_motion_time >= NO_MOTION_SECONDS
                ):
                    writer.release()
                    writer = None
                    last_motion_time = None

            if writer is not None:
                cv2.putText(
                    display_frame,
                    "Recording...",
                    (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 255),
                    2,
                    cv2.LINE_AA,
                )

            prev_gray = gray
            with frame_lock:
                latest_frame = display_frame.copy()
            time.sleep(0.01)
    except Exception as exc:  # noqa: BLE001
        print(f"Error: stream processor stopped unexpectedly: {exc}", file=sys.stderr)
    finally:
        if writer is not None:
            writer.release()
        cap.release()


@app.on_event("startup")
def start_stream_processor() -> None:
    """Start stream processing in the background (single ESP32 connection)."""
    thread = getattr(app.state, "stream_thread", None)
    if thread is not None and thread.is_alive():
        return
    app.state.stream_thread = threading.Thread(
        target=run_stream_processor,
        daemon=True,
    )
    app.state.stream_thread.start()


def _recording_file_path(filename: str) -> Path:
    """Resolve a recording path under recordings/ and block path traversal."""
    if not filename or filename.strip() != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    candidate = (RECORDINGS_DIR / filename).resolve()
    try:
        candidate.relative_to(RECORDINGS_DIR.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    return candidate


def _video_media_type(name: str) -> str:
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    return {
        "avi": "video/x-msvideo",
        "mp4": "video/mp4",
        "webm": "video/webm",
        "mov": "video/quicktime",
    }.get(ext, "application/octet-stream")


@app.get("/alerts")
def get_alerts():
    """Return the contents of alerts.json as JSON."""
    if not ALERTS_PATH.is_file():
        raise HTTPException(status_code=404, detail="alerts.json not found")
    try:
        with open(ALERTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500, detail="alerts.json is not valid JSON"
        ) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not isinstance(data, list):
        raise HTTPException(
            status_code=500, detail="alerts.json must contain a JSON array"
        )
    return data


@app.get("/recordings")
def list_recordings():
    """List filenames in the recordings folder."""
    if not RECORDINGS_DIR.is_dir():
        return []
    try:
        names = sorted(p.name for p in RECORDINGS_DIR.iterdir() if p.is_file())
        return names
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/recordings/{filename}")
def get_recording(filename: str):
    """Stream a recording file (e.g. for browser playback)."""
    path = _recording_file_path(filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Recording not found")
    try:
        return FileResponse(
            path,
            media_type=_video_media_type(filename),
            filename=filename,
        )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/live-frame")
def get_live_frame():
    """Return the latest processed frame as JPEG."""
    with frame_lock:
        frame = None if latest_frame is None else latest_frame.copy()

    if frame is None:
        raise HTTPException(status_code=503, detail="No frame available yet")

    # pylint: disable=no-member
    ok, encoded = cv2.imencode(".jpg", frame)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode frame")
    return Response(content=encoded.tobytes(), media_type="image/jpeg")


@app.get("/live-stream")
def get_live_stream():
    """Stream the latest processed frame continuously as multipart MJPEG."""

    def generate_mjpeg():
        # Infinite stream loop for browser MJPEG playback.
        while True:
            with frame_lock:
                frame = None if latest_frame is None else latest_frame.copy()

            if frame is None:
                time.sleep(0.05)
                continue

            # pylint: disable=no-member
            ok, encoded = cv2.imencode(".jpg", frame)
            if not ok:
                time.sleep(0.01)
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + encoded.tobytes() + b"\r\n"
            )
            time.sleep(0.03)

    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/health")
def get_health():
    """Basic health status for stream thread and live frame availability."""
    thread = getattr(app.state, "stream_thread", None)
    with frame_lock:
        has_frame = latest_frame is not None
    return {
        "status": "ok",
        "stream_thread_alive": bool(thread and thread.is_alive()),
        "live_frame_available": has_frame,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
