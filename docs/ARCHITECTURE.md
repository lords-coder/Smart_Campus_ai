# SmartCampus AI Ã¢â‚¬â€ Architecture (Phase 4)

## 1. High-level

```
Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
Ã¢â€â€š  frontend (Next.js)  Ã¢â€â€š  React UI Ã‚Â· JWT stored in localStorage Ã‚Â· single API client
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
           Ã¢â€â€š  HTTPS/JSON  Ã‚Â·  Authorization: Bearer <jwt>
Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
Ã¢â€â€š  backend (Express)   Ã¢â€â€š  middleware Ã¢â€ â€™ controller Ã¢â€ â€™ service Ã¢â€ â€™ SQL
Ã¢â€â€š  modular monolith    Ã¢â€â€š
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
           Ã¢â€â€š  parameterised SQL (pg pool)
Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€“Â¼Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
Ã¢â€â€š  PostgreSQL 16       Ã¢â€â€š  migrations in database/migrations/*.sql
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
```

One frontend, one backend, one database. No microservices. Every feature is added as a
**module** inside `backend/src/modules/`, keeping the door open for later phases without a
rewrite.

## 2. Backend request lifecycle

```
HTTP request
  Ã¢â€ â€™ cors()                    allow-listed origins only (FRONTEND_URL)
  Ã¢â€ â€™ express.json()            100kb body limit
  Ã¢â€ â€™ request logger            method, path, status, duration (never logs bodies)
  Ã¢â€ â€™ routes/index.ts           /api/health Ã‚Â· /api/auth Ã‚Â· /api/students Ã‚Â· /api/attendance Ã‚Â· /api/fees Ã‚Â· /api/timetable
      Ã¢â€ â€™ middleware/validate   Zod schema Ã¢â€ â€™ 400 VALIDATION_ERROR
      Ã¢â€ â€™ middleware/authenticate.requireAuth()
            verifies JWT (HS256 + JWT_SECRET + issuer)
            loads the user row from PostgreSQL  Ã¢â€ Â role changes take effect immediately
      Ã¢â€ â€™ middleware/authenticate.requireRole("STUDENT")
      Ã¢â€ â€™ controller            parses validated input, calls service, shapes response
      Ã¢â€ â€™ service               owns ALL SQL and domain logic
  Ã¢â€ â€™ middleware/errorHandler   ZodError/ApiError/PG error Ã¢â€ â€™ uniform envelope + status
```

Rules used everywhere:

- Controllers stay thin Ã¢â‚¬â€ no SQL, no business rules in route handlers.
- Services own queries (`students.service.ts`, `auth.service.ts`); SQL lives only there.
- All responses go through `utils/response.ts` (`sendSuccess` / `sendError`).
- All failures throw `ApiError` or are translated by the central error handler.

### Adding a module

```
backend/src/modules/<name>/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ <name>.routes.ts       router + validate() wiring
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ <name>.controller.ts   request/response only
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ <name>.service.ts      SQL + domain logic
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ <name>.schemas.ts      Zod schemas (optional)
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ <name>.types.ts        DTO shapes (optional)
```

Register it once in `src/routes/index.ts`:

```ts
router.use("/attendance", requireAuth, attendanceRoutes);
```

Then add migrations under `database/migrations/` (new numbered file) and, if the UI needs it,
one typed interface in `frontend/src/lib/types.ts` plus a `useApi<T>()` call.

## 3. Authentication

1. `POST /api/auth/login` verifies with **bcrypt** (10 rounds by default).
2. On success the server signs a JWT: `{ sub, role, email }`, `issuer: smartcampus-ai`,
   expiry `JWT_EXPIRES_IN` (default 1 day), key `JWT_SECRET` (env only).
3. The frontend stores the token in `localStorage` and attaches it via `Authorization`.
4. `requireAuth` re-reads the user from the database on **every** request, so a deleted or
   role-changed account is immediately reflected Ã¢â‚¬â€ the JWT is not treated as a source of truth.
5. On any 401 the API client clears the token and emits `smartcampus:unauthorized`;
   `AuthProvider` flips the app to signed-out and `AuthGuard` routes to `/login`
   (the login form shows "your session expired").

Known trade-off: `localStorage` is XSS-explainable. Moving to an httpOnly cookie is a
a later hardening item (requires CORS credentials and same-site work).

## 4. Authorization (RBAC)

| Layer | Mechanism |
| ----- | --------- |
| Backend (authoritative) | `requireAuth` + `requireRole(...roles)` mounted per router; students' data is always scoped by `WHERE user_id = $1` |
| Frontend (UX only) | `<AuthGuard>` in `app/(app)/layout.tsx` (session required), `<RoleGuard roles={[...]}>` per page (redirects to the role's home) |

Roles are defined once in `backend/src/utils/roles.ts`:

```ts
ROLES        = STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN  // DB CHECK matches
ACTIVE_ROLES = STUDENT | FACULTY | ADMIN                                    // self-service roles
```

Adding `PARENT` later requires: no schema change (the CHECK already allows it), one entry in
`ACTIVE_ROLES`, `requireRole("PARENT")` on the new router, a `RoleGuard` value and a
`roleHome()` branch. **No authorization logic is duplicated** across modules.

Public registration accepts only `STUDENT`, `FACULTY` and `ADMIN`, and every one of them is created
inactive (`users.status = 'PENDING'`) with a `registrations` row awaiting `SUPER_ADMIN` approval -
so a role only becomes effective after approval. `SUPER_ADMIN` is the one bootstrapped account (from
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`); it approves registrations, handles password-help
requests and manages users, and inherits every `ADMIN` surface because `requireRole` lets it through
wherever `ADMIN` is accepted. `PARENT`, `ALUMNI` and `SUPER_ADMIN` can never be self-registered.

### Permission matrix (Phase 4)

| Action | Student | Faculty | Admin |
| ------ | ------- | ------- | ----- |
| View own attendance | Ã¢Å“â€¦ | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| List/manage attendance classes | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ own timetable entries | Ã¢Å“â€¦ every entry |
| Mark / edit attendance | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ assigned class only, server-verified | Ã¢Å“â€¦ any class |
| View own fees | Ã¢Å“â€¦ | Ã¢ÂÅ’ 403 | Ã¢â‚¬â€ |
| Read admin fee register (`GET /fees`) | Ã¢ÂÅ’ 403 | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ |
| Record fee payment | Ã¢ÂÅ’ 403 | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ |
| Read payment history | Ã¢Å“â€¦ own fee records only | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ any |
| Modify fee amount / delete records | Ã¢ÂÅ’ | Ã¢ÂÅ’ | Ã¢ÂÅ’ not exposed |
| Read timetable register | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ own classes only (filters forced to self) | Ã¢Å“â€¦ full register + filters |
| Create / edit timetable entries | Ã¢ÂÅ’ 403 | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ (conflict-checked) |
| Archive / delete timetable entries | Ã¢ÂÅ’ 403 | Ã¢ÂÅ’ 403 | Ã¢Å“â€¦ archive default, hard delete only without history |
| Ask the AI assistant (`POST /ai/ask`) | Ã¢Å“â€¦ own attendance, fees, timetable | Ã¢Å“â€¦ own classes and attendance | Ã¢Å“â€¦ institute fee register and schedule |

### Permission matrix addition (Phase 8 — PARENT)

| Action | STUDENT | FACULTY | ADMIN | PARENT |
| ------ | ------- | ------- | ----- | ------ |
| Read linked child's academics (`GET /api/parent/...`) | 403 (own `/students/me` only) | 403 | 403 | 200, ACTIVE link required |
| Manage parents/invitations (`/api/admin/parents...`) | 403 | 403 | 200 | 403 |
| Ask the AI assistant | own scope | own scope | institute scope | linked-child scope only |

How the rules are enforced (never in the browser):

- **Attendance** Ã¢â‚¬â€ `attendance.service.ts#loadEntryForUser` loads the timetable entry and, for
  `FACULTY`, compares `timetable_entries.faculty_id` with the caller's `faculties.id`
  (resolved from `users.id`). Every read and write path goes through it. The roster is always
  recomputed from `enrollments` + section + semester, and each submitted `studentId` must be a
  member of that roster, so a forged `studentId`, `courseId`, `facultyId` or `section` cannot
  target another class.
- **Fees** Ã¢â‚¬â€ routers declare `requireRole("ADMIN")` for register/payment writes and
  `requireRole("ADMIN", "STUDENT")` for history; the service then checks
  `fees.student_id Ã¢â€ â€™ students.user_id` for the student path and returns `404` (not 403) when a
  student requests someone else's fee id so the record's existence is not leaked.
- **Timetable** Ã¢â‚¬â€ the router mounts `requireRole("FACULTY", "ADMIN")` for reads and
  `requireRole("ADMIN")` for every write, so students can never reach the register at all. For
  `FACULTY` the service overwrites the requested `facultyId` filter with the caller's own
  `faculties.id` and `getEntry` compares ownership before returning, so a crafted filter or entry
  id cannot expose another teacher's week.
- **AI assistant** Ã¢â‚¬â€ the router mounts `requireAuth Ã¢â€ â€™ requireRole("STUDENT","FACULTY","ADMIN") Ã¢â€ â€™
  validate Ã¢â€ â€™ rate limit`, and `ai.tools.ts#retrieve` dispatches to a different tool set per role.
  Every tool calls an existing service (which re-applies IDOR scoping), and only a minimized,
  user-scoped context reaches the model Ã¢â‚¬â€ see section 12.

## 5. Attendance workflow (Phase 2)

```
faculty selects class (GET /attendance/classes)
        Ã¢â€ â€œ
choose date Ã¢â€ â€™ GET /attendance/classes/:id?date=   Ã¢â€ Â roster + saved statuses
        Ã¢â€ â€œ
mark Present/Absent locally (draft state, not persisted)
        Ã¢â€ â€œ
POST /attendance { timetableEntryId, date, attendance[] }
        Ã¢â€ â€œ
  validate (zod) Ã¢â€ â€™ loadEntryForUser (ownership) Ã¢â€ â€™ date rules
  Ã¢â€ â€™ recompute roster Ã¢â€ â€™ reject unknown/duplicate students
        Ã¢â€ â€œ
  BEGIN  Ã‚Â· INSERT Ã¢â‚¬Â¦ ON CONFLICT (student, course, date) DO UPDATE  Ã‚Â· COMMIT
        Ã¢â€ â€œ
students' /attendance-summary and /attendance change immediately
```

- Atomic: one transaction per class submission Ã¢â‚¬â€ all rows or none.
- Idempotent: the existing `UNIQUE (student_id, course_id, date)` constraint turns a repeat
  submission into an UPDATE (`isUpdate: true` in the response).
- `recorded_by` keeps the original faculty member when an admin edits (`COALESCE`).
- Read model for students is a simple aggregate over `attendance` Ã¢â‚¬â€ no cached percentages, so
  a faculty submission is visible on the student dashboard and attendance page on next fetch.

## 6. Fee payment workflow (Phase 2)

```
admin opens a fee (GET /fees?q=&status=)
        Ã¢â€ â€œ
dialog loads history (GET /fees/:id/payments)
        Ã¢â€ â€œ
POST /fees/:id/payments { amount, paymentMethod, reference? }
        Ã¢â€ â€œ
BEGIN
  SELECT Ã¢â‚¬Â¦ FROM fees WHERE id = $1 FOR UPDATE     Ã¢â€ Â row lock
  balance = amount - amount_paid
  amount > balance Ã¢â€ â€™ 400 OVERPAYMENT  Ã¢â€ â€™ ROLLBACK
  INSERT INTO fee_payments (fee_id, amount, payment_method, reference, recorded_by)
  UPDATE fees SET amount_paid, status = PENDING|PARTIAL|PAID
COMMIT
```

Payment rows are immutable history; the `fees` row is only ever updated, never deleted.
`fee_payments.recorded_by` records which admin entered it (audit trail), and
`ON DELETE SET NULL` keeps history if an account is removed.

## 7. Timetable management workflow (Phase 3)

```
admin opens the register (GET /timetable?day=&section=&facultyId=&room=&status=)
        Ã¢â€ â€œ
form options (GET /timetable/options)  Ã¢â€ â€™ courses, faculty, sections with student counts
        Ã¢â€ â€œ
POST /timetable  or  PATCH /timetable/:id
        Ã¢â€ â€œ
BEGIN
  pg_advisory_xact_lock(TIMETABLE_WRITE_LOCK)   Ã¢â€ Â one writer at a time
  load course (404) Ã‚Â· load faculty (404) Ã‚Â· assert section has students (400)
  derive semester + department from the course (never from the client)
  findConflicts(): FACULTY / ROOM / SECTION overlaps vs active entries
    edit path excludes the row itself Ã¢â€ â€™ no false self-conflict
    409 TIMETABLE_CONFLICT { conflictTypes, conflicts }  Ã¢â€ â€™ ROLLBACK
  INSERT Ã¢â‚¬Â¦ or UPDATE Ã¢â‚¬Â¦                              (reload the row for the response)
COMMIT
        Ã¢â€ â€œ
DELETE /timetable/:id                 Ã¢â€ Â archive: is_active=false, archived_at=now()
DELETE /timetable/:id?permanent=true  Ã¢â€ Â only when related attendance count = 0
```

- **One timetable system.** Attendance, the faculty week view and the student schedule all read the
  same `timetable_entries` rows; there is no second copy to keep in sync.
- **Archive is the default delete.** `attendance` has no FK to `timetable_entries`, so history never
  breaks Ã¢â‚¬â€ archiving also hides the slot from students, faculty class lists and attendance rosters,
  and `PATCH { isActive: true }` restores it. A hard delete needs `?permanent=true` and is refused
  with `409 DEPENDENCY_CONFLICT` (`details.remediation: "ARCHIVE"`) while attendance rows relate to
  that class, so an admin can never silently orphan history.
- **Serialised writes.** Conflict checks and the write happen in one transaction behind a session
  advisory lock, so two simultaneous "create" requests cannot both pass the check and then both
  insert.
- **Revive instead of a constraint error.** Creating a slot identical to an archived one (same
  course, day, start time, section) reactivates that row rather than tripping
  `UNIQUE (course_id, day_of_week, start_time, section)`.
- **Derived, not declared.** `semester` and `department` are copied from the course on every write,
  so a client cannot place a class into a semester the course does not run in.

## 8. Frontend architecture

```
app/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ layout.tsx            AuthProvider + Toaster + font/theme wiring
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ page.tsx              entry: redirects by session/role
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ login/page.tsx        public
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ (app)/                protected shell (AuthGuard + AppShell: sidebar, header, profile menu)
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ layout.tsx
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dashboard/        STUDENT
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ attendance/       STUDENT
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ fees/             STUDENT
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ timetable/        STUDENT
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ai/               STUDENT | FACULTY | ADMIN  (grounded AI chat)
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ profile/          STUDENT | FACULTY | ADMIN
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ faculty/          FACULTY   Ã¢â€ â€™ attendance management (AttendanceManager)
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ timetable/    FACULTY   Ã¢â€ â€™ read-only week view (FacultyTimetable)
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ admin/            ADMIN     Ã¢â€ â€™ fee management (FeeManagement + RecordPaymentDialog)
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ timetable/    ADMIN     Ã¢â€ â€™ timetable register (TimetableManager)
```

New in Phase 2 (reused components everywhere else):

- `components/attendance/attendance-manager.tsx` Ã¢â‚¬â€ class picker, date picker, roster table,
  present/absent controls, all-present / all-absent / reset, submit + retry, saved-state badges.
- `components/admin/fee-management.tsx` Ã¢â‚¬â€ search + status filter, institute totals, fee table.
- `components/fees/record-payment-dialog.tsx` Ã¢â‚¬â€ amount/method/reference form with client-side
  validation, live balance, payment history.
- `components/fees/payment-history.tsx` Ã¢â‚¬â€ shared payment list (admin dialog and student fees page).

New in Phase 3:

- `components/admin/timetable-manager.tsx` Ã¢â‚¬â€ room/day/section/faculty/status filters, register
  table, per-row edit / archive / restore / delete, and the create dialog wiring.
- `components/admin/timetable-entry-dialog.tsx` Ã¢â‚¬â€ create & edit form (course, faculty, section,
  room, day, times, status); renders the server's `TIMETABLE_CONFLICT` payload as an inline list of
  clashing classes instead of a generic error.
- `components/admin/timetable-delete-dialog.tsx` Ã¢â‚¬â€ archive-first confirmation that explains the
  attendance dependency and disables "Delete permanently" while history exists.
- `components/faculty/timetable-view.tsx` Ã¢â‚¬â€ read-only week view with day tabs and week stats.

- **API client**: `lib/api.ts` is the only place that calls `fetch`. It unwraps the envelope,
  throws typed `ApiError`s, handles network failures and broadcasts the 401 event.
- **Data fetching**: `hooks/use-api.ts` gives every page `data / loading / error / reload`
  so loading, error and empty states are consistent and not duplicated per page.
- **Business logic** stays out of components (format helpers live in `lib/format.ts`,
  types in `lib/types.ts`).
- Server components are used only for static shells; all data screens are client components
  because the API is called with the bearer token from the browser.

## 9. Database

```
users 1 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 1 students Ã¢â€â‚¬Ã¢â€â‚¬< enrollments >Ã¢â€â‚¬Ã¢â€â‚¬ courses >Ã¢â€â‚¬Ã¢â€â‚¬ faculties 1Ã¢â€â‚¬Ã¢â€â‚¬1 users
                    Ã¢â€â€š                           Ã¢â€â€š
                    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬< attendance >Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
                    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬< fees >Ã¢â€â‚¬Ã¢â€â‚¬< fee_payments
                    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ (timetable_entries matches students by section + semester)
```

| Table | Purpose |
| ----- | ------- |
| `users` | identity: name, unique email, bcrypt hash, role (CHECK for 5 roles) |
| `students` | student number, department, semester, section, batch year (FK Ã¢â€ â€™ users) |
| `faculties` | employee number, department, designation (FK Ã¢â€ â€™ users) |
| `courses` | code, name, credits, department, semester, assigned faculty |
| `enrollments` | student Ã¢â€ â€ course, status ACTIVE/DROPPED/COMPLETED |
| `attendance` | student, course, date, status, recorded_by; unique (student, course, date) |
| `fees` | fee head, amount, amount paid, due date, status; CHECK amount_paid Ã¢â€°Â¤ amount |
| `fee_payments` | immutable payment history: amount, method, reference, recorded_by (FK Ã¢â€ â€™ users) |
| `timetable_entries` | course, faculty (nullable, `ON DELETE SET NULL`), room, day, start/end (CHECK end > start), section, semester, `is_active` + `archived_at` (Phase 3), `UNIQUE (course, day, start, section)` |
| `schema_migrations` | applied migration files (created by the runner) |

Migrations are plain SQL files applied in filename order inside a transaction and recorded in
`schema_migrations`. `npm run seed` is a **bootstrap**: it applies migrations and creates the single
`SUPER_ADMIN` account from configuration - it never inserts demo users or demo campus data. The
deterministic fixture dataset used by the automated tests (12 users, 6 courses, 30 timetable slots,
540 attendance rows, 18 fee records, 12 payment rows) lives in the separate, test-only
`npm run seed:test` script. Phase 2 added `004_phase2_operations.sql`, Phase 3 added
`005_phase3_timetable.sql` (`is_active`, `archived_at` and the register indexes),
`018_registration_approval_system.sql` added `users.status`/`users.phone`, `registrations`,
`password_help_requests` and `password_reset_tokens`; earlier migrations are never edited.

`attendance` deliberately carries **no** foreign key to `timetable_entries` Ã¢â‚¬â€ it references
`students` + `courses`, so archiving or (when allowed) deleting a slot can never orphan or cascade
away history.

**DATE columns** are parsed by node-pg as *local* midnight, so every date leaving the API goes
through `utils/date.ts#toLocalDateString` Ã¢â‚¬â€ using `toISOString()` there would shift the value
back one day in time zones east of Greenwich.

## 10. Security baseline

Implemented: bcrypt hashing, JWT expiry + issuer claim, secrets only in `.env` (git-ignored),
backend RBAC on every route, ownership checks for attendance and payments (IDOR-safe), Zod input
validation, parameterised SQL everywhere, `SELECT … FOR UPDATE` on fee updates, transactional
writes for attendance, payments and timetable entries (advisory lock serialises timetable
conflict checks), CORS allow-list, `x-powered-by` disabled, 100kb body limit,
no password/hash fields in any response, generic 500 message in production.

AI-specific (Phase 4): per-user rate limiting on `POST /ai/ask` (30/min → 429 `RATE_LIMITED`),
deterministic server-side intent routing (the model cannot choose tools), allowlisted read-only
tools that reuse IDOR-safe services, minimized context (no ids, hashes, tokens or credentials ever
reach the prompt), fixed refusals for prompt-injection / secret / out-of-scope requests, cross-user
phrasing answered with a scope note and the caller's own data only, malformed JSON rejected as
400 `INVALID_JSON`, and provider failures surfaced as 503/504 with the raw provider error logged
(server-side) but never returned to the client.

Deferred (later phases): httpOnly cookie sessions, global rate limiting (the AI endpoint is the
only throttled route today), refresh tokens, audit log, helmet security headers, payment gateway
integration.

## 11. Environment & ports

| Component | Port | Start |
| --------- | ---- | ----- |
| PostgreSQL | 5432 | `docker compose up -d` |
| Backend API | 4000 | `cd backend && npm run dev` |
| Frontend | 3000 | `cd frontend && npm run dev` |

Configuration lives in `backend/.env` and `frontend/.env.local`; templates are
`backend/.env.example` and `frontend/.env.example`.

## 12. AI assistant workflow (Phase 4)

**Request flow:**

```
POST /api/ai/ask
  -> authenticate (JWT)
  -> requireRole(STUDENT | FACULTY | ADMIN)
  -> validate(askSchema)               Zod: 1-1000 chars, unknown keys stripped
  -> askLimiter                        30/min per user id -> 429 RATE_LIMITED
  -> ai.service.ask
       1. routeMessage                 deterministic intent routing (regex), no model involvement
       2. retrieve(actor, route)       allowlisted read-only tools -> existing services only
                                       (students / fees / attendance / timetable); SQL stays here
       3. buildSystemPrompt            grounding rules + scope note + minimized context
                                       (no ids, no credentials)
       4. provider.complete            OpenAI gpt-4o-mini  |  deterministic mock (AI_PROVIDER=auto)
       5. map to response              { answer, intent, sources, context, provider }
```

**Provider abstraction** (`ai.provider.ts`):
- `AiProvider` interface with `complete(request)` returning `{text}`.
- `OpenAiProvider` -> `https://api.openai.com/v1/chat/completions` with 12s timeout, AbortController.
- `MockProvider` -> `renderMockAnswer()` — deterministic, covers all intents, same shape as OpenAI.
- `createProvider()` -> `auto` = OpenAI when `OPENAI_API_KEY` set, else mock (default in CI/tests).

**Tool matrix (intent -> services, role scoping):**

| Intent | Student tool | Faculty tool | Admin tool |
|--------|--------------|--------------|------------|
| ATTENDANCE | `studentsService.getAttendanceSummary` | `facultyAttendanceSummary` (assigned classes) | N/A (refused) |
| COURSE_ATTENDANCE | `studentsService.getAttendanceSummary` with course filter | same as student | N/A |
| FEES | `studentsService.getFeesSummary` | N/A (refused) | `adminFeeRegister` (institute totals) |
| FEE_HISTORY | `feesService.getPayments` per fee (IDOR-safe) | N/A | `adminFeeRegister(includeHistory=true)` |
| TIMETABLE | `studentsService.getTimetable(today)` | `facultyTimetable(today)` | `adminSchedule(today)` |
| NEXT_CLASS | `studentsService.pickNextClass` | `facultyPickNextClass` | N/A (refused) |
| GENERAL | refusal / scope note | refusal / scope note | refusal / scope note |

**Security properties:**
- The model never receives SQL, tokens, hashes, internal IDs, or another user's data.
- Intent is chosen by server-side regex, not the model — the model only phrases the answer.
- Cross-user phrasing ("his attendance", "all students") -> `context.scopeNote` + caller's data only.
- Injection / secret / out-of-scope -> fixed refusal (`GENERAL` intent, empty `sources`).
- Rate limit keyed by authenticated `user.id` (validated body doesn't consume quota).
- Provider failures logged server-side; client receives 503/504 only.

**Frontend `/ai` page:**
- `ChatAssistant` component: messages array, starter chips (role-aware), send + loading + retry + clear.
- Source badges: "Attendance data", "Fee data", "Timetable data".
- Client-side 30s timeout via `api.ts#timeoutMs`.

## 13. Personalized Learning Recommendations (Phase 6)

### 13.1 Recommendation pipeline

```
Student logs in (JWT)
       |
       v
GET /api/recommendations  (STUDENT-only, JWT-derived identity)
       |
       v
generateRecommendations(studentId)
       |
       |-- getStudentPerformanceFeatures()  [reuse Phase 5 service]
       |-- Enrolled courses (enrollments table)
       |-- Per-course assessments, assignments, attendance
       |
       v
Deterministic weakness detection per course:
  - Attendance < 70%  -> ATTENDANCE weakness
  - Assessments < 60% -> ASSESSMENT weakness
  - Assignments < 65% -> ASSIGNMENT weakness
       |
       v
Priority calculation (deterministic):
  - HIGH: 3+ weaknesses OR any metric >15 pts below threshold
  - MEDIUM: 2 weaknesses OR 1 metric 8-15 pts below threshold
  - LOW: 1 weakness with metric <8 pts below threshold
       |
       v
Resource matching (learning_resources table):
  - Filter by course_id, topic relevance, difficulty, priority
  - LIMIT 3 (HIGH), 2 (MEDIUM), 1 (LOW)
  - Fallback: no filters, just course_id + active
       |
       v
Structured response { summary, recommendations[] }
```

### 13.2 Core modules

| Module | Purpose |
|--------|---------|
| `performance.recommendations.ts` | Deterministic engine: weakness detection, priority, reason generation, resource matching |
| `performance.recommendations.routes.ts` | `GET /api/recommendations`, `GET /api/recommendations/study-plan` (STUDENT-only) |
| `learning_resources` table | Database-backed resources with course, type, topic, difficulty, URL |

### 13.3 Categories & thresholds (centralized)

```ts
// performance.recommendations.ts
THRESHOLDS = { ATTENDANCE_WARNING: 70, ASSESSMENT_WARNING: 60, ASSIGNMENT_WARNING: 65 }
CATEGORIES = COURSE_WEAKNESS | ATTENDANCE | ASSESSMENT | ASSIGNMENT | STUDY_ACTION | REMEDIAL_SUPPORT
PRIORITIES = HIGH | MEDIUM | LOW
```

### 13.4 Resource matching

- **Table**: `learning_resources` (created in migration `007_phase6_recommendations.sql`)
- **Columns**: `id`, `course_id`, `title`, `description`, `resource_type` (VIDEO/NOTES/PRACTICE/ARTICLE/REMEDIAL), `topic`, `difficulty` (beginner/intermediate/advanced), `url`, `active`
- **Seed data**: 5 curated demo resources per course (30 total), clearly labeled as DEMO/CURATED
- **Matching logic**: topic/difficulty filters per category, priority-based LIMIT, fallback to any active resource for the course

### 13.5 Optional AI study plan

Reuses Phase 4's `AiProvider` abstraction (`ai.provider.ts`):

```
deterministic recommendations
        |
        v
build context (only verified facts: course, category, priority, reason, metrics, resources)
        |
        v
provider.generate({ systemPrompt, userPrompt, context, intent: "GENERAL" })
        |
        v
{ studyPlan: "markdown..." }  or  fallback: { studyPlan: null, fallback: true }
```

**AI safety guarantees:**
- Context contains **only** verified deterministic data — no raw SQL, no credentials, no other students
- AI **never invents**: marks, attendance, courses, deadlines, resources, teachers, remedial classes
- Provider failure (unavailable, timeout, rate limit, auth) → graceful fallback with `studyPlan: null`
- The deterministic recommendation engine is the primary feature; AI is enhancement only

### 13.6 Frontend

| Route | Component |
|-------|-----------|
| `/recommendations` | `RecommendationsPage` — summary cards, filter chips, recommendation list |
| Dashboard summary | `StatCard` — shows courses needing attention, high/medium priority counts, link to `/recommendations` |
| Components | `learning-summary.tsx`, `recommendation-filters.tsx`, `recommendation-list.tsx`, `recommendation-card.tsx`, `priority-badge.tsx`, `resource-card.tsx` |

### 13.7 Security

- **JWT ownership**: `req.user.id` → `students.user_id` → `enrollments.student_id` — zero trust in client-supplied IDs
- **No `studentId` parameter**: Ownership cannot be overridden via query/body
- **Role enforcement**: `requireRole("STUDENT")` on router — FACULTY/ADMIN receive 403
- **No cross-student access**: Identical pattern to Phase 4/5 protections (verified by E2E tests)

### 13.8 Testing

| Suite | Tests | Scope |
|-------|-------|-------|
| API | 13 new assertions | auth, ownership, weak course detection, attendance/assessment/assignment recs, priority, resource matching, empty data, AI failure fallback |
| E2E Phase 6 | 6 flows | login -> dashboard summary -> /recommendations -> cards -> metrics -> priority -> resources -> filters -> error/empty states -> auth guards |
| Regression | 169 E2E (Ph 1-4) + 5 E2E (Ph 5) + 228 API | All previous tests remain green |

### 13.9 Limitations

- **Demo resources**: 30 curated resources seeded (5 per course); not official university materials; URLs point to public educational sites or placeholder pages
- **Data dependency**: Recommendations require assessments, assignments and attendance data; empty-data state shown when insufficient
- **Deterministic only**: No collaborative filtering, ML recommender, or neural network — rules are explicit and auditable
- **AI explanation optional**: Works without any AI provider configured (mock or none)

## 14. Dropout Risk & Intervention Dashboard (Phase 7)

Advisory early-warning analytics. Risk outputs are signals for authorized human
review � the system never suspends, blocks, grades, or disciplines a student.

### 14.1 Risk pipeline

```
Campus data (attendance / assessments / assignments, dated rows)
       |
       v
Temporal trends per student (current vs previous window)
  attendance: last 21d vs prior 21d | assessments/assignments: last 30d vs prior 30d
       |
       v
Deterministic scoring 0-100 (NOT a probability)
  decline weights + persistent-low weights + multi-domain bonus
       |
       v
Risk level: >=70 CRITICAL | >=50 HIGH | >=30 MODERATE | else LOW
       |
       v
risk_snapshots (one row per student per day) + interventions (staff actions)
       |
       v
/faculty/risk + /admin/risk dashboards (+ optional AI suggestion)
```

### 14.2 Modules

| Module | Purpose |
|--------|---------|
| `performance.risk.ts` | Trend calculation, transparent scoring, snapshot/intervention CRUD, optional AI plan |
| `performance.risk.routes.ts` | `/api/risk/*` � student own-analysis, staff list/stats/detail, intervention create/update |
| `risk_snapshots` / `interventions` | Daily risk persistence + staff action tracking (migrations 008/009) |
| `components/risk/*` | `risk-dashboard`, `risk-table`, `risk-filters`, `risk-summary`, `trend-card`, `intervention-dialog`, `intervention-history`, badges |
| `faculty/risk`, `admin/risk` | Role-guarded pages + `[studentId]` detail views |

### 14.3 ID mapping (shared lesson from Phase 5/6 fix)

`users.id` (JWT `sub`) != `students.id` (profile). `assessments`, `assignments`,
`enrollments`, `attendance`, `risk_snapshots`, `interventions` all reference
`students.id`. `performance.service#getStudentProfileId(userId)` resolves the
profile; the risk and recommendation engines call it first. Attendance queries
that join via `students.user_id` accept `users.id` directly.

### 14.4 Authorization

- STUDENT: `GET /risk/own/*` only (minimized payload: level, signals, trends,
  current metrics � no scores emphasis, no staff notes, no other students).
- FACULTY: list/stats/detail/interventions scoped to students enrolled in the
  faculty`s active `timetable_entries` courses (`assertFacultyCanAccessStudent`
  on every detail/write path). Crafted `section`/`course`/`studentId` values
  cannot widen scope.
- ADMIN: full cohort scope, same endpoints.
- Interventions: `created_by = req.user.id` server-side; faculty updates
  limited to in-scope students; students receive 403 on all staff routes.

### 14.5 Performance

List/stats read latest snapshots + open-intervention counts in single batched
queries (no N+1). Snapshots missing for the day are backfilled live
(`ensureRiskSnapshots`) so the first dashboard load both heals and returns
data. Detail views compute live trends for the one student shown.

### 14.6 AI suggestion layer

Reuses Phase 4 `AiProvider`. Context contains only verified risk facts
(level, score, signals, trends, current metrics). The model may phrase a
supportive suggestion; it cannot assign risk, invent evidence, programs, or
deadlines. Provider failure returns `{ interventionPlan: null, fallback: true }`
with the deterministic analysis intact.

## 15. Parent Portal (Phase 8)

Read-only guardian access, invitation-gated. No parallel auth system: parents
use the existing bcrypt/JWT middleware, `requireRole("PARENT")`, and session
provider. `ACTIVE_ROLES` is intentionally unchanged — `PARENT` needs no
operational write paths, so only route-level `requireRole("PARENT")` gates
were added (portal, AI chat, profile).

### 15.1 Data flow

Admin creates invitation (student + parent email + relationship) -> single-use
token (raw shown once; SHA-256 stored, 7-day default expiry) -> parent
activates at /parent/activate -> PARENT account + ACTIVE link -> parent JWT ->
parent_student_links (ACTIVE) -> student -> permitted reads (attendance
summary, fee summary, timetable, performance category, recommendation
headlines, derived notices).

### 15.2 Modules

- `modules/parent/`: `parent.service` (invitations, activation, link checks,
  parent-scoped reads, admin lists), thin `parent.controller`,
  `parent.routes` (public activate + `PARENT` router + `ADMIN` router), zod
  schemas, types.
- `parent_student_links`: `parent_user_id -> users`, `student_id -> students`,
  type `PARENT/GUARDIAN/SPONSOR`, status `ACTIVE/REVOKED`, unique pair, plus
  a DB trigger rejecting non-`PARENT` holders.
- `parent_invitations`: `student_id`, `parent_email`, hashed token (unique),
  status `PENDING/ACCEPTED/REVOKED/EXPIRED`, expiry, single-use consume via
  `SELECT ... FOR UPDATE`.
- `components/parent/` + `(app)/parent` + `parent/activate`: dashboard
  (switcher, notices, overview, attendance, fees, timetable, headlines) and
  the public activation form.
- `(app)/admin/parents`: account/link tables, invitation dialog (reuses the
  admin fee-register search as a student finder), one-time link display,
  revokes.

### 15.3 Reuse without duplication

Parent reads resolve the linked student's `users.id` server-side and call the
existing services unchanged: `studentsService.getMe/getAttendanceSummary/
getFeesSummary/getTimetable`, `getStudentPerformanceFeatures`/
`predictPerformance` (category only), `generateRecommendations` (headlines
only). Fee payment history (methods, references, recorders) and
risk/intervention internals are excluded by construction — the endpoints
never query those tables.

### 15.4 AI for parents

`POST /api/ai/ask` allows `PARENT`. `retrieve()` gains a parent branch: links
are loaded, a named linked child wins (otherwise the first link), and the
existing student retrieval runs against the child's `users.id` under a
parent-labelled context (`childName` + scope note). A named unlinked student
falls back to the default linked child plus the scope note — nothing leaks.
Child-family words (and possessives) are routing stopwords so "my child's
attendance" reaches `ATTENDANCE`, and tool-set scope notes take precedence
over the generic cross-user note.

### 15.5 Security properties

- The relationship is backend-controlled: a frontend `parentId + studentId`
  pair is never sufficient; every read re-checks the ACTIVE link row.
- Unlinked/forged ids return 404 (no existence leak); wrong roles return 403.
- Invitations: 256-bit random tokens, hashed storage, bounded expiry
  (1-168h), single-use row-locked consume, no passwords inside, no email
  automation (the admin relays the link out-of-band).
- `getCurrentUser` returns `linkedStudents` for `PARENT` so the shell,
  profile page, and switcher render without extra privileged calls.

## 16. Hostel + Transport (Phase 9)

Two ERP modules under the same modular monolith. No new roles: hostel and
transport management are ADMIN-only; students get self-service reads plus
request creation; parents get link-checked read cards. No AI dependency —
both modules work fully with the provider disabled.

### 16.1 Modules

- `modules/hostel/`: service (aggregates, allocation transactions,
  complaint/review workflows, visitor workflow), thin controller, student
  router (`/api/hostel`) + admin router (`/api/admin/hostel`), zod schemas.
- `modules/transport/`: service (fleet/routes/stops/assignments/passes/
  alerts), thin controller, student router (`/api/transport`) + admin
  router (`/api/admin/transport`).
- Parent views live in the existing parent surface:
  `GET /api/parent/students/:id/{transport,hostel}` reuse the same services
  behind `requireLinkedStudentUserId`.

### 16.2 Integrity model

- One ACTIVE hostel bed per student and one ACTIVE occupant per
  (room, bed): partial unique indexes. Room capacity and bed range: trigger
  `enforce_hostel_capacity()`. Allocate/transfer/approve-move run in
  transactions with `SELECT ... FOR UPDATE`.
- One ACTIVE transport assignment per student (partial unique). Stops must
  belong to the route: trigger `enforce_assignment_stop_route()`. Pass
  numbers unique; assignment creation auto-generates the pass in the same
  transaction.
- Room-change approval executes the move server-side (vacate current +
  allocate first free bed, or the requested room's free bed); students can
  never change their own allocation.

### 16.3 Fees

No second ledger. Hostel and transport fees are ordinary rows in `fees`
(`fee_type` `Hostel Fee - ...` / `Transport Fee - ...`), payable through
the existing admin payment endpoints. The student hostel/transport UIs only
read them.

### 16.4 Performance

Dashboard aggregates are single grouped queries; lists are capped
(`LIMIT 200`) with filters; occupant/pass sub-objects use lateral
sub-selects instead of per-row queries. No `SELECT *` in list paths.

### 16.5 Frontend

- `/hostel`, `/transport` (STUDENT): allocation/roommate/fee cards,
  complaint/change/visitor workflows with dialogs, route timeline with pass
  and alerts, honest empty states for day scholars and unassigned riders.
- `/admin/hostel`, `/admin/transport` (ADMIN): occupancy/fleet stat cards,
  tabbed registers with filters, allocation/transfer/vacate dialogs,
  review actions for complaints, room changes, and visitors.
- Parent dashboard gains transport (route/stop/vehicle/pass) and hostel
  (hostel/room/roommate-count) cards — roommate *names* stay
  student/admin-only.

## 17. Digital Certificates (Phase 10)

Request → review → approve → issue → download/verify, all inside the
modular monolith. No blockchain: QR verification against the ERP database
is the authenticity mechanism.

### 17.1 Modules

- `modules/certificates/`: `certificates.service` (state machine with row
  locks, `SC-YYYY-XXX-NNNNNN` sequencing, 12-char verification codes),
  `certificate.document` (pdfkit + qrcode rendering), thin controller,
  student router (`/api/certificates`), admin router
  (`/api/admin/certificates`), public router
  (`/api/certificates/verify`, IP rate-limited), zod schemas.
- Tables (`012_phase10_certificates.sql`): `certificate_requests`
  (partial unique against duplicate PENDING per student+type) and
  `certificates` (unique number, unique code, `request_id` 1:1, status
  `ISSUED/REVOKED`), linked both ways.
- Parent view reuses the Phase 8 link check at
  `GET /api/parent/students/:id/certificates` (issued only, read-only).
- Frontend: `/certificates` (request dialog, tracking, view/download/
  verify), `/admin/certificates` (filters, detail with academic context,
  approve/reject/issue/revoke), public `/verify/[code]` with a distinct
  dark verification design, parent dashboard card.

### 17.2 Integrity model

- Transitions enforced in transactions: PENDING→APPROVED→ISSUED→REVOKED
  and PENDING→REJECTED only; `INVALID_TRANSITION` otherwise. Issuance is
  atomic (number + code + certificate row + request update); revocation
  flips both rows so the certificate stays verifiable as REVOKED.
- Numbers come from `certificate_no_seq` (seed reserves 1–100 for demo
  fixtures); codes are 96-bit random with unique-constraint retries.
- PDFs are stateless: regenerated deterministically from the certificate
  row on every download, so there is no file store to keep consistent,
  no path traversal surface (filenames derive from the AAA-patterned
  number), and downloads stream with auth-checked ownership.

### 17.3 Verification privacy

The public endpoint returns only number, type, masked name (first +
surname initial), institution, issued date, and VALID/REVOKED/NOT FOUND —
no email, fees, attendance, grades, notes, scores, or internal ids.

## 18. Library Management (Phase 11)

A circulation ERP module: catalogue → reserve → issue → borrow → renew /
track → return → fine → fee ledger. Works fully without AI; no new roles
(students self-serve, admins manage, faculty read the catalogue, parents
see link-checked summaries).

### 18.1 Modules

- `modules/library/`: service (catalogue queries, transactional
  issue/return/renew/reserve/cancel, fine math, fee-ledger upsert), thin
  controller, student router (`/api/library`, catalogue also readable by
  faculty) + admin router (`/api/admin/library`), zod schemas.
- Parent view reuses the Phase 8 link check at
  `GET /api/parent/students/:id/library`.
- Frontend: `/library` (search, detail, loans, reservations, fines),
  `/admin/library` (tabbed registers + dialogs + review actions),
  dashboard StatCard + quick action, parent dashboard card.
- Authors/categories stay denormalized text columns (documented MVP
  decision — no separate tables until per-author workflows are needed).

### 18.2 Integrity model

- One ACTIVE loan per copy and per (student, book) reservation liveness:
  partial unique indexes. Issue/return/renew/reserve/cancel run in
  transactions with `SELECT ... FOR UPDATE`.
- Reservation FIFO by `requested_at`: issuing an AVAILABLE copy rejects
  when another student waits (`RESERVATION_CONFLICT`); returns promote the
  longest waiter to READY and hold the copy RESERVED; renewals fail while
  others wait; cancelling a READY hold passes it on or frees the copy.
- Overdue is derived (`due_at < CURRENT_DATE` on ACTIVE loans), never
  stored; fines (`days × Rs.10`, capped Rs.500) upsert exactly one fee row
  per loan via `fees.library_loan_id`.

### 18.3 Fees

Fines are ordinary `fees` rows (payable through existing fee management),
computed only at return finalization — overdue passage alone never writes
to the ledger. Policy constants (`LIBRARY_FINE_PER_DAY`,
`LIBRARY_MAX_FINE`, `LIBRARY_LOAN_DAYS`, `LIBRARY_MAX_ACTIVE_LOANS`,
`LIBRARY_MAX_RENEWALS`, `LIBRARY_MAX_ACTIVE_RESERVATIONS`) live in one
place in `library.service.ts`.

### 18.4 Performance

Catalogue uses grouped count queries with `COUNT(*) OVER()` pagination
(capped at 100/page) and title/author/ISBN/category indexes; dashboards
read aggregates; loan/transaction paths are single-row locked writes. No
`SELECT *` in list paths; no N+1 (borrower/pass/queue data arrives via
joins and lateral sub-selects).

## 19. Alumni Relations (Phase 13)

A relationship-management ERP module: verified directory → mentorship →
events → engagement → recorded giving. Works fully without AI; no new AI
system was created.

### 19.1 Modules

- `modules/alumni/`: service (directory, mentorship engine, events with
  capacity transactions, campaigns/contributions, aggregates-only
  analytics), thin controller, shared router (`/api/alumni`, role-gated
  per route) + admin router (`/api/admin/alumni`), zod schemas.
- Alumni identity: `alumni_profiles.user_id → users` (the login account,
  role `ALUMNI`, enforced by a DB trigger) with an optional
  `student_id → students` link preserving graduate history. Name/email
  live only in `users` — never duplicated. The `ALUMNI` role was added to
  the `users` CHECK, backend `ROLES`, and frontend `Role` type; route-level
  `requireRole` gates mirror the `PARENT` precedent (`ACTIVE_ROLES`
  untouched).
- Frontend: `/alumni` (directory), `/alumni/mentorship`, `/alumni/events`,
  `/alumni/campaigns`, `/alumni/profile` (ALUMNI-only), `/admin/alumni`
  (tabbed management), student dashboard card, PARENT has no alumni surface.

### 19.2 Privacy model

The directory query hard-filters `status = ALUMNI AND verification =
VERIFIED AND visibility = PUBLIC` and selects name + professional fields
only — emails never leave the database on directory paths. `PRIVATE`
profiles and `PENDING` accounts are invisible except to owner and admin.
Mentorship contexts carry names needed to coordinate, never contact data.
Analytics return counts/breakdowns, never individual rows.

### 19.3 Integrity model

- Mentorship: partial unique index (one live request per pair),
  row-locked transitions per `MENTORSHIP_TRANSITIONS`, mentor-offering and
  live-status checks at request time.
- Events: row-locked registration with capacity count, audience
  eligibility (`ALL/STUDENTS/ALUMNI` plus ADMIN), unique
  (event, user) registration, status-gated transitions.
- Contributions: pledges (`PLEDGED`, alumni self-declared) vs office
  recorded (`RECORDED`); totals aggregate `RECORDED` only. No gateway, no
  fake payment confirmations.

### 19.4 Performance

Directory and list paths are single grouped queries with `LIMIT` caps and
covering indexes (graduation year, industry, company, status,
verification); analytics are pure SQL aggregations; state changes are
single-row locked writes.

## 20. Mess & Canteen (Phase 14)

A food-service ERP module: plans → enrollment → menu → usage → billing →
fee ledger, and catalogue → order → snapshot → billing → fee ledger. Works
fully without AI; no new roles (students self-serve, admins manage,
parents read link-checked summaries).

### 20.1 Modules

- `modules/mess/`: service (plans, enrollments, menu, meal attendance,
  feedback, canteen catalogue, transactional orders, idempotent billing,
  aggregates-only analytics), thin controller, student router
  (`/api/mess`) + admin router (`/api/admin/mess`), zod schemas.
- Parent view reuses the Phase 8 link check at
  `GET /api/parent/students/:id/mess` (plan, outstanding, recent orders,
  7-day meal counts — read-only).
- Frontend: `/mess` (plan card, weekly menu, billing, canteen with cart,
  feedback), `/admin/mess` (tabbed plans/menu/meals/canteen/orders/
  billing/feedback), dashboard StatCard + quick action, parent card.

### 20.2 Integrity model

- One ACTIVE enrollment per student (partial unique index); students may
  enroll (validated active plan) and cancel, never set `ACTIVE` directly.
- Meal records upsert on `(student, date, meal)` — recording the same meal
  twice updates instead of duplicating.
- Orders lock item rows, snapshot prices into `canteen_order_items`, and
  commit atomically; pipeline `PENDING→CONFIRMED→READY→COMPLETED`
  (+`CANCELLED`), students cancelling only own early orders.
- Billing recomputes the two period fee rows per student per month
  (`Mess Plan - YYYY-MM`, `Canteen - YYYY-MM`, partial-unique guarded)
  and marks swept orders via `fee_id`, so re-runs and late order additions
  converge instead of duplicating. No mess-specific ledger exists.

### 20.3 Performance

Menu/meal/order lists are bounded range queries on date/status indexes;
billing loops enrolled students with per-student transactions (no giant
single transaction, no semester-wide recalculation per request);
analytics are SQL aggregations; catalogue search uses name/category/
availability indexes with a 200-row cap.

---

## 21. Transport Live Tracking Readiness (Phase 15)

### 21.1 Modules

- `backend/src/modules/transport/transport.service.ts` — extended with:
  - `ingestTelemetry` — ADMIN-only, validated staff/simulated point ingestion
  - `simulateTelemetry` — ADMIN-only deterministic demo stepper
  - `computeVehicleTracking` — derives status/progress from latest telemetry
  - `fleetTracking` — all vehicles' tracking objects
  - `TELEMETRY_OFFLINE_MINUTES = 15` (centralized threshold)
  - `myTransportByProfile` extended with `tracking` field
- `backend/src/modules/transport/transport.routes.ts` — new ADMIN routes:
  - `POST /admin/transport/telemetry`
  - `POST /admin/transport/simulation`
  - `GET /admin/transport/vehicles/:id/location`
  - `GET /admin/transport/tracking`
- `backend/src/modules/transport/transport.schemas.ts` — Zod schemas:
  - `telemetrySchema` (coords, speed, heading, sequence, recordedAt)
  - `simulationSchema` (vehicleId, action, speedKmh)
- `backend/src/modules/transport/transport.types.ts` — new types:
  - `VehicleTracking`, `TrackingStatus`, `TelemetrySource`
  - `MyTransport` extended with `tracking`
- `database/migrations/017_phase15_transport_telemetry.sql`:
  - `transport_vehicle_telemetry` (validated point store)
  - `transport_route_progress` (deterministic snapshots)
- `backend/src/scripts/seed.ts` — demo telemetry for V1/V2/V3
- Frontend:
  - `frontend/src/components/transport/tracking-card.tsx` — reusable status/progress card
  - `frontend/src/components/transport/student-transport.tsx` — injects tracking card
  - `frontend/src/components/parent/parent-dashboard.tsx` — tracking badge on transport card
  - `frontend/src/components/admin/transport-management.tsx` — Tracking tab with fleet cards
  - `frontend/src/lib/types.ts` — `MyTransport.tracking` + `VehicleTracking` type
- `frontend/e2e/phase15.e2e.mjs` — 10 Playwright scenarios

### 21.2 Tracking logic (deterministic)

**Status derivation** (`trackingStatusFor`):
- `MOVING` — latest point `< 15 min` AND `speedKmh > 0`
- `IDLE` — latest point `< 15 min` AND (`speedKmh = 0` OR unknown)
- `OFFLINE` — no point OR latest point `>= 15 min` old

**Progress derivation** (`computeVehicleTracking`):
- Requires `stop_sequence` on latest telemetry point
- Clamped to route: `current = last stop with sequence <= reported`, `next = first stop > current`
- `progressPct = Math.round((currentSequence / lastSequence) * 100)`
- Missing sequence → `progressPct: null` (never guessed)

**Safety**:
- All ingestion ADMIN-only (`requireRole("ADMIN")`)
- Coordinate ranges enforced by DB `CHECK` + Zod
- `lat`/`lon` pair required together
- `recordedAt` max 5 min future
- Simulation requires active route assignment
- All responses include `simulated: true` (source !== `DEVICE`)
- UI labels: "Demo tracking" / "Demo data" badges
- No external map dependency

### 21.3 API surface

| Endpoint | Role | Purpose |
| -------- | ---- | ------- |
| `GET /api/transport/me` | STUDENT | Own assignment + tracking |
| `GET /api/parent/students/:id/transport` | PARENT | Linked student's tracking |
| `POST /api/admin/transport/telemetry` | ADMIN | Ingest validated point |
| `POST /api/admin/transport/simulation` | ADMIN | Deterministic demo stepper |
| `GET /api/admin/transport/vehicles/:id/location` | ADMIN | Single vehicle tracking |
| `GET /api/admin/transport/tracking` | ADMIN | Fleet overview |

### 21.4 Performance

- Fleet < 200 vehicles → no pagination needed for tracking
- `transport_vehicle_telemetry` indexed on `(vehicle_id, recorded_at DESC)`
- `transport_route_progress` indexed on `(vehicle_id, recorded_at DESC)` + `(route_id)`
- Deterministic computation per vehicle at read time (no materialized views)
- Progress snapshot written on every ingestion (lightweight INSERT)

---

## Appendix: ML service integration (Phase 5)

The performance prediction is served by the trained Python model. Full detail,
including the 44-feature source mapping, lives in
[`docs/ML_ARCHITECTURE.md`](ML_ARCHITECTURE.md).

| Piece | Location | Role |
| ----- | -------- | ---- |
| Feature engineering | `backend/src/modules/performance/performance.features.ts` | Builds the model's 44-column vector from the student's own records |
| ML client | `backend/src/modules/performance/performance.ml-client.ts` | Calls the service with a bounded timeout and validates the response |
| Degraded path | `backend/src/modules/performance/performance.service.ts` | Rule-based estimate used only when the service cannot answer |
| Model server | `ml/inference/main.py` (FastAPI, `ML_SERVICE_URL`) | Loads the artifact and scores the vector |

Contract highlights:

- Student identity comes from the JWT; a supplied `studentId` is ignored and
  the endpoint is `STUDENT`-only.
- Responses carry `prediction_source` (`ML` or `RULE_BASED`) and
  `is_model_prediction`, so a fallback is never presented as a model output.
- The model has three classes (`AT_RISK`, `EXCELLENT`, `GOOD`); `AVERAGE` has no
  training examples and is never fabricated.
- The shipped model was trained on 6 synthetic students and is not validated for
  real academic use.

---

## Appendix: Migration chain

001…016: core through Phase 14 (unchanged)  
017: Phase 15 transport telemetry + progress snapshots
