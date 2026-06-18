# NCPL AttendEase — API Documentation

## Base URL
```
http://localhost:4000/api
```

## Authentication
All protected endpoints require `Authorization: Bearer <token>` header.

---

## Auth Endpoints

### POST /auth/login
Login with email and password.
```json
Request:  { "email": "admin@ncpl.com", "password": "Admin@123" }
Response: { "accessToken": "...", "refreshToken": "...", "user": { ... } }
```

### POST /auth/refresh
Refresh access token.
```json
Request:  { "refreshToken": "..." }
Response: { "accessToken": "..." }
```

### GET /auth/me
Get current user profile. **Auth required.**

---

## Attendance Endpoints

### GET /attendance/my?year=2026&month=4
Get current user's attendance for a month. **Auth required.**

### GET /attendance/my/range?startDate=2026-04-01&endDate=2026-04-30
Get attendance by date range. **Auth required.**

### GET /attendance/my/summary?year=2026&month=4
Get monthly summary (present, absent, late, hours). **Auth required.**

### GET /attendance/my/dashboard
Get dashboard stats (today's status, monthly totals). **Auth required.**

### GET /attendance/all?date=2026-04-10&department=IT
Get all employees' attendance for a date. **Admin/HR only.**

### PATCH /attendance/:id/override
Override attendance record. **Admin/HR only.**
```json
Request: { "punch_in": "09:00", "punch_out": "18:00", "status": "present", "reason": "Correction" }
```

---

## Leave Endpoints

### POST /leaves/apply
Apply for leave. **Auth required.**
```json
Request: { "leave_type": "casual", "start_date": "2026-04-15", "end_date": "2026-04-16", "reason": "Personal work" }
```

### GET /leaves/my?year=2026&status=pending
Get current user's leaves. **Auth required.**

### GET /leaves/my/balance?year=2026
Get leave balance. **Auth required.**

### GET /leaves/pending
Get pending leave requests. **Manager/Admin only.**

### PATCH /leaves/:id/approve
Approve leave. **Manager/Admin only.**
```json
Request: { "remarks": "Approved" }
```

### PATCH /leaves/:id/reject
Reject leave. **Manager/Admin only.**

---

## Regularization Endpoints

### POST /regularization/apply
Submit regularization request. **Auth required.**
```json
Request: { "attendance_date": "2026-04-10", "requested_punch_in": "09:00", "requested_punch_out": "18:00", "reason": "Biometric failure" }
```

### GET /regularization/my
Get user's regularization requests. **Auth required.**

### GET /regularization/pending
Get pending requests. **Manager/Admin only.**

### PATCH /regularization/:id/approve / reject
Approve or reject. **Manager/Admin only.**

---

## Report Endpoints

### GET /reports/attendance?startDate=...&endDate=...&format=excel
Attendance report. Format: `json`, `excel`, `pdf`. **Manager+ only.**

### GET /reports/leaves?year=2026&format=excel
Leave report. **Manager+ only.**

### GET /reports/summary?year=2026&month=4
Monthly summary for all employees. **Manager+ only.**

---

## Notification Endpoints

### GET /notifications?unreadOnly=true
Get notifications. **Auth required.**

### GET /notifications/unread-count
Get unread count.

### PATCH /notifications/:id/read
Mark as read.

### PATCH /notifications/read-all
Mark all as read.

---

## Admin Endpoints
All require **Admin/HR** role.

### GET /admin/dashboard
Admin dashboard stats.

### GET/POST /admin/employees
List or create employees.

### PUT/DELETE /admin/employees/:id
Update or deactivate employee.

### GET/POST /admin/shifts
List or create shifts.

### PUT/DELETE /admin/shifts/:id
Update or delete shift.

### PATCH /admin/attendance/:id/override
Override attendance.

---

## Biometric Endpoints (Admin only)

### POST /biometric/sync
Manually trigger biometric sync.

### GET /biometric/status
Get last sync status and device info.

---

## Error Responses
```json
{ "error": "Error message description" }
```
Status codes: 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 429 (rate limit), 500 (server)
