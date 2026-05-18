# Backend Phase 0

## Local Setup (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-backend.txt
Copy-Item .env.example .env
```

## Create / Upgrade DB Schema

```powershell
.\.venv\Scripts\alembic revision --autogenerate -m "initial_schema"
.\.venv\Scripts\alembic upgrade head
```

## Run API

```powershell
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8122
```

## Health Check

```powershell
Invoke-RestMethod http://localhost:8122/api/health
```
