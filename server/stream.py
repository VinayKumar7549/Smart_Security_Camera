"""
Display an ESP32-CAM MJPEG stream using OpenCV with motion detection and recording.

Stream URL format: http://<ip>:81/stream
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

# ESP32-CAM MJPEG endpoint (replace <ip> with your board's IP address)
stream_url = "http://10.2.10.176:81/stream"

# Max width for display; height scales to preserve aspect ratio
MAX_DISPLAY_WIDTH = 960

# Motion detection (tuned for real-time MJPEG)
GAUSSIAN_KERNEL = (5, 5)  # odd size; smaller = faster
DIFF_THRESHOLD = 25  # pixel difference to count as motion
MIN_CONTOUR_AREA = 800  # ignore smaller blobs (noise)
DILATE_ITERATIONS = 1

# Recording
RECORDINGS_DIR = Path(__file__).resolve().parent / "recordings"
NO_MOTION_SECONDS = 5.0
OUTPUT_FPS = 20.0

# Alerts (JSON array in alerts.json; writes are async and file updates are locked)
ALERTS_PATH = Path(__file__).resolve().parent / "alerts.json"
_alerts_lock = threading.Lock()
_RENAME_ATTEMPTS = 10
_RENAME_DELAY_SEC = 0.05


def _replace_with_retry(src: Path, dst: Path) -> bool:
    """
    Replace dst with src using os.replace after src is fully closed.
    Retries on typical Windows transient locks (AV, indexer, other readers).
    """
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
    """
    Write full JSON text to disk: prefer atomic rename from a unique temp file.
    The temp file is fully closed (context manager) before os.replace runs.
    If rename fails after retries, fall back to writing alerts.json directly.
    """
    parent = ALERTS_PATH.parent
    parent.mkdir(parents=True, exist_ok=True)

    temp_file = tmp_path if tmp_path is not None else (
        parent / f"{ALERTS_PATH.stem}.{uuid.uuid4().hex}.tmp"
    )

    try:
        with open(temp_file, "w", encoding="utf-8", newline="\n") as tmp_f:
            tmp_f.write(payload)
            tmp_f.flush()
            os.fsync(tmp_f.fileno())
        # Handle closed — required on Windows before replace/move

        try:
            replaced = _replace_with_retry(temp_file, ALERTS_PATH)
        except OSError as exc:
            print(
                f"Warning: could not rename temp alerts file ({exc}); "
                "using direct write.",
                file=sys.stderr,
            )
            replaced = False

        if not replaced:
            try:
                with open(ALERTS_PATH, "w", encoding="utf-8", newline="\n") as out_f:
                    out_f.write(payload)
                    out_f.flush()
                    os.fsync(out_f.fileno())
            except OSError as exc:
                print(
                    f"Error: could not write alerts (fallback): {exc}",
                    file=sys.stderr,
                )
                raise
    finally:
        try:
            if temp_file.exists():
                temp_file.unlink()
        except OSError:
            pass


def _append_alert_to_file(entry: dict) -> None:
    """Read alerts array, append entry, persist valid JSON (caller must hold lock)."""
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
    """Queue a disk append on a daemon thread so the capture loop is not blocked."""

    def _run() -> None:
        with _alerts_lock:
            try:
                _append_alert_to_file(entry)
            except OSError as exc:
                print(
                    f"Error: could not write alerts (permission or I/O): {exc}",
                    file=sys.stderr,
                )
            except (TypeError, ValueError) as exc:
                print(f"Error: invalid alert data for JSON: {exc}", file=sys.stderr)

    threading.Thread(target=_run, daemon=True).start()


def main() -> None:
    """Open the MJPEG stream, show frames, and release resources on exit."""
    # OpenCV is C-extension backed; static analysis does not list all attributes.
    # pylint: disable=no-member
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        print(f"Error: could not open stream at {stream_url}", file=sys.stderr)
        print(
            "Check the IP address, port 81, and that the camera firmware is running.",
            file=sys.stderr,
        )
        sys.exit(1)

    window_name = "ESP32-CAM MJPEG"
    prev_gray = None
    writer = None
    last_motion_time = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                print("Error: failed to read frame from stream.", file=sys.stderr)
                break

            h, w = frame.shape[:2]
            if w > MAX_DISPLAY_WIDTH:
                scale = MAX_DISPLAY_WIDTH / float(w)
                new_w = MAX_DISPLAY_WIDTH
                new_h = max(1, int(round(h * scale)))
                frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

            # Same timestep: clean pixels for file, annotated copy for UI only
            original_frame = frame.copy()
            display_frame = frame.copy()

            gray = cv2.cvtColor(display_frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, GAUSSIAN_KERNEL, 0)

            if prev_gray is None:
                prev_gray = gray
                cv2.imshow(window_name, display_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
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
                cv2.rectangle(
                    display_frame, (x, y), (x + cw, y + ch), (0, 255, 0), 2
                )

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
                    oh, ow = original_frame.shape[:2]
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    writer = cv2.VideoWriter(
                        out_path, fourcc, OUTPUT_FPS, (ow, oh)
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

            cv2.imshow(window_name, display_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
    except KeyboardInterrupt:
        pass
    finally:
        if writer is not None:
            writer.release()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
