"""
FastAPI backend for the smart security camera system.
"""

import errno
import json
import os
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv

    # Prefer server/.env; also load repo-root .env if present (common on Windows).
    for _env in (BASE_DIR / ".env", BASE_DIR.parent / ".env"):
        if _env.is_file():
            load_dotenv(_env, override=True)
except ImportError:
    pass

import cv2
import auth
import database
import notifications
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
ALERTS_PATH = BASE_DIR / "alerts.json"
RECORDINGS_DIR = BASE_DIR / "recordings"
COMPLETED_RECORDINGS_PATH = BASE_DIR / "completed_recordings.json"

_completed_recordings_lock = threading.Lock()
_completed_filenames: set[str] = set()

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


class LoginBody(BaseModel):
    username: str
    password: str


class AdminCreateUserBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None


class AdminUpdateUserBody(BaseModel):
    username: str | None = None
    email: str | None = None
    phone: str | None = None
    password: str | None = None
    is_admin: bool | None = None
    email_notifications: bool | None = None


class AssignCameraBody(BaseModel):
    camera_id: int
    user_id: int


class UserSettingsBody(BaseModel):
    email_notifications: bool


@app.get("/users/me")
def get_me(user: dict = Depends(auth.get_current_user)):
    """Current user profile (from database, no password)."""
    return auth.user_public(user)


@app.patch("/users/me/settings")
def patch_my_settings(
    body: UserSettingsBody,
    user: dict = Depends(auth.get_current_user),
):
    database.update_user_email_notifications(user["id"], body.email_notifications)
    updated = database.get_user_by_id(user["id"])
    if updated is None:
        raise HTTPException(status_code=500, detail="User not found")
    return auth.user_public(updated)


@app.post("/auth/login")
def login(body: LoginBody):
    """Authenticate against SQLite; returns a bearer token and public user fields."""
    user = database.get_user_by_username(body.username)
    if user is None or not database.verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth.make_token(user["id"], user["is_admin"])
    return {"token": token, "user": auth.user_public(user)}


@app.get("/admin/users")
def admin_list_users(_admin: dict = Depends(auth.require_admin)):
    users = database.get_all_users()
    return [auth.user_public(u) for u in users]


@app.post("/admin/users", status_code=201)
def admin_create_user(
    body: AdminCreateUserBody,
    _admin: dict = Depends(auth.require_admin),
):
    try:
        uid = database.create_user(
            body.username,
            body.password,
            email=body.email,
            phone=body.phone,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username already taken") from exc
    user = database.get_user_by_id(uid)
    if user is None:
        raise HTTPException(status_code=500, detail="Failed to load new user")
    return auth.user_public(user)


@app.patch("/admin/users/{user_id}")
def admin_patch_user(
    user_id: int,
    body: AdminUpdateUserBody,
    _admin: dict = Depends(auth.require_admin),
):
    raw = body.model_dump(exclude_unset=True)
    if "password" in raw and not (raw.get("password") or "").strip():
        del raw["password"]
    try:
        database.admin_apply_user_updates(user_id, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username already taken") from exc
    user = database.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return auth.user_public(user)


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    _admin: dict = Depends(auth.require_admin),
):
    if user_id == _admin["id"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account while logged in",
        )
    try:
        database.delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/admin/cameras")
def admin_list_cameras(_admin: dict = Depends(auth.require_admin)):
    return database.get_all_cameras()


@app.post("/admin/cameras/assign")
def admin_assign_camera(
    body: AssignCameraBody,
    _admin: dict = Depends(auth.require_admin),
):
    try:
        database.assign_camera_to_user(body.camera_id, body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    return {"ok": True}


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


def _persist_completed_recordings_to_disk() -> None:
    """Persist completed filenames; caller must hold _completed_recordings_lock."""
    payload = json.dumps(sorted(_completed_filenames), indent=2, ensure_ascii=False)
    parent = COMPLETED_RECORDINGS_PATH.parent
    parent.mkdir(parents=True, exist_ok=True)
    temp_file = parent / f"{COMPLETED_RECORDINGS_PATH.stem}.{uuid.uuid4().hex}.tmp"
    try:
        with open(temp_file, "w", encoding="utf-8", newline="\n") as tmp_f:
            tmp_f.write(payload)
            tmp_f.flush()
            os.fsync(tmp_f.fileno())
        replaced = _replace_with_retry(temp_file, COMPLETED_RECORDINGS_PATH)
        if not replaced:
            with open(COMPLETED_RECORDINGS_PATH, "w", encoding="utf-8", newline="\n") as out_f:
                out_f.write(payload)
                out_f.flush()
                os.fsync(out_f.fileno())
    finally:
        try:
            if temp_file.exists():
                temp_file.unlink()
        except OSError:
            pass


def register_completed_recording(filename: str) -> None:
    """Expose a recording via the API only after it is fully finalized."""
    if not filename or not filename.endswith(".mp4"):
        return
    if filename.endswith("_fixed.mp4"):
        return
    with _completed_recordings_lock:
        _completed_filenames.add(filename)
        _persist_completed_recordings_to_disk()


def load_completed_recordings_from_disk() -> None:
    """Load completed set on startup; migrate from folder if JSON is missing."""
    global _completed_filenames
    with _completed_recordings_lock:
        if COMPLETED_RECORDINGS_PATH.is_file():
            try:
                with open(COMPLETED_RECORDINGS_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    _completed_filenames = {
                        str(x)
                        for x in data
                        if isinstance(x, str) and x.endswith(".mp4")
                    }
                else:
                    _completed_filenames = set()
            except (json.JSONDecodeError, OSError):
                _completed_filenames = set()
        else:
            RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
            _completed_filenames = {
                p.name
                for p in RECORDINGS_DIR.glob("*.mp4")
                if p.is_file() and not p.name.endswith("_fixed.mp4")
            }
            if _completed_filenames:
                _persist_completed_recordings_to_disk()


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


def _run_ffmpeg_after_recording(input_path: str) -> None:
    """Run ffmpeg once after VideoWriter.release(); register only if conversion succeeds."""
    if not input_path or not os.path.isfile(input_path):
        return

    filename = Path(input_path).name
    output_path = input_path.replace(".mp4", "_fixed.mp4")

    print("Starting ffmpeg conversion...")

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-i",
                input_path,
                "-vcodec",
                "libx264",
                "-acodec",
                "aac",
                output_path,
                "-y",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        print("FFMPEG FAILED: ffmpeg not found on PATH")
        return
    except OSError as exc:
        print(f"FFMPEG FAILED: {exc}")
        return

    print("FFMPEG ERROR:", result.stderr)

    if os.path.exists(output_path):
        try:
            os.remove(input_path)
            os.rename(output_path, input_path)
        except OSError as exc:
            print(f"FFMPEG FAILED: {exc}")
            try:
                if os.path.isfile(output_path):
                    os.remove(output_path)
            except OSError:
                pass
            return
        print("Video converted successfully")
        register_completed_recording(filename)
    else:
        print("FFMPEG FAILED")


def run_stream_processor() -> None:
    """Continuously capture frames, detect motion, and record clips."""
    global latest_frame
    # pylint: disable=no-member
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)

    prev_gray = None
    writer = None
    recording = False
    recording_path = None
    recording_size = None
    last_motion_time = None

    def stop_recording_and_convert() -> None:
        """Release writer, then run ffmpeg exactly once (not inside the frame loop)."""
        nonlocal writer, recording, recording_path, recording_size, last_motion_time
        if not recording or writer is None:
            return
        path_to_convert = recording_path
        writer.release()
        print("Recording saved successfully", file=sys.stderr)
        writer = None
        recording_path = None
        recording_size = None
        last_motion_time = None
        recording = False
        if path_to_convert:
            _run_ffmpeg_after_recording(path_to_convert)

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
                stop_recording_and_convert()
                continue

            ok, frame = cap.read()
            if not ok or frame is None:
                print("Stream lost, reconnecting...", file=sys.stderr)
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                prev_gray = None
                stop_recording_and_convert()
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
                if not recording:
                    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    out_path = str(RECORDINGS_DIR / f"recording_{ts}.mp4")
                    width = original_frame.shape[1]
                    height = original_frame.shape[0]
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    recording_size = (width, height)
                    writer = cv2.VideoWriter(
                        out_path, fourcc, OUTPUT_FPS, recording_size
                    )
                    if not writer.isOpened():
                        print(
                            f"Error: could not open video writer for {out_path}",
                            file=sys.stderr,
                        )
                        writer = None
                        recording_path = None
                        recording_size = None
                        last_motion_time = None
                        recording = False
                    else:
                        recording = True
                        recording_path = out_path
                        _rec_filename = Path(out_path).name
                        schedule_alert_log(
                            {
                                "timestamp": datetime.now().isoformat(timespec="seconds"),
                                "video_filename": _rec_filename,
                                "event_type": "motion_detected",
                            }
                        )
                        try:
                            notifications.notify_motion_for_camera(
                                notifications.resolve_motion_notification_camera_id(),
                                recording_filename=_rec_filename,
                            )
                        except Exception as exc:  # noqa: BLE001
                            print(
                                f"Motion email notification error: {exc}",
                                file=sys.stderr,
                            )

            if recording and writer is not None:
                frame_to_write = original_frame
                if recording_size is not None and (
                    frame_to_write.shape[1] != recording_size[0]
                    or frame_to_write.shape[0] != recording_size[1]
                ):
                    frame_to_write = cv2.resize(
                        frame_to_write, recording_size, interpolation=cv2.INTER_AREA
                    )
                writer.write(frame_to_write)
                if last_motion_time is not None and (
                    now - last_motion_time >= NO_MOTION_SECONDS
                ):
                    stop_recording_and_convert()

            if recording and writer is not None:
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
        stop_recording_and_convert()
        cap.release()


@app.on_event("startup")
def start_stream_processor() -> None:
    """Start stream processing in the background (single ESP32 connection)."""
    database.init_db()
    load_completed_recordings_from_disk()
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


@app.get("/cameras/status")
def get_camera_status():
    """Return camera online/offline status based on stream thread and frame availability."""
    thread = getattr(app.state, "stream_thread", None)
    with frame_lock:
        has_frame = latest_frame is not None
    cameras = database.get_all_cameras()
    result = []
    for cam in cameras:
        result.append({
            "id": cam["id"],
            "camera_name": cam["camera_name"],
            "assigned_user_id": cam.get("assigned_user_id"),
            "online": bool(thread and thread.is_alive() and has_frame),
        })
    return result


@app.get("/alerts/count")
def get_alert_count():
    """Return the number of alerts in the last 24 hours."""
    if not ALERTS_PATH.is_file():
        return {"count": 0}
    try:
        with open(ALERTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"count": 0}
    if not isinstance(data, list):
        return {"count": 0}
    now = datetime.now()
    count = 0
    for entry in data:
        ts = entry.get("timestamp", "")
        try:
            alert_time = datetime.fromisoformat(ts)
            if (now - alert_time).total_seconds() < 86400:
                count += 1
        except (ValueError, TypeError):
            count += 1
    return {"count": count, "total": len(data)}


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
    """List finalized recordings only (not files still recording or converting)."""
    if not RECORDINGS_DIR.is_dir():
        return []
    try:
        with _completed_recordings_lock:
            stale = [
                n
                for n in _completed_filenames
                if not (RECORDINGS_DIR / n).is_file()
            ]
            for n in stale:
                _completed_filenames.discard(n)
            if stale:
                _persist_completed_recordings_to_disk()
            return sorted(
                n for n in _completed_filenames if (RECORDINGS_DIR / n).is_file()
            )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/recordings/{filename}")
def get_recording(filename: str):
    """Stream a recording file (e.g. for browser playback)."""
    with _completed_recordings_lock:
        if filename not in _completed_filenames:
            raise HTTPException(status_code=404, detail="Recording not found")
    path = _recording_file_path(filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Recording not found")
    if path.suffix.lower() != ".mp4":
        raise HTTPException(status_code=400, detail="Only .mp4 recordings are supported")
    try:
        return FileResponse(
            path,
            media_type="video/mp4",
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
