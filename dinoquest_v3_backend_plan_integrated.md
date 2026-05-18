# DinoQuest v3 Backend Plan (Integrated With Current Frontend)

> Consolidated from:
> - `C:\Users\Admin\Downloads\dinoquest_v3_backend_plan.md`
> - `C:\Users\Admin\Downloads\dinoquest_v3_backend_plan_corrections.md` (authoritative where conflicts exist)
> - current frontend repo `cstung/dinoquest-journey` on `main` (as of 2026-05-18)

---

## 1) Source Of Truth

1. `dinoquest_v3_backend_plan_corrections.md` overrides conflicting sections in the original backend plan.
2. Actual frontend code contract in this repo overrides assumptions from both plan documents.
3. If future frontend code diverges from this plan, backend contract must be updated in the same PR.

---

## 2) Locked Integration Contract

## 2.1 Auth (Cookie-Based)

- Use HTTP-only cookie auth, not Bearer in app requests.
- Cookie key: `access_token`.
- Login/register return **raw user object** (no token envelope).
- `GET /api/auth/me` returns raw user object.
- `DELETE /api/auth/logout` clears cookie.

Production cookie settings:
- `SameSite=None`
- `Secure=True`
- `HttpOnly=True`
- `Domain=.yourdomain.com` (optional, from env)

Local dev cookie settings:
- `SameSite=Lax`
- `Secure=False`

## 2.2 WebSocket Auth

- Browser WS connection uses query token:
  - `ws://.../ws/families/{family_id}?token=<wsToken>` (dev)
  - `wss://.../ws/families/{family_id}?token=<wsToken>` (prod)
- Add endpoint: `GET /api/auth/ws-token` (requires valid session cookie, short TTL e.g. 1 hour).
- Only WS uses explicit token; standard API stays cookie-authenticated.

## 2.3 JSON Naming

- Backend internals remain snake_case.
- All API JSON responses and accepted payload aliases are camelCase via Pydantic alias generator.
- Keep FastAPI error shape unchanged:
```json
{ "detail": "Human-readable message" }
```

## 2.4 Routing Model

- Backend keeps family-scoped API routes:
  - `/api/families/{family_id}/quests`
  - `/api/families/{family_id}/tests`
  - `/api/families/{family_id}/pets`
  - `/api/families/{family_id}/leaderboard`
  - `/api/families/{family_id}/rewards`
- Frontend routes remain flat (`/quests`, `/tests`, etc.) and inject `activeFamilyId` from store into API path.

## 2.5 Invite Code Format

- Invite code is strictly numeric 6-digit string (`000000`-`999999`), zero-padded.
- DB column: `String(6)` unique.

## 2.6 Family Deletion Rules

- `DELETE /api/families/{id}` soft-deletes family (terminal action), no auto-promote.
- Auto-promote only on owner self-removal from membership route.

---

## 3) Frontend Reality (Current Repo) And Required Changes

Current frontend is UI-only with mock data (`src/data/mock.ts`) and no API client/hook layer. Integration work is required.

Must add:
1. API client wrapper with `credentials: "include"` default.
2. `VITE_API_BASE_URL` support and env-based API URL handling.
3. Dev proxy for same-origin local cookie flow:
   - `/api -> http://localhost:8122`
   - `/ws -> ws://localhost:8122`
4. Auth bootstrap:
   - On app mount, call `GET /api/auth/me`.
   - Store returned user in Zustand.
5. Replace mock data usage with TanStack Query hooks per domain (families, quests, tests, pets, rewards, leaderboard).
6. Family-scoped hooks read `activeFamilyId` from store and disable query when null.
7. Request/response typing in camelCase aligned to backend schemas.

---

## 4) Deployment Architecture (Final)

- Frontend: Cloudflare Workers/TanStack Start deployment (`wrangler deploy`).
- Backend: Docker Compose (API + SQLite volume) on home server.
- Public API exposure: Cloudflare Tunnel -> `api.yourdomain.com` -> `localhost:8122`.
- Remove nginx/static-frontend containers from backend compose design.

---

## 5) Updated Build Process (Execution Order)

## Phase A - Backend Foundation

1. Scaffold backend project structure (FastAPI + SQLAlchemy async + Alembic).
2. Add `Settings` with:
   - `environment`
   - `cookie_domain`
   - `allowed_origins`
   - existing DB/OpenAI/VAPID settings.
3. Configure SQLite WAL + FK pragmas.
4. Configure CORS with `allow_credentials=True` and explicit origins.
5. Create `APIModel` base schema using camelCase alias generator.

Definition of done:
- `GET /api/health` works.
- Alembic migrations run up/down cleanly.

## Phase B - Auth + Session

1. Implement register/login/logout/me endpoints using cookie session.
2. Implement `get_current_user` from cookie.
3. Add `GET /api/auth/ws-token` for short-lived WS token.
4. Add auth tests:
   - login sets cookie
   - me requires cookie
   - logout clears cookie

Definition of done:
- Browser session persists across refresh with cookie.
- No token in Zustand/localStorage.

## Phase C - Family Core

1. Implement families CRUD (with soft-delete).
2. Implement members management + owner self-removal auto-promote path.
3. Implement invites with numeric 6-digit codes + QR.
4. Implement join-request flow.
5. Implement activity/audit endpoints (paginated).

Definition of done:
- Family switcher can be hydrated from real `/api/families`.

## Phase D - Core Game Domains

1. Quests + assignments + completion + XP events.
2. Pets + rewards + leaderboard.
3. Test maker pipeline (preview/publish/assignment/take/submit/reopen).
4. WS events for XP, leaderboard, test lifecycle, reopen flow.

Definition of done:
- End-to-end parent->assign->child->complete->XP->leaderboard update works.

## Phase E - Frontend Integration Pass

1. Add API layer and query hooks.
2. Replace route-level mock consumption incrementally:
   - `/families`
   - `/quests`
   - `/tests`
   - `/leaderboard`
   - `/pets`
   - `/rewards`
3. Wire login/logout/me flows to backend cookies.
4. Wire WS with `ws-token` endpoint.
5. Keep optimistic UI minimal until baseline correctness is stable.

Definition of done:
- No runtime dependency on `src/data/mock.ts` for production flows.

## Phase F - Hardening + Deploy

1. Add integration tests for high-risk paths (auth, invites, reopen XP revoke).
2. Production env configuration for cookie domain/origins.
3. Deploy backend via compose.
4. Deploy frontend to Cloudflare Workers.
5. Validate CORS + cookies + WS in production domain pair.

Definition of done:
- Full workflow passes on production URLs with secure cookie behavior.

---

## 6) Immediate Implementation Backlog (First Sprint)

1. Backend scaffold + config + Alembic + health endpoint.
2. Cookie auth endpoints (`register/login/logout/me`) + `ws-token`.
3. `APIModel` conversion for auth/family schemas.
4. Families list/create/select flow endpoints.
5. Frontend: API client + me bootstrap + families query + dev proxy.

---

## 7) Notes On Current Frontend Gaps (Must Be Planned)

- `src/routes/login.tsx` is mock-login only and currently routes "Register" back to `/login`.
- `src/store/index.ts` currently seeds default authenticated user; this must be removed when real auth wiring is added.
- Topbar/Sidebar/Home/Tests/Families pages currently consume static mocks; integration requires replacing these data sources.

---

## 8) Final Contract Summary

- Auth: HTTP-only cookie session.
- JSON: camelCase outward, snake_case inward.
- Errors: `{detail}`.
- Family scoping: API path param; UI injects `activeFamilyId`.
- Deployment: frontend on Cloudflare Workers, backend compose behind Tunnel.

