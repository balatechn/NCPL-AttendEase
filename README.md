# NCPL AttendEase

**HR Attendance Management System** — A modern, mobile-first Progressive Web App for tracking employee attendance with biometric device integration.

---

## Features

- **Biometric Integration** — Auto-sync with eSSL biometric devices via MS SQL
- **Real-time Dashboard** — Today's status, monthly stats, and attendance calendar
- **Leave Management** — Apply, approve/reject with balance tracking (CL/SL/EL/CO)
- **Attendance Regularization** — Request corrections for missed or incorrect punches
- **Reports** — Generate attendance, leave, and summary reports (Excel/PDF/JSON)
- **Admin Panel** — Manage employees, shifts, attendance overrides, biometric sync
- **Notifications** — In-app notifications for approvals, rejections, and alerts
- **Role-Based Access** — Admin, HR, Manager, Employee roles
- **Mobile-First PWA** — Responsive design optimized for phones and tablets

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Backend | Express.js, Node.js |
| Database | PostgreSQL (app data), MS SQL (biometric) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Testing | Playwright (E2E), Jest + Supertest (API/unit) |
| Deployment | PM2, PowerShell remoting |
| Reports | ExcelJS, PDFKit |

## Quick Start

```bash
# Install
cd backend && npm install
cd ../frontend && npm install

# Setup database
createdb attendease
cd backend && node ../database/migrate.js && node ../database/migrate.js --seed

# Configure
cp backend/.env.example backend/.env
# Edit .env with your database credentials

# Run
cd backend && npm run dev    # API on :4000
cd frontend && npm run dev   # App on :3000
```

Default login: `admin@ncpl.com` / `Admin@123`

## Documentation

- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [QA Report & Test Cases](docs/QA_REPORT.md)
- [Bug Tracking Template](docs/BUG_TRACKING.md)

## License

Proprietary — NCPL Internal Use Only
