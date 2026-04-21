"""
FastAPI backend for the smart security camera system.
"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

BASE_DIR = Path(__file__).resolve().parent
ALERTS_PATH = BASE_DIR / "alerts.json"
RECORDINGS_DIR = BASE_DIR / "recordings"

app = FastAPI(title="Smart Security Camera API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
