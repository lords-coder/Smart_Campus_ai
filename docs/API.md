# SmartCampus AI — API Reference (Phase 4)

Base URL: `http://localhost:4000/api`

## Conventions

**Success**

```json
{ "success": true, "data": {}, "message": "OK" }
```

**Error**

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `VALIDATION_ERROR` | 400 | Zod rejected the request body/query (`details` lists field issues) |
| `UNAUTHORIZED` / `INVALID_TOKEN` / `INVALID_CREDENTIALS` | 401 | Missing, invalid or expired token / wrong email or password |
| `FORBIDDEN` | 403 | Authenticated, but the role is not allowed |
| `NOT_FOUND` | 404 | Route or resource does not exist |
| `EMAIL_TAKEN` / `DUPLICATE_RESOURCE` | 409 | Uniqueness constraint violated |
| `TIMETABLE_CONFLICT` | 409 | A timetable write would clash with an existing class (`details.conflictTypes`) |
| `DEPENDENCY_CONFLICT` | 409 | Hard delete blocked because attendance history relates to the record |
| `INVALID_SECTION` | 400 | The section has no students for that semester |
| `INVALID_JSON` | 400 | The request body is not parseable JSON |
| `RATE_LIMITED` | 429 | Too many requests for this account (see `Retry-After`) |
| `AI_UNAVAILABLE` / `AI_TIMEOUT` | 503 / 504 | The configured AI provider failed or did not answer in time |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected failure |

Feature-specific codes such as `FUTURE_DATE`, `EMPTY_ROSTER`, `OVERPAYMENT` or `INVALID_AMOUNT`
are documented next to the endpoint that raises them.

Authentication header: `Authorization: Bearer <jwt>`

---

## Health

### `GET /api/health`
Auth: none · Role: —

```json
{ "success": true, "data": { "status": "ok", "database": "up", "uptimeSeconds": 12, "timestamp": "..." }, "message": "Service healthy" }
```

Returns **503** with `status: "degraded"` when the database is unreachable.

---

## Auth

Registration creates an **inactive** account. Every student, faculty and administrator request must
be approved by `SUPER_ADMIN` before it can sign in, and no token is issued at registration time.

### `POST /api/auth/register`
Auth: none · Role: — (public; only `STUDENT`, `FACULTY` and `ADMIN` may be requested.
`PARENT`, `ALUMNI` and `SUPER_ADMIN` are rejected by validation.)

Request (student):

```json
{ "role": "STUDENT", "email": "aarav@smartcampus.edu", "password": "Password123!", "confirmPassword": "Password123!",
  "firstName": "Aarav", "lastName": "Sharma", "phone": "9876543210",
  "studentNo": "SC2025-001", "department": "Computer Science and Engineering",
  "semester": 3, "section": "A", "batchYear": 2025 }
```

Request (faculty / admin add a verification `code`):

```json
{ "role": "FACULTY", "email": "…", "password": "…", "confirmPassword": "…", "code": "…",
  "firstName": "…", "lastName": "…", "phone": "…",
  "employeeNo": "EMP-0001", "department": "…", "designation": "Assistant Professor" }

{ "role": "ADMIN", "email": "…", "password": "…", "confirmPassword": "…", "code": "…",
  "firstName": "…", "lastName": "…", "phone": "…", "department": "Administration", "jobTitle": "System Administrator" }
```

| Field | Rules |
| ----- | ----- |
| `role` | `STUDENT` \| `FACULTY` \| `ADMIN` |
| `email` | valid, lower-cased, unique, must end in `UNIVERSITY_EMAIL_DOMAIN` |
| `password` / `confirmPassword` | 8–72 chars, ≥1 uppercase, ≥1 number, ≥1 special character, and they must match |
| `code` | required for `FACULTY`/`ADMIN`; compared **server-side** against `FACULTY_REGISTRATION_CODE` / `ADMIN_REGISTRATION_CODE` |
| `phone` | ≥10 digits, max 20 |
| student fields | `studentNo`, `department`, `semester` 1–12, `section`, `batchYear` |
| faculty fields | `employeeNo`, `department`, `designation` |
| admin fields | `department`, `jobTitle` |

Response **201** — deliberately no token:

```json
{ "success": true,
  "data": { "status": "PENDING_APPROVAL", "message": "Registration submitted. Your account is waiting for Super Admin approval." },
  "message": "Registration submitted. Your account is waiting for Super Admin approval." }
```

Side effects (one transaction): a `users` row with `status = 'PENDING'`, a `students` or `faculties`
profile, and a `registrations` row with `status = 'PENDING_APPROVAL'` holding the submitted profile
data. The password, its confirmation and the verification code are never stored in the submission.

Errors: 400 validation, 400 `INVALID_EMAIL_DOMAIN`, 400 `INVALID_REGISTRATION_CODE` (no account is
created), 409 `EMAIL_TAKEN`, 429 `RATE_LIMITED`.

### `POST /api/auth/login`
Auth: none · Role: —

Request: `{ "email": "...", "password": "..." }` · Response **200** with `token` + `user`.

Errors: 400 validation, 401 `INVALID_CREDENTIALS` (identical message for an unknown email and a
wrong password), 429 `RATE_LIMITED`, and — after the password is confirmed correct — 403 with:

| Code | Message |
| ---- | ------- |
| `REGISTRATION_PENDING` | Your registration is still pending approval. |
| `REGISTRATION_REJECTED` | Your registration was not approved. Please contact the administration. |
| `ACCOUNT_SUSPENDED` | Your account has been disabled. Please contact the administration. |

### `POST /api/auth/password-help`
Auth: none · Role: — (rate-limited; recovery is administrative, not an e-mail flow)

Request: `{ "email": "…", "role": "STUDENT", "message": "…", "contact": "…" }` (`role` and `contact`
optional) · Response **200** `{ "message": "Your request has been submitted…" }`.

Creates a persisted `OPEN` request in `password_help_requests`, linked to the user when the address
is known. The response is identical for unknown addresses, so it cannot be used to enumerate
accounts. Never stores or accepts a password.

### `POST /api/auth/reset-password`
Auth: none · Role: — (rate-limited)

Request: `{ "token": "<from the reset link>", "password": "…", "confirmPassword": "…" }` ·
Response **200** `{ "message": "Your password has been reset successfully…" }`.

Consumes a single-use token minted by `POST /api/super-admin/password-help/:id/reset`: the token row
is claimed atomically (`used_at IS NULL`) and the bcrypt hash is replaced, so the previous password
stops working immediately.

Errors: 400 `INVALID_RESET_TOKEN` (unknown), `TOKEN_ALREADY_USED` (replay), `TOKEN_EXPIRED`
(older than 24 h), password validation failures.

### `GET /api/auth/me`
Auth: required · Role: any · 401 `ACCOUNT_DISABLED` when the account is not `ACTIVE`

```json
{ "user": { "id": "…", "name": "…", "email": "…", "role": "STUDENT", "createdAt": "…" },
  "profile": { "studentNo": "SC2025-001", "department": "…", "semester": 3, "section": "A", "batchYear": 2025 } }
```

`profile` is a faculty record (`employeeNo`, `department`, `designation`) for `FACULTY`,
and `null` for roles without a profile row (e.g. `ADMIN`, `SUPER_ADMIN`).

### `POST /api/auth/logout`
Auth: required · Role: any · Response **200** `{ "loggedOut": true }`.

JWTs are stateless — the client discards the token. The backend additionally treats any
rejected token as logged-out (token revocation list is a later-phase concern).

---

## Super Admin (all endpoints: auth + role `SUPER_ADMIN`)

A normal `ADMIN`, `FACULTY`, `STUDENT` or anonymous caller receives **403 / 401** on every route
below. `SUPER_ADMIN` additionally inherits every `ADMIN` route elsewhere in this document.

### `GET /api/super-admin/registrations`
Query: `status` = `ALL` \| `PENDING_APPROVAL` \| `APPROVED` \| `REJECTED` (default `ALL`),
`role`, `q` (name/e-mail substring), `limit` (≤200), `offset` ·
Response **200** `{ "items": [ … ], "total": n }` — name, e-mail, requested role, status, submission,
rejection reason, reviewer and timestamps. The stored password, confirmation and verification code
are never present.

### `GET /api/super-admin/registrations/:id`
Response **200** one registration · 404 when unknown.

### `PATCH /api/super-admin/registrations/:id/approve`
No body. In one transaction: `users.status → 'ACTIVE'` and `registrations.status → 'APPROVED'` with
`reviewed_by` / `reviewed_at`. The role only becomes effective now.
Response **200** the registration · 404 unknown · 409 `INVALID_TRANSITION` when it is not pending.

### `PATCH /api/super-admin/registrations/:id/reject`
Body: `{ "reason": "optional note for the applicant" }` · sets `users.status → 'REJECTED'` and stores
`rejection_reason`. Response **200** · 404 · 409 `INVALID_TRANSITION`.

### `GET /api/super-admin/users`
Query: `status` = `ALL` \| `ACTIVE` \| `PENDING` \| `SUSPENDED` \| `REJECTED`, `role`, `q`,
`limit`, `offset` · Response **200** `{ "items": [ { id, name, email, role, status, phone, createdAt } ], "total": n }`.
Never returns `password_hash`.

### `PATCH /api/super-admin/users/:id/status`
Body: `{ "status": "ACTIVE" | "SUSPENDED" }` · reactivates or suspends an account. A suspended user
cannot sign in and their existing token stops working immediately (`requireAuth` re-reads the row).
400 when trying to force `REJECTED` here (use registration rejection instead) · 404 unknown.

### `GET /api/super-admin/password-help`
Query: `status` = `ALL` \| `OPEN` \| `IN_PROGRESS` \| `RESOLVED` \| `REJECTED`, `limit`, `offset` ·
Response **200** `{ "items": [ … ], "total": n }` with the requester, role, reason, contact, status,
admin notes and handler. Never any password material.

### `PATCH /api/super-admin/password-help/:id`
Body: `{ "status": "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED", "adminNotes": "optional" }` ·
Response **200** · 404 unknown.

### `POST /api/super-admin/password-help/:id/reset`
No body. Mints a single-use reset token: stores only its SHA-256 hash with a 24-hour expiry, marks
the request `IN_PROGRESS`, and returns the link **once**:

```json
{ "token": "…", "resetUrl": "http://localhost:3000/reset-password?token=…", "expiresAt": "…" }
```

400 `NO_USER_LINKED` when the request is not attached to an account · 404 unknown.

---

## Student (all endpoints require auth + role `STUDENT`)

### `GET /api/students/me`

```json
{ "id": "…", "studentNo": "SC2025-001", "department": "Computer Science and Engineering",
  "semester": 3, "section": "A", "batchYear": 2025,
  "user": { "id": "…", "name": "Aarav Sharma", "email": "…", "role": "STUDENT" } }
```

Errors: 403 for non-students, 404 when the account has no student profile.

### `GET /api/students/me/attendance-summary`

```json
{ "overall": { "percentage": 97.8, "present": 83, "late": 5, "absent": 2, "leave": 0, "total": 90 },
  "byCourse": [ { "courseId": "…", "code": "CS301", "name": "…", "present": 15, "late": 0,
                  "absent": 0, "leave": 0, "total": 15, "percentage": 100 } ] }
```

`percentage = (present + late) / total`, rounded to 1 decimal. Empty `byCourse` for new students.

### `GET /api/students/me/fees-summary`

```json
{ "totalFees": 96000, "totalPaid": 96000, "totalPending": 0,
  "nextDue": null,
  "records": [ { "id": "…", "feeType": "Tuition Fee - Semester 3", "amount": 85000,
                 "amountPaid": 85000, "balance": 0, "dueDate": "2026-10-14", "status": "PAID" } ] }
```

`nextDue` is the earliest record with `balance > 0`, otherwise `null`.
`status` is derived: `PAID` (balance 0) · `PARTIAL` (some paid) · `PENDING` (nothing paid).

### `GET /api/students/me/attendance?limit=20`
Auth: required · Role: `STUDENT` · `limit` 1–100 (default 20)

Most recent attendance rows for the signed-in student, newest first:

```json
{ "records": [ { "id": "…", "date": "2026-09-29", "status": "ABSENT",
                 "course": { "code": "CS301", "name": "Data Structures and Algorithms" } } ] }
```

Rows appear here as soon as faculty submit attendance for the session.

### `GET /api/students/me/timetable?day=Monday`

`day` is optional (`Monday`…`Sunday`), defaulting to today's weekday.

```json
{ "day": "Monday", "date": "2026-09-29",
  "entries": [ { "id": "…", "startTime": "09:00:00", "endTime": "10:00:00", "room": "L-201",
                 "section": "A", "course": { "id": "…", "code": "CS301", "name": "…", "credits": 4 },
                 "faculty": { "id": "…", "name": "Dr. Ananya Sharma" } } ] }
```

Only entries matching the student's section, semester **and** active enrollments are returned.
Archived timetable entries are never returned. Errors: 400 when `day` is not a weekday name.

---

## Attendance (Phase 2) — faculty & admin

All three endpoints require authentication and role **FACULTY** or **ADMIN**.
Students receive `403 FORBIDDEN`.

### `GET /api/attendance/classes`
Role: `FACULTY` | `ADMIN`

```json
{ "classes": [ { "id": "<timetableEntryId>", "day": "Monday", "startTime": "09:00:00",
                 "endTime": "10:00:00", "room": "L-201", "section": "A", "semester": 3,
                 "studentCount": 3,
                 "course": { "id": "…", "code": "CS301", "name": "…" },
                 "faculty": { "id": "…", "name": "Dr. Ananya Sharma" } } ] }
```

- `FACULTY` → only timetable entries whose `faculty_id` is their own faculty profile.
- `ADMIN` → every timetable entry (30 in the seed).

### `GET /api/attendance/classes/:timetableEntryId?date=YYYY-MM-DD`
Role: `FACULTY` | `ADMIN` · `date` optional, defaults to today.

```json
{ "class": { … }, "date": "2026-09-29", "alreadySubmitted": true, "recordedCount": 3,
  "students": [ { "studentId": "…", "studentNo": "SC2025-001", "name": "Aarav Sharma",
                  "status": "ABSENT" } ] }
```

`status` is `null` when no attendance exists for that class and date yet.
Errors: `403` when a faculty member requests another faculty member's class, `404` unknown entry, `400 FUTURE_DATE`.

### `POST /api/attendance`
Role: `FACULTY` (own classes only) | `ADMIN` (any class) · Status `201`

```json
{ "timetableEntryId": "…", "date": "2026-09-29",
  "attendance": [ { "studentId": "…", "status": "PRESENT" },
                  { "studentId": "…", "status": "ABSENT" } ] }
```

| Field | Rules |
| ----- | ----- |
| `timetableEntryId` | must exist; for `FACULTY` it must be assigned to them |
| `date` | `YYYY-MM-DD`, real calendar date, not in the future, not before 2000-01-01 |
| `attendance` | 1–500 entries, `status ∈ PRESENT \| ABSENT \| LATE \| LEAVE` |
| `studentId` | must be an ACTIVE enrolment of that course **and** match the class section + semester |

Response:

```json
{ "timetableEntryId": "…", "date": "2026-09-29", "courseCode": "CS301", "section": "A",
  "submitted": 3, "inserted": 3, "updated": 0, "isUpdate": false,
  "counts": { "PRESENT": 2, "ABSENT": 1, "LATE": 0, "LEAVE": 0 } }
```

Behaviour:

- **Transactional** — every row of one request is written in a single PostgreSQL
  transaction; any failure rolls the whole batch back.
- **Idempotent / editable** — `attendance` has `UNIQUE (student_id, course_id, date)`, and the
  service upserts, so re-submitting the same class and date updates rows instead of duplicating them.
  `recorded_by` is preserved when an admin edits (`COALESCE`).

Errors: `400 VALIDATION_ERROR` (shape/status), `400 DUPLICATE_STUDENT`, `400 STUDENT_NOT_IN_CLASS`,
`400 EMPTY_ROSTER`, `400 FUTURE_DATE`, `403 FORBIDDEN`, `404 NOT_FOUND`.

---

## Fee payments (Phase 2)

### `GET /api/fees?q=&status=`
Role: `ADMIN` only · `q` matches student name / student number / email, `status` ∈ `PENDING|PARTIAL|PAID`.

```json
{ "summary": { "feeCount": 18, "totalAmount": 576000, "totalPaid": 456250,
               "totalOutstanding": 119750, "openFeeCount": 10, "studentsWithDues": 5 },
  "records": [ { "id": "…", "feeType": "Tuition Fee - Semester 3", "amount": 85000,
                 "amountPaid": 40000, "balance": 45000, "dueDate": "2026-10-14",
                 "status": "PARTIAL", "paymentCount": 1,
                 "student": { "id": "…", "studentNo": "SC2025-005", "name": "Karthik Reddy",
                              "email": "…", "section": "B", "semester": 3 } } ] }
```

Open fees are sorted first, then by due date. Capped at 500 rows.

### `POST /api/fees/:feeId/payments`
Role: `ADMIN` only (students and faculty get `403`) · Status `201`

```json
{ "amount": 25000, "paymentMethod": "CASH", "reference": "RCT-1023" }
```

| Field | Rules |
| ----- | ----- |
| `amount` | number, `> 0`, ≤ outstanding balance, max 2 decimals |
| `paymentMethod` | `CASH` \| `BANK_TRANSFER` \| `UPI` \| `CARD` |
| `reference` | optional, ≤ 100 chars, empty string is normalised away |

Response: `{ "payment": { … }, "fee": { …updated fee record… } }`.

Single transaction: `SELECT … FOR UPDATE` on the fee → balance check → insert `fee_payments` →
update `fees.amount_paid` → recompute `status` → commit. Any failure rolls everything back, so a
payment row can never exist without the matching balance update.

Status is derived by the backend, never by the client:
`amount_paid = 0 → PENDING`, `0 < amount_paid < amount → PARTIAL`, `amount_paid ≥ amount → PAID`.

Errors: `400 VALIDATION_ERROR`, `400 INVALID_AMOUNT`, `400 OVERPAYMENT` (details carry
`outstandingBalance`), `403 FORBIDDEN`, `404 NOT_FOUND`.

### `GET /api/fees/:feeId/payments`
Role: `ADMIN` | `STUDENT` (own fee records only)

```json
{ "fee": { "id": "…", "feeType": "…", "amount": 6500, "amountPaid": 6500, "balance": 0,
           "dueDate": "2026-10-04", "status": "PAID",
           "student": { "id": "…", "studentNo": "…", "name": "…", "email": "…" } },
  "payments": [ { "id": "…", "feeId": "…", "amount": 6500, "paymentMethod": "UPI",
                  "reference": "REF-2026-0004",
                  "recordedBy": { "id": "…", "name": "Meera Iyer" },
                  "createdAt": "2026-09-20T09:12:44.000Z" } ] }
```

A student requesting another student's fee id gets `404 NOT_FOUND` (existence is not leaked);
faculty get `403`.

---

## Timetable register (Phase 3)

One `timetable_entries` table backs attendance classes, the faculty week view and the student
schedule; this register is its management API.

| Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
| -------- | --------- | --------- | ------- |
| `GET /api/timetable` | `403` | `200`, scoped to own classes (a crafted `facultyId` is ignored) | `200`, full register |
| `GET /api/timetable/options` | `403` | `403` | `200` |
| `GET /api/timetable/:entryId` | `403` | `200` own entry / `403` someone else's | `200` |
| `POST /api/timetable` | `403` | `403` | `201` |
| `PATCH /api/timetable/:entryId` | `403` | `403` | `200` |
| `DELETE /api/timetable/:entryId` | `403` | `403` | `200` (archive) |

### `GET /api/timetable?day=&facultyId=&courseId=&section=&room=&status=`

Role: `FACULTY` | `ADMIN`

| Query | Rules |
| ----- | ----- |
| `day` | `Monday`…`Sunday` (`monday`/`MONDAY` accepted) |
| `facultyId` | UUID; forced to the caller's own profile for `FACULTY` |
| `courseId` | UUID |
| `section` | 1–10 letters/digits/spaces/dashes |
| `room` | case-insensitive substring match |
| `status` | `ACTIVE` (default) \| `ARCHIVED` \| `ALL` |

```json
{ "entries": [ { "id": "…", "day": "Monday", "startTime": "09:00", "endTime": "10:00",
                 "room": "L-201", "section": "A", "semester": 3,
                 "department": "Computer Science and Engineering",
                 "isActive": true, "archivedAt": null,
                 "studentCount": 3, "attendanceRecordCount": 54,
                 "course": { "id": "…", "code": "CS301", "name": "…", "credits": 4 },
                 "faculty": { "id": "…", "name": "Dr. Ananya Sharma" },
                 "createdAt": "…", "updatedAt": "…" } ],
  "total": 30 }
```

`studentCount` is the enrolled roster of that course + section + semester, `attendanceRecordCount`
the attendance rows that would be protected from a hard delete.

### `GET /api/timetable/options`

Role: `ADMIN`. Reference data for the create/edit form:

```json
{ "courses": [ { "id": "…", "code": "CS301", "name": "…", "credits": 4, "semester": 3, "department": "…" } ],
  "faculties": [ { "id": "…", "name": "Dr. Ananya Sharma", "department": "…" } ],
  "sections": [ { "section": "A", "semester": 3, "studentCount": 3 } ] }
```

### `GET /api/timetable/:entryId`

Role: `FACULTY` (own entries only) | `ADMIN`. Returns `{ "entry": { … } }`.

### `POST /api/timetable`

Role: `ADMIN` · Status `201`

```json
{ "courseId": "…", "facultyId": "…", "section": "A", "room": "L-901",
  "day": "Saturday", "startTime": "09:00", "endTime": "10:00" }
```

| Field | Rules |
| ----- | ----- |
| `courseId` | must exist (`404`) |
| `facultyId` | must exist (`404`) |
| `section` | 1–10 chars, and there must be students in it for the course's semester (`400 INVALID_SECTION`) |
| `room` | 1–40 chars, letters/digits/spaces/`./_-` |
| `day` | weekday name, normalised to `Monday`…`Sunday` |
| `startTime` / `endTime` | `HH:MM` (24h, `9:30` normalised to `09:30`), end must be after start |

`semester` and `department` are derived from the course — they are never taken from the client.

**Conflict detection** (inside the write transaction, serialised by a session advisory lock):

- `FACULTY` — the same faculty member teaches an overlapping class that day
- `ROOM` — the same room is booked for an overlapping period (case-insensitive, trimmed)
- `SECTION` — the section already has an overlapping class in the same semester

Touching slots (`10:00–11:00` then `11:00–12:00`) are allowed; archived entries never conflict.

```json
{ "success": false,
  "error": { "code": "TIMETABLE_CONFLICT",
             "message": "Dr. Ananya Sharma already teaches CS301 on Saturday 09:00-10:00 (Section A)",
             "details": { "conflictTypes": ["FACULTY"],
                          "conflicts": [ { "entryId": "…", "type": "FACULTY", "day": "Saturday",
                                           "startTime": "09:00", "endTime": "10:00", "room": "L-201",
                                           "section": "A", "courseCode": "CS301",
                                           "facultyName": "Dr. Ananya Sharma", "message": "…" } ] } } }
```

Creating a slot identical to an **archived** one (same course, day, start time, section) revives
that row instead of failing on the unique constraint.

Errors: `400 VALIDATION_ERROR`, `400 INVALID_SECTION`, `404 NOT_FOUND`, `409 TIMETABLE_CONFLICT`,
`403 FORBIDDEN`.

### `PATCH /api/timetable/:entryId`

Role: `ADMIN` · Status `200`

Send any subset of the create fields plus `isActive` (`true` restores an archived class, `false`
archives it). At least one field is required. Conflicts are re-checked against every **other**
active entry, so editing a slot can never collide with itself; all other validations run again for
the resulting row (a changed course/section re-checks existence and students).

Errors: `400 VALIDATION_ERROR`, `400 INVALID_SECTION`, `404 NOT_FOUND`, `409 TIMETABLE_CONFLICT`.

### `DELETE /api/timetable/:entryId?permanent=false`

Role: `ADMIN` · Status `200`

**Delete is an archive by default.** `attendance` rows are not foreign-keyed to a timetable entry,
so nothing breaks either way — archiving additionally keeps the slot restorable and instantly hides
it from students, faculty class lists and attendance rosters.

```json
{ "entry": { "…": "…", "isActive": false, "archivedAt": "2026-09-29T16:55:40.649Z" },
  "archived": true, "preservedAttendanceRecords": 54 }
```

`?permanent=true` hard-deletes the row, but **only** when no attendance history relates to that
class (same course + section + semester):

```json
{ "success": false, "error": { "code": "DEPENDENCY_CONFLICT",
  "message": "This class has 54 attendance records. Archive it instead so history is preserved.",
  "details": { "attendanceRecords": 54, "remediation": "ARCHIVE" } } }
```

When nothing depends on it the response is `{ "entryId": "…", "deleted": true }`.

Errors: `404 NOT_FOUND`, `409 DEPENDENCY_CONFLICT`.

---
 
 ## AI chat (Phase 4)
 
 A single, **read-only** endpoint. Intent routing, data retrieval and scoping happen on the server:
 allowlisted tools call the existing services (students, fees, attendance, timetable) and hand the
 model a minimized context — the model only phrases the answer, so it never sees SQL, credentials or
 another user's records.
 
 | Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
 | -------- | --------- | --------- | ------- |
 | `POST /api/ai/ask` | `200`, own attendance / fees / timetable | `200`, own classes and attendance | `200`, fee register and institute schedule |
 
 ### `POST /api/ai/ask`
 
 Role: `STUDENT` | `FACULTY` | `ADMIN` · Status `200`
 
 ```json
 { "message": "What's my attendance this semester?" }
 ```
 
 | Field | Rules |
 | ----- | ----- |
 | `message` | required, trimmed, 1–1000 characters; unknown fields are stripped |
 
 ```json
 { "answer": "Your overall attendance is 97.8% (88 of 90 recorded classes). …",
   "intent": "ATTENDANCE",
   "sources": ["attendance"],
   "context": { "user": { "role": "STUDENT" },
                "attendance": { "overall": { "percentage": 97.8, "present": 84, "late": 4, "total": 90 },
                                "byCourse": [ { "code": "CS301", "name": "…", "percentage": 98.9 } ] },
                "scopeNote": "…" },
   "provider": "mock" }
 ```
 
 | Intent | Question shape | `sources` |
 | ------ | -------------- | --------- |
 | `ATTENDANCE` | "What's my attendance?" | `attendance` |
 | `COURSE_ATTENDANCE` | "Attendance in Data Structures" (unknown course → graceful note) | `attendance` |
 | `FEES` | "How much fee is pending?" (admin → institute fee register) | `fees` |
 | `FEE_HISTORY` | "Show my payment history" | `fees` |
 | `TIMETABLE` | "What classes today?" (admin → institute schedule) | `timetable` |
 | `NEXT_CLASS` | "When is my next class?" | `timetable` |
 | `GENERAL` | anything else — out of scope, injection or secret requests get a fixed refusal | `[]` |
 
 Notes:
 
 - `provider` is `mock` or `openai` (`AI_PROVIDER` decides; `auto` picks OpenAI only when
   `OPENAI_API_KEY` is set). The answer is only guaranteed to match `sources`/`context` for the mock.
 - Asking about **other people's records** (names, "all students", "his attendance") answers with
   `context.scopeNote` and data from the caller's account only — never someone else's.
 - **Rate limit**: `AI_RATE_LIMIT_MAX` per user per window (default 30/min) → `429 RATE_LIMITED`.
 - **Provider errors**: `503 AI_UNAVAILABLE`, `504 AI_TIMEOUT`.
 
 ---
 
 ## Performance prediction (Phase 5)
 
 Predict a student's overall academic performance category using attendance, assessment and
 assignment data. The backend determines the student from the JWT — the frontend never supplies
 a `studentId`.
 
 | Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
 | -------- | --------- | --------- | ------- |
 | `GET /api/performance/predict` | `200`, own prediction | `403` (not own classes) | `403` (not own data) |
 | `GET /api/performance` | `200`, own features | `403` | `403` |
 
### `GET /api/performance/predict`

Auth: JWT required · Role: `STUDENT` only · Returns the performance prediction for the
authenticated student.

```json
{ "success": true, "data": {
    "category": "EXCELLENT",
    "confidence": 0.755,
    "probabilities": { "AT_RISK": 0.035, "EXCELLENT": 0.755, "GOOD": 0.21 },
    "model_version": "v1",
    "features_used": ["attendance_percentage", "total_classes", "..."],
    "prediction_source": "ML",
    "is_model_prediction": true,
    "model_trained_at": "2026-09-30T05:26:37.300007Z",
    "predicted_at": "2026-10-01T20:13:25.429111+00:00" },
  "message": "Performance prediction retrieved" }
```

| Field | Description |
| ----- | ----------- |
| `category` | One of: `EXCELLENT` (≥85), `GOOD` (70‑84), `AVERAGE` (55‑69), `AT_RISK` (<55) |
| `confidence` | Confidence of the predicted band (0‑1), display as a percentage |
| `probabilities` | Per-class distribution, summing to 1 |
| `model_version` | Version of the artifact that produced the prediction (`v1`) |
| `features_used` | The features the prediction was derived from — all 44 on the ML path |
| `prediction_source` | `ML` when the Python service scored the model, `RULE_BASED` on degradation |
| `is_model_prediction` | `true` only when the numbers came from the trained model |
| `fallback_reason` | Present only when `prediction_source` is `RULE_BASED`: `ML_DISABLED`, `ML_UNREACHABLE`, `ML_TIMEOUT`, `ML_BAD_STATUS` or `ML_INVALID_RESPONSE` |
| `model_trained_at` | Training timestamp recorded in the model metadata (ML path only) |
| `predicted_at` | ISO-8601 timestamp of the inference (ML path only) |

**Prediction source.** The backend builds the model's full 44-feature vector from
the authenticated student's own records and posts it to the Python inference
service (`ML_SERVICE_URL`). When that service cannot answer within
`ML_TIMEOUT_MS`, the endpoint still returns `200` with the rule-based estimate
tagged `prediction_source: "RULE_BASED"`, `is_model_prediction: false` and
`model_version: "rule-based-v1"`. A fallback confidence is a band distance and is
never presented as model confidence.

**Class support.** The shipped model was trained on data with no `AVERAGE`
example, so it has three classes — `AT_RISK`, `EXCELLENT`, `GOOD`. Its
`probabilities` object contains exactly those three. `AVERAGE` is not reported
with a zero probability: a band the model never learned is omitted, so "the
model says zero" stays distinguishable from "the model cannot say". The
rule-based path, being threshold-based, can return all four.

See [`docs/ML_ARCHITECTURE.md`](ML_ARCHITECTURE.md) for the feature mapping,
failure-handling matrix and model limitations.

Errors:
- `401 UNAUTHORIZED` when no valid JWT is provided
- `403 FORBIDDEN` when role is not `STUDENT` (FACULTY/ADMIN cannot predict for arbitrary students)
- `404 NOT_FOUND` when the account has no linked student profile

There is no `503`: an unavailable ML service degrades to a labelled fallback
rather than failing the request.

### `GET /api/performance`

Auth: JWT required · Role: `STUDENT` only · Returns the 8 aggregate features behind the prediction.

```json
{ "success": true, "data": {
    "attendance_percentage": 97.78,
    "avg_assessment_percentage": 90.21,
    "total_assessments": 19,
    "assignment_submission_rate": 100,
    "avg_assignment_score": 8.88,
    "academic_score": 92.21 },
  "message": "Student performance features retrieved" }
```

| Field | Description |
| ----- | ----------- |
| `attendance_percentage` | Overall attendance percentage across all courses (`PRESENT`/`LATE` count as attended; every row, including `ABSENT` and `LEAVE`, is in the denominator) |
| `avg_assessment_percentage` | Mean of `marks_obtained / max_marks * 100` across all assessments |
| `total_assessments` | Number of assessment rows for the student |
| `assignment_submission_rate` | Percentage of assignments marked submitted |
| `avg_assignment_score` | Mean of `score` over submitted assignments, **on the 0–10 scale** |
| `academic_score` | Weighted composite: attendance 30 %, assessments 50 %, assignment term 20 % (submission rate × score scaled to a percentage) |

These are the aggregate members of the model's feature vector; the per-course and
per-assessment-type features are internal to the prediction path. Fields are
`snake_case` because this module returns the aggregate shape directly. The
recommendations module built on top of them (`GET /api/recommendations`) uses
`camelCase`.

Errors:
  - `401 UNAUTHORIZED` when no valid JWT is provided
  - `403 FORBIDDEN` when role is not `STUDENT`
  - `404 NOT_FOUND` when the account has no linked student profile
  
---

## Personalized Learning Recommendations (Phase 6)

Generates personalized learning recommendations based on the student's academic performance data. The backend determines the student from the JWT — the frontend never supplies a `studentId`.

| Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
| -------- | --------- | --------- | ------- |
| `GET /api/recommendations` | `200`, own recommendations | `403` | `403` |
| `GET /api/recommendations/study-plan` | `200`, own AI study plan | `403` | `403` |

### `GET /api/recommendations`

Auth: JWT required · Role: `STUDENT` only · Returns personalized learning recommendations for the authenticated student.

```json
{ "success": true, "data": {
  "summary": { "highPriority": 2, "mediumPriority": 1, "coursesNeedingAttention": 2 },
  "recommendations": [
    {
      "courseId": "...",
      "courseName": "Discrete Mathematics",
      "category": "ASSESSMENT",
      "priority": "HIGH",
      "reason": "Your assessment average in MA201 is 54%, below the warning threshold of 60%",
      "metrics": { "attendancePercentage": 88, "assessmentPercentage": 54, "assignmentSubmissionRate": 92, "totalAssignments": 3 },
      "resources": [
        { "id": "...", "course_id": "...", "title": "Proof Techniques: Induction, Contradiction, Contrapositive", "description": "Step-by-step guide to mathematical proof methods with examples", "resource_type": "VIDEO", "topic": "proof techniques", "difficulty": "beginner", "url": "https://www.math.csusb.edu/notes/proofs/pfnot/pfnot.html", "active": true }
      ],
      "resourceCount": 1
    }
  ]
}, "message": "Recommendations generated" }
```

| Field | Description |
| ----- | ----------- |
| `summary.highPriority` | Number of HIGH priority recommendations |
| `summary.mediumPriority` | Number of MEDIUM priority recommendations |
| `summary.coursesNeedingAttention` | Number of recommendation rows generated. A course with a non-`HIGH` weakness yields two rows (the weakness plus a `STUDY_ACTION` row), so this can exceed the number of distinct courses |
| `recommendations[].courseId` | UUID of the course |
| `recommendations[].courseName` | Human-readable course name |
| `recommendations[].category` | One of: `COURSE_WEAKNESS`, `ATTENDANCE`, `ASSESSMENT`, `ASSIGNMENT`, `STUDY_ACTION`, `REMEDIAL_SUPPORT` |
| `recommendations[].priority` | `HIGH`, `MEDIUM`, or `LOW` — deterministic from metric severity |
| `recommendations[].reason` | Factual explanation citing real metric values and thresholds |
| `recommendations[].metrics` | Supporting metrics for the course |
| `recommendations[].resources` | Curated learning resources matched by course, topic, difficulty and priority |
| `recommendations[].resourceCount` | Number of resources attached |

**Deterministic priority rules:**
- `HIGH` — 3+ weakness indicators, OR any single metric >15 points below threshold
- `MEDIUM` — 2 weakness indicators, OR 1 metric 8–15 points below threshold
- `LOW` — 1 weakness indicator with metric <8 points below threshold

**Thresholds (centralized):**
- `ATTENDANCE_WARNING` = 70%
- `ASSESSMENT_WARNING` = 60%
- `ASSIGNMENT_WARNING` = 65%

Errors:
- `401 UNAUTHORIZED` when no valid JWT is provided
- `403 FORBIDDEN` when role is not `STUDENT`

### `GET /api/recommendations/study-plan`

Auth: JWT required · Role: `STUDENT` only · Returns an optional AI-generated study plan based on the deterministic recommendations. Reuses the Phase 4 AI provider abstraction; gracefully falls back to structured recommendations if the AI provider fails.

```json
{ "success": true, "data": { "studyPlan": "Based on your academic profile...", "recommendations": [ { "course": "Discrete Mathematics", "category": "ASSESSMENT", "priority": "HIGH", "reason": "..." } ] }, "message": "Study plan generated" }
```

| Field | Description |
| ----- | ----------- |
| `studyPlan` | Natural language study guidance (markdown) or `null` if AI unavailable |
| `recommendations` | Abbreviated recommendation list for reference |
| `fallback` | Present when AI provider failed; deterministic engine used |

Notes:
- The AI **never invents** academic facts (marks, attendance, courses, deadlines, resources, teachers, remedial classes).
- Context passed to the AI contains only verified deterministic recommendation data.
- If the AI provider fails (unavailable, timeout, rate limit, auth), the endpoint returns the structured recommendations with `fallback: true` and `studyPlan: null` — the deterministic engine is the primary feature.

---

## Dropout risk & interventions (Phase 7)

Advisory early-warning analytics over temporal academic signals. Risk scores are
internal indicators (0–100), **not** probabilities of dropout, and never trigger
automatic action against a student. All staff endpoints derive authorized scope
from the JWT — `studentId`/`courseId`/`section` parameters cannot widen access.

| Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
| -------- | --------- | --------- | ------- |
| `GET /api/risk/own/analysis` | `200`, own level + signals (no staff notes) | `403` | `403` |
| `GET /api/risk/own/intervention-plan` | `200`, optional AI suggestion | `403` | `403` |
| `GET /api/risk/students` | `403` | `200`, students in assigned courses | `200`, all active students |
| `GET /api/risk/stats` | `403` | `200`, scoped cohort summary | `200`, full cohort summary |
| `GET /api/risk/students/:studentId` | `403` | `200`, own courses only | `200` |
| `GET /api/risk/students/:studentId/trends` | `403` | `200`, own courses only | `200` |
| `GET /api/risk/students/:studentId/interventions` | `403` | `200`, own courses only | `200` |
| `POST /api/risk/students/:studentId/interventions` | `403` | `201`, own courses only | `201` |
| `POST /api/risk/interventions` | `403` | `201`, own courses only | `201` |
| `PATCH /api/risk/interventions/:interventionId` | `403` | `200`, in-scope only | `200` |

`:studentId` is `students.id` (the profile id), never `users.id`.

### `GET /api/risk/own/analysis`

Auth: JWT required · Role: `STUDENT` only · Returns the caller's own high-level
warning information. Staff notes and other students are never included.

```json
{ "success": true, "data": { "riskLevel": "LOW", "signals": ["Assessment performance mild decline (93% → 87%)"],
  "trends": { "attendance": { "current": 100, "previous": 96, "change": 4 },
              "assessments": { "current": 87, "previous": 93, "change": -6 },
              "assignments": { "current": 89, "previous": 89, "change": 0 } },
  "currentMetrics": { "attendancePercentage": 97.8, "avgAssessmentPercentage": 88.1,
    "assignmentSubmissionRate": 95.2, "avgAssignmentScore": 87.4, "academicScore": 90.2 } },
  "message": "Risk analysis completed" }
```

### `GET /api/risk/students`

Auth: JWT required · Role: `FACULTY` | `ADMIN` · Paginated (max 200) risk list,
sorted CRITICAL → HIGH → MODERATE → LOW. Missing daily snapshots are computed
on demand and persisted, so the first load both backfills and returns data.

Query filters (all optional): `riskLevel` (`CRITICAL|HIGH|MODERATE|LOW`),
`section` (e.g. `A`), `course` (course-code substring, e.g. `CS301`).

```json
{ "success": true, "data": { "students": [ { "studentId": "…", "studentName": "Karthik Reddy",
  "studentEmail": "…", "studentNo": "SC2025-005", "section": "B",
  "riskLevel": "CRITICAL", "riskScore": 95,
  "signals": ["Attendance severe decline (93% → 56%)", "…"],
  "trends": { "attendance": { "current": 56, "previous": 93, "change": -37 }, "assessments": { "…" : "…" }, "assignments": { "…" : "…" } },
  "openInterventions": 1, "lastUpdated": "2026-10-01" } ] },
  "message": "Risk data retrieved" }
```

### `GET /api/risk/stats`

Auth: JWT required · Role: `FACULTY` | `ADMIN` · Cohort summary scoped like the list.

```json
{ "success": true, "data": { "totalStudents": 6, "critical": 2, "high": 1,
  "moderate": 0, "low": 3, "decliningAttendance": 2, "decliningAssessments": 5,
  "decliningAssignments": 3, "openInterventions": 1 },
  "message": "Risk statistics retrieved" }
```

### `GET /api/risk/students/:studentId`

Auth: JWT required · Role: `FACULTY` (own courses) | `ADMIN` · Returns
`{ student, riskAnalysis, interventions }`. Faculty requesting a student outside
their assigned courses receive `403 FORBIDDEN`; unknown ids return `404`.

### Interventions

`POST /api/risk/students/:studentId/interventions` (or the `POST /api/risk/interventions`
alias with `{ studentId, … }` in the body) · Status `201` · Body:

```json
{ "interventionType": "ATTENDANCE_SUPPORT", "notes": "Agreed attendance plan", "followUpDate": "2026-10-15" }
```

`interventionType` ∈ `ACADEMIC_REVIEW|ATTENDANCE_SUPPORT|ASSESSMENT_SUPPORT|
ASSIGNMENT_SUPPORT|REMEDIAL_SUPPORT|FACULTY_MEETING|GENERAL_FOLLOW_UP` ·
`followUpDate` is `YYYY-MM-DD` or `null`. `status` defaults to `OPEN`;
`risk_level_at_creation` is captured from the current deterministic analysis.

`PATCH /api/risk/interventions/:interventionId` accepts any subset of
`{ interventionType, notes, status, followUpDate }` ·
`status` ∈ `OPEN|IN_PROGRESS|COMPLETED|DISMISSED`. Faculty may update only
interventions for students in their courses; students receive `403`.

Errors: `401 UNAUTHORIZED` (no token) · `403 FORBIDDEN` (wrong role or
out-of-scope student) · `404 NOT_FOUND` (unknown student/intervention) ·
`400 VALIDATION_ERROR` (bad type/status/date).

### Scoring reference (deterministic, documented)

Attendance/assessment decline: severe (≤ −15) +25 · moderate (≤ −8) +15 · mild
(≤ −3) +5 · Assignment decline: +20 / +12 / +6 · Very low current value
(< 50 attendance, < 40 assessment, < 40 assignment completion): +15 · Low
(< 60 / < 50 / < 50): +10 · Two or more declining domains: +10 bonus ·
Levels: ≥ 70 `CRITICAL` · ≥ 50 `HIGH` · ≥ 30 `MODERATE` · else `LOW`.

---

## Parent portal (Phase 8)

Invitation-gated, read-only guardian access. Every parent endpoint verifies
JWT → `PARENT` role → ACTIVE `parent_student_links` row for the requested
student. Forged or unlinked student ids return `404` (existence is not leaked).
Staff-only data (risk scores/snapshots, intervention notes, payment methods,
other students) is never included.

| Endpoint | `PARENT` | Others |
| -------- | -------- | ------ |
| `POST /api/parent/activate` (public) | n/a (activation) | n/a |
| `GET /api/parent/students` | `200`, linked students only | `403` |
| `GET /api/parent/students/:studentId/overview` | `200`, linked only | `403`/`404` |
| `GET /api/parent/students/:studentId/attendance` | `200`, linked only | `403`/`404` |
| `GET /api/parent/students/:studentId/fees` | `200`, linked only | `403`/`404` |
| `GET /api/parent/students/:studentId/timetable?day=` | `200`, linked only | `403`/`404` |
| `GET /api/parent/students/:studentId/recommendations` | `200`, headlines only | `403`/`404` |
| `GET /api/parent/students/:studentId/notices` | `200`, derived notices | `403`/`404` |
| `GET /api/admin/parents` | `403` | `200` ADMIN only |
| `GET /api/admin/parents/invitations` | `403` | `200` ADMIN only |
| `POST /api/admin/parents/invitations` | `403` | `201` ADMIN only |
| `PATCH /api/admin/parents/invitations/:invitationId/revoke` | `403` | `200` ADMIN only |
| `PATCH /api/admin/parents/links/:linkId` | `403` | `200` ADMIN only |
| `POST /api/ai/ask` | `200`, linked-child scope | per-role scopes (§ Phase 4/7) |

`:studentId` is `students.id` (the profile id).

### `POST /api/parent/activate` (public)

```json
{ "token": "<invitation-token>", "name": "Ravi Sharma", "password": "Password123!" }
```

Validates the token (exists, `PENDING`, unexpired, single-use via row lock),
creates (or reuses, for multi-student families) the `PARENT` account, activates
the link, marks the invitation `ACCEPTED`, and returns `{ token, user }` (a
normal JWT login). Response **201**.

Errors: `404 NOT_FOUND` (unknown token) · `400 INVITATION_REVOKED` ·
`400 INVITATION_USED` · `400 INVITATION_EXPIRED` (row is also flipped to
`EXPIRED`) · `409 EMAIL_TAKEN` (email belongs to a non-parent account) ·
`400 VALIDATION_ERROR`.

### `POST /api/admin/parents/invitations`

Role: `ADMIN` · Status `201` · Body `{ studentId, parentEmail,
relationshipType = PARENT, expiresInHours = 168 (1–168) }`. Rejects unknown
students (`404`) and duplicate pending invitations for the same student+email
(`409 INVITATION_EXISTS`). Returns `{ invitation, token }` — the raw token is
shown **once**; only its SHA-256 hash is stored.

### `GET /api/parent/students/:studentId/overview`

```json
{ "student": { "id": "…", "studentNo": "SC2025-001", "name": "Aarav Sharma",
  "department": "…", "semester": 3, "section": "A", "batchYear": 2025 },
  "academic": { "attendancePercentage": 97.8, "avgAssessmentPercentage": 90.2,
    "totalAssessments": 19, "assignmentSubmissionRate": 100, "performanceCategory": "EXCELLENT" } }
```

Attendance/fees/timetable reuse the student shapes (`overall`/`byCourse`,
records with balance/status/due dates, day entries). Recommendations return
`{ summary, headlines: [{ courseName, category, priority, reason, resources:
[{ title, url, type, topic }], resourceCount }] }`. Notices are derived:
`ATTENDANCE_WARNING` (< 75%), `FEE_DUE` (pending + next due), `TODAY_CLASSES`.

---

## Hostel management (Phase 9)

Room allocation is backend-owned: students request, staff executes. Bed
collisions, double allocations, and over-capacity are blocked by partial
unique indexes plus a capacity trigger and transactional writes.

| Endpoint | `STUDENT` | `ADMIN` |
| -------- | --------- | ------- |
| `GET /api/hostel/me` | `200`, own allocation + roommates + hostel fees | `403` |
| `GET /api/hostel/rooms` | `200`, vacancy list (no occupant names) | — (use admin register) |
| `GET /api/hostel/complaints` | `200`, own only | — |
| `POST /api/hostel/complaints` | `201` | — |
| `GET /api/hostel/room-changes` | `200`, own only | — |
| `POST /api/hostel/room-changes` | `201` (needs active allocation; one pending max) | — |
| `GET /api/hostel/visitors` | `200`, own only | — |
| `POST /api/hostel/visitors` | `201` (date not in the past) | — |
| `GET /api/admin/hostel/dashboard` | `403` | `200`, aggregate occupancy |
| `GET /api/admin/hostel/hostels` · `POST` | `403` | `200` · `201` (`409` duplicate name) |
| `GET /api/admin/hostel/rooms` · `POST` | `403` | `200` · `201` (`409` duplicate room no.) |
| `GET /api/admin/hostel/allocations` · `POST` | `403` | `200` · `201` (`409` double-booked/occupied) |
| `PATCH /api/admin/hostel/allocations/:id/vacate` | `403` | `200` |
| `POST /api/admin/hostel/allocations/:id/transfer` | `403` | `200`, atomic move |
| `GET /api/admin/hostel/complaints` · `PATCH /:id` | `403` | `200` (status/priority) |
| `GET /api/admin/hostel/room-changes` · `PATCH /:id/review` | `403` | `200`; `APPROVED` executes the move |
| `GET /api/admin/hostel/visitors` · `PATCH /:id` | `403` | `200` |

`GET /api/hostel/me` returns `{ allocation | null, roommates[], fees[] }`
(hostel fees reuse the existing fees ledger via `fee_type LIKE 'Hostel%'`).
FACULTY/PARENT receive `403` on both routers (parents use
`GET /api/parent/students/:id/hostel`, which returns allocation summary +
roommate count + fees — no roommate names).

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR` · `409 ALLOCATION_CONFLICT`/`DUPLICATE_RESOURCE`.

## Transport management (Phase 9)

Student assignments are staff-owned; each student holds at most one ACTIVE
assignment (partial unique index), stops must belong to the route (trigger),
and assigning a student auto-generates their bus pass. No GPS in this phase —
statuses are staff-maintained.

| Endpoint | `STUDENT` | `ADMIN` |
| -------- | --------- | ------- |
| `GET /api/transport/me` | `200`, route + stop + vehicle + pass + alerts | `403` |
| `GET /api/admin/transport/dashboard` | `403` | `200`, fleet/route stats |
| `GET /api/admin/transport/vehicles` · `POST` · `PATCH /:id` | `403` | `200` · `201` (`409` duplicate registration) · `200` |
| `GET /api/admin/transport/drivers` · `POST` | `403` | `200` · `201` (`409` duplicate license) |
| `GET /api/admin/transport/routes` · `POST` · `GET /:id` · `PATCH /:id` | `403` | `200` · `201` (`409` duplicate code) · `200` · `200` |
| `POST /api/admin/transport/stops` · `PATCH /stops/:id` | `403` | `201` (`409` duplicate sequence) · `200` |
| `GET /api/admin/transport/assignments` · `POST` · `PATCH /:id/end` | `403` | `200` · `201` + auto pass (`409` double assignment, `400` cross-route stop) · `200` (`404` repeat end) |
| `GET /api/admin/transport/alerts` · `POST` · `PATCH /:id` | `403` | `200` · `201` · `200` (activate/deactivate) |

`GET /api/transport/me` returns `{ assignment | null, pass | null, alerts[] }`
with the full stop timeline, vehicle + driver name, pass validity, the
linked transport fee status, and active alerts for the route.
FACULTY/PARENT receive `403` here; parents use
`GET /api/parent/students/:id/transport` (same shape, link-checked).

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR` · `409 ALLOCATION_CONFLICT`/`DUPLICATE_RESOURCE`.

---

## Digital certificates (Phase 10)

Request → review → approve → issue → download/verify. State machine:
`PENDING → APPROVED → ISSUED → REVOKED`, `PENDING → REJECTED`. Only the
shown transitions exist; everything else returns `400 INVALID_TRANSITION`.
Numbering (`SC-YYYY-XXX-NNNNNN` from a sequence) and verification codes
(12-char random) are server-generated and unique by constraint.

| Endpoint | `STUDENT` | `ADMIN` | Others |
| -------- | --------- | ------- | ------ |
| `POST /api/certificates/requests` | `201` (`409` duplicate pending type) | `403` | `403` |
| `GET /api/certificates/requests` | `200`, own only | — | `403` |
| `GET /api/certificates` | `200`, own issued only | — | `403` |
| `GET /api/certificates/:id` | `200`, own only (`404` otherwise) | — | `403`/`404` |
| `GET /api/certificates/:id/download` | `200` PDF, own only (`?view=1` for inline) | — | `403`/`404` |
| `GET /api/admin/certificates/requests` | `403` | `200`, filters `status/type/q` | `403` |
| `GET /api/admin/certificates/requests/:id` | `403` | `200` + student + academic context | `403` |
| `PATCH /api/admin/certificates/requests/:id/approve` | `403` | `200` | `403` |
| `PATCH /api/admin/certificates/requests/:id/reject` | `403` | `200` (reason required) | `403` |
| `POST /api/admin/certificates/requests/:id/issue` | `403` | `201` + unique number/code | `403` |
| `PATCH /api/admin/certificates/:id/revoke` | `403` | `200` | `403` |
| `GET /api/parent/students/:studentId/certificates` | `403` | `403` | `200` PARENT, linked only |
| `GET /api/certificates/verify/:verificationCode` | public | public | public (120/min/IP) |

Request body: `{ certificateType: BONAFIDE|TRANSCRIPT|CONDUCT|ENROLLMENT,
purpose: string (5–2000 chars) }`. Reject body: `{ rejectionReason }`.

### `GET /api/certificates/verify/:verificationCode` (public, no auth)

```json
{ "success": true, "data": { "certificateNumber": "SC-2026-BON-000001",
  "certificateType": "BONAFIDE", "studentName": "Aarav S.",
  "institution": "SmartCampus (Demo)", "issuedDate": "2026-09-21", "status": "VALID" },
  "message": "Certificate verified" }
```

Revoked certificates return `200` with `status: "REVOKED"`; unknown codes
return `404 NOT_FOUND`. The payload carries no email, fees, attendance,
grades, notes, scores, or internal ids (student name is masked to first
name + surname initial).

Documents are generated server-side (pdfkit) with an embedded QR code
pointing at `{FRONTEND_URL}/verify/<code>` and demo-branding disclaimers.
PDFs regenerate deterministically on each download — no certificate files
are stored on disk or in the database.

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR` · `400 INVALID_TRANSITION` ·
`409 DUPLICATE_RESOURCE` · `429 RATE_LIMITED` (verify only).

---

## Library management (Phase 11)

Catalogue → reserve → issue → borrow → renew/track → return → fine (if
overdue) → fee ledger. Fines are ordinary `fees` rows linked by
`library_loan_id` — no second ledger. Overdue state is computed from due
dates, never stored. Policy: Rs.10/day, Rs.500 cap, 14-day loans, max 4
active loans, max 2 renewals, max 3 active reservations.

| Endpoint | `STUDENT` | `FACULTY` | `ADMIN` |
| -------- | --------- | --------- | ------- |
| `GET /api/library/books?q=&category=&author=&available=&page=&limit=` | `200` | `200` read-only | `200` |
| `GET /api/library/books/:id` | `200` | `200` | `200` |
| `GET /api/library/my-loans` | `200`, own only | `403` | `403` here |
| `GET /api/library/my-reservations` | `200`, own only | `403` | — |
| `GET /api/library/my-fines` | `200`, ledger + accruing | `403` | — |
| `POST /api/library/books/:id/reserve` | `201` (`409` duplicate) | `403` | — |
| `POST /api/library/loans/:id/renew` | `200` (`409` queue/limit, `400` overdue) | `403` | — |
| `POST /api/library/reservations/:id/cancel` | `200`, own only | `403` | — |
| `GET /api/admin/library/books` · `POST` · `PATCH /books/:id` | `403` | `403` | `200` · `201` (`409` ISBN) · `200` |
| `GET /api/admin/library/copies` · `POST` · `PATCH /copies/:id` | `403` | `403` | `200` · `201` (`409` accession) · `200` |
| `GET /api/admin/library/loans?status=` · `OVERDUE` view | `403` | `403` | `200` with computed days/fines |
| `POST /api/admin/library/issue` | `403` | `403` | `201` (`409` double-issue/queue/limit) |
| `POST /api/admin/library/return` | `403` | `403` | `200` + fine ledger upsert |
| `GET /api/admin/library/reservations` · `PATCH /:id/cancel` | `403` | `403` | `200` · `200` |
| `GET /api/admin/library/fines` | `403` | `403` | `200`, ledger-backed |
| `GET /api/parent/students/:studentId/library` | `403` | `403` | `403` · `200` PARENT, linked only |

Catalogue responses are paginated (`{ items, total, page, limit }`, max 100
per page). Issue requires an AVAILABLE copy (or a RESERVED copy held for
the student), an active book, head-of-queue priority, and borrowing-limit
headroom — all inside one transaction with row locks. Returns compute
`overdue_days × Rs.10` (capped), upsert exactly one fee row per loan, and
promote the longest-waiting reserver to READY (FIFO). Renewals extend by 14
days and fail past the limit, when overdue, or when others wait.

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR` · `409 DUPLICATE_RESOURCE`/`ALLOCATION_CONFLICT`/
`RESERVATION_CONFLICT`.

---

## Alumni relations (Phase 13)

Directory, mentorship, events, and giving. The directory lists only
`VERIFIED` + `PUBLIC` alumni with name and professional fields — never
contact details. Mentorship and event registration are transactional
(row locks, capacity checks, duplicate prevention). Pledges are recorded
intentions, not payments; no gateway exists.

| Endpoint | `STUDENT` | `ALUMNI` | `FACULTY` | `ADMIN` | `PARENT` |
| -------- | --------- | -------- | --------- | ------- | -------- |
| `GET /api/alumni/directory` | `200` | `200` | `200` | `200` | `403` |
| `GET /api/alumni/directory/:id` | `200` | `200` | `200` | `200` | `403` |
| `GET /api/alumni/me/profile` · `PATCH` | `403` | `200` own only | `403` | `403` here | `403` |
| `GET /api/alumni/me/mentorships` · `PATCH /:id` | — | `200` own inbox | — | — | — |
| `POST /api/alumni/mentorships` · `POST /:id/cancel` | `201` · `200` own only | — | — | — | — |
| `GET /api/alumni/events` · `POST /:id/register|cancel` | `200` · `201`/`200` | same | read/register | — | `403` |
| `GET /api/alumni/campaigns` | `200` | `200` | — | — | — |
| `POST /api/alumni/me/contributions` | `403` | `201` PLEDGED | `403` | — | — |
| `GET /api/admin/alumni/profiles` · `PATCH /:id` | `403` | `403` | `403` | `200` verify/activate | `403` |
| `GET /api/admin/alumni/mentorships` | `403` | `403` | `403` | `200` | `403` |
| `GET /api/admin/alumni/events` · `POST` · `PATCH /:id` | `403` | `403` | `403` | `200` · `201` · `200` | `403` |
| `GET /api/admin/alumni/events/:id/registrations` · `PATCH /registrations/:id/attend` | `403` | `403` | `403` | `200` | `403` |
| `GET /api/admin/alumni/campaigns` · `POST` · `PATCH /:id` | `403` | `403` | `403` | `200` · `201` · `200` | `403` |
| `GET /api/admin/alumni/contributions` · `POST` · `PATCH /:id` | `403` | `403` | `403` | `200` · `201` · `200` | `403` |
| `GET /api/admin/alumni/analytics` | `403` | `403` | `403` | `200` aggregates only | `403` |

Mentorship transitions: `REQUESTED→ACCEPTED|REJECTED|CANCELLED`,
`ACCEPTED→COMPLETED|CANCELLED`, enforced row-locked (`400
INVALID_TRANSITION` otherwise). Events move
`DRAFT→PUBLISHED→CLOSED|COMPLETED` (plus `CANCELLED`); registration needs
`PUBLISHED` status, audience eligibility, free capacity, and no existing
registration (`409` on duplicates/full).

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR`/`INVALID_TRANSITION` ·
`409 DUPLICATE_RESOURCE`/`EVENT_FULL`.

---

## Mess & canteen (Phase 14)

Meal plans → enrollment → menu → meal usage → billing → fee ledger, and
catalogue → order → price snapshot → billing → fee ledger. Billing is
idempotent: plan charges (MONTHLY full price, WEEKLY price × weeks
overlapped, MEAL_BASED price × consumed meals) and COMPLETED-order sweeps
land in `Mess Plan - YYYY-MM` / `Canteen - YYYY-MM` fee rows that are
recomputed — never duplicated — on re-runs.

| Endpoint | `STUDENT` | `ADMIN` | Others |
| -------- | --------- | ------- | ------ |
| `GET /api/mess/plan` · `POST /mess/enroll` · `POST /mess/enrollment/cancel` | `200` own · `201` (`409` duplicate) · `200` | `403` | `403` |
| `GET /api/mess/menu?scope=today\|tomorrow\|week` | `200` | — | `403` |
| `GET /api/mess/meals` | `200`, own only | — | `403` |
| `GET /api/mess/billing` | `200`, ledger outstanding + fees | — | `403` |
| `GET /api/mess/canteen?q=&category=&available=` | `200` | — | `403` |
| `POST /api/mess/orders` | `201` with snapshot totals (`400` bad qty/unavailable) | — | `403` |
| `POST /api/mess/orders/:id/cancel` | `200`, own PENDING/CONFIRMED | — | `403`/`404` |
| `POST /api/mess/feedback` · `GET /mess/feedback` | `201` (`400` bad rating) · `200` own | — | `403` |
| `GET /api/admin/mess/plans` · `POST` · `PATCH /:id` | `403` | `200` · `201` · `200` | `403` |
| `GET /api/admin/mess/menu` · `POST` · `PATCH /:id` · `DELETE /:id` | `403` | `200` · `201` (`409` slot) · `200` · `200` | `403` |
| `POST /api/admin/mess/meals/record` · `GET /meals` | `403` | `201` upsert · `200` | `403` |
| `GET /api/admin/mess/items` · `POST` · `PATCH /:id` | `403` | `200` · `201` · `200` | `403` |
| `GET /api/admin/mess/orders` · `PATCH /:id` | `403` | `200` · `200` (`400` bad transition) | `403` |
| `POST /api/admin/mess/billing` | `403` | `200` + per-student breakdown | `403` |
| `GET /api/admin/mess/feedback` · `/analytics` | `403` | `200` aggregates | `403` |
| `GET /api/parent/students/:studentId/mess` | `403` | `403` | `200` PARENT, linked only |

Order pipeline: `PENDING→CONFIRMED→READY→COMPLETED` (+`CANCELLED` from the
first three), students cancelling only their own `PENDING`/`CONFIRMED`
orders. FACULTY/PARENT receive `403` on both routers (parents use the
dedicated summary endpoint).

Errors: `401 UNAUTHORIZED` · `403 FORBIDDEN` · `404 NOT_FOUND` ·
`400 VALIDATION_ERROR` · `409 DUPLICATE_RESOURCE`.

---

## Not implemented yet

Still future phases: blockchain certificates, voice/face/QR attendance,
payment gateway, biometric access, RFID/QR meal scanning, email/SMS
automation, grade entry, bulk fee generation and refund/reversal endpoints.
