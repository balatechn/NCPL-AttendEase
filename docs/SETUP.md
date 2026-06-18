# NCPL AttendEase — Development Setup Guide

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **PostgreSQL** 14+
- **MS SQL Server** (for eSSL biometric device)
- **npm** 9+
- **Git**

---

## 1. Clone & Install

```bash
git clone <repo-url> NCPL_AttendEase
cd NCPL_AttendEase

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# E2E Tests
cd ../tests
npm install
npx playwright install
```

---

## 2. Database Setup

### PostgreSQL

1. Create the database:
```sql
CREATE DATABASE attendease;
```

2. Run migrations:
```bash
cd backend
node ../database/migrate.js
```

3. Seed default data:
```bash
node ../database/migrate.js --seed
```

### MS SQL (eSSL Biometric)

Ensure the eSSL biometric device database is accessible. Connection is configured via environment variables.

---

## 3. Environment Variables

Copy `.env.example` to `.env` in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

Required variables:

| Variable | Description | Example |
|----------|-------------|---------|
| PORT | API server port | 4000 |
| NODE_ENV | Environment | development |
| JWT_SECRET | JWT signing key | random-64-char-string |
| JWT_REFRESH_SECRET | Refresh token key | random-64-char-string |
| DB_HOST | PostgreSQL host | localhost |
| DB_PORT | PostgreSQL port | 5432 |
| DB_NAME | Database name | attendease |
| DB_USER | Database user | postgres |
| DB_PASSWORD | Database password | (your password) |
| MSSQL_HOST | eSSL SQL Server host | 192.168.10.50 |
| MSSQL_DATABASE | eSSL database name | eSSL_DB |
| MSSQL_USER | SQL Server user | sa |
| MSSQL_PASSWORD | SQL Server password | (your password) |
| FRONTEND_URL | Frontend origin (CORS) | http://localhost:3000 |
| BIOMETRIC_SYNC_INTERVAL | Sync interval minutes | 5 |

---

## 4. Run Development Servers

```bash
# Terminal 1: Backend API
cd backend
npm run dev
# Runs on http://localhost:4000

# Terminal 2: Frontend
cd frontend
npm run dev
# Runs on http://localhost:3000
```

---

## 5. Default Login

| Email | Password | Role |
|-------|----------|------|
| admin@ncpl.com | Admin@123 | Admin |

---

## 6. Run Tests

```bash
# Backend unit & integration tests
cd backend
npm test

# E2E tests (requires both servers running)
cd tests
npx playwright test

# E2E with UI
npx playwright test --ui

# Specific test
npx playwright test login.spec.ts
```

---

## 7. Build for Production

```bash
# Backend (no build step, JS)
cd backend

# Frontend
cd frontend
npm run build
```

---

## 8. Deploy

See `scripts/deploy.ps1` for the PowerShell deployment script targeting server 192.168.10.10.

```powershell
cd scripts
.\deploy.ps1
```

PM2 process manager config is in `scripts/ecosystem.config.js`.

---

## Folder Structure

```
NCPL_AttendEase/
├── backend/          # Express.js API
│   └── src/
│       ├── config/   # DB connections
│       ├── controllers/
│       ├── jobs/     # Cron jobs
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── services/ # Biometric sync
│       ├── tests/
│       └── utils/
├── frontend/         # Next.js App Router
│   └── src/
│       ├── app/      # Pages (attendance, leaves, etc.)
│       ├── components/
│       ├── lib/      # API client, auth context
│       ├── styles/
│       └── types/
├── database/         # Migrations & seeds
├── tests/            # Playwright E2E
├── scripts/          # Deployment
└── docs/             # Documentation
```
