"""
Email notification hooks.

Loads server/.env when this module is imported so SMTP_* work even if the app
entrypoint does not call load_dotenv first.

Default sender: ALERT_FROM_EMAIL (demo329032@gmail.com).
Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER + SMTP_PASSWORD (app password, no spaces).
Port 587 + STARTTLS: set SMTP_USE_STARTTLS=1 and SMTP_PORT=587.
"""

from __future__ import annotations

import os
import smtplib
import sys
import traceback
from email.mime.text import MIMEText
from pathlib import Path

import database

_SERVER_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SERVER_DIR.parent


def _load_env() -> None:
    """Load .env from server/ first, then repo root (override so file wins over empty env)."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for path in (_SERVER_DIR / ".env", _REPO_ROOT / ".env"):
        if path.is_file():
            load_dotenv(path, override=True)


_load_env()


def env_diagnostic() -> str:
    """Where we look for config (for error messages)."""
    parts = []
    for path in (_SERVER_DIR / ".env", _REPO_ROOT / ".env"):
        parts.append(f"{path}={'yes' if path.is_file() else 'no'}")
    return " | ".join(parts)


def resolve_motion_notification_camera_id() -> int:
    """
    DB cameras.id used for motion emails (single stream).

    Uses the lowest camera id that has an assigned operator—no .env setting.
    If none are assigned, returns the first camera row id (or 1 if the table is empty).
    """
    for c in database.get_all_cameras():
        if c.get("assigned_user_id") is None:
            continue
        cid = int(c["id"])
        if database.get_user_assigned_to_camera(cid) is not None:
            return cid
    all_c = database.get_all_cameras()
    if all_c:
        return int(all_c[0]["id"])
    return 1


def alert_from_email() -> str:
    return os.environ.get("ALERT_FROM_EMAIL", "demo329032@gmail.com").strip()


def send_email(to_email: str) -> None:
    """
    Send motion alert email, or log a placeholder if SMTP is not configured.
    """
    _load_env()
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    smtp_user = os.environ.get("SMTP_USER", alert_from_email()).strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    use_starttls = os.environ.get("SMTP_USE_STARTTLS", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    body = (
        "Motion was detected on a camera assigned to your account.\n\n"
        "This is an automated message from your Smart Security Camera system."
    )
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = "Security camera: motion alert"
    msg["From"] = smtp_user
    msg["To"] = to_email

    if smtp_host and smtp_password:
        try:
            if use_starttls:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.ehlo()
                    smtp.login(smtp_user, smtp_password)
                    smtp.sendmail(smtp_user, [to_email], msg.as_string())
            else:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
                    smtp.login(smtp_user, smtp_password)
                    smtp.sendmail(smtp_user, [to_email], msg.as_string())
            print(
                f"[notifications] SMTP OK: sent from {smtp_user} to {to_email}",
                file=sys.stderr,
            )
            return
        except Exception as exc:  # noqa: BLE001
            print(
                f"[notifications] SMTP FAILED ({type(exc).__name__}): {exc}",
                file=sys.stderr,
            )
            traceback.print_exc(file=sys.stderr)

    if not smtp_host or not smtp_password:
        print(
            "[notifications] SMTP not configured: need non-empty SMTP_HOST and SMTP_PASSWORD.",
            file=sys.stderr,
        )
        print(f"[notifications] Checked: {env_diagnostic()}", file=sys.stderr)
        print(
            f"[notifications] Current env: SMTP_HOST={'set' if smtp_host else 'EMPTY'} "
            f"SMTP_PASSWORD={'set' if smtp_password else 'EMPTY'} (len={len(smtp_password)})",
            file=sys.stderr,
        )
        print(
            f"[notifications] Put variables in server/.env (same folder as main.py) or repo-root .env. "
            f"Would send to: {to_email}",
            file=sys.stderr,
        )
    else:
        print(
            f"[notifications] After SMTP failure, check password (16 chars, no spaces) and Gmail app password.",
            file=sys.stderr,
        )


def notify_motion_for_camera(camera_id: int) -> None:
    """
    Notify the user assigned to this camera when motion is detected.
    """
    user = database.get_user_assigned_to_camera(camera_id)
    if user is None:
        print(
            f"[notifications] Skip: no user assigned to camera id={camera_id}. "
            f"In Admin → Assign camera to user, pick this camera and an operator with an email.",
            file=sys.stderr,
        )
        return
    if not user.get("email_notifications"):
        print(
            f"[notifications] Skip: mail alerts off for user id={user.get('id')} "
            f"(Dashboard → Settings).",
            file=sys.stderr,
        )
        return
    raw = user.get("email")
    if not raw or not str(raw).strip():
        print(
            f"[notifications] Skip: user id={user.get('id')} ({user.get('username')}) has no email address. "
            f"Edit the operator in Admin and add an email.",
            file=sys.stderr,
        )
        return
    to_addr = str(raw).strip()
    print(
        f"[notifications] Motion alert for camera id={camera_id} -> user {user.get('username')} <{to_addr}>",
        file=sys.stderr,
    )
    send_email(to_addr)
