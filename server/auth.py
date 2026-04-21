"""
HMAC-signed bearer tokens (stdlib only). User identity is re-loaded from SQLite on each request.
"""

from __future__ import annotations

import hmac
import hashlib
import os
import time
from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import database

SECRET = os.environ.get("AUTH_SECRET", "smart-security-dev-secret").encode()

security = HTTPBearer(auto_error=False)


def make_token(user_id: int, is_admin: bool) -> str:
    exp = int(time.time()) + 7 * 86400
    payload = f"{user_id}:{int(is_admin)}:{exp}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def parse_token(token: str) -> tuple[int, bool] | None:
    try:
        body, sig = token.rsplit(":", 1)
        expected = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        uid_s, is_ad_s, exp_s = body.split(":", 2)
        if int(exp_s) < int(time.time()):
            return None
        return int(uid_s), bool(int(is_ad_s))
    except (ValueError, IndexError):
        return None


def user_public(user: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in user.items() if k != "password"}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    parsed = parse_token(credentials.credentials)
    if parsed is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    uid, _ = parsed
    user = database.get_user_by_id(uid)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
