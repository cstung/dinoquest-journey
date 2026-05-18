# DinoQuest

DinoQuest is a family-oriented gamified application where parents can assign quests and tests to their children, rewarding them with XP, pets, and other custom rewards. It features a fully integrated frontend and backend with secure authentication, real-time updates, and family management.

## Tech Stack

### Frontend
- **Framework:** React 19 + Vite
- **Routing:** TanStack Router
- **State Management:** Zustand, TanStack Query
- **Styling:** Tailwind CSS, Radix UI
- **Deployment:** Cloudflare Workers

### Backend
- **Framework:** FastAPI (Python)
- **Database:** SQLite, SQLAlchemy (async), Alembic
- **Authentication:** HTTP-only cookies
- **Deployment:** Docker Compose

## Getting Started

### Prerequisites
- Node.js
- Python 3.10+
- Docker & Docker Compose

### Local Development Setup

#### 1. Backend Setup
You can run the backend via Docker or locally.

**Using Docker (Recommended):**
1. Copy the environment variables template:
   ```bash
   cp .env.example .env
   ```
2. Start the Docker services:
   ```bash
   docker-compose up -d api
   ```
The API will be available at `http://localhost:8122`.

**Running Locally:**
1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements-backend.txt
   ```
2. Run database migrations:
   ```bash
   npm run api:migrate
   ```
3. Start the FastAPI server:
   ```bash
   npm run api:dev
   ```

#### 2. Frontend Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
The frontend will be available at `http://localhost:3000` (or as specified by Vite). The frontend dev server is configured to proxy API requests (`/api`) and WebSocket connections (`/ws`) to the backend at port 8122.

## Project Structure
- `src/` - Frontend React application code (components, routes, store).
- `backend/` - FastAPI backend application code.
- `alembic/` - Database migration scripts.
- `plans/` - Project implementation plans and documentation.

## Scripts
Defined in `package.json`:
- `npm run dev`: Starts the frontend development server.
- `npm run build`: Builds the frontend for production.
- `npm run api:dev`: Starts the backend FastAPI server in reload mode.
- `npm run api:migrate`: Runs Alembic database migrations.

## Architecture
- **Authentication:** Uses secure HTTP-only cookie (`access_token`) for API requests and short-lived tokens for WebSocket connections.
- **API Routing:** Backend routes are family-scoped (e.g., `/api/families/{family_id}/quests`). The frontend manages the active family state and dynamically injects the `activeFamilyId` into requests.
- **JSON Formatting:** API responses and payloads use `camelCase` for frontend consumption, mapped to `snake_case` in the backend.
