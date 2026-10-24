from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.models import Family, FamilyMember, User
from backend.schemas.auth import LoginRequest, RegisterRequest, UserOut, WsTokenOut
from backend.services.invite_service import claim_invite, resolve_invite
from backend.security import create_access_token, create_ws_token, hash_password, verify_password

router = APIRouter()


async def _build_user_out(user: User, db: AsyncSession) -> UserOut:
    active_family_id: int | None = None
    active_family_name: str | None = None
    role: str | None = None

    if user.global_role != "superadmin":
        membership = (
            await db.execute(
                select(FamilyMember, Family)
                .join(Family, Family.id == FamilyMember.family_id)
                .where(
                    FamilyMember.user_id == user.id,
                    Family.is_deleted.is_(False),
                )
                .order_by(FamilyMember.joined_at.asc())
                .limit(1)
            )
        ).one_or_none()
        if membership:
            member_row, family_row = membership
            active_family_id = family_row.id
            active_family_name = family_row.name
            role = member_row.role

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        global_role=user.global_role,
        created_at=user.created_at,
        active_family_id=active_family_id,
        active_family_name=active_family_name,
        role=role,
    )


def _apply_auth_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    is_prod = settings.environment == "production"
    cookie_domain = settings.cookie_domain.strip() or None
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
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

    invite = None
    if not is_first_user:
        invite_code = (body.invite_code or "").replace(" ", "")
        if not invite_code:
            raise HTTPException(status_code=422, detail="inviteCode is required")
        # Validate before hashing so bad codes are cheap to reject and rate-limited.
        invite, _ = await resolve_invite(db, code=invite_code)

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=await run_in_threadpool(hash_password, body.password),
        global_role="superadmin" if is_first_user else "user",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if invite is not None:
        db.add(
            FamilyMember(
                family_id=invite.family_id,
                user_id=user.id,
                role=invite.role,
            )
        )
        await claim_invite(db, invite, user.id)

    await db.commit()
    await db.refresh(user)

    _apply_auth_cookie(response, create_access_token(user.id))
    return await _build_user_out(user, db)


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user or not await run_in_threadpool(verify_password, body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    _apply_auth_cookie(response, create_access_token(user.id))
    return await _build_user_out(user, db)


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
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    return await _build_user_out(current_user, db)


@router.get("/ws-token", response_model=WsTokenOut)
async def ws_token(current_user: User = Depends(get_current_user)) -> WsTokenOut:
    settings = get_settings()
    return WsTokenOut(
        ws_token=create_ws_token(current_user.id),
        expires_in_seconds=settings.ws_token_expire_minutes * 60,
    )
