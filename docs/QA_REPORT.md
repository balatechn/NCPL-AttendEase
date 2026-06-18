# NCPL AttendEase — QA Report

**Project:** NCPL AttendEase (HR Attendance Management System)  
**Version:** 1.0.0  
**QA Engineer:** Senior QA — Automated Test Suite  
**Date:** 2026-07-22  

---

## 1. Test Summary

| Category                | Total | Pass | Fail | Blocked |
|------------------------|-------|------|------|---------|
| Functional (E2E)       | 21    | —    | —    | —       |
| API Integration        | 9     | —    | —    | —       |
| Unit Tests             | 6     | —    | —    | —       |
| Security               | 5     | —    | —    | —       |
| Performance            | 3     | —    | —    | —       |
| Mobile Responsiveness  | 4     | —    | —    | —       |
| **Total**              | **48**| —    | —    | —       |

> Pass/Fail columns to be populated after test execution.

---

## 2. Functional Test Cases (Playwright E2E)

### TC-001 — Login Page Display
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Navigate to /login |
| Expected | Email, password fields, submit button, NCPL branding visible |
| Priority | P0 |

### TC-002 — Empty Form Submission
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Click Login with empty fields |
| Expected | Form validation prevents submission |
| Priority | P0 |

### TC-003 — Invalid Credentials
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Enter wrong email/password → Login |
| Expected | Error toast/message shown. Not redirected |
| Priority | P0 |

### TC-004 — Valid Login
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Enter admin@ncpl.com / Admin@123 → Login |
| Expected | Redirected to /attendance; dashboard loads |
| Priority | P0 |

### TC-005 — Password Toggle
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Type password → click eye icon |
| Expected | Password visibility toggles |
| Priority | P2 |

### TC-006 — Auth Guard
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Access /attendance without login |
| Expected | Redirect to /login |
| Priority | P0 |

### TC-007 — Mobile Login Layout
| Field | Value |
|-------|-------|
| Module | Authentication |
| Steps | Open /login on Pixel 5 viewport |
| Expected | Responsive layout, no horizontal scroll |
| Priority | P1 |

### TC-008 — Dashboard Stats Cards
| Field | Value |
|-------|-------|
| Module | Attendance |
| Steps | Login → View /attendance |
| Expected | 4 stat cards (today's status, present, absent, late) |
| Priority | P0 |

### TC-009 — Monthly Summary Table
| Field | Value |
|-------|-------|
| Module | Attendance |
| Steps | Login → View /attendance |
| Expected | Monthly attendance summary table visible |
| Priority | P1 |

### TC-010 — Calendar Navigation
| Field | Value |
|-------|-------|
| Module | Attendance |
| Steps | Go to /attendance/calendar → click prev/next |
| Expected | Month changes, status indicators update |
| Priority | P1 |

### TC-011 — Dashboard Load Time
| Field | Value |
|-------|-------|
| Module | Performance |
| Steps | Login → measure time to interactive on /attendance |
| Expected | Under 3 seconds |
| Priority | P1 |

### TC-012 — Leave Balance Display
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Login → /leaves |
| Expected | Leave balance cards visible (CL/SL/EL/CO) |
| Priority | P0 |

### TC-013 — Apply Leave Form
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Click "Apply Leave" button |
| Expected | Form opens with type, dates, reason fields |
| Priority | P0 |

### TC-014 — Leave Validation
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Submit leave with end date before start date |
| Expected | Validation error shown |
| Priority | P0 |

### TC-015 — Leave Submission
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Fill valid leave → submit |
| Expected | Success notification; appears in leave list |
| Priority | P0 |

### TC-016 — Leave Cancel
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Click cancel on a pending leave |
| Expected | Leave status changes to cancelled; balance restored |
| Priority | P1 |

### TC-017 — Pending Approvals Tab
| Field | Value |
|-------|-------|
| Module | Leaves |
| Steps | Login as manager → /leaves → Pending tab |
| Expected | Pending leave list visible with approve/reject |
| Priority | P0 |

### TC-018 — Regularization Apply
| Field | Value |
|-------|-------|
| Module | Regularization |
| Steps | Fill regularization form → submit |
| Expected | Request created; appears in list |
| Priority | P0 |

### TC-019 — Notification Load
| Field | Value |
|-------|-------|
| Module | Notifications |
| Steps | Login → /notifications |
| Expected | Notification list renders; badge shows unread |
| Priority | P1 |

### TC-020 — Report Download
| Field | Value |
|-------|-------|
| Module | Reports |
| Steps | Select report type → Generate → Download |
| Expected | Excel file downloads |
| Priority | P1 |

### TC-021 — Admin Employee CRUD
| Field | Value |
|-------|-------|
| Module | Admin |
| Steps | Admin → Employees tab → Add/Edit/Deactivate |
| Expected | Operations succeed; list updates |
| Priority | P0 |

---

## 3. API Integration Test Cases (Jest)

| ID     | Test Case                          | Priority |
|--------|------------------------------------|----------|
| API-01 | Health check returns 200           | P0       |
| API-02 | Unauthenticated request → 401      | P0       |
| API-03 | Malformed token rejected            | P0       |
| API-04 | Protected routes guarded            | P0       |
| API-05 | Login returns tokens + user         | P0       |
| API-06 | Rate limiting kicks in              | P1       |
| API-07 | Unknown route returns 404           | P2       |
| API-08 | Security headers present            | P1       |
| API-09 | XSS payload rejected/sanitized      | P0       |

---

## 4. Unit Test Cases (Jest)

| ID     | Test Case                                    | Priority |
|--------|----------------------------------------------|----------|
| UT-01  | processLogs pairs IN/OUT correctly            | P0       |
| UT-02  | Missing punch-out handled as incomplete       | P0       |
| UT-03  | Duplicate log entries deduplicated             | P0       |
| UT-04  | Multiple employees grouped correctly          | P0       |
| UT-05  | Work hours calculated accurately              | P1       |
| UT-06  | Empty logs return empty array                 | P2       |

---

## 5. Security Test Checklist

| # | Check                                         | Status |
|---|-----------------------------------------------|--------|
| 1 | JWT tokens validated on all protected routes   | ✅ Implemented |
| 2 | Passwords hashed with bcrypt (12 rounds)       | ✅ Implemented |
| 3 | Rate limiting enabled on API (100 req/15min)   | ✅ Implemented |
| 4 | CORS restricted to frontend origin             | ✅ Implemented |
| 5 | Security headers via Helmet                    | ✅ Implemented |
| 6 | SQL injection prevented (parameterized queries)| ✅ Implemented |
| 7 | Role-based access control on admin endpoints   | ✅ Implemented |
| 8 | No credentials hardcoded in source code        | ✅ Implemented |
| 9 | HPP (HTTP Parameter Pollution) protection      | ✅ Implemented |
| 10| Input validation on API endpoints              | ✅ Implemented |

---

## 6. Performance Benchmarks (Targets)

| Metric                    | Target     |
|---------------------------|------------|
| Login response time       | < 500ms    |
| Dashboard load (TTI)      | < 3s       |
| API p95 latency           | < 200ms    |
| Biometric sync cycle      | < 30s      |
| Excel report generation   | < 5s       |

---

## 7. Mobile / Responsive Testing

| Viewport       | Pages Tested    | Status |
|----------------|-----------------|--------|
| Pixel 5 (393px)| Login, Dashboard, Leaves, Admin | To verify |
| iPad (768px)   | All pages       | To verify |
| Desktop (1440px)| All pages      | To verify |

---

## 8. Known Issues / Risks

| # | Issue | Severity | Mitigation |
|---|-------|----------|------------|
| 1 | Database not yet provisioned | Blocker | Run migrations before testing |
| 2 | Biometric device connectivity untested | High | Verify MS SQL connectivity to eSSL |
| 3 | PWA service worker not implemented | Medium | Add in next sprint |
| 4 | PDF report styling minimal | Low | Enhance in v1.1 |

---

## 9. Test Execution Instructions

```bash
# Backend tests
cd backend
npm test

# E2E tests
cd tests
npx playwright install
npx playwright test

# Specific test file
npx playwright test login.spec.ts
npx playwright test --project=mobile
```
