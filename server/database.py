"""
SQLite persistence for users and cameras (stdlib sqlite3 only).
Database file: app.db next to this package.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"


def _hash_password(plain: str) -> str:
    """SHA-256 hex digest for stored passwords (upgrade to argon2 in production)."""
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create tables if they do not exist."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0,
                email_notifications INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_name TEXT NOT NULL,
                assigned_user_id INTEGER,
                FOREIGN KEY (assigned_user_id) REFERENCES users(id)
            );
            """
        )
        conn.commit()
    seed_defaults()
    _migrate_assigned_users_mail_alerts_on()
    ensure_admin_credentials()


def ensure_admin_credentials() -> None:
    """
    Ensure username `admin` exists with password `1234` and is_admin=1.
    SKIP_ADMIN_PASSWORD_RESET=1 keeps the existing admin password hash.
    """
    skip = os.environ.get("SKIP_ADMIN_PASSWORD_RESET", "").strip() in (
        "1",
        "true",
        "yes",
    )
    hashed = _hash_password("1234")
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", ("admin",)
        ).fetchone()
        if row is None:
            create_user(
                "admin",
                "1234",
                email=None,
                phone=None,
                is_admin=True,
                email_notifications=True,
            )
            return
        if skip:
            return
        conn.execute(
            """
            UPDATE users
            SET password = ?, is_admin = 1
            WHERE username = ?
            """,
            (hashed, "admin"),
        )
        conn.commit()


def seed_defaults() -> None:
    """First boot: default admin user and one camera row."""
    with _connect() as conn:
        n_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if n_users == 0:
            create_user(
                "admin",
                "1234",
                email=None,
                phone=None,
                is_admin=True,
                email_notifications=True,
            )
        n_cam = conn.execute("SELECT COUNT(*) FROM cameras").fetchone()[0]
        if n_cam == 0:
            row = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
            assign_uid = int(row[0]) if row else None
            conn.execute(
                "INSERT INTO cameras (camera_name, assigned_user_id) VALUES (?, ?)",
                ("Main camera", assign_uid),
            )
            conn.commit()


def _migrate_assigned_users_mail_alerts_on() -> None:
    """
    One-time: users assigned to a camera get email_notifications=1 so motion mail works.
    PRAGMA user_version bumps after running (existing DBs upgrade once).
    """
    with _connect() as conn:
        row = conn.execute("PRAGMA user_version").fetchone()
        ver = int(row[0]) if row is not None else 0
        if ver >= 1:
            return
        conn.execute(
            """
            UPDATE users SET email_notifications = 1
            WHERE id IN (
                SELECT DISTINCT assigned_user_id FROM cameras
                WHERE assigned_user_id IS NOT NULL
            )
            """
        )
        conn.execute("PRAGMA user_version = 1")
        conn.commit()


def _user_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    raw_en = row["email_notifications"]
    en = bool(int(raw_en)) if raw_en is not None else True
    return {
        "id": row["id"],
        "username": row["username"],
        "password": row["password"],
        "email": row["email"],
        "phone": row["phone"],
        "is_admin": bool(row["is_admin"]),
        "email_notifications": en,
    }


def create_user(
    username: str,
    password: str,
    email: str | None = None,
    phone: str | None = None,
    *,
    is_admin: bool = False,
    email_notifications: bool = True,
) -> int:
    """
    Insert a user. Password is stored as a SHA-256 hash.
    Returns the new user's id.
    Raises sqlite3.IntegrityError on duplicate username.
    """
    pw = _hash_password(password)
    is_ad = 1 if is_admin else 0
    en = 1 if email_notifications else 0
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (
                username, password, email, phone, is_admin, email_notifications
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (username.strip(), pw, email, phone, is_ad, en),
        )
        conn.commit()
        return int(cur.lastrowid)


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    """Return user dict or None. Password field is the stored hash."""
    with _connect() as conn:
        cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return None if row is None else _user_row_to_dict(row)


def get_user_by_username(username: str) -> dict[str, Any] | None:
    """Return user dict or None. Password field is the stored hash."""
    with _connect() as conn:
        cur = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (username.strip(),),
        )
        row = cur.fetchone()
        return None if row is None else _user_row_to_dict(row)


def get_all_users() -> list[dict[str, Any]]:
    """Return all users, ordered by id."""
    with _connect() as conn:
        cur = conn.execute("SELECT * FROM users ORDER BY id ASC")
        return [_user_row_to_dict(row) for row in cur.fetchall()]


def get_all_cameras() -> list[dict[str, Any]]:
    """All cameras with assignment, ordered by id."""
    with _connect() as conn:
        cur = conn.execute(
            "SELECT id, camera_name, assigned_user_id FROM cameras ORDER BY id ASC"
        )
        return [
            {
                "id": row["id"],
                "camera_name": row["camera_name"],
                "assigned_user_id": row["assigned_user_id"],
            }
            for row in cur.fetchall()
        ]


def get_user_assigned_to_camera(camera_id: int) -> dict[str, Any] | None:
    """Return the user row for this camera when assigned_user_id is set."""
    with _connect() as conn:
        cur = conn.execute(
            """
            SELECT u.* FROM cameras c
            INNER JOIN users u ON u.id = c.assigned_user_id
            WHERE c.id = ?
            """,
            (camera_id,),
        )
        row = cur.fetchone()
        return None if row is None else _user_row_to_dict(row)


def _count_admins() -> int:
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1"
        ).fetchone()
        return int(row[0]) if row is not None else 0


def admin_apply_user_updates(user_id: int, updates: dict[str, Any]) -> None:
    """
    Partial update for admin. Keys: username, email, phone, password (plain, non-empty), is_admin,
    email_notifications. Raises ValueError if user missing or would remove the only admin.
    """
    current = get_user_by_id(user_id)
    if current is None:
        raise ValueError("User not found")

    new_is_admin = updates["is_admin"] if "is_admin" in updates else current["is_admin"]
    if current["username"] == "admin" and "is_admin" in updates and not updates["is_admin"]:
        raise ValueError("Cannot remove admin role from the built-in admin account")
    if current["is_admin"] and not new_is_admin:
        if _count_admins() <= 1:
            raise ValueError("Cannot remove admin role from the only admin account")

    sets: list[str] = []
    params: list[Any] = []

    if "username" in updates:
        u = str(updates["username"]).strip()
        if not u:
            raise ValueError("Username cannot be empty")
        sets.append("username = ?")
        params.append(u)
    if "email" in updates:
        em = updates["email"]
        if em is None or (isinstance(em, str) and not em.strip()):
            sets.append("email = ?")
            params.append(None)
        else:
            sets.append("email = ?")
            params.append(str(em).strip())
    if "phone" in updates:
        ph = updates["phone"]
        if ph is None or (isinstance(ph, str) and not ph.strip()):
            sets.append("phone = ?")
            params.append(None)
        else:
            sets.append("phone = ?")
            params.append(str(ph).strip())
    if "password" in updates:
        pw = str(updates["password"])
        if pw:
            sets.append("password = ?")
            params.append(_hash_password(pw))
    if "is_admin" in updates:
        sets.append("is_admin = ?")
        params.append(1 if updates["is_admin"] else 0)
    if "email_notifications" in updates:
        sets.append("email_notifications = ?")
        params.append(1 if updates["email_notifications"] else 0)

    if not sets:
        return

    params.append(user_id)
    with _connect() as conn:
        conn.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        conn.commit()


def delete_user(user_id: int) -> None:
    """
    Remove user and clear camera assignments. Raises ValueError for missing user,
    built-in admin, only admin, or invalid state.
    """
    current = get_user_by_id(user_id)
    if current is None:
        raise ValueError("User not found")
    if current["username"] == "admin":
        raise ValueError("Cannot delete the built-in admin account")
    if current["is_admin"] and _count_admins() <= 1:
        raise ValueError("Cannot delete the only admin account")

    with _connect() as conn:
        conn.execute(
            "UPDATE cameras SET assigned_user_id = NULL WHERE assigned_user_id = ?",
            (user_id,),
        )
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()


def update_user_email_notifications(user_id: int, enabled: bool) -> None:
    """Persist email_notifications for motion mail."""
    flag = 1 if enabled else 0
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE users SET email_notifications = ? WHERE id = ?",
            (flag, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError(f"No user with id {user_id}")


def assign_camera_to_user(camera_id: int, user_id: int) -> None:
    """
    Set cameras.assigned_user_id for an existing camera row.
    Raises ValueError if the camera id does not exist.
    Raises sqlite3.IntegrityError if user_id is not a valid user.
    """
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE cameras SET assigned_user_id = ? WHERE id = ?",
            (user_id, camera_id),
        )
        if cur.rowcount == 0:
            raise ValueError(f"No camera with id {camera_id}")
        conn.execute(
            "UPDATE users SET email_notifications = 1 WHERE id = ?",
            (user_id,),
        )
        conn.commit()


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Compare a plain password to the stored hash from get_user_by_username."""
    return _hash_password(plain_password) == stored_hash
