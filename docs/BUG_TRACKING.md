# NCPL AttendEase — Bug Tracking Template

Use this template when reporting bugs found during testing or production use.

---

## Bug Report Template

```
### Bug Title
[Short, descriptive title]

**Bug ID:** BUG-XXXX
**Date Reported:** YYYY-MM-DD
**Reporter:** [Name]
**Assigned To:** [Name]
**Severity:** Critical | High | Medium | Low
**Priority:** P0 | P1 | P2 | P3
**Status:** Open | In Progress | Fixed | Verified | Closed | Reopened
**Module:** Authentication | Attendance | Leaves | Regularization | Reports | Admin | Biometric | Notifications

---

**Environment:**
- OS: Windows 11 / Android 14 / iOS 17
- Browser: Chrome 125 / Edge 125 / Safari 17
- Build Version: 1.0.0
- Server: 192.168.10.10

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happens]

**Screenshots / Logs:**
[Attach screenshots or paste relevant log output]

**Additional Notes:**
[Any related info, workarounds, or linked issues]
```

---

## Severity Definitions

| Severity | Definition | Example |
|----------|-----------|---------|
| **Critical** | System unusable, data loss, security breach | Login completely broken, DB corruption |
| **High** | Major feature broken, no workaround | Cannot apply for leave, biometric sync fails |
| **Medium** | Feature partially broken, workaround exists | Calendar shows wrong month on first load |
| **Low** | Cosmetic, minor UX issue | Misaligned button on one viewport |

---

## Priority Definitions

| Priority | Response Time | Fix Deadline |
|----------|--------------|--------------|
| **P0** | Immediate | Same day |
| **P1** | Within 4 hours | Within 2 days |
| **P2** | Within 1 day | Within 1 week |
| **P3** | Within 1 week | Next release |

---

## Bug Lifecycle

```
Open → In Progress → Fixed → Verified → Closed
                  ↘ Reopened → In Progress
```

---

## Sample Bug Report

### Leave balance not updated after approval
**Bug ID:** BUG-0001  
**Date Reported:** 2026-07-22  
**Reporter:** QA Team  
**Severity:** High  
**Priority:** P1  
**Status:** Open  
**Module:** Leaves  

**Environment:** Chrome 125, Windows 11, Build 1.0.0

**Steps to Reproduce:**
1. Login as employee → Apply for 2 days CL
2. Login as manager → Approve the leave
3. Login as employee → Check leave balance

**Expected Result:** CL balance reduced by 2.

**Actual Result:** CL balance unchanged; still shows original count.

**Logs:**
```
[ERROR] LeaveModel.deductBalance: balance update returned 0 rows
```
