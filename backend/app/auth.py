import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

security = HTTPBearer()


@dataclass
class AuthUser:
    sub: str
    role: str  # "superadmin" | "owner"


def create_access_token(subject: str, role: str = "superadmin") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiration_hours)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_admin_credentials(username: str, password: str) -> bool:
    username_match = hmac.compare_digest(username, settings.admin_user)
    password_match = hmac.compare_digest(password, settings.admin_pass)
    return username_match and password_match


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """Validates JWT and returns AuthUser. Accepts both superadmin and owner tokens."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        sub: str | None = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        role = payload.get("role", "superadmin")  # backwards compat
        return AuthUser(sub=sub, role=role)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


async def get_current_owner(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """Validates JWT and requires owner role."""
    auth = await get_current_admin(credentials)
    if auth.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a proprietários")
    return auth


async def get_current_superadmin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """Validates JWT and requires superadmin role. Use for system-wide management endpoints."""
    auth = await get_current_admin(credentials)
    if auth.role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito ao administrador do sistema")
    return auth
