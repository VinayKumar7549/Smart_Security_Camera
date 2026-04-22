"""
Email notification system for motion alerts.

Uses SMTP (Gmail or configurable) to send real email alerts when motion is detected.
Environment variables: EMAIL_USER, EMAIL_PASS (or SMTP_USER, SMTP_PASSWORD as fallback).
"""

from __future__ import annotations

import os
import smtplib
import sys
import time
import traceback
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import database

_SERVER_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SERVER_DIR.parent

# Rate limiting: minimum seconds between emails per recipient
_MIN_EMAIL_INTERVAL = 30
_last_email_times: dict[str, float] = {}


def _load_env() -> None:
    """Load .env from server/ first, then repo root."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for path in (_SERVER_DIR / ".env", _REPO_ROOT / ".env"):
        if path.is_file():
            load_dotenv(path, override=True)


_load_env()


def _get_smtp_config() -> dict[str, str | int | bool]:
    """Read SMTP config from environment with sensible defaults."""
    _load_env()
    return {
        "host": os.environ.get("SMTP_HOST", "smtp.gmail.com").strip(),
        "port": int(os.environ.get("SMTP_PORT", "465")),
        "user": (
            os.environ.get("EMAIL_USER", "").strip()
            or os.environ.get("SMTP_USER", "").strip()
            or os.environ.get("ALERT_FROM_EMAIL", "").strip()
        ),
        "password": (
            os.environ.get("EMAIL_PASS", "").strip()
            or os.environ.get("SMTP_PASSWORD", "").strip()
        ),
        "use_starttls": os.environ.get("SMTP_USE_STARTTLS", "").strip().lower()
        in ("1", "true", "yes"),
    }


def send_motion_alert(
    email: str,
    camera_name: str,
    timestamp: str,
    recording_filename: str | None = None,
) -> bool:
    """
    Send a motion alert email via SMTP.

    Args:
        email: Recipient email address.
        camera_name: Name of the camera that detected motion.
        timestamp: Human-readable timestamp string.
        recording_filename: Optional filename for a link to the recording.

    Returns:
        True if the email was sent successfully, False otherwise.
    """
    # Rate limiting
    now = time.monotonic()
    last_sent = _last_email_times.get(email, 0.0)
    if now - last_sent < _MIN_EMAIL_INTERVAL:
        print(
            f"[notifications] Rate limited: skipping email to {email} "
            f"(last sent {now - last_sent:.0f}s ago)",
            file=sys.stderr,
        )
        return False

    cfg = _get_smtp_config()
    smtp_host = str(cfg["host"])
    smtp_port = int(cfg["port"])  # type: ignore[arg-type]
    smtp_user = str(cfg["user"])
    smtp_password = str(cfg["password"])
    use_starttls = bool(cfg["use_starttls"])

    if not smtp_host or not smtp_password or not smtp_user:
        print(
            "[notifications] SMTP not configured. "
            "Set EMAIL_USER + EMAIL_PASS (or SMTP_USER + SMTP_PASSWORD) in server/.env",
            file=sys.stderr,
        )
        return False

    # Build email
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Motion Detected \U0001f6a8"
    msg["From"] = smtp_user
    msg["To"] = email

    # Plain text body
    text_body = (
        f"Motion Detected!\n\n"
        f"Camera: {camera_name}\n"
        f"Time: {timestamp}\n"
    )
    if recording_filename:
        text_body += f"Recording: {recording_filename}\n"
    text_body += "\n— Smart Security Camera System"

    # HTML body
    html_body = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0f1923; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 24px 28px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
          \U0001f6a8 Motion Detected
        </h1>
      </div>
      <div style="padding: 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #94a3b8; font-size: 13px; border-bottom: 1px solid #1e293b;">Camera</td>
            <td style="padding: 10px 0; color: #f1f5f9; font-size: 14px; font-weight: 500; text-align: right; border-bottom: 1px solid #1e293b;">{camera_name}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #94a3b8; font-size: 13px; border-bottom: 1px solid #1e293b;">Time</td>
            <td style="padding: 10px 0; color: #f1f5f9; font-size: 14px; font-weight: 500; text-align: right; border-bottom: 1px solid #1e293b;">{timestamp}</td>
          </tr>
          {"<tr><td style='padding: 10px 0; color: #94a3b8; font-size: 13px;'>Recording</td><td style='padding: 10px 0; color: #38bdf8; font-size: 14px; text-align: right;'>" + recording_filename + "</td></tr>" if recording_filename else ""}
        </table>
        <p style="margin-top: 24px; color: #64748b; font-size: 12px; line-height: 1.5;">
          This is an automated alert from your Smart Security Camera system.
          Log in to your dashboard to review footage.
        </p>
      </div>
      <div style="background: #0a1018; padding: 16px 28px; text-align: center;">
        <p style="margin: 0; color: #475569; font-size: 11px;">Smart Security Camera System</p>
      </div>
    </div>
    """

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if use_starttls:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(smtp_user, smtp_password)
                smtp.sendmail(smtp_user, [email], msg.as_string())
        else:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
                smtp.login(smtp_user, smtp_password)
                smtp.sendmail(smtp_user, [email], msg.as_string())

        _last_email_times[email] = now
        print(f"Email sent successfully to {email}", file=sys.stderr)
        return True

    except smtplib.SMTPAuthenticationError as exc:
        print(
            f"[notifications] SMTP auth failed: {exc}. "
            "Check EMAIL_USER / EMAIL_PASS in .env",
            file=sys.stderr,
        )
    except smtplib.SMTPException as exc:
        print(f"[notifications] SMTP error: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    except OSError as exc:
        print(f"[notifications] Network error sending email: {exc}", file=sys.stderr)

    return False


def resolve_motion_notification_camera_id() -> int:
    """
    DB cameras.id used for motion emails (single stream).

    Uses the lowest camera id that has an assigned operator.
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


def get_camera_name_by_id(camera_id: int) -> str:
    """Get the camera name from the database."""
    for c in database.get_all_cameras():
        if c["id"] == camera_id:
            return str(c.get("camera_name", f"Camera {camera_id}"))
    return f"Camera {camera_id}"


def notify_motion_for_camera(camera_id: int, recording_filename: str | None = None) -> None:
    """
    Notify the user assigned to this camera when motion is detected.
    Sends a real email via SMTP if configured and user has notifications enabled.
    """
    user = database.get_user_assigned_to_camera(camera_id)
    if user is None:
        print(
            f"[notifications] Skip: no user assigned to camera id={camera_id}.",
            file=sys.stderr,
        )
        return

    if not user.get("email_notifications"):
        print(
            f"[notifications] Skip: email alerts off for user id={user.get('id')}.",
            file=sys.stderr,
        )
        return

    raw = user.get("email")
    if not raw or not str(raw).strip():
        print(
            f"[notifications] Skip: user id={user.get('id')} ({user.get('username')}) "
            "has no email address.",
            file=sys.stderr,
        )
        return

    to_addr = str(raw).strip()
    camera_name = get_camera_name_by_id(camera_id)
    timestamp = datetime.now().strftime("%B %d, %Y at %I:%M:%S %p")

    print(
        f"[notifications] Sending motion alert for camera '{camera_name}' "
        f"-> {user.get('username')} <{to_addr}>",
        file=sys.stderr,
    )

    send_motion_alert(
        email=to_addr,
        camera_name=camera_name,
        timestamp=timestamp,
        recording_filename=recording_filename,
    )
