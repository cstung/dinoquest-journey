from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.models import User
from backend.schemas.auth import LoginRequest, RegisterRequest, UserOut, WsTokenOut
from backend.security import create_access_token, create_ws_token, hash_password, verify_password

router = APIRouter()


def _apply_auth_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    is_prod = settings.environment == "production"
    cookie_domain = settings.cookie_domain.strip() or None
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=86400 * settings.access_token_expire_days,
        domain=cookie_domain,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    filters = [User.username == body.username]
    if body.email:
        filters.append(User.email == body.email)

    existing = (await db.execute(select(User).where(or_(*filters)))).scalar_one_or_none()

    if existing:
        if existing.username == body.username:
            raise HTTPException(status_code=400, detail="Username already taken")
        raise HTTPException(status_code=400, detail="Email already in use")

    user_count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    is_first_user = user_count == 0

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        global_role="superadmin" if is_first_user else "user",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _apply_auth_cookie(response, create_access_token(user.id))
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    _apply_auth_cookie(response, create_access_token(user.id))
    return UserOut.model_validate(user)


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> Response:
    settings = get_settings()
    cookie_domain = settings.cookie_domain.strip() or None
    response.delete_cookie(
        key="access_token",
        domain=cookie_domain,
        path="/",
        httponly=True,
        secure=settings.environment == "production",
        samesite="none" if settings.environment == "production" else "lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.get("/ws-token", response_model=WsTokenOut)
async def ws_token(current_user: User = Depends(get_current_user)) -> WsTokenOut:
    settings = get_settings()
    return WsTokenOut(
        ws_token=create_ws_token(current_user.id),
        expires_in_seconds=settings.ws_token_expire_minutes * 60,
    )
