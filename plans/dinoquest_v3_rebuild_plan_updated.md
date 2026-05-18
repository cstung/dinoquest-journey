# DinoQuest v3 — Rebuild Plan

> **Source analysed:** `cstung/dinoquest_v2_stable` (main branch)
> **Updated:** May 2026 — includes Family Management feature (30-question spec) + Test Maker feature

---

## 1. Feature Extraction from v2

### 1.1 Core Game Loop
| Feature | Current State |
|---|---|
| Quest creation (manual + auto-generated) | `backend/services/assignment_generator.py` |
| Quest categories (Daily, Learning, Creative, Epic) | Enum-based on backend |
| Quest Calendar (scheduling & streaks) | Implemented |
| XP award on quest completion | Backend logic |
| Quest image upload | `python-multipart` in requirements |

### 1.2 RPG Progression
| Feature | Current State |
|---|---|
| Level system (XP thresholds) | Backend |
| Pet system (hatch → level → evolve) | Backend + frontend |
| Avatar / gear unlocks via rank | Frontend-only cosmetics |
| XP Reward Shop (parent-managed) | Backend CRUD + frontend |

### 1.3 Learning System
| Feature | Current State |
|---|---|
| Timed quizzes & multiple-choice tests | Backend |
| Adaptive XP scoring (accuracy + speed) | Scoring service |
| Skill domain insights | Basic aggregation |

### 1.4 Family Hub
| Feature | Current State |
|---|---|
| Multi-user / multi-child accounts | Parent + child roles |
| Leaderboard (sibling competition) | DB query, polled |
| Shoutouts, emotes, achievement broadcast | Frontend-only |
| Achievement tiers (Bronze, Silver, Gold) | Enum |

### 1.5 Notifications & PWA
| Feature | Current State |
|---|---|
| Web Push notifications | `pywebpush` |
| PWA manifest / service worker | `frontend/` |
| Mobile-first layout | Tailwind responsive |

### 1.6 Auth & Security
| Feature | Current State |
|---|---|
| Password hashing | `bcrypt` |
| Session / auth token | Basic (likely cookie or localStorage JWT) |
| Secret key | **Hardcoded** in `docker-compose.yml` ⚠️ |

### 1.7 Infrastructure
| Aspect | v2 Status |
|---|---|
| Deployment | Single Docker container (monolith) |
| Database | SQLite + `aiosqlite` (volume-mounted) |
| Migrations | None detected (likely `create_all`) |
| Frontend serving | FastAPI serves Vite `dist/` as static files |
| Reverse proxy | None |
| TZ | `Asia/Ho_Chi_Minh` |

---

## 2. Pain Points in v2

1. **Monolithic container** — frontend rebuild requires full image rebuild.
2. **No database migrations** — schema changes require manual SQL or drop-and-recreate.
3. **SQLite without WAL mode** — concurrent async writes cause `database is locked` under load.
4. **Hardcoded secrets** — `SECRET_KEY` is plaintext in `docker-compose.yml`.
5. **No reverse proxy** — uvicorn exposed directly; no gzip, no SSL termination.
6. **Polled leaderboard** — no real-time updates; clients must refresh manually.
7. **No test coverage** — `tests/` directory exists but content unknown.
8. **Frontend state management** — likely ad-hoc `useState` chains; no server-state layer.
9. **No Alembic** — impossible to safely evolve schema in production.
10. **No offline queue** — PWA push works but failed quests/XP during offline are lost.

---

## 3. Rebuild Goals (v3)

- **Preserve** the Neo-Brutalism design language and all existing features.
- **Decouple** frontend and backend into independent, separately-deployable containers.
- **Harden** security: secrets via `.env`, proper JWT flow, HTTP-only cookies.
- **Add** database migrations (Alembic) from day one.
- **Enable** real-time updates (WebSocket) for leaderboard and family events.
- **Improve** offline experience with a proper service worker strategy.
- **Support** multiple families per user — fully scoped data model.
- **Keep** it self-hosted, ARM-compatible, single `docker compose up`.

---

## 4. NEW: Family Management — Specification

> Derived from the 30-question design session.

### 4.1 Core Rules

| Question | Decision |
|---|---|
| Who can create a family? | **Any registered user** |
| Multi-family membership? | **Yes — one user can belong to multiple families** |
| Roles inside a family | **Parent/Admin** and **Child** only |
| How to join | **Invite code (6-digit)** or **QR code scan** |
| Who can invite | **Parent/Admin only** |
| Invite expiry | **7 days** |
| Join flow for children | Child self-registers → sends join **request** → Parent approves |
| Max members | **No limit** |

### 4.2 Data Scoping (Everything is Family-Scoped)

| Entity | Scope |
|---|---|
| Quests | Per-family |
| XP & levels | Per-family |
| Pets | Per-family |
| Rewards / Shop | Per-family |
| Leaderboard | Per-family **+ global tab** (cross-family) |
| Push notifications | Per-family (family name in message) |
| WebSocket channel | Per-family room (`family:{id}`) |

### 4.3 Lifecycle Edge Cases

| Scenario | Behaviour |
|---|---|
| Family deleted | **Soft-delete** — data retained, family deactivated |
| Member removed | Kicked out — account remains, data orphaned in DB |
| Creator leaves | **Auto-promote** eldest Parent/Admin in the family |
| Removed member XP/quest data | Stays in DB, `user_id` retained, `family_id` intact |

### 4.4 Customisation per Family

- Family name
- Family avatar / icon
- Family color theme (stored as hex; applied as CSS variable in the switcher UI)
- Family motto / tagline

### 4.5 UI Placement

- **Standalone `/families` top-level route** in the nav
- **Family switcher dropdown** in the app header (shows current family name + color dot)
- Per-family **nickname + avatar/color** for each member (stored in `family_members`)
- Children see: leaderboard only — no admin data, no member management

### 4.6 Activity & Audit Log

- **Family activity log** — quest completions, XP earned, level-ups (visible to Parents)
- **Audit log** — admin actions: invite sent/accepted/revoked, member removed, role changed (Parents only)

---

## 5. NEW: Test Maker — Specification

> Derived from the 10-question design session (May 2026).

### 5.1 Core Rules

| Question | Decision |
|---|---|
| Who can create a test? | **Parent/Admin only** |
| Input | YouTube URL (any public video) |
| Subtitle source | Fetch via `yt-dlp`; if no subtitle exists, fall back to **OpenAI Whisper** transcription |
| Question type | **Multiple choice — 4 options** only |
| Question count | **Parent chooses** at test creation time |
| Quiz language | **English only** |
| LLM backend | **OpenAI API** (gpt-4o recommended) |
| Assignment | **Parent hand-picks** which children in the family get the test |
| Time limit | **Per-test time limit** — parent sets it at creation (e.g. 30 min) |
| XP reward | **Score-scaled** — `xp_earned = max_xp * (score / total_questions)` |
| Retakes | **Closed after first attempt** — child must **request a reopen**; parent approves/rejects; only the first attempt earns XP |

### 5.2 Test Creation Flow (Parent)

```
1. Parent navigates to /families/{id}/tests → clicks "New Test"
2. Pastes YouTube URL
3. Backend fetches subtitle:
   a. yt-dlp --write-auto-sub → .vtt file
   b. If no subtitle → Whisper transcription (openai.Audio.transcribe)
4. Subtitle text is chunked and sent to OpenAI with a structured prompt
5. LLM returns N multiple-choice questions (parent chose N)
6. Parent reviews generated questions — can edit question text, options, or correct answer
7. Parent sets:
   - Test title
   - Time limit (minutes)
   - Max XP reward
   - Assigned children (multi-select from family member list)
8. Parent publishes → test appears in assigned children's quest list
```

### 5.3 Test Taking Flow (Child)

```
1. Child sees test card in their dashboard (shows: title, video thumbnail, time limit, XP reward)
2. Child clicks "Start Test" → timer begins (countdown shown)
3. Questions displayed one at a time (or all at once — TBD in Phase impl.)
4. On submit (or timer expiry):
   - Score calculated
   - XP awarded = max_xp * (correct / total)
   - Results screen shown: score, time taken, per-question breakdown (correct/incorrect + right answer)
5. Test is locked — child cannot retake without parent approval
```

### 5.4 Reopen Request Flow

```
Child: clicks "Request Reopen" on a completed test
  → join_request-style entry created in test_reopen_requests
  → parent receives notification + sees badge on Tests page
Parent: approves or rejects
  → if approved: child's attempt for this test is reset; test re-opens
  → XP from first attempt is revoked; new attempt's XP replaces it
  → if rejected: child sees "Reopen denied" status
```

### 5.5 Parent Dashboard — Per-Test Progress View

For each assigned child the parent can see:

- Score (X / N correct, %)
- Time taken vs time limit
- Question-by-question breakdown: child's answer, correct answer, pass/fail per question
- Attempt status: Pending / In Progress / Completed / Reopen Requested / Reopened

### 5.6 Data Scoping

All test data is family-scoped (same pattern as quests):

| Entity | Scope |
|---|---|
| `video_tests` | Per-family |
| `test_questions` | Per-test |
| `test_assignments` | Per `(test_id, user_id, family_id)` |
| `test_attempts` | Per `(assignment_id)` |
| `test_attempt_answers` | Per `(attempt_id, question_id)` |
| `test_reopen_requests` | Per `(attempt_id)` |

### 5.7 Database Schema — Test Maker Tables

```sql
-- ─────────────────────────────────────────────
-- TEST MAKER  (family-scoped)
-- ─────────────────────────────────────────────

video_tests (
  id              INTEGER PRIMARY KEY,
  family_id       INTEGER REFERENCES families(id),
  created_by      INTEGER REFERENCES users(id),   -- parent only
  title           TEXT NOT NULL,
  youtube_url     TEXT NOT NULL,
  video_id        TEXT NOT NULL,                  -- parsed from URL
  thumbnail_url   TEXT,                           -- YouTube thumbnail
  subtitle_source TEXT NOT NULL,                  -- 'youtube_auto' | 'youtube_manual' | 'whisper'
  raw_transcript  TEXT NOT NULL,                  -- stored for audit / re-generation
  time_limit_sec  INTEGER NOT NULL,               -- parent-set per-test limit
  max_xp          INTEGER NOT NULL DEFAULT 100,
  question_count  INTEGER NOT NULL,
  status          TEXT DEFAULT 'draft',           -- 'draft' | 'published' | 'archived'
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

test_questions (
  id              INTEGER PRIMARY KEY,
  test_id         INTEGER REFERENCES video_tests(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,               -- display order
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  correct_option  TEXT NOT NULL                   -- 'A' | 'B' | 'C' | 'D'
)

test_assignments (
  id              INTEGER PRIMARY KEY,
  test_id         INTEGER REFERENCES video_tests(id),
  user_id         INTEGER REFERENCES users(id),
  family_id       INTEGER REFERENCES families(id),
  assigned_by     INTEGER REFERENCES users(id),   -- parent who assigned
  assigned_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  status          TEXT DEFAULT 'pending'
    -- 'pending' | 'in_progress' | 'completed' | 'reopen_requested' | 'reopened'
)

test_attempts (
  id              INTEGER PRIMARY KEY,
  assignment_id   INTEGER REFERENCES test_assignments(id),
  attempt_number  INTEGER DEFAULT 1,              -- 1 = first, 2 = after reopen, etc.
  started_at      DATETIME,
  submitted_at    DATETIME,
  time_taken_sec  INTEGER,
  score           INTEGER,                        -- number of correct answers
  xp_earned       INTEGER,
  is_active       BOOLEAN DEFAULT TRUE            -- FALSE for superseded attempts
)

test_attempt_answers (
  id              INTEGER PRIMARY KEY,
  attempt_id      INTEGER REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id     INTEGER REFERENCES test_questions(id),
  selected_option TEXT,                           -- 'A' | 'B' | 'C' | 'D' | NULL (timed out)
  is_correct      BOOLEAN
)

test_reopen_requests (
  id              INTEGER PRIMARY KEY,
  assignment_id   INTEGER REFERENCES test_assignments(id),
  attempt_id      INTEGER REFERENCES test_attempts(id),
  requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  status          TEXT DEFAULT 'pending',         -- 'pending' | 'approved' | 'rejected'
  resolved_by     INTEGER REFERENCES users(id),
  resolved_at     DATETIME
)
```

### 5.8 Backend — New Services & Routers

**New packages required:**
```
yt-dlp              # subtitle / audio download
openai              # GPT-4o quiz generation + Whisper fallback
```

**New files:**
```
backend/
  services/
    subtitle_service.py     # yt-dlp fetch → .vtt parse → plain text
    whisper_service.py      # download audio → openai.Audio.transcribe
    quiz_generator.py       # chunk transcript → OpenAI prompt → parse JSON questions
    test_service.py         # CRUD, assignment, XP award, reopen logic
  routers/
    tests.py                # all test endpoints (see 5.9)
```

**`subtitle_service.py` outline:**
```python
import yt_dlp, re

def fetch_subtitle(youtube_url: str) -> tuple[str, str]:
    """
    Returns (plain_text_transcript, source_label)
    source_label: 'youtube_auto' | 'youtube_manual' | 'whisper'
    """
    ydl_opts = {
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "outtmpl": "/tmp/dq_%(id)s",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        video_id = info["id"]
        thumbnail = info.get("thumbnail")

    # Try manual subtitle first, then auto
    for suffix, label in [(".en.vtt", "youtube_manual"), (".en-auto.vtt", "youtube_auto")]:
        path = f"/tmp/dq_{video_id}{suffix}"
        if os.path.exists(path):
            return _parse_vtt(path), label, video_id, thumbnail

    # Fallback: Whisper
    return _whisper_transcribe(youtube_url, video_id), "whisper", video_id, thumbnail

def _parse_vtt(path: str) -> str:
    """Strip VTT timing tags, deduplicate lines → plain text."""
    ...

def _whisper_transcribe(url: str, video_id: str) -> str:
    """Download audio with yt-dlp, send to openai.Audio.transcribe."""
    ...
```

**`quiz_generator.py` outline:**
```python
from openai import OpenAI

SYSTEM_PROMPT = """
You are an educational quiz generator. Given a video transcript, generate
exactly {n} multiple-choice questions in English. Each question must have
4 options (A, B, C, D) with exactly one correct answer. Base questions
strictly on the transcript content.

Respond ONLY with a JSON array:
[
  {
    "question": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_option": "A"
  }
]
"""

async def generate_questions(transcript: str, n: int) -> list[dict]:
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    # Chunk transcript if > 12,000 chars to stay within context
    chunk = transcript[:12000]
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(n=n)},
            {"role": "user", "content": chunk},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)
```

### 5.9 API Endpoints — Test Maker

```
-- TEST MANAGEMENT (Parent)
POST   /api/families/{id}/tests/preview          Submit YouTube URL → return transcript + N generated questions (draft)
POST   /api/families/{id}/tests                  Publish test (save questions, assign children, set time limit & XP)
GET    /api/families/{id}/tests                  List all tests in the family
GET    /api/families/{id}/tests/{tid}            Test detail + all questions (parent view)
PATCH  /api/families/{id}/tests/{tid}            Edit title / time limit / max XP (draft only)
DELETE /api/families/{id}/tests/{tid}            Archive test

-- ASSIGNMENT MANAGEMENT (Parent)
GET    /api/families/{id}/tests/{tid}/assignments            List all assignments + per-child status
PATCH  /api/families/{id}/tests/{tid}/assignments/{aid}     Manually update assignment status

-- REOPEN REQUESTS (Parent)
GET    /api/families/{id}/tests/reopen-requests             List all pending reopen requests
PATCH  /api/families/{id}/tests/reopen-requests/{rid}       Approve or reject reopen

-- TEST TAKING (Child)
GET    /api/families/{id}/my-tests                          List tests assigned to me + status
GET    /api/families/{id}/my-tests/{tid}                    Get test questions (only if assigned + not completed)
POST   /api/families/{id}/my-tests/{tid}/start              Start attempt → record started_at
POST   /api/families/{id}/my-tests/{tid}/submit             Submit answers → score, XP award, lock
POST   /api/families/{id}/my-tests/{tid}/reopen-request     Child requests reopen

-- PROGRESS / REPORTING (Parent)
GET    /api/families/{id}/tests/{tid}/report                Full report: per-child score, time, Q-by-Q breakdown
```

### 5.10 Frontend — New Pages & Components

```
frontend/src/
  pages/
    Tests/
      TestList.tsx          # Parent: all tests in the family, status badges
      TestCreate.tsx        # Step 1: paste URL → preview transcript → Step 2: review/edit questions → Step 3: assign & publish
      TestDetail.tsx        # Parent: test info + per-child progress table
      TestReport.tsx        # Parent: drill-down per child — score, time, Q-by-Q breakdown
      MyTests.tsx           # Child: list of assigned tests, status, XP reward shown
      TakeTest.tsx          # Child: countdown timer + question display + submit
      TestResult.tsx        # Child: post-submit results screen
  components/
    VideoPreviewCard.tsx    # Shows YouTube thumbnail + title after URL is parsed
    QuestionEditor.tsx      # Editable question card (parent review step)
    CountdownTimer.tsx      # Animated countdown shown during test-taking
    TestStatusBadge.tsx     # Pending / In Progress / Completed / Reopen Requested
    ReopenRequestBadge.tsx  # Pending reopen count indicator for parents
    QuestionBreakdown.tsx   # Per-question result row (child answer vs correct)
```

**`TestCreate.tsx` — 3-step wizard:**

```
Step 1 — Import
  [YouTube URL input] → [Generate Quiz button]
  → calls POST /preview → shows VideoPreviewCard + loading spinner
  → on success: shows transcript word count + "N questions generated"

Step 2 — Review Questions
  → lists N QuestionEditor cards (editable text, options, correct answer toggle)
  → parent can add/remove questions, edit wording

Step 3 — Publish
  → Test title (pre-filled from video title)
  → Question count (confirmed from Step 2)
  → Time limit (minutes input)
  → Max XP input
  → Child multi-select (checkboxes from family member list, children only)
  → [Publish] button → POST /tests
```

### 5.11 XP Engine Integration

```python
# In test_service.py, after submit:
score_pct = correct_answers / total_questions
xp_earned = round(assignment.test.max_xp * score_pct)

await award_xp(
    user_id=child.user_id,
    family_id=assignment.family_id,
    delta=xp_earned,
    reason=f"test:{test.id}:attempt:{attempt.id}",
    db=db,
    ws=ws_manager,
)
# Revoke XP if reopen approved and child reattempts:
# Insert negative xp_event for original xp_earned, then award fresh on new submit
```

### 5.12 WebSocket Events — Test Maker

| Event | Triggered by | Broadcast to |
|---|---|---|
| `test_assigned` | Parent publishes test | All assigned children's family room |
| `test_completed` | Child submits answers | Family room (parents see activity feed update) |
| `reopen_requested` | Child requests reopen | Family room (parent badge update) |
| `reopen_resolved` | Parent approves/rejects | Child's family room connection |

### 5.13 Settings / .env additions

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
WHISPER_MODEL=whisper-1
TEST_TRANSCRIPT_MAX_CHARS=12000   # chunk limit for LLM context
```

---

## 6. Recommended Tech Stack

### 6.1 Backend

| Layer | v2 | v3 | Reason |
|---|---|---|---|
| Framework | FastAPI | **FastAPI** (keep) | Already async, no reason to change |
| ORM | SQLAlchemy 2 async | **SQLAlchemy 2 async** (keep) | Solid, native async |
| DB driver | aiosqlite | **aiosqlite + WAL pragma** | Enable WAL mode on startup |
| Migrations | None | **Alembic** | Non-negotiable for production |
| Auth | bcrypt + ad-hoc | **bcrypt + python-jose (JWT) + HTTP-only cookie** | Secure, stateless |
| Real-time | None | **FastAPI WebSocket** (per-family rooms) | Lightweight, no extra broker |
| Push | pywebpush | **pywebpush** (keep, extended) | Family-labeled payloads |
| Config | `os.environ` | **pydantic-settings** | Typed settings from `.env` |
| Validation | Pydantic v2 | **Pydantic v2** (keep) | |
| Server | uvicorn | **uvicorn** behind **nginx** | nginx handles SSL, gzip, rate-limit |
| Subtitle | None | **yt-dlp** | YouTube subtitle/audio extraction |
| AI / Quiz | None | **openai (GPT-4o + Whisper)** | Quiz generation + fallback transcription |

**New backend packages:**
```
alembic
python-jose[cryptography]
qrcode[pil]
yt-dlp
openai
```

### 6.2 Frontend

| Layer | v2 | v3 | Reason |
|---|---|---|---|
| Framework | React + Vite | **React 19 + Vite** (keep) | |
| Language | JavaScript | **TypeScript** | Type safety, better DX |
| Styling | Tailwind + shadcn/ui | **Tailwind v4 + shadcn/ui** (keep) | Matches Neo-Brutalism tokens |
| State (server) | useState + fetch | **TanStack Query v5** | Caching, background refetch, optimistic updates |
| State (client) | ad-hoc | **Zustand** | Global: `authStore`, `familyStore` |
| Real-time | None | **native WebSocket hook** (per-family room) | Live leaderboard + family events |
| PWA | Vite PWA plugin | **vite-plugin-pwa** (keep + improve) | Offline queue via Background Sync |
| Forms | uncontrolled | **React Hook Form + Zod** | Mirrors backend Pydantic schemas |
| Routing | React Router v6 | **React Router v7** | `/families`, `/families/:id/*` nested routes |
| QR Scanner | None | **@zxing/browser** | In-browser QR code scanning for join flow |

### 6.3 Infrastructure

| Component | v2 | v3 |
|---|---|---|
| Reverse proxy | None | **nginx** (Docker service) |
| Database | SQLite volume | **SQLite + WAL** (family_id FK isolation on all tables) |
| Secrets | Hardcoded in compose | **`.env` file** + `env_file:` in compose |
| Containers | 1 (monolith) | **3** (nginx, api, frontend-build) |
| ARM support | ✅ python:3.12-slim | ✅ keep slim images |
| Health check | HTTP poll | `/api/health` returning DB status |

---

## 7. Project Structure (v3)

```
dinoquest_v3/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
│
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── models/
│   │   ├── user.py
│   │   ├── family.py
│   │   ├── family_member.py
│   │   ├── family_invite.py
│   │   ├── join_request.py
│   │   ├── activity_log.py
│   │   ├── quest.py
│   │   ├── progress.py
│   │   ├── pet.py
│   │   ├── reward.py
│   │   ├── achievement.py
│   │   ├── video_test.py          # NEW
│   │   ├── test_question.py       # NEW
│   │   ├── test_assignment.py     # NEW
│   │   ├── test_attempt.py        # NEW
│   │   ├── test_attempt_answer.py # NEW
│   │   └── test_reopen_request.py # NEW
│   ├── schemas/
│   │   ├── family.py
│   │   ├── invite.py
│   │   ├── join_request.py
│   │   ├── user.py
│   │   ├── quest.py
│   │   ├── video_test.py          # NEW
│   │   └── ...
│   ├── routers/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── families.py
│   │   ├── invites.py
│   │   ├── join_requests.py
│   │   ├── quests.py
│   │   ├── pets.py
│   │   ├── rewards.py
│   │   ├── leaderboard.py
│   │   ├── activity_log.py
│   │   ├── push.py
│   │   └── tests.py               # NEW
│   ├── services/
│   │   ├── family_service.py
│   │   ├── invite_service.py
│   │   ├── xp_engine.py
│   │   ├── assignment_generator.py
│   │   ├── scoring.py
│   │   ├── push_service.py
│   │   ├── subtitle_service.py    # NEW
│   │   ├── whisper_service.py     # NEW
│   │   ├── quiz_generator.py      # NEW
│   │   └── test_service.py        # NEW
│   ├── ws/
│   │   └── manager.py
│   └── alembic/
│       ├── env.py
│       └── versions/
│
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── families.ts
│       │   ├── invites.ts
│       │   ├── quests.ts
│       │   ├── tests.ts           # NEW
│       │   └── ...
│       ├── hooks/
│       │   ├── useFamilies.ts
│       │   ├── useActiveFamily.ts
│       │   ├── useInvite.ts
│       │   ├── useJoinRequest.ts
│       │   ├── useTests.ts        # NEW
│       │   ├── useTakeTest.ts     # NEW
│       │   └── ...
│       ├── stores/
│       │   ├── authStore.ts
│       │   ├── familyStore.ts
│       │   └── xpStore.ts
│       ├── pages/
│       │   ├── Families/
│       │   │   ├── FamilyLobby.tsx
│       │   │   ├── FamilyDetail.tsx
│       │   │   ├── CreateFamily.tsx
│       │   │   ├── JoinFamily.tsx
│       │   │   └── AdminPanel.tsx
│       │   ├── Tests/             # NEW
│       │   │   ├── TestList.tsx
│       │   │   ├── TestCreate.tsx
│       │   │   ├── TestDetail.tsx
│       │   │   ├── TestReport.tsx
│       │   │   ├── MyTests.tsx
│       │   │   ├── TakeTest.tsx
│       │   │   └── TestResult.tsx
│       │   ├── Home.tsx
│       │   ├── Quests.tsx
│       │   ├── Calendar.tsx
│       │   ├── Pet.tsx
│       │   ├── Rewards.tsx
│       │   ├── Leaderboard.tsx
│       │   ├── Quiz.tsx
│       │   └── Admin/
│       └── components/
│           ├── FamilySwitcher.tsx
│           ├── InviteCodeCard.tsx
│           ├── JoinRequestBadge.tsx
│           ├── ActivityFeed.tsx
│           ├── MemberCard.tsx
│           ├── VideoPreviewCard.tsx   # NEW
│           ├── QuestionEditor.tsx     # NEW
│           ├── CountdownTimer.tsx     # NEW
│           ├── TestStatusBadge.tsx    # NEW
│           ├── ReopenRequestBadge.tsx # NEW
│           ├── QuestionBreakdown.tsx  # NEW
│           ├── ui/
│           ├── QuestCard.tsx
│           ├── XPBar.tsx
│           ├── PetAvatar.tsx
│           └── AchievementBadge.tsx
│
├── Dockerfile.api
├── Dockerfile.frontend
└── requirements.txt
```

---

## 8. Database Schema (v3 — Full)

```sql
-- USERS & AUTH
users (
  id              INTEGER PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE,
  hashed_password TEXT NOT NULL,
  global_role     TEXT DEFAULT 'user',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- FAMILY MANAGEMENT
families (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  motto       TEXT,
  avatar_url  TEXT,
  color_hex   TEXT DEFAULT '#ffdb33',
  owner_id    INTEGER REFERENCES users(id),
  is_deleted  BOOLEAN DEFAULT FALSE,
  deleted_at  DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)

family_members (
  family_id    INTEGER REFERENCES families(id) ON DELETE RESTRICT,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  nickname     TEXT,
  avatar_color TEXT,
  joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (family_id, user_id)
)

family_invites (
  id          INTEGER PRIMARY KEY,
  family_id   INTEGER REFERENCES families(id),
  created_by  INTEGER REFERENCES users(id),
  code        TEXT UNIQUE NOT NULL,
  qr_token    TEXT UNIQUE NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_by     INTEGER REFERENCES users(id),
  used_at     DATETIME,
  revoked     BOOLEAN DEFAULT FALSE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)

join_requests (
  id           INTEGER PRIMARY KEY,
  family_id    INTEGER REFERENCES families(id),
  user_id      INTEGER REFERENCES users(id),
  status       TEXT DEFAULT 'pending',
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at  DATETIME,
  resolved_by  INTEGER REFERENCES users(id)
)

activity_log (
  id          INTEGER PRIMARY KEY,
  family_id   INTEGER REFERENCES families(id),
  user_id     INTEGER REFERENCES users(id),
  event_type  TEXT NOT NULL,
  payload_json TEXT,
  is_audit    BOOLEAN DEFAULT FALSE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- QUEST SYSTEM
quests (
  id              INTEGER PRIMARY KEY,
  family_id       INTEGER REFERENCES families(id),
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  xp_reward       INTEGER DEFAULT 10,
  difficulty      TEXT,
  due_date        DATETIME,
  is_recurring    BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

quest_assignments (
  id           INTEGER PRIMARY KEY,
  quest_id     INTEGER REFERENCES quests(id),
  user_id      INTEGER REFERENCES users(id),
  family_id    INTEGER REFERENCES families(id),
  status       TEXT DEFAULT 'pending',
  completed_at DATETIME,
  xp_earned    INTEGER
)

quest_images (id, quest_id, image_path)

-- LEARNING
quizzes        (id, quest_id, time_limit_sec)
quiz_questions (id, quiz_id, question, choices_json, correct_index)
quiz_attempts  (id, quiz_id, user_id, family_id, score, duration_sec, completed_at)

-- PROGRESSION
xp_events (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER REFERENCES users(id),
  family_id INTEGER REFERENCES families(id),
  delta     INTEGER NOT NULL,
  reason    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

user_family_levels (
  user_id   INTEGER REFERENCES users(id),
  family_id INTEGER REFERENCES families(id),
  level     INTEGER DEFAULT 1,
  total_xp  INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, family_id)
)

pets (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  family_id   INTEGER REFERENCES families(id),
  species     TEXT,
  name        TEXT,
  stage       TEXT,
  xp          INTEGER DEFAULT 0,
  last_fed_at DATETIME
)

achievements (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  family_id  INTEGER REFERENCES families(id),
  type       TEXT,
  tier       TEXT,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- REWARDS / SHOP
reward_items (
  id          INTEGER PRIMARY KEY,
  family_id   INTEGER REFERENCES families(id),
  title       TEXT NOT NULL,
  description TEXT,
  xp_cost     INTEGER,
  image_path  TEXT,
  created_by  INTEGER REFERENCES users(id)
)

reward_claims (
  id          INTEGER PRIMARY KEY,
  reward_id   INTEGER REFERENCES reward_items(id),
  user_id     INTEGER REFERENCES users(id),
  family_id   INTEGER REFERENCES families(id),
  status      TEXT DEFAULT 'pending',
  claimed_at  DATETIME,
  approved_at DATETIME
)

-- PUSH
push_subscriptions (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER REFERENCES users(id),
  family_id INTEGER REFERENCES families(id),
  endpoint  TEXT,
  keys_json TEXT
)

-- TEST MAKER  (NEW)
video_tests (
  id              INTEGER PRIMARY KEY,
  family_id       INTEGER REFERENCES families(id),
  created_by      INTEGER REFERENCES users(id),
  title           TEXT NOT NULL,
  youtube_url     TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  thumbnail_url   TEXT,
  subtitle_source TEXT NOT NULL,   -- 'youtube_auto' | 'youtube_manual' | 'whisper'
  raw_transcript  TEXT NOT NULL,
  time_limit_sec  INTEGER NOT NULL,
  max_xp          INTEGER NOT NULL DEFAULT 100,
  question_count  INTEGER NOT NULL,
  status          TEXT DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

test_questions (
  id              INTEGER PRIMARY KEY,
  test_id         INTEGER REFERENCES video_tests(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  correct_option  TEXT NOT NULL   -- 'A' | 'B' | 'C' | 'D'
)

test_assignments (
  id              INTEGER PRIMARY KEY,
  test_id         INTEGER REFERENCES video_tests(id),
  user_id         INTEGER REFERENCES users(id),
  family_id       INTEGER REFERENCES families(id),
  assigned_by     INTEGER REFERENCES users(id),
  assigned_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  status          TEXT DEFAULT 'pending'
    -- 'pending' | 'in_progress' | 'completed' | 'reopen_requested' | 'reopened'
)

test_attempts (
  id              INTEGER PRIMARY KEY,
  assignment_id   INTEGER REFERENCES test_assignments(id),
  attempt_number  INTEGER DEFAULT 1,
  started_at      DATETIME,
  submitted_at    DATETIME,
  time_taken_sec  INTEGER,
  score           INTEGER,
  xp_earned       INTEGER,
  is_active       BOOLEAN DEFAULT TRUE
)

test_attempt_answers (
  id              INTEGER PRIMARY KEY,
  attempt_id      INTEGER REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id     INTEGER REFERENCES test_questions(id),
  selected_option TEXT,   -- 'A' | 'B' | 'C' | 'D' | NULL (timed out)
  is_correct      BOOLEAN
)

test_reopen_requests (
  id              INTEGER PRIMARY KEY,
  assignment_id   INTEGER REFERENCES test_assignments(id),
  attempt_id      INTEGER REFERENCES test_attempts(id),
  requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  resolved_by     INTEGER REFERENCES users(id),
  resolved_at     DATETIME
)
```

---

## 9. Key Implementation Details

### 9.1 SQLite WAL Mode

```python
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
```

### 9.2 JWT Auth (HTTP-only Cookie)

```python
response.set_cookie(
    key="access_token",
    value=create_access_token(user.id),
    httponly=True,
    samesite="lax",
    max_age=86400 * 7,
)
```

### 9.3 Active Family Context — Dependency Injection

```python
async def get_active_family(
    family_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FamilyMember:
    member = await db.get(FamilyMember, (family_id, current_user.id))
    if not member:
        raise HTTPException(403, "Not a member of this family")
    return member

async def require_parent(member: FamilyMember = Depends(get_active_family)) -> FamilyMember:
    if member.role != "parent":
        raise HTTPException(403, "Parent/Admin role required")
    return member
```

### 9.4 Invite Code & QR Generation

```python
def generate_invite_code() -> str:
    return secrets.token_urlsafe(4).upper()[:6]

def generate_qr_png(join_url: str) -> bytes:
    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
```

### 9.5 Auto-Promote on Creator Departure

```python
async def handle_owner_departure(family_id: int, leaving_user_id: int, db: AsyncSession):
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
            update(Family).where(Family.id == family_id)
            .values(owner_id=next_owner.user_id)
        )
    else:
        await soft_delete_family(family_id, db)
```

### 9.6 WebSocket — Per-Family Rooms

```python
class ConnectionManager:
    def __init__(self):
        self.rooms: dict[int, list[WebSocket]] = {}

    async def connect(self, family_id: int, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(family_id, []).append(ws)

    def disconnect(self, family_id: int, ws: WebSocket):
        self.rooms.get(family_id, []).remove(ws)

    async def broadcast(self, family_id: int, event: str, data: dict):
        for ws in list(self.rooms.get(family_id, [])):
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:
                self.rooms[family_id].remove(ws)
```

### 9.7 XP Engine — Family-Scoped

```python
async def award_xp(user_id, family_id, delta, reason, db, ws):
    # 1. Insert xp_event
    # 2. Upsert user_family_levels
    # 3. If level-up → insert achievement → broadcast 'level_up'
    # 4. Insert activity_log row
    # 5. Broadcast 'leaderboard_update' to family room
    ...
```

### 9.8 nginx Config

```nginx
server {
    listen 80;
    client_max_body_size 10M;

    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://api:8122;
    }

    location /api/ {
        proxy_pass http://api:8122;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws/ {
        proxy_pass http://api:8122;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location /join {
        root /usr/share/nginx/html;
        try_files /index.html =404;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        gzip_static on;
    }
}
```

---

## 10. API Endpoints — Full Reference

```
-- AUTH
POST   /api/auth/register
POST   /api/auth/login
DELETE /api/auth/logout

-- FAMILIES
GET    /api/families
POST   /api/families
GET    /api/families/{id}
PATCH  /api/families/{id}
DELETE /api/families/{id}

-- MEMBERS
GET    /api/families/{id}/members
PATCH  /api/families/{id}/members/{uid}/role
DELETE /api/families/{id}/members/{uid}

-- INVITES
POST   /api/families/{id}/invites
GET    /api/families/{id}/invites
DELETE /api/families/{id}/invites/{inv_id}
GET    /api/families/{id}/invite/qr

-- JOIN FLOW
POST   /api/join
GET    /api/families/{id}/join-requests
PATCH  /api/families/{id}/join-requests/{jid}

-- LOGS
GET    /api/families/{id}/activity
GET    /api/families/{id}/audit

-- SUPER-ADMIN
GET    /api/admin/families
DELETE /api/admin/families/{id}

-- WEBSOCKET
WS     /ws/families/{id}

-- SCOPED GAME ROUTES
GET    /api/families/{id}/quests
POST   /api/families/{id}/quests
GET    /api/families/{id}/leaderboard?scope=family|global
GET    /api/families/{id}/pets
GET    /api/families/{id}/rewards

-- TEST MAKER (NEW)
POST   /api/families/{id}/tests/preview
POST   /api/families/{id}/tests
GET    /api/families/{id}/tests
GET    /api/families/{id}/tests/{tid}
PATCH  /api/families/{id}/tests/{tid}
DELETE /api/families/{id}/tests/{tid}
GET    /api/families/{id}/tests/{tid}/assignments
PATCH  /api/families/{id}/tests/{tid}/assignments/{aid}
GET    /api/families/{id}/tests/reopen-requests
PATCH  /api/families/{id}/tests/reopen-requests/{rid}
GET    /api/families/{id}/my-tests
GET    /api/families/{id}/my-tests/{tid}
POST   /api/families/{id}/my-tests/{tid}/start
POST   /api/families/{id}/my-tests/{tid}/submit
POST   /api/families/{id}/my-tests/{tid}/reopen-request
GET    /api/families/{id}/tests/{tid}/report
```

---

## 11. Docker Compose (v3)

```yaml
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
      - frontend

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

---

## 12. Build Phases (Updated)

### Phase 1 — Foundation + Family Core (Week 1–2)
- [ ] Init monorepo structure, `.env.example`, docker-compose, nginx
- [ ] `backend/database.py` with WAL pragma + Alembic init
- [ ] All SQLAlchemy models + first Alembic migration (all tables including family_* and video_tests)
- [ ] Auth: register, login (JWT HTTP-only cookie), logout, `/me`
- [ ] `POST /api/families` — create family, auto-add creator as Parent
- [ ] `POST /api/families/{id}/invites` — generate code + QR token
- [ ] `POST /api/join` — join via code
- [ ] `PATCH /api/families/{id}/join-requests/{jid}` — approve / reject
- [ ] WebSocket manager, per-family room
- [ ] Frontend: `familyStore`, `FamilySwitcher` in header
- [ ] Frontend: `/families` route — Lobby, CreateFamily, JoinFamily pages

### Phase 2 — Family Management UI + Admin (Week 3)
- [ ] FamilyDetail page: member list, role badge, remove member, invite panel
- [ ] `InviteCodeCard` + QR display + revoke button
- [ ] `JoinRequestBadge`
- [ ] `family_service.py`: auto-promote, soft-delete
- [ ] Activity feed + Audit log
- [ ] Super-admin page

### Phase 3 — Quest Engine (Week 4)
- [ ] CRUD for quests + assignments with `family_id`
- [ ] `xp_engine.py` scoped to `(user_id, family_id)` + WS broadcast
- [ ] Quest completion → XP → level check → `activity_log`
- [ ] Frontend: Quest list, Quest card

### Phase 4 — RPG Layer (Week 5)
- [ ] Pet system with `family_id`
- [ ] Achievement grants
- [ ] Reward shop (family-scoped)
- [ ] Leaderboard: family tab + global tab
- [ ] Frontend: Pet page, XP bar, Achievement badges

### Phase 5 — Test Maker (Week 6)  ← NEW
- [ ] `subtitle_service.py`: yt-dlp fetch → .vtt parse → plain text
- [ ] `whisper_service.py`: audio download → OpenAI Whisper transcription fallback
- [ ] `quiz_generator.py`: transcript chunking → GPT-4o prompt → JSON question parse
- [ ] All test SQLAlchemy models + Alembic migration
- [ ] `POST /api/families/{id}/tests/preview` — subtitle fetch + LLM generation
- [ ] `POST /api/families/{id}/tests` — publish with assignments
- [ ] Child test-taking endpoints: start, submit, reopen-request
- [ ] Parent report endpoint
- [ ] XP award + revoke on reopen
- [ ] WebSocket events: `test_assigned`, `test_completed`, `reopen_requested`, `reopen_resolved`
- [ ] Frontend: `TestCreate.tsx` 3-step wizard (URL → review → publish)
- [ ] Frontend: `MyTests.tsx`, `TakeTest.tsx` with `CountdownTimer`
- [ ] Frontend: `TestResult.tsx` with `QuestionBreakdown`
- [ ] Frontend: `TestDetail.tsx` + `TestReport.tsx` (parent view)
- [ ] Frontend: `ReopenRequestBadge` for parents

### Phase 6 — Learning & Calendar (Week 7)
- [ ] Quiz engine (timed, multiple-choice, adaptive scoring)
- [ ] Quest Calendar view
- [ ] Recurring quest processing
- [ ] Skill domain aggregation endpoint

### Phase 7 — Polish & PWA (Week 8)
- [ ] `vite-plugin-pwa` + service worker
- [ ] Background Sync for offline quest completion
- [ ] Family-labeled push notifications
- [ ] QR scanner in JoinFamily page
- [ ] Mobile-first responsive pass

### Phase 8 — Testing & Deploy (Week 9)
- [ ] Backend: `pytest` + `httpx` — cover family service, invite flow, XP engine, test maker, auth
- [ ] Frontend: Vitest — `familyStore`, `useActiveFamily`, test-taking hooks
- [ ] ARM64 Docker image audit
- [ ] `.env.example` fully documented (including `OPENAI_API_KEY`)
- [ ] Cloudflare Tunnel config

---

## 13. Security Checklist

- [ ] `SECRET_KEY` and `OPENAI_API_KEY` loaded from `.env`, never committed
- [ ] JWT stored in HTTP-only, SameSite=Lax cookie
- [ ] `bcrypt` rounds ≥ 12
- [ ] CORS restricted to known origins
- [ ] File upload: validate MIME type + max 10 MB at nginx and FastAPI
- [ ] Rate-limit login endpoint (5 req/min)
- [ ] Alembic `upgrade head` runs in entrypoint before app start
- [ ] SQLite file permissions: `0600`
- [ ] Invite codes expire after 7 days
- [ ] `get_active_family` on every family-scoped endpoint
- [ ] Children blocked from: audit log, member management, invite generation, test creation
- [ ] `require_parent` on all test creation, assignment, and reopen-resolve endpoints
- [ ] YouTube URL validated server-side before calling yt-dlp
- [ ] OpenAI API key never exposed to the frontend
- [ ] Transcript stored in DB for audit; not re-fetched on every request
- [ ] Test questions only returned to a child if they have an active, non-completed assignment

---

## 14. What Stays the Same

| Preserved | Rationale |
|---|---|
| Neo-Brutalism design system (`#ffdb33`, black borders, hard shadows, Bebas Neue / Space Mono) | Core identity |
| FastAPI + SQLAlchemy async | Already production-grade |
| SQLite (no migration to Postgres) | Family-scale app |
| pywebpush | Working; extended with family-labeled payloads |
| Cloudflare Tunnel for external access | Already in your infra |
| `Asia/Ho_Chi_Minh` timezone | Operational requirement |
| ARM64 compatibility | Tanix W2 home server |
