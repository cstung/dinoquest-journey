# DinoQuest v3 — Backend Implementation Plan

> ⚠️ **Superseded in part** by:
> - `C:\Users\Admin\Downloads\dinoquest_v3_backend_plan_corrections.md` (authoritative errata)
> - `C:\Users\Admin\Desktop\dinoquest v3\dinoquest-journey\dinoquest_v3_backend_plan_integrated.md` (consolidated execution plan aligned to current frontend code)
>
> If any section in this document conflicts with either file above, follow those files.

> **Target repo:** `cstung/dinoquest-journey` (frontend already built)
> **Frontend stack confirmed:** React 19 · TanStack Start (SSR) · TanStack Router · TanStack Query v5 · Zustand v5 · shadcn/ui · Tailwind v4 · React Hook Form + Zod · Cloudflare Workers deployment
> **Backend stack:** FastAPI · SQLAlchemy 2 async · SQLite WAL · Alembic · python-jose JWT · pywebpush · yt-dlp · OpenAI
> **Last updated:** May 2026

---

## ⚠️ Critical Frontend Integration Notes (Read First)

Before writing a single line of backend code, every developer must understand these frontend-specific constraints:

### 1. CORS — Mandatory, Not Optional

The frontend is built with `@cloudflare/vite-plugin` and `wrangler.jsonc`, meaning it **may be served from a Cloudflare Workers origin** (e.g., `https://dinoquest.pages.dev`) while the FastAPI backend runs on a LAN server. This means:

- **CORS headers are required on every single response** — including errors.
- Configure `CORSMiddleware` with exact allowed origins from `.env` (never wildcard `*` in production with cookies).
- For local dev, allow both `http://localhost:3000` and `http://localhost:5173`.

### 2. JWT Delivery — Bearer Token, Not HTTP-Only Cookie

HTTP-only cookies **do not work cross-origin** without `SameSite=None; Secure` and a valid HTTPS cert on both ends. For the self-hosted LAN scenario:

- **Use `Authorization: Bearer <token>` header instead of HTTP-only cookie.**
- The frontend's `authStore` (Zustand) holds the JWT in memory. On page reload, the store reads from `localStorage` as fallback.
- The backend returns `{ access_token, token_type: "bearer", user: {...} }` on login/register.
- Every protected endpoint reads `Authorization: Bearer <token>` via a `get_current_user` dependency.

> If the app is later deployed fully on Cloudflare (frontend + backend via Cloudflare Tunnel), cookie mode can be revisited. For now: Bearer.

### 3. TanStack Router — URL Parameter Format

TanStack Router uses `$` prefix for dynamic segments in file-based routing: `_authenticated/families/$familyId/tests/$testId.tsx`. The resulting URL is `/families/123/tests/456`. Backend routes use standard FastAPI path params: `/api/families/{family_id}/tests/{test_id}`. **These must match exactly** — no trailing slashes, no `/v1/` prefix.

### 4. Error Response Shape

TanStack Query surfaces errors from fetch. Every error response **must** follow this exact shape so the frontend can display it via `sonner` toast:

```json
{ "detail": "Human-readable error message here" }
```

FastAPI's default `HTTPException` already produces this. Do not use any other error schema.

### 5. Pagination

TanStack Query's `useInfiniteQuery` hook expects cursor-based pagination. All list endpoints that could grow large (quests, tests, activity log) must return:

```json
{
  "items": [...],
  "next_cursor": "2024-01-15T10:30:00" | null,
  "total": 42
}
```

Small, bounded lists (members, invites) can return flat arrays.

### 6. WebSocket URL

TanStack Query does not manage WebSockets. The frontend has a `useWebSocket` hook that constructs the URL as:

```
ws://<host>/ws/families/<familyId>?token=<jwt>
```

The backend WebSocket endpoint must accept the token as a **query parameter** (not in the header, as browser WebSocket API does not support custom headers).

### 7. Date Format

All datetimes returned from the API must be **ISO 8601 UTC strings** (`2026-05-18T10:30:00Z`). The frontend uses `date-fns` to parse and format. SQLite stores timestamps as text; ensure SQLAlchemy model serialization includes the `Z` suffix or explicit UTC timezone.

---

## Project Structure

```
dinoquest_v3/
├── .env                        # Never committed
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile.api
├── nginx/
│   └── nginx.conf
├── data/                       # SQLite DB volume mount
│   └── dinoquest.db
├── requirements.txt
└── backend/
    ├── main.py                 # FastAPI app factory
    ├── config.py               # pydantic-settings Settings
    ├── database.py             # engine, session, WAL pragmas
    ├── dependencies.py         # get_db, get_current_user, get_active_family, require_parent
    ├── models/
    │   ├── __init__.py
    │   ├── user.py
    │   ├── family.py
    │   ├── family_member.py
    │   ├── family_invite.py
    │   ├── join_request.py
    │   ├── activity_log.py
    │   ├── quest.py
    │   ├── quest_assignment.py
    │   ├── quest_image.py
    │   ├── quiz.py
    │   ├── xp_event.py
    │   ├── user_family_level.py
    │   ├── pet.py
    │   ├── achievement.py
    │   ├── reward_item.py
    │   ├── reward_claim.py
    │   ├── push_subscription.py
    │   ├── video_test.py
    │   ├── test_question.py
    │   ├── test_assignment.py
    │   ├── test_attempt.py
    │   ├── test_attempt_answer.py
    │   └── test_reopen_request.py
    ├── schemas/
    │   ├── auth.py
    │   ├── family.py
    │   ├── invite.py
    │   ├── join_request.py
    │   ├── member.py
    │   ├── quest.py
    │   ├── pet.py
    │   ├── reward.py
    │   ├── leaderboard.py
    │   ├── activity.py
    │   └── video_test.py
    ├── routers/
    │   ├── auth.py
    │   ├── users.py
    │   ├── families.py
    │   ├── invites.py
    │   ├── join_requests.py
    │   ├── members.py
    │   ├── quests.py
    │   ├── pets.py
    │   ├── rewards.py
    │   ├── leaderboard.py
    │   ├── activity_log.py
    │   ├── push.py
    │   ├── admin.py
    │   └── tests.py
    ├── services/
    │   ├── family_service.py
    │   ├── invite_service.py
    │   ├── xp_engine.py
    │   ├── assignment_generator.py
    │   ├── scoring.py
    │   ├── push_service.py
    │   ├── subtitle_service.py
    │   ├── whisper_service.py
    │   ├── quiz_generator.py
    │   └── test_service.py
    ├── ws/
    │   └── manager.py
    └── alembic/
        ├── env.py
        └── versions/
            └── 0001_initial.py
```

---

## Phase 1 — Project Scaffold & Infrastructure

**Goal:** Running FastAPI server with DB connection, WAL enabled, and Alembic initialized. No business logic yet.

### Step 1.1 — Requirements & `.env`

**`requirements.txt`:**
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.36
aiosqlite==0.20.0
alembic==1.13.3
pydantic-settings==2.5.2
pydantic[email]==2.9.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
qrcode[pil]==7.4.2
pywebpush==2.0.1
yt-dlp==2024.11.4
openai==1.54.0
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

**`.env.example`:**
```env
# App
SECRET_KEY=change-me-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
TZ=Asia/Ho_Chi_Minh

# Database
DB_PATH=/app/data/dinoquest.db

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
WHISPER_MODEL=whisper-1
TEST_TRANSCRIPT_MAX_CHARS=12000

# Web Push (VAPID)
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_CLAIMS_EMAIL=admin@dinoquest.local

# Super-admin
SUPER_ADMIN_USERNAME=admin
```

### Step 1.2 — `config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import list

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    secret_key: str
    access_token_expire_days: int = 7
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    db_path: str = "/app/data/dinoquest.db"
    tz: str = "Asia/Ho_Chi_Minh"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    whisper_model: str = "whisper-1"
    test_transcript_max_chars: int = 12000

    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "admin@dinoquest.local"

    super_admin_username: str = "admin"

settings = Settings()
```

### Step 1.3 — `database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from backend.config import settings

DATABASE_URL = f"sqlite+aiosqlite:///{settings.db_path}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

# WAL mode + foreign keys on every new connection
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

### Step 1.4 — Alembic Init

```bash
cd backend
alembic init alembic
```

Edit `alembic/env.py`:
- Set `target_metadata = Base.metadata`
- Set `sqlalchemy.url` from `settings.db_path`
- Use **synchronous** SQLite URL for Alembic (`sqlite:///` not `sqlite+aiosqlite:///`)

```python
# alembic/env.py (key section)
from backend.database import Base
from backend.config import settings
import backend.models  # noqa: F401 — import all models so Alembic sees them

config.set_main_option("sqlalchemy.url", f"sqlite:///{settings.db_path}")
target_metadata = Base.metadata
```

### Step 1.5 — `main.py` — App Factory

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.routers import auth, users, families, invites, join_requests, members
from backend.routers import quests, pets, rewards, leaderboard, activity_log, push, admin, tests
from backend.ws.manager import router as ws_router

def create_app() -> FastAPI:
    app = FastAPI(title="DinoQuest API", version="3.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(families.router, prefix="/api/families", tags=["families"])
    app.include_router(invites.router, prefix="/api/families", tags=["invites"])
    app.include_router(join_requests.router, prefix="/api", tags=["join"])
    app.include_router(members.router, prefix="/api/families", tags=["members"])
    app.include_router(quests.router, prefix="/api/families", tags=["quests"])
    app.include_router(pets.router, prefix="/api/families", tags=["pets"])
    app.include_router(rewards.router, prefix="/api/families", tags=["rewards"])
    app.include_router(leaderboard.router, prefix="/api/families", tags=["leaderboard"])
    app.include_router(activity_log.router, prefix="/api/families", tags=["activity"])
    app.include_router(push.router, prefix="/api", tags=["push"])
    app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
    app.include_router(tests.router, prefix="/api/families", tags=["tests"])
    app.include_router(ws_router)

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "version": "3.0.0"}

    return app

app = create_app()
```

### Step 1.6 — `Dockerfile.api`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system deps for yt-dlp and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY alembic.ini .

# Run Alembic migrations then start server
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 8122"]
```

### Step 1.7 — `docker-compose.yml`

```yaml
version: "3.9"
services:
  nginx:
    image: nginx:alpine
    ports:
      - "5006:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - frontend_dist:/usr/share/nginx/html:ro
    depends_on:
      - api

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    env_file: .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8122/api/health')"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    volumes:
      - frontend_dist:/app/dist

volumes:
  frontend_dist:
```

**`nginx/nginx.conf`:**
```nginx
server {
    listen 80;
    client_max_body_size 10M;

    # Rate limit login: 5 req/min per IP
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://api:8122;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://api:8122;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://api:8122;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        gzip_static on;
    }
}
```

### ✅ Phase 1 Acceptance Criteria

- `docker compose up` starts without errors.
- `GET /api/health` returns `200 {"status": "ok"}`.
- `data/dinoquest.db` is created with all tables after first boot.
- CORS headers present on all responses.

---

## Phase 2 — All SQLAlchemy Models + First Alembic Migration

**Goal:** All 22 tables defined as SQLAlchemy models. A single Alembic migration creates them all. No endpoints yet.

### Step 2.1 — Naming Conventions

- All PKs: `id: Mapped[int]`, `primary_key=True`
- All FKs: `Mapped[int]`, `ForeignKey("table.id")`
- All timestamps: `Mapped[datetime]`, `server_default=func.now()` for `created_at`; nullable for optional times.
- Use `Mapped[...]` typed annotations (SQLAlchemy 2.x style) throughout.

### Step 2.2 — `models/user.py`

```python
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, func
from backend.database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    global_role: Mapped[str] = mapped_column(String(20), default="user")  # "user" | "superadmin"
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.3 — `models/family.py`

```python
class Family(Base):
    __tablename__ = "families"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    motto: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    color_hex: Mapped[str] = mapped_column(String(7), default="#ffdb33")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_deleted: Mapped[bool] = mapped_column(default=False)
    deleted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.4 — `models/family_member.py`

```python
class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (PrimaryKeyConstraint("family_id", "user_id"),)

    family_id: Mapped[int] = mapped_column(ForeignKey("families.id", ondelete="RESTRICT"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "parent" | "child"
    nickname: Mapped[str | None] = mapped_column(String(50))
    avatar_color: Mapped[str | None] = mapped_column(String(7))
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.5 — `models/family_invite.py`

```python
class FamilyInvite(Base):
    __tablename__ = "family_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)   # 6-char code
    qr_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    used_at: Mapped[datetime | None]
    revoked: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.6 — `models/join_request.py`

```python
class JoinRequest(Base):
    __tablename__ = "join_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending"|"approved"|"rejected"
    requested_at: Mapped[datetime] = mapped_column(server_default=func.now())
    resolved_at: Mapped[datetime | None]
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
```

### Step 2.7 — `models/activity_log.py`

```python
class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # event_type examples: "quest_completed", "xp_earned", "level_up",
    #                      "member_joined", "member_removed", "invite_sent",
    #                      "invite_accepted", "role_changed", "test_completed"
    payload_json: Mapped[str | None]  # JSON string
    is_audit: Mapped[bool] = mapped_column(default=False)  # True = admin audit log
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.8 — Quest Models

```python
# models/quest.py
class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None]
    category: Mapped[str | None] = mapped_column(String(30))  # "Daily"|"Learning"|"Creative"|"Epic"
    xp_reward: Mapped[int] = mapped_column(default=10)
    difficulty: Mapped[str | None] = mapped_column(String(20))
    due_date: Mapped[datetime | None]
    is_recurring: Mapped[bool] = mapped_column(default=False)
    recurrence_rule: Mapped[str | None]  # iCal RRULE string
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# models/quest_assignment.py
class QuestAssignment(Base):
    __tablename__ = "quest_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending"|"completed"
    completed_at: Mapped[datetime | None]
    xp_earned: Mapped[int | None]

# models/quest_image.py
class QuestImage(Base):
    __tablename__ = "quest_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id", ondelete="CASCADE"))
    image_path: Mapped[str] = mapped_column(String(500))
```

### Step 2.9 — Progression Models

```python
# models/xp_event.py
class XpEvent(Base):
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    delta: Mapped[int] = mapped_column(nullable=False)  # positive or negative
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# models/user_family_level.py
class UserFamilyLevel(Base):
    __tablename__ = "user_family_levels"
    __table_args__ = (PrimaryKeyConstraint("user_id", "family_id"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    level: Mapped[int] = mapped_column(default=1)
    total_xp: Mapped[int] = mapped_column(default=0)

# models/pet.py
class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    species: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String(50))
    stage: Mapped[str | None] = mapped_column(String(20))  # "egg"|"hatch"|"juvenile"|"adult"
    xp: Mapped[int] = mapped_column(default=0)
    last_fed_at: Mapped[datetime | None]

# models/achievement.py
class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    type: Mapped[str] = mapped_column(String(50))
    tier: Mapped[str] = mapped_column(String(10))  # "Bronze"|"Silver"|"Gold"
    granted_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Step 2.10 — Reward Models

```python
# models/reward_item.py
class RewardItem(Base):
    __tablename__ = "reward_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None]
    xp_cost: Mapped[int | None]
    image_path: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

# models/reward_claim.py
class RewardClaim(Base):
    __tablename__ = "reward_claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("reward_items.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending"|"approved"|"rejected"
    claimed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    approved_at: Mapped[datetime | None]
```

### Step 2.11 — Test Maker Models (all 6 tables)

```python
# models/video_test.py
class VideoTest(Base):
    __tablename__ = "video_tests"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    youtube_url: Mapped[str] = mapped_column(String(500), nullable=False)
    video_id: Mapped[str] = mapped_column(String(20), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    subtitle_source: Mapped[str] = mapped_column(String(20))  # "youtube_auto"|"youtube_manual"|"whisper"
    raw_transcript: Mapped[str] = mapped_column(nullable=False)
    time_limit_sec: Mapped[int] = mapped_column(nullable=False)
    max_xp: Mapped[int] = mapped_column(default=100)
    question_count: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # "draft"|"published"|"archived"
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# models/test_question.py
class TestQuestion(Base):
    __tablename__ = "test_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("video_tests.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(nullable=False)
    question_text: Mapped[str] = mapped_column(nullable=False)
    option_a: Mapped[str] = mapped_column(nullable=False)
    option_b: Mapped[str] = mapped_column(nullable=False)
    option_c: Mapped[str] = mapped_column(nullable=False)
    option_d: Mapped[str] = mapped_column(nullable=False)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False)  # "A"|"B"|"C"|"D"

# models/test_assignment.py
class TestAssignment(Base):
    __tablename__ = "test_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("video_tests.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    assigned_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
    status: Mapped[str] = mapped_column(String(30), default="pending")
    # "pending"|"in_progress"|"completed"|"reopen_requested"|"reopened"

# models/test_attempt.py
class TestAttempt(Base):
    __tablename__ = "test_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("test_assignments.id"))
    attempt_number: Mapped[int] = mapped_column(default=1)
    started_at: Mapped[datetime | None]
    submitted_at: Mapped[datetime | None]
    time_taken_sec: Mapped[int | None]
    score: Mapped[int | None]
    xp_earned: Mapped[int | None]
    is_active: Mapped[bool] = mapped_column(default=True)

# models/test_attempt_answer.py
class TestAttemptAnswer(Base):
    __tablename__ = "test_attempt_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("test_attempts.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("test_questions.id"))
    selected_option: Mapped[str | None] = mapped_column(String(1))  # NULL = timed out
    is_correct: Mapped[bool | None]

# models/test_reopen_request.py
class TestReopenRequest(Base):
    __tablename__ = "test_reopen_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("test_assignments.id"))
    attempt_id: Mapped[int] = mapped_column(ForeignKey("test_attempts.id"))
    requested_at: Mapped[datetime] = mapped_column(server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending"|"approved"|"rejected"
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None]

# models/push_subscription.py
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"))
    endpoint: Mapped[str] = mapped_column(String(1000))
    keys_json: Mapped[str]  # {"p256dh": "...", "auth": "..."}
```

### Step 2.12 — Generate Alembic Migration

In `models/__init__.py`, import every model:
```python
from backend.models.user import User
from backend.models.family import Family
# ... all 22 models
```

Then generate:
```bash
alembic revision --autogenerate -m "initial_schema"
alembic upgrade head
```

Verify: Open `data/dinoquest.db` with `sqlite3`, run `.tables` — must show all 22 tables.

### ✅ Phase 2 Acceptance Criteria

- `alembic upgrade head` runs cleanly with no errors.
- All 22 tables exist in the database.
- `alembic downgrade -1` then `upgrade head` works cleanly.

---

## Phase 3 — Auth Endpoints

**Goal:** Register, Login, Logout, /me. JWT as Bearer token.

### Step 3.1 — `dependencies.py`

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError
from backend.database import get_db
from backend.models.user import User
from backend.models.family_member import FamilyMember
from backend.config import settings

bearer_scheme = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: int = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_active_family(
    family_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FamilyMember:
    """Verifies the current user is a member of the requested family."""
    member = await db.get(FamilyMember, (family_id, current_user.id))
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this family")
    # Also verify family is not soft-deleted
    from backend.models.family import Family
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")
    return member

async def require_parent(
    member: FamilyMember = Depends(get_active_family),
) -> FamilyMember:
    if member.role != "parent":
        raise HTTPException(status_code=403, detail="Parent/Admin role required")
    return member

async def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.global_role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin role required")
    return current_user
```

**JWT helper** (add to `dependencies.py` or a separate `auth_utils.py`):
```python
from datetime import datetime, timedelta, timezone
from jose import jwt

def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.access_token_expire_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.secret_key,
        algorithm="HS256",
    )
```

### Step 3.2 — `schemas/auth.py`

```python
from pydantic import BaseModel, EmailStr, field_validator
import re

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: EmailStr | None = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", v):
            raise ValueError("Username must be 3-30 alphanumeric chars or underscores")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class UserOut(BaseModel):
    id: int
    username: str
    email: str | None
    global_role: str

    model_config = {"from_attributes": True}
```

### Step 3.3 — `routers/auth.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from backend.database import get_db
from backend.models.user import User
from backend.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut
from backend.dependencies import create_access_token, get_current_user

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Username already taken")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=pwd_ctx.hash(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if not user or not pwd_ctx.verify(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )

@router.delete("/logout", status_code=204)
async def logout():
    # JWT is stateless. Client drops the token.
    # If a token blacklist is needed later, implement Redis here.
    return

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
```

### ✅ Phase 3 Acceptance Criteria

- `POST /api/auth/register` with `{username, password}` → `201 {access_token, user}`
- `POST /api/auth/login` → `200 {access_token, user}` or `401`
- `GET /api/auth/me` with `Authorization: Bearer <token>` → `200 {user}` or `401`
- Invalid token → `401 {"detail": "Invalid or expired token"}`
- Duplicate username → `400 {"detail": "Username already taken"}`

---

## Phase 4 — Family Management

**Goal:** Create family, invite system, join flow, member management.

### Step 4.1 — `schemas/family.py`

```python
class FamilyCreate(BaseModel):
    name: str
    motto: str | None = None
    color_hex: str = "#ffdb33"

class FamilyUpdate(BaseModel):
    name: str | None = None
    motto: str | None = None
    color_hex: str | None = None

class FamilyOut(BaseModel):
    id: int
    name: str
    motto: str | None
    avatar_url: str | None
    color_hex: str
    owner_id: int
    created_at: datetime
    model_config = {"from_attributes": True}

class FamilyWithRoleOut(FamilyOut):
    my_role: str  # "parent"|"child" — injected at query time
```

### Step 4.2 — `routers/families.py`

```
GET    /api/families               → list all families the current user belongs to
POST   /api/families               → create a new family (auto-add as parent)
GET    /api/families/{family_id}   → get family detail (member must be in it)
PATCH  /api/families/{family_id}   → update name/motto/color (parent only)
DELETE /api/families/{family_id}   → soft-delete (owner only, triggers auto-promote)
```

**`POST /api/families` Logic:**
1. Validate `name` is not empty.
2. Insert `Family` row with `owner_id = current_user.id`.
3. Insert `FamilyMember` row: `role="parent"`, `family_id=new_family.id`, `user_id=current_user.id`.
4. Write `ActivityLog` `event_type="family_created"`, `is_audit=True`.
5. Return `FamilyOut`.

**`DELETE /api/families/{family_id}` Logic:**
1. Only the `owner_id` can delete (not just any parent).
2. Call `family_service.soft_delete_family(family_id, db)`:
   - Set `is_deleted=True`, `deleted_at=now()`.
   - Write audit log `event_type="family_deleted"`.
3. Return `204`.

### Step 4.3 — `services/family_service.py` — Key Functions

**`auto_promote_or_delete(family_id, leaving_user_id, db)`:**
```python
async def auto_promote_or_delete(family_id: int, leaving_user_id: int, db: AsyncSession):
    """Called when the current owner leaves or is removed."""
    family = await db.get(Family, family_id)
    if family.owner_id != leaving_user_id:
        return  # Not the owner leaving — no promotion needed

    next_owner = (await db.execute(
        select(FamilyMember)
        .where(
            FamilyMember.family_id == family_id,
            FamilyMember.role == "parent",
            FamilyMember.user_id != leaving_user_id,
        )
        .order_by(FamilyMember.joined_at)
        .limit(1)
    )).scalar_one_or_none()

    if next_owner:
        await db.execute(
            update(Family)
            .where(Family.id == family_id)
            .values(owner_id=next_owner.user_id)
        )
        # Write audit log
        await write_audit(family_id, None, "owner_promoted", {"new_owner": next_owner.user_id}, db)
    else:
        await soft_delete_family(family_id, db)

async def soft_delete_family(family_id: int, db: AsyncSession):
    await db.execute(
        update(Family)
        .where(Family.id == family_id)
        .values(is_deleted=True, deleted_at=func.now())
    )
```

### Step 4.4 — Invite System (`routers/invites.py`)

```
POST   /api/families/{family_id}/invites           → generate new invite code (parent only)
GET    /api/families/{family_id}/invites            → list active invites (parent only)
DELETE /api/families/{family_id}/invites/{inv_id}  → revoke invite (parent only)
GET    /api/families/{family_id}/invite/qr          → return PNG image of QR code
```

**`POST /api/families/{family_id}/invites` Logic:**
1. Require parent role.
2. Generate a 6-character code: `secrets.token_urlsafe(4).upper()[:6]`
3. Generate a UUID for `qr_token`.
4. Set `expires_at = now() + timedelta(days=7)`.
5. Build `join_url = f"{settings.app_base_url}/join?token={qr_token}"`.
6. Insert `FamilyInvite`.
7. Write audit log `event_type="invite_sent"`.
8. Return `{id, code, qr_token, expires_at}`.

**`GET /api/families/{family_id}/invite/qr` Logic:**
1. Get the most recent non-expired, non-revoked invite for this family.
2. Build `join_url`.
3. Generate QR PNG: `qrcode.make(join_url)` → BytesIO.
4. Return `Response(content=png_bytes, media_type="image/png")`.

### Step 4.5 — Join Flow (`routers/join_requests.py`)

```
POST   /api/join                                           → join by code or qr_token
GET    /api/families/{family_id}/join-requests             → list pending (parent only)
PATCH  /api/families/{family_id}/join-requests/{jid}       → approve or reject (parent only)
```

**`POST /api/join` Body:**
```python
class JoinRequest(BaseModel):
    code: str | None = None      # 6-char invite code
    qr_token: str | None = None  # UUID from QR
```

**`POST /api/join` Logic:**
1. Exactly one of `code` or `qr_token` must be provided.
2. Look up `FamilyInvite` where `code == body.code` OR `qr_token == body.qr_token`.
3. Validate:
   - Invite exists and is not `revoked`.
   - `expires_at > now()`.
   - User is not already a member of this family.
   - User has no pending join request for this family.
4. Create `JoinRequest` row with `status="pending"`.
5. Broadcast WS event `join_request_received` to family room (parents see badge update).
6. Return `201 {join_request_id, family_id, family_name, status}`.

**`PATCH /api/families/{family_id}/join-requests/{jid}` Body:**
```python
class JoinDecision(BaseModel):
    action: Literal["approve", "reject"]
```

**Approve Logic:**
1. Set `JoinRequest.status = "approved"`, `resolved_at = now()`, `resolved_by = parent.user_id`.
2. Insert `FamilyMember` with `role="child"`.
3. Mark invite `used_by` / `used_at` if applicable.
4. Write audit log `event_type="join_approved"`.
5. Broadcast `member_joined` WS event to family room.
6. Return updated join request.

**Reject Logic:**
1. Set `status="rejected"`, write audit log.
2. Return updated join request.

### Step 4.6 — Member Management (`routers/members.py`)

```
GET    /api/families/{family_id}/members                       → list members (all roles can see)
PATCH  /api/families/{family_id}/members/{user_id}/role        → change role (parent only)
DELETE /api/families/{family_id}/members/{user_id}             → remove member (parent only)
```

**`DELETE /api/families/{family_id}/members/{user_id}` Logic:**
1. Parent cannot remove themselves via this endpoint (use leave logic instead).
2. Delete `FamilyMember` row (the user's data stays in DB — quests, XP, etc.).
3. Disconnect that user from the family's WS room (send `kicked` event to their connection).
4. If the removed user was the `owner_id`: call `auto_promote_or_delete`.
5. Write audit log `event_type="member_removed"`.

### Step 4.7 — Activity & Audit Logs (`routers/activity_log.py`)

```
GET /api/families/{family_id}/activity   → family activity feed (all parents; children see nothing)
GET /api/families/{family_id}/audit      → admin audit log (parent only, is_audit=True rows)
```

Both return paginated results sorted newest-first, with cursor-based pagination on `created_at`.

```
Response: { items: [...], next_cursor: "2026-05-18T10:00:00Z" | null, total: 50 }
```

Query param: `?cursor=<iso_datetime>&limit=20` (default limit 20, max 100).

### ✅ Phase 4 Acceptance Criteria

- Create family → user appears as `parent` in `family_members`.
- Generate invite code → 6 chars, expires in 7 days.
- Join via code → join request created with `status="pending"`.
- Approve join → user appears in `family_members` with `role="child"`.
- WS event `join_request_received` fires to the family room on join.
- WS event `member_joined` fires to the family room on approval.
- Soft-delete family → `is_deleted=True`; `GET /api/families/{id}` returns `404`.

---

## Phase 5 — WebSocket Manager

**Goal:** Persistent per-family WS rooms that survive connect/disconnect cycles.

### Step 5.1 — `ws/manager.py`

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError
from backend.config import settings

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # family_id → list of (user_id, WebSocket)
        self.rooms: dict[int, list[tuple[int, WebSocket]]] = {}

    async def connect(self, family_id: int, user_id: int, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(family_id, []).append((user_id, ws))

    def disconnect(self, family_id: int, ws: WebSocket):
        connections = self.rooms.get(family_id, [])
        self.rooms[family_id] = [(uid, w) for uid, w in connections if w != ws]

    async def broadcast(self, family_id: int, event: str, data: dict):
        """Broadcast to all connections in a family room."""
        dead = []
        for uid, ws in list(self.rooms.get(family_id, [])):
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        self.rooms[family_id] = [(uid, w) for uid, w in self.rooms.get(family_id, []) if w not in dead]

    async def send_to_user(self, family_id: int, user_id: int, event: str, data: dict):
        """Send only to a specific user's connection in a family room."""
        for uid, ws in list(self.rooms.get(family_id, [])):
            if uid == user_id:
                try:
                    await ws.send_json({"event": event, "data": data})
                except Exception:
                    pass

ws_manager = ConnectionManager()

@router.websocket("/ws/families/{family_id}")
async def family_ws(
    family_id: int,
    ws: WebSocket,
    token: str = Query(...),  # ?token=<jwt>
):
    # Authenticate via token query param (browser WS API does not support custom headers)
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        await ws.close(code=4001)  # 4001 = unauthorized
        return

    await ws_manager.connect(family_id, user_id, ws)
    try:
        while True:
            # Keep connection alive; handle client pings
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(family_id, ws)
```

**Event Catalog — Standard WS Event Shapes:**

| Event Name | Broadcast To | `data` Fields |
|---|---|---|
| `join_request_received` | Family room | `{join_request_id, username, requested_at}` |
| `member_joined` | Family room | `{user_id, username, role}` |
| `quest_completed` | Family room | `{user_id, username, quest_title, xp_earned}` |
| `xp_earned` | Family room | `{user_id, username, delta, total_xp, level}` |
| `level_up` | Family room | `{user_id, username, new_level}` |
| `leaderboard_update` | Family room | `{leaderboard: [{user_id, username, total_xp, level}]}` |
| `test_assigned` | Family room | `{test_id, title, assigned_user_ids}` |
| `test_completed` | Family room | `{test_id, user_id, username, score, total}` |
| `reopen_requested` | Family room | `{reopen_request_id, test_id, user_id, username}` |
| `reopen_resolved` | Target user's connection | `{test_id, status: "approved"|"rejected"}` |
| `kicked` | Target user's connection | `{}` |

### ✅ Phase 5 Acceptance Criteria

- Connect to `ws://localhost:8122/ws/families/1?token=<valid_jwt>` → accepted.
- Connect with invalid token → `close(4001)`.
- `broadcast("quest_completed", ...)` reaches all connected clients in that family room.
- Disconnected client is cleaned up from `rooms` automatically.

---

## Phase 6 — Quest Engine

**Goal:** Full quest CRUD, assignment, completion, XP award.

### Step 6.1 — `schemas/quest.py`

```python
class QuestCreate(BaseModel):
    title: str
    description: str | None = None
    category: Literal["Daily", "Learning", "Creative", "Epic"] | None = None
    xp_reward: int = 10
    difficulty: Literal["Easy", "Medium", "Hard"] | None = None
    due_date: datetime | None = None
    is_recurring: bool = False
    recurrence_rule: str | None = None  # iCal RRULE
    assigned_user_ids: list[int] = []   # children to assign to; empty = unassigned

class QuestOut(BaseModel):
    id: int
    family_id: int
    title: str
    description: str | None
    category: str | None
    xp_reward: int
    difficulty: str | None
    due_date: datetime | None
    is_recurring: bool
    created_by: int
    created_at: datetime
    assignments: list["QuestAssignmentOut"] = []
    model_config = {"from_attributes": True}

class QuestAssignmentOut(BaseModel):
    id: int
    user_id: int
    status: str
    completed_at: datetime | None
    xp_earned: int | None
    model_config = {"from_attributes": True}

class CompleteQuestBody(BaseModel):
    assignment_id: int
```

### Step 6.2 — `routers/quests.py`

```
GET    /api/families/{family_id}/quests                         → list quests in family
POST   /api/families/{family_id}/quests                         → create quest (parent only)
GET    /api/families/{family_id}/quests/{quest_id}              → quest detail
PATCH  /api/families/{family_id}/quests/{quest_id}              → edit quest (parent only)
DELETE /api/families/{family_id}/quests/{quest_id}              → delete quest (parent only)
POST   /api/families/{family_id}/quests/{quest_id}/complete     → mark assignment complete (child marks own)
```

**`POST /api/families/{family_id}/quests/{quest_id}/complete` Logic:**
1. Look up `QuestAssignment` where `quest_id = quest_id`, `user_id = current_user.id`, `family_id = family_id`.
2. Check `status == "pending"` — if already completed, return `400 "Quest already completed"`.
3. Set `status="completed"`, `completed_at=now()`, `xp_earned=quest.xp_reward`.
4. Call `await xp_engine.award_xp(user_id, family_id, delta=quest.xp_reward, reason=f"quest:{quest.id}", db, ws_manager)`.
5. Return `{assignment_id, xp_earned, total_xp, level}`.

### Step 6.3 — `services/xp_engine.py`

This is a central service used by quest completion, test submission, and reward redemption.

```python
# XP level thresholds (level N requires N * 100 cumulative XP)
LEVEL_THRESHOLDS = {1: 0, 2: 100, 3: 250, 4: 450, 5: 700, 6: 1000, 7: 1400, 8: 1900}
# Add more levels as needed; default: level = floor(total_xp / 100) + 1 for simplicity

def xp_to_level(total_xp: int) -> int:
    """Determine level from total XP."""
    level = 1
    for lvl, threshold in sorted(LEVEL_THRESHOLDS.items()):
        if total_xp >= threshold:
            level = lvl
    return level

async def award_xp(
    user_id: int,
    family_id: int,
    delta: int,
    reason: str,
    db: AsyncSession,
    ws: ConnectionManager,
):
    # 1. Insert XP event (delta can be negative for revocations)
    db.add(XpEvent(user_id=user_id, family_id=family_id, delta=delta, reason=reason))

    # 2. Upsert user_family_levels
    ufl = await db.get(UserFamilyLevel, (user_id, family_id))
    if not ufl:
        ufl = UserFamilyLevel(user_id=user_id, family_id=family_id, level=1, total_xp=0)
        db.add(ufl)
    old_level = ufl.level
    ufl.total_xp = max(0, ufl.total_xp + delta)
    new_level = xp_to_level(ufl.total_xp)
    ufl.level = new_level

    # 3. Activity log
    db.add(ActivityLog(
        family_id=family_id, user_id=user_id,
        event_type="xp_earned",
        payload_json=json.dumps({"delta": delta, "total_xp": ufl.total_xp, "reason": reason}),
    ))

    await db.commit()

    # 4. Broadcast XP event
    user = await db.get(User, user_id)
    await ws.broadcast(family_id, "xp_earned", {
        "user_id": user_id, "username": user.username,
        "delta": delta, "total_xp": ufl.total_xp, "level": new_level,
    })

    # 5. Level up event if level changed
    if new_level > old_level:
        db.add(Achievement(user_id=user_id, family_id=family_id, type="level_up", tier="Bronze"))
        db.add(ActivityLog(
            family_id=family_id, user_id=user_id, event_type="level_up",
            payload_json=json.dumps({"new_level": new_level}),
        ))
        await db.commit()
        await ws.broadcast(family_id, "level_up", {
            "user_id": user_id, "username": user.username, "new_level": new_level,
        })

    # 6. Broadcast leaderboard refresh
    leaderboard = await get_family_leaderboard(family_id, db)
    await ws.broadcast(family_id, "leaderboard_update", {"leaderboard": leaderboard})

    return ufl
```

### ✅ Phase 6 Acceptance Criteria

- `POST /api/families/1/quests` with parent token → quest created, assignment rows created for each `assigned_user_ids`.
- Child completes quest → `xp_earned` increases `user_family_levels.total_xp`.
- WS room receives `xp_earned` and `leaderboard_update` events.
- Completing the same quest twice → `400 "Quest already completed"`.

---

## Phase 7 — RPG Layer (Pets, Achievements, Rewards, Leaderboard)

### Step 7.1 — Pets (`routers/pets.py`)

```
GET    /api/families/{family_id}/pets              → get current user's pet in this family
POST   /api/families/{family_id}/pets              → hatch a new pet
PATCH  /api/families/{family_id}/pets/{pet_id}     → rename, feed
```

**Pet Stage Progression Logic** (in `pet_service.py`):
- `egg` → `hatch`: automatically after pet is created (immediate or after 24h, TBD).
- `hatch` → `juvenile`: at `xp >= 100`.
- `juvenile` → `adult`: at `xp >= 300`.
- Feeding increments pet XP by 10 and sets `last_fed_at = now()`.

### Step 7.2 — Leaderboard (`routers/leaderboard.py`)

```
GET /api/families/{family_id}/leaderboard?scope=family|global
```

**Family scope query:**
```python
results = await db.execute(
    select(User.id, User.username, UserFamilyLevel.total_xp, UserFamilyLevel.level)
    .join(UserFamilyLevel, (UserFamilyLevel.user_id == User.id) & (UserFamilyLevel.family_id == family_id))
    .join(FamilyMember, (FamilyMember.user_id == User.id) & (FamilyMember.family_id == family_id))
    .order_by(UserFamilyLevel.total_xp.desc())
)
```

**Global scope query:** Same but aggregate `SUM(total_xp)` across all families.

Response shape (used by WS `leaderboard_update` event too):
```json
[
  { "rank": 1, "user_id": 5, "username": "alice", "total_xp": 850, "level": 6, "avatar_color": "#ff6b35" }
]
```

### Step 7.3 — Rewards (`routers/rewards.py`)

```
GET    /api/families/{family_id}/rewards                      → list reward items
POST   /api/families/{family_id}/rewards                      → create reward (parent only)
DELETE /api/families/{family_id}/rewards/{rid}                → delete reward (parent only)
POST   /api/families/{family_id}/rewards/{rid}/claim          → child claims a reward
GET    /api/families/{family_id}/rewards/claims               → list pending claims (parent only)
PATCH  /api/families/{family_id}/rewards/claims/{cid}         → approve/reject claim (parent only)
```

**Claim Logic:**
1. Check child has enough `total_xp` in `user_family_levels` (≥ `reward.xp_cost`).
2. Deduct XP: call `award_xp(delta=-reward.xp_cost, reason=f"reward:{rid}")`.
3. Insert `RewardClaim` with `status="pending"`.
4. On parent approval: set `approved_at=now()`, `status="approved"`.

### ✅ Phase 7 Acceptance Criteria

- Child hatches pet → `pet.stage = "hatch"`.
- Leaderboard returns all family members sorted by XP.
- Global leaderboard aggregates across all families.
- Child with 200 XP can claim a 150 XP reward; XP deducted immediately on claim, not on approval.

---

## Phase 8 — Test Maker

This is the most complex phase. Read all sub-steps before starting.

### Step 8.1 — `services/subtitle_service.py`

```python
import os, re, subprocess
import yt_dlp

def extract_video_id(url: str) -> str:
    """
    Extract YouTube video_id from URL patterns:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://youtube.com/shorts/VIDEO_ID
    """
    patterns = [
        r"(?:v=)([a-zA-Z0-9_-]{11})",
        r"youtu\.be/([a-zA-Z0-9_-]{11})",
        r"shorts/([a-zA-Z0-9_-]{11})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    raise ValueError("Could not extract video ID from URL")

def validate_youtube_url(url: str) -> str:
    """Raises ValueError if URL is not a valid YouTube URL."""
    if not re.match(r"https?://(www\.)?(youtube\.com|youtu\.be)/", url):
        raise ValueError("URL must be a valid YouTube URL")
    return extract_video_id(url)

async def fetch_subtitle(youtube_url: str) -> tuple[str, str, str, str | None]:
    """
    Returns: (plain_text_transcript, source_label, video_id, thumbnail_url)
    source_label: "youtube_manual" | "youtube_auto" | "whisper"
    Raises: RuntimeError if all methods fail
    """
    video_id = validate_youtube_url(youtube_url)
    tmp_prefix = f"/tmp/dq_{video_id}"

    ydl_opts = {
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "outtmpl": tmp_prefix,
        "quiet": True,
    }
    thumbnail_url = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            thumbnail_url = info.get("thumbnail")
            ydl.download([youtube_url])
    except Exception as e:
        raise RuntimeError(f"yt-dlp failed: {e}")

    # Try manual subtitle first, then auto
    for suffix, label in [
        (f"{tmp_prefix}.en.vtt", "youtube_manual"),
        (f"{tmp_prefix}.en-auto.vtt", "youtube_auto"),
    ]:
        if os.path.exists(suffix):
            text = _parse_vtt(suffix)
            os.remove(suffix)
            return text, label, video_id, thumbnail_url

    # Fallback: Whisper transcription
    audio_path = _download_audio(youtube_url, video_id)
    text = await _whisper_transcribe(audio_path)
    return text, "whisper", video_id, thumbnail_url

def _parse_vtt(path: str) -> str:
    """Strip VTT timing headers and tags, deduplicate adjacent identical lines."""
    with open(path, encoding="utf-8") as f:
        raw = f.read()

    # Remove VTT header, timing lines, tags
    lines = raw.splitlines()
    clean = []
    prev = None
    for line in lines:
        # Skip WEBVTT header, timing lines (contain -->), blank lines
        if line.startswith("WEBVTT") or "-->" in line or not line.strip():
            continue
        # Strip HTML-like tags <...>
        text = re.sub(r"<[^>]+>", "", line).strip()
        if text and text != prev:
            clean.append(text)
            prev = text
    return " ".join(clean)
```

### Step 8.2 — `services/whisper_service.py`

```python
import os
import yt_dlp
from openai import OpenAI
from backend.config import settings

def _download_audio(youtube_url: str, video_id: str) -> str:
    """Download audio-only to /tmp and return file path."""
    audio_path = f"/tmp/dq_audio_{video_id}.mp3"
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": audio_path.replace(".mp3", ""),
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])
    return audio_path

async def _whisper_transcribe(audio_path: str) -> str:
    """Send audio file to OpenAI Whisper and return transcript text."""
    client = OpenAI(api_key=settings.openai_api_key)
    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model=settings.whisper_model,
            file=f,
            response_format="text",
        )
    os.remove(audio_path)  # Clean up after transcription
    return response
```

### Step 8.3 — `services/quiz_generator.py`

```python
import json
from openai import OpenAI
from backend.config import settings

SYSTEM_PROMPT = """You are an educational quiz generator.
Given a video transcript, generate exactly {n} multiple-choice questions in English.
Each question must have 4 options (A, B, C, D) with exactly one correct answer.
Base questions strictly on the transcript content. Do not invent facts.

Respond ONLY with a valid JSON array. No preamble, no markdown, no code fences.
Format:
[
  {{
    "question": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_option": "A"
  }}
]"""

async def generate_questions(transcript: str, n: int) -> list[dict]:
    """
    Returns a list of n question dicts.
    Raises: ValueError if LLM returns malformed JSON or wrong count.
    """
    client = OpenAI(api_key=settings.openai_api_key)

    # Chunk transcript to stay within context
    chunk = transcript[:settings.test_transcript_max_chars]

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(n=n)},
            {"role": "user", "content": chunk},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )

    raw = response.choices[0].message.content
    try:
        # The response_format=json_object guarantees JSON, but may be wrapped
        parsed = json.loads(raw)
        # Model might return {"questions": [...]} or a direct array
        if isinstance(parsed, list):
            questions = parsed
        elif isinstance(parsed, dict):
            # Find the first list value
            questions = next(v for v in parsed.values() if isinstance(v, list))
        else:
            raise ValueError("Unexpected JSON structure")
    except (json.JSONDecodeError, StopIteration) as e:
        raise ValueError(f"LLM returned invalid JSON: {e}")

    # Validate structure
    required_keys = {"question", "option_a", "option_b", "option_c", "option_d", "correct_option"}
    for q in questions:
        if not required_keys.issubset(q.keys()):
            raise ValueError(f"Question missing required fields: {q}")
        if q["correct_option"] not in ("A", "B", "C", "D"):
            raise ValueError(f"Invalid correct_option: {q['correct_option']}")

    return questions[:n]  # Trim to exactly n in case model returns more
```

### Step 8.4 — `schemas/video_test.py`

```python
class TestPreviewRequest(BaseModel):
    youtube_url: str
    question_count: int = Field(ge=3, le=30, default=10)

class TestPreviewResponse(BaseModel):
    video_id: str
    title: str | None  # From yt-dlp info
    thumbnail_url: str | None
    subtitle_source: str
    transcript_char_count: int
    questions: list["QuestionDraft"]

class QuestionDraft(BaseModel):
    position: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str

class TestPublishRequest(BaseModel):
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str | None = None
    subtitle_source: str
    raw_transcript: str
    time_limit_sec: int = Field(ge=60, le=7200)  # 1 min to 2 hrs
    max_xp: int = Field(ge=10, le=1000, default=100)
    questions: list[QuestionDraft]   # Final (possibly edited) questions
    assigned_user_ids: list[int]      # Children to assign

class TestOut(BaseModel):
    id: int
    family_id: int
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str | None
    subtitle_source: str
    time_limit_sec: int
    max_xp: int
    question_count: int
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}

class TestSubmitRequest(BaseModel):
    answers: list["AnswerIn"]
    time_taken_sec: int

class AnswerIn(BaseModel):
    question_id: int
    selected_option: str | None  # None if timed out

class AttemptResult(BaseModel):
    score: int
    total: int
    xp_earned: int
    time_taken_sec: int
    breakdown: list["QuestionResult"]

class QuestionResult(BaseModel):
    question_id: int
    question_text: str
    selected_option: str | None
    correct_option: str
    is_correct: bool
```

### Step 8.5 — `routers/tests.py` — All Endpoints

```python
router = APIRouter()

# ── PARENT: PREVIEW (generate without saving) ──────────────────────────────

@router.post("/{family_id}/tests/preview", response_model=TestPreviewResponse)
async def preview_test(
    family_id: int,
    body: TestPreviewRequest,
    member: FamilyMember = Depends(require_parent),
):
    """
    1. Validate YouTube URL
    2. Fetch subtitle (yt-dlp) or Whisper fallback
    3. Generate N questions via GPT-4o
    4. Return preview (NOT saved to DB)
    
    This is a long-running operation (10-60s). Frontend shows a spinner.
    Consider adding a background task + polling if timeout is an issue.
    """
    try:
        transcript, source, video_id, thumbnail = await fetch_subtitle(body.youtube_url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(502, f"Could not fetch video subtitle: {e}")

    try:
        raw_questions = await generate_questions(transcript, body.question_count)
    except ValueError as e:
        raise HTTPException(502, f"Question generation failed: {e}")

    questions = [
        QuestionDraft(position=i + 1, **q)
        for i, q in enumerate(raw_questions)
    ]
    return TestPreviewResponse(
        video_id=video_id,
        title=None,  # Can be extracted from yt-dlp info if needed
        thumbnail_url=thumbnail,
        subtitle_source=source,
        transcript_char_count=len(transcript),
        questions=questions,
    )
```

```python
# ── PARENT: PUBLISH ─────────────────────────────────────────────────────────

@router.post("/{family_id}/tests", response_model=TestOut, status_code=201)
async def publish_test(
    family_id: int,
    body: TestPublishRequest,
    member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
):
    """
    Saves test + questions to DB and creates assignment rows.
    
    Validation:
    - All user_ids in assigned_user_ids must be children in this family.
    - At least 1 assigned child.
    - question_count must match len(body.questions).
    """
    # Validate assigned children
    children = await _get_family_children(family_id, db)
    child_ids = {c.user_id for c in children}
    for uid in body.assigned_user_ids:
        if uid not in child_ids:
            raise HTTPException(400, f"User {uid} is not a child in this family")

    # Save test
    test = VideoTest(
        family_id=family_id,
        created_by=member.user_id,
        title=body.title,
        youtube_url=body.youtube_url,
        video_id=body.video_id,
        thumbnail_url=body.thumbnail_url,
        subtitle_source=body.subtitle_source,
        raw_transcript=body.raw_transcript,
        time_limit_sec=body.time_limit_sec,
        max_xp=body.max_xp,
        question_count=len(body.questions),
        status="published",
    )
    db.add(test)
    await db.flush()  # Get test.id

    # Save questions
    for q in body.questions:
        db.add(TestQuestion(
            test_id=test.id,
            position=q.position,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            correct_option=q.correct_option,
        ))

    # Create assignments
    for uid in body.assigned_user_ids:
        db.add(TestAssignment(
            test_id=test.id,
            user_id=uid,
            family_id=family_id,
            assigned_by=member.user_id,
            status="pending",
        ))

    await db.commit()
    await db.refresh(test)

    # Broadcast to assigned children
    await ws_manager.broadcast(family_id, "test_assigned", {
        "test_id": test.id,
        "title": test.title,
        "assigned_user_ids": body.assigned_user_ids,
    })

    # Activity log
    db.add(ActivityLog(
        family_id=family_id, user_id=member.user_id,
        event_type="test_published",
        payload_json=json.dumps({"test_id": test.id, "title": test.title}),
    ))
    await db.commit()

    return TestOut.model_validate(test)
```

```python
# ── CHILD: LIST MY TESTS ────────────────────────────────────────────────────

@router.get("/{family_id}/my-tests", response_model=list[MyTestOut])
async def my_tests(
    family_id: int,
    member: FamilyMember = Depends(get_active_family),
    db: AsyncSession = Depends(get_db),
):
    """Returns all tests assigned to the current user in this family."""
    assignments = await db.execute(
        select(TestAssignment, VideoTest)
        .join(VideoTest, TestAssignment.test_id == VideoTest.id)
        .where(
            TestAssignment.user_id == member.user_id,
            TestAssignment.family_id == family_id,
            VideoTest.status == "published",
        )
    )
    # Map to MyTestOut (includes status, time_limit_sec, max_xp, thumbnail)
    ...
```

```python
# ── CHILD: START ATTEMPT ────────────────────────────────────────────────────

@router.post("/{family_id}/my-tests/{test_id}/start", response_model=TestWithQuestionsOut)
async def start_test(
    family_id: int,
    test_id: int,
    member: FamilyMember = Depends(get_active_family),
    db: AsyncSession = Depends(get_db),
):
    """
    Rules:
    - Child must have a "pending" or "reopened" assignment for this test.
    - If "in_progress": return the existing attempt (idempotent — allows page reload).
    - Questions are returned WITHOUT the correct_option field.
    
    Creates a TestAttempt row with started_at = now().
    """
    assignment = await _get_child_assignment(test_id, member.user_id, family_id, db)

    if assignment.status == "completed":
        raise HTTPException(403, "Test already completed. Request a reopen from your parent.")
    if assignment.status == "reopen_requested":
        raise HTTPException(403, "Waiting for parent to approve reopen.")

    # Check for existing in_progress attempt
    existing = (await db.execute(
        select(TestAttempt)
        .where(TestAttempt.assignment_id == assignment.id, TestAttempt.is_active == True)
        .order_by(TestAttempt.attempt_number.desc())
    )).scalar_one_or_none()

    if not existing:
        attempt_num = (await _count_attempts(assignment.id, db)) + 1
        attempt = TestAttempt(
            assignment_id=assignment.id,
            attempt_number=attempt_num,
            started_at=datetime.now(timezone.utc),
        )
        db.add(attempt)
        assignment.status = "in_progress"
        await db.commit()
        await db.refresh(attempt)
    else:
        attempt = existing

    # Return test questions WITHOUT correct_option
    test = await db.get(VideoTest, test_id)
    questions = (await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test_id)
        .order_by(TestQuestion.position)
    )).scalars().all()

    return TestWithQuestionsOut(
        test_id=test.id,
        title=test.title,
        time_limit_sec=test.time_limit_sec,
        max_xp=test.max_xp,
        attempt_id=attempt.id,
        started_at=attempt.started_at,
        questions=[QuestionOut.model_validate(q) for q in questions],
        # QuestionOut does NOT include correct_option
    )
```

```python
# ── CHILD: SUBMIT ANSWERS ───────────────────────────────────────────────────

@router.post("/{family_id}/my-tests/{test_id}/submit", response_model=AttemptResult)
async def submit_test(
    family_id: int,
    test_id: int,
    body: TestSubmitRequest,
    member: FamilyMember = Depends(get_active_family),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoring logic:
    - Load active attempt for this child + test.
    - Validate attempt is in_progress and not already submitted.
    - For each answer in body.answers: look up TestQuestion, check selected_option == correct_option.
    - score = count of is_correct == True
    - xp_earned = round(test.max_xp * score / total_questions)
    - Save all TestAttemptAnswer rows.
    - Update attempt: submitted_at, time_taken_sec, score, xp_earned.
    - Update assignment status → "completed".
    - Call award_xp().
    - Broadcast "test_completed" to family room.
    - Return AttemptResult with per-question breakdown (including correct_option revealed).
    """
    assignment = await _get_child_assignment(test_id, member.user_id, family_id, db)
    if assignment.status != "in_progress":
        raise HTTPException(400, "No active test attempt found")

    attempt = (await db.execute(
        select(TestAttempt)
        .where(TestAttempt.assignment_id == assignment.id, TestAttempt.is_active == True)
    )).scalar_one_or_none()
    if not attempt or attempt.submitted_at:
        raise HTTPException(400, "Attempt already submitted or not started")

    # Load questions
    questions = {q.id: q for q in (await db.execute(
        select(TestQuestion).where(TestQuestion.test_id == test_id)
    )).scalars().all()}

    score = 0
    breakdown = []
    for ans in body.answers:
        q = questions.get(ans.question_id)
        if not q:
            continue
        is_correct = ans.selected_option == q.correct_option
        if is_correct:
            score += 1
        db.add(TestAttemptAnswer(
            attempt_id=attempt.id,
            question_id=ans.question_id,
            selected_option=ans.selected_option,
            is_correct=is_correct,
        ))
        breakdown.append(QuestionResult(
            question_id=q.id,
            question_text=q.question_text,
            selected_option=ans.selected_option,
            correct_option=q.correct_option,
            is_correct=is_correct,
        ))

    total = len(questions)
    xp_earned = round(test.max_xp * score / total) if total > 0 else 0

    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.time_taken_sec = body.time_taken_sec
    attempt.score = score
    attempt.xp_earned = xp_earned
    assignment.status = "completed"

    await db.commit()

    # Award XP
    await award_xp(member.user_id, family_id, xp_earned, f"test:{test_id}:attempt:{attempt.id}", db, ws_manager)

    # Activity log + broadcast
    user = await db.get(User, member.user_id)
    await ws_manager.broadcast(family_id, "test_completed", {
        "test_id": test_id, "user_id": member.user_id, "username": user.username,
        "score": score, "total": total,
    })

    return AttemptResult(score=score, total=total, xp_earned=xp_earned,
                         time_taken_sec=body.time_taken_sec, breakdown=breakdown)
```

### Step 8.6 — Reopen Flow

```python
# ── CHILD: REQUEST REOPEN ───────────────────────────────────────────────────

@router.post("/{family_id}/my-tests/{test_id}/reopen-request", status_code=201)
async def request_reopen(family_id, test_id, member, db):
    """
    - assignment.status must be "completed".
    - No existing pending reopen_request for this attempt.
    - Creates TestReopenRequest(status="pending").
    - Sets assignment.status = "reopen_requested".
    - Broadcasts "reopen_requested" to family room.
    """
    ...

# ── PARENT: RESOLVE REOPEN ──────────────────────────────────────────────────

@router.patch("/{family_id}/tests/reopen-requests/{rid}")
async def resolve_reopen(family_id, rid, body: ReopenDecision, parent, db):
    """
    body.action: "approve" | "reject"

    On APPROVE:
    1. Set TestReopenRequest.status = "approved", resolved_by, resolved_at.
    2. Mark the current TestAttempt.is_active = False.
    3. Deduct the original xp_earned:
       award_xp(delta=-attempt.xp_earned, reason=f"reopen_revoke:test:{test_id}")
    4. Set assignment.status = "reopened".
    5. Broadcast "reopen_resolved" to the specific child's connection (send_to_user).
    
    On REJECT:
    1. Set status = "rejected".
    2. Set assignment.status = "completed" (stays locked).
    3. Broadcast "reopen_resolved" (status: "rejected") to the child.
    """
    ...
```

### ✅ Phase 8 Acceptance Criteria

- `POST /api/families/1/tests/preview` with a public YouTube URL → returns 10 questions (takes ~20–40s).
- `POST /api/families/1/tests` → test saved, assignment rows created, `test_assigned` WS event fires.
- Child calls `/start` → `TestWithQuestionsOut` returned; `correct_option` field NOT present in response.
- Child calls `/submit` → score calculated, XP awarded, `test_completed` WS event fires.
- Same child calls `/start` again → `403 "Test already completed"`.
- Child requests reopen → parent receives WS badge.
- Parent approves → child's original XP is revoked, test is `reopened`.
- Child re-takes and submits → new XP awarded.

---

## Phase 9 — Admin Endpoints

```
GET    /api/admin/families         → list all families (superadmin only)
DELETE /api/admin/families/{id}    → hard-delete a family (superadmin only)
PATCH  /api/admin/users/{uid}/role → set global_role (superadmin only)
```

The `superadmin` role is set manually in the DB or via the `SUPER_ADMIN_USERNAME` env var — there is no self-registration flow for it.

```python
# On startup, promote SUPER_ADMIN_USERNAME user if it exists
@app.on_event("startup")
async def promote_superadmin():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.username == settings.super_admin_username)
        )).scalar_one_or_none()
        if user and user.global_role != "superadmin":
            user.global_role = "superadmin"
            await db.commit()
```

---

## Phase 10 — Push Notifications

### Step 10.1 — VAPID Key Generation

```bash
# Run once, paste output into .env
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('PRIVATE:', v.private_key_urlsafe); print('PUBLIC:', v.public_key_urlsafe)"
```

### Step 10.2 — `routers/push.py`

```
GET    /api/push/vapid-key                         → return VAPID public key to frontend
POST   /api/push/subscribe                         → save push subscription (requires family_id in body)
DELETE /api/push/unsubscribe                       → remove subscription by endpoint
```

**Push payload format** (frontend parses this):
```json
{
  "title": "DinoQuest · Nguyen Family",
  "body": "Alice completed 'Read for 20 minutes'! +25 XP 🦕",
  "icon": "/icons/dino-192.png",
  "data": { "url": "/families/1/quests" }
}
```

**When to push** (add call in respective services):
- Quest completed → push to all family parents.
- Join request received → push to all family parents.
- Test assigned → push to assigned child.
- Reopen resolved → push to the child.

---

## Phase 11 — Testing

### Step 11.1 — `pytest` Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### Step 11.2 — Test Fixtures (`tests/conftest.py`)

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from backend.main import create_app
from backend.database import Base, get_db
from backend.config import settings

@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()

@pytest.fixture
async def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture
async def parent_token(client):
    resp = await client.post("/api/auth/register", json={"username": "parent1", "password": "pass123"})
    return resp.json()["access_token"]

@pytest.fixture
async def child_token(client):
    resp = await client.post("/api/auth/register", json={"username": "child1", "password": "pass123"})
    return resp.json()["access_token"]
```

### Step 11.3 — Test Coverage Requirements

| Test File | Coverage Target |
|---|---|
| `tests/test_auth.py` | Register, login, invalid token, duplicate username |
| `tests/test_families.py` | Create, get, update, soft-delete, auto-promote |
| `tests/test_invite.py` | Generate code, join via code, expiry, revoke |
| `tests/test_join_request.py` | Create request, approve, reject |
| `tests/test_quests.py` | CRUD, assign, complete, double-complete guard |
| `tests/test_xp_engine.py` | XP award, level-up trigger, negative delta (revoke) |
| `tests/test_leaderboard.py` | Family and global rankings |
| `tests/test_tests.py` | Publish, start, submit, scoring, reopen full flow |

---

## Phase 12 — Security Hardening Checklist

Before marking any phase complete, verify these checkboxes:

- [ ] `SECRET_KEY` loaded from `.env`. Never hardcoded. `len >= 32 chars`.
- [ ] `bcrypt` rounds = 12 (configured in `CryptContext`).
- [ ] CORS `allow_origins` is explicit list from `.env`, not `["*"]`.
- [ ] Every family-scoped endpoint calls `get_active_family` dependency.
- [ ] `require_parent` on: test create/publish, invite generate, member manage, reopen resolve, reward create/approve.
- [ ] `correct_option` is **never** included in the `GET /my-tests/{tid}` or `/start` response.
- [ ] YouTube URL validated server-side via regex before calling yt-dlp.
- [ ] `OPENAI_API_KEY` never returned in any API response.
- [ ] `raw_transcript` stored in DB, not re-fetched per request.
- [ ] Rate-limit on `/api/auth/login` (nginx: 5 req/min per IP).
- [ ] File uploads: validate MIME type, reject if > 10 MB.
- [ ] Invite codes expire and are checked on every join attempt.
- [ ] `is_deleted=True` families return `404` on all scoped endpoints.
- [ ] WS auth validates JWT token query param; closes with `4001` on failure.
- [ ] `test_reopen_requests.status = "approved"` revokes XP before re-opening.
- [ ] SQLite file permissions: `chmod 600 data/dinoquest.db`.

---

## Frontend Integration Contracts

The following table is a contract between backend and frontend. If the frontend changes a field name or the backend changes a field name, both sides must be updated simultaneously.

### Auth Store

The Zustand `authStore` expects the following shape on login/register:
```typescript
interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: {
    id: number;
    username: string;
    email: string | null;
    global_role: string;
  };
}
```
The `authStore` stores `access_token` in memory (and optionally `localStorage`). Every TanStack Query request includes:
```typescript
Authorization: `Bearer ${authStore.getState().access_token}`
```

### Family Switcher

The `familyStore` fetches `GET /api/families` on mount and stores:
```typescript
interface FamilyWithRoleOut {
  id: number;
  name: string;
  color_hex: string;  // "#ffdb33"
  my_role: "parent" | "child";
  // ... other fields
}
```
The `FamilySwitcher` component in the header uses `color_hex` to render the colored dot.

### TanStack Router Path Params

TanStack Router dynamic segments map directly to FastAPI path params:

| Frontend Route File | URL | FastAPI Param |
|---|---|---|
| `families/$familyId/index.tsx` | `/families/1` | `family_id: int` |
| `families/$familyId/tests/$testId.tsx` | `/families/1/tests/5` | `test_id: int` |
| `families/$familyId/tests/$testId/take.tsx` | `/families/1/tests/5/take` | same |

### Error Handling

TanStack Query's `onError` callback receives the `detail` field from FastAPI errors:
```typescript
// Frontend error handler (already implemented in the frontend)
const detail = (error as any)?.detail ?? "Something went wrong";
toast.error(detail);  // sonner toast
```
**Do not change the `detail` field name in error responses.**

### WebSocket Hook

The frontend `useWebSocket` hook in the family context:
```typescript
// Connects on mount, reconnects on disconnect
const ws = new WebSocket(`ws://${apiHost}/ws/families/${familyId}?token=${token}`);
ws.onmessage = (e) => {
  const { event, data } = JSON.parse(e.data);
  switch (event) {
    case "xp_earned": xpStore.update(data); break;
    case "leaderboard_update": queryClient.setQueryData(["leaderboard", familyId], data.leaderboard); break;
    case "test_assigned": queryClient.invalidateQueries(["my-tests", familyId]); break;
    // ...
  }
};
```

---

## Deployment Runbook

### First Deploy

```bash
# 1. Copy env
cp .env.example .env
# Edit .env — set SECRET_KEY, OPENAI_API_KEY, VAPID keys

# 2. Build and start
docker compose up -d --build

# 3. Verify migrations ran
docker compose exec api alembic current

# 4. Check health
curl http://localhost:5006/api/health
```

### Schema Migration (new feature)

```bash
# 1. Add model changes
# 2. Generate migration
docker compose exec api alembic revision --autogenerate -m "add_column_xyz"
# 3. Review the generated file in backend/alembic/versions/
# 4. Apply
docker compose exec api alembic upgrade head
```

### ARM64 Compatibility Notes

- `python:3.12-slim` is multi-arch (works on Tanix W2 / Armbian).
- `yt-dlp` is a pure Python wheel — ARM64 compatible.
- `openai` Python SDK — ARM64 compatible.
- `qrcode[pil]` — `Pillow` has ARM64 wheels.
- `pywebpush` — `cryptography` package requires `libssl-dev` on ARM; the `RUN apt-get install libssl-dev` line in Dockerfile handles this.
- All SQLite/aiosqlite — ARM64 compatible.

### Environment Variables — Full Reference

| Variable | Required | Example | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ | `openssl rand -hex 32` output | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_DAYS` | ❌ | `7` | JWT lifetime |
| `ALLOWED_ORIGINS` | ✅ | `http://localhost:3000,https://dinoquest.pages.dev` | CORS whitelist |
| `DB_PATH` | ✅ | `/app/data/dinoquest.db` | SQLite file path |
| `OPENAI_API_KEY` | ✅ | `sk-...` | For quiz generation + Whisper |
| `OPENAI_MODEL` | ❌ | `gpt-4o` | LLM model for quiz generation |
| `WHISPER_MODEL` | ❌ | `whisper-1` | Whisper model for audio transcription |
| `TEST_TRANSCRIPT_MAX_CHARS` | ❌ | `12000` | Chunk limit sent to LLM |
| `VAPID_PRIVATE_KEY` | ✅ (Push) | base64url key | Web Push VAPID private key |
| `VAPID_PUBLIC_KEY` | ✅ (Push) | base64url key | Sent to frontend |
| `VAPID_CLAIMS_EMAIL` | ✅ (Push) | `admin@local` | VAPID contact email |
| `SUPER_ADMIN_USERNAME` | ❌ | `admin` | Promoted to superadmin on startup |
| `TZ` | ❌ | `Asia/Ho_Chi_Minh` | Container timezone |

---

*End of DinoQuest v3 Backend Implementation Plan*
