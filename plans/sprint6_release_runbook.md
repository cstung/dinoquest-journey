# Sprint 6 Release Runbook

## 1) Production Environment Contract

Required backend env vars:

- `ENVIRONMENT=production`
- `SECRET_KEY=<strong random secret>`
- `DB_PATH=/app/data/dinoquest.db`
- `ALLOWED_ORIGINS=https://app.yourdomain.com`
- `COOKIE_DOMAIN=.yourdomain.com`
- `ACCESS_TOKEN_EXPIRE_DAYS=7`
- `WS_TOKEN_EXPIRE_MINUTES=60`

Recommended frontend env vars:

- `VITE_API_BASE_URL=https://api.yourdomain.com`
- `VITE_WS_BASE_URL=wss://api.yourdomain.com`

## 2) Backend Deploy (Docker Compose)

1. Copy `.env.example` to `.env` and fill production values.
2. Build and start:
   - `docker compose -f docker-compose.backend.yml up -d --build`
3. Validate health:
   - `curl https://api.yourdomain.com/api/health`

## 3) Cloudflare Tunnel

Map public hostname `api.yourdomain.com` to backend:

- `http://localhost:8122`

Confirm websocket forwarding is enabled for `/ws/*`.

## 4) Frontend Deploy

1. Install dependencies and build:
   - `npm install`
   - `npm run build`
2. Deploy Workers app:
   - `wrangler deploy`

## 5) Post-Deploy Smoke Checklist

1. Register + login sets secure cookie.
2. `GET /api/auth/me` returns current user from cookie session.
3. Family create + invite + join request + parent approval works.
4. Quest complete awards XP and leaderboard updates.
5. Test maker flow works end-to-end, including reopen approve and XP revoke/re-award.
6. Rewards claim approval deducts XP.
7. Pets can be created, fed, and update level/stage.
8. Websocket events received in browser (`/ws/families/{familyId}`) for:
   - `xp_earned`
   - `leaderboard_update`
   - `test_assigned`
   - `test_completed`
   - `reopen_requested`
   - `reopen_resolved`
   - `reward_claim_resolved`
   - `pet_updated`
