# DinoQuest v3 Full Implementation Plan

> Objective: build and ship a fully functional DinoQuest web app by integrating a new FastAPI backend with the existing TanStack Start frontend in this repository.
>
> Working folder: `C:\Users\Admin\Desktop\dinoquest v3\dinoquest-journey`

---

## 1. Scope And Success Criteria

The app is complete when all of the following are true:

1. Users can register, login, persist session, logout using HTTP-only cookies.
2. Families can be created, joined, managed, and switched in UI with real backend data.
3. Family-scoped game data is fully functional: quests, tests, pets, rewards, leaderboard, activity logs.
4. Parent/child permissions are enforced server-side for all family-scoped actions.
5. Test Maker flow is complete: preview generation, publish, child attempt, scoring, reopen request, parent decision, XP revoke/re-award.
6. Real-time updates work over WebSocket for family events and progression updates.
7. Frontend no longer depends on `src/data/mock.ts` for production features.
8. CI tests pass and production deploy works: frontend on Cloudflare Workers, backend on Docker Compose behind Cloudflare Tunnel.

---

## 2. Locked Technical Decisions

1. Auth strategy:
- HTTP-only cookie session for API requests.
- `access_token` cookie; no token in frontend Zustand store.
- WS uses short-lived token from `GET /api/auth/ws-token`.

2. API shape:
- Backend internals stay snake_case.
- API payloads are camelCase using a base schema alias strategy.
- Error schema stays `{ "detail": "..." }`.

3. Routing model:
- Frontend routes stay flat (`/quests`, `/tests`, etc.).
- Backend routes stay family-scoped (`/api/families/{familyId}/...`).
- Frontend injects `activeFamilyId` from store into API paths.

4. Deployment model:
- Frontend deployed separately to Cloudflare Workers.
- Backend only in Docker Compose.
- API exposed via Cloudflare Tunnel.

---

## 3. Repository Plan

Create backend code inside this repo:

1. `backend/` for app code.
2. `alembic/` for migrations.
3. `tests_backend/` for API and service tests.
4. `plans/` for planning documents.

Keep frontend app under `src/` unchanged structurally; replace mock data usage incrementally with query hooks.

---

## 4. Delivery Phases

## Phase 0 - Baseline Setup

Deliverables:
1. Create backend scaffold and dependency files.
2. Create `.env.example` with all required keys.
3. Add local backend run commands and Makefile or script shortcuts.

Acceptance:
1. `uvicorn` boots backend locally.
2. `GET /api/health` returns 200.

## Phase 1 - Data Layer And Migration Backbone

Deliverables:
1. SQLAlchemy async engine with SQLite WAL pragmas and FK enforcement.
2. Alembic configured with initial migration pipeline.
3. Core models:
- users
- families
- family_members
- family_invites
- join_requests
- activity_log
- quests + quest_assignments
- xp_events + user_family_level
- pets
- rewards + reward_claims
- video_tests + test_questions + test_assignments + test_attempts + test_attempt_answers + test_reopen_requests

Acceptance:
1. `alembic upgrade head` and downgrade/upgrade cycles run cleanly.
2. Unique constraints and foreign keys enforce family scoping integrity.

## Phase 2 - Auth And Session

Deliverables:
1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. `DELETE /api/auth/logout`
4. `GET /api/auth/me`
5. `GET /api/auth/ws-token`
6. Cookie-based `get_current_user` dependency.

Acceptance:
1. Login/register set cookie with env-aware secure/samesite policy.
2. `me` requires valid cookie.
3. Logout clears cookie.
4. No Bearer token requirement for standard API calls.

## Phase 3 - Family Core

Deliverables:
1. Families endpoints:
- list/create/detail/update/delete(soft-delete)
2. Members endpoints:
- list/change-role/remove
3. Invite endpoints:
- create/list/revoke/qr
4. Join flow:
- request by code/qr token
- parent approve/reject
5. Activity and audit paginated endpoints.
6. Correct owner behavior:
- delete family is terminal soft-delete
- auto-promote only when owner removes self from membership.

Acceptance:
1. Numeric 6-digit invite codes only.
2. Parent/child access controls fully enforced.
3. Removed members lose access immediately.

## Phase 4 - Quest Engine + Progression

Deliverables:
1. Quest CRUD and assignment endpoints.
2. Quest completion endpoint with XP award logic.
3. XP engine updates user-family level and emits log entries.
4. Initial pet/reward progression hooks.

Acceptance:
1. Child can complete only authorized quest assignments.
2. XP and level updates are family-scoped and auditable.

## Phase 5 - RPG Layer

Deliverables:
1. Pets endpoints for hatch/feed/rename/state.
2. Rewards endpoints for CRUD, claim, parent approval.
3. Leaderboard endpoint with family/global scopes.

Acceptance:
1. Parent-only administration actions are blocked for children.
2. Ranking updates reflect XP events correctly.

## Phase 6 - Test Maker

Deliverables:
1. Subtitle extraction service (`yt-dlp`), fallback transcription (`Whisper`).
2. Quiz generation service (`OpenAI`) with structured validation.
3. Parent test flow:
- preview questions
- publish test with assignments, limits, XP
4. Child test flow:
- list assigned tests
- start attempt
- submit answers
- score and XP award
5. Reopen flow:
- child reopen request
- parent approve/reject
- revoke first XP on approval before reattempt.

Acceptance:
1. Full first-attempt lock behavior works.
2. Reopen approval resets attempt status and re-enables child flow.
3. Reopen rejection keeps test locked and returns correct status.

## Phase 7 - Real-Time Events

Deliverables:
1. WS room manager keyed by familyId.
2. WS auth via short-lived wsToken query param.
3. Broadcast events:
- xp_earned
- leaderboard_update
- test_assigned
- test_completed
- reopen_requested
- reopen_resolved
- family_deleted

Acceptance:
1. Parent and child clients receive role-relevant events in active family room.
2. Invalid WS token connections are rejected.

## Phase 8 - Frontend Integration Pass

Deliverables:
1. Add API client layer with `credentials: "include"`.
2. Add TanStack Query hooks by domain.
3. Replace mock usage in:
- login
- family switcher
- families pages
- quests pages
- tests pages
- leaderboard
- pets
- rewards
- activity cards
4. Add app bootstrap call to `/api/auth/me`.
5. Add guard behaviors when `activeFamilyId` is null.
6. Add WS lifecycle integration with `/api/auth/ws-token`.

Acceptance:
1. User can run complete app flows without mock data.
2. Pages render loading/error/empty states correctly with backend responses.

## Phase 9 - Quality, Security, And Observability

Deliverables:
1. Backend tests:
- auth
- family/invite/join
- quest/xp
- tests/reopen
- rewards claims
2. Frontend integration smoke tests for primary journeys.
3. Input validation and permission regression tests.
4. Rate limiting on auth endpoints at edge/reverse layer.
5. Structured API logging and error tracing.

Acceptance:
1. Test suite is stable in CI.
2. No critical auth or authorization gaps.

## Phase 10 - Production Release

Deliverables:
1. Backend Docker image and compose stack.
2. Cloudflare Tunnel mapping to backend port.
3. Cloudflare Workers deployment for frontend.
4. Production env setup:
- `ALLOWED_ORIGINS`
- `COOKIE_DOMAIN`
- OpenAI keys
- VAPID keys
5. Post-deploy verification runbook.

Acceptance:
1. Production login works with secure cookie across app/api domains.
2. WebSocket and core family/game flows work in production.

---

## 5. Execution Sequence (Recommended)

1. Build backend through Phase 3 before heavy frontend rewiring.
2. Integrate frontend auth + families first.
3. Integrate quests and tests next (highest user value).
4. Complete RPG/rewards/pets and realtime afterward.
5. Keep migration and API contracts stable once frontend hooks begin.

---

## 6. Work Breakdown For Immediate Start

Sprint 1:
1. Phase 0 and Phase 1 complete.
2. Phase 2 auth endpoints complete.
3. Frontend bootstrap `/api/auth/me` integrated.

Sprint 2:
1. Phase 3 family core complete.
2. Frontend families and switcher integrated.

Sprint 3:
1. Phase 4 quests + XP complete.
2. Quests pages integrated.

Sprint 4:
1. Phase 6 test maker complete.
2. Tests pages integrated.

Sprint 5:
1. Phase 5 RPG + Phase 7 realtime complete.
2. Leaderboard/pets/rewards integrated.

Sprint 6:
1. Phase 9 hardening and Phase 10 release.

---

## 7. Non-Negotiable Guardrails

1. Every family-scoped endpoint must validate membership and role.
2. No frontend trust for role/ownership decisions.
3. No plaintext secrets in repo.
4. No schema changes without Alembic migration.
5. No API response naming drift from camelCase once integration starts.

---

## 8. Planned Output Artifacts

1. Working backend service with migrations and tests.
2. Integrated frontend with live API and WS.
3. Deployment runbook and env templates.
4. Smoke-test checklist for release validation.

