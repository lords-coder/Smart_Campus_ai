# Phase 3 Final Report — Full Timetable Management

Scope delivered: an admin-managed `timetable_entries` register with server-side conflict
detection, an archive-first delete that protects attendance history, a faculty read-only week
view, and the student schedule kept in sync. Phase 1 (auth, RBAC, dashboards) and Phase 2
(attendance + fee payments) were preserved and extended only — attendance and fee behaviour is
byte-for-byte the same workflow, verified by their unchanged assertions.

Verification run at report time (all green):

| Check | Command | Result |
| ----- | ------- | ------ |
| Backend types | `cd backend && npm run typecheck` | pass |
| Backend build | `npm run build` | pass |
| DB | `npm run db:reset -- --yes` → 001…005 | pass |
| Seed | `npm run seed` | `users=12 courses=6 timetable=30 fees=18 payments=12` |
| API tests | `npm run test:api` | **147/147** |
| Frontend types | `cd frontend && npx tsc --noEmit` | pass |
| Lint | `npm run lint` | pass (0 problems) |
| Build | `npm run build` | pass, 13 routes |
| E2E Phase 1 | `npm run test:e2e` | **26/26** |
| E2E Phase 2 | `npm run test:e2e:phase2` | **48/48** |
| E2E Phase 3 | `npm run test:e2e:phase3` | **52/52** |

---

## 1. Files Changed

### Backend (6 new, 5 modified)

| File | Change |
| ---- | ------ |
| `database/migrations/005_phase3_timetable.sql` | **new** — `is_active`, `archived_at`, register indexes |
| `backend/src/modules/timetable/timetable.types.ts` | **new** — day names, conflict, entry/list/options DTOs |
| `backend/src/modules/timetable/timetable.schemas.ts` | **new** — list query, params, create/patch bodies, delete query; day/time normalisers |
| `backend/src/modules/timetable/timetable.service.ts` | **new** — conflict finder, transactional write path, archive/permanent delete |
| `backend/src/modules/timetable/timetable.controller.ts` | **new** — thin request/response layer |
| `backend/src/modules/timetable/timetable.routes.ts` | **new** — `requireRole("FACULTY","ADMIN")` reads, `requireRole("ADMIN")` writes |
| `backend/src/utils/ApiError.ts` | **modified** — `conflict(message, code, details?)` now carries `details` |
| `backend/src/routes/index.ts` | **modified** — mounts `/api/timetable` |
| `backend/src/modules/attendance/attendance.service.ts` | **modified** — `is_active` in the entry select, class list filtered, archived entry → `404` |
| `backend/src/modules/students/students.service.ts` | **modified** — student timetable adds `AND t.is_active = true` |
| `backend/tests/api.smoke.mjs` | **modified** — Phase 3 block (+67 assertions → 147) |

### Frontend (7 new, 3 modified)

| File | Change |
| ---- | ------ |
| `frontend/src/components/admin/timetable-manager.tsx` | **new** — filters, register table, per-row edit / archive / restore / delete |
| `frontend/src/components/admin/timetable-entry-dialog.tsx` | **new** — create + edit form, inline `TIMETABLE_CONFLICT` rendering |
| `frontend/src/components/admin/timetable-delete-dialog.tsx` | **new** — archive-first confirmation, permanent delete gated on attendance |
| `frontend/src/components/faculty/timetable-view.tsx` | **new** — read-only week view, day tabs, week stats |
| `frontend/src/app/(app)/admin/timetable/page.tsx` | **new** — `RoleGuard ["ADMIN"]` |
| `frontend/src/app/(app)/faculty/timetable/page.tsx` | **new** — `RoleGuard ["FACULTY"]` |
| `frontend/e2e/phase3.e2e.mjs` | **new** — 52-assertion E2E suite |
| `frontend/src/lib/types.ts` | **modified** — `AdminTimetableEntry`, `TimetableList`, `TimetableOptions`, conflict types |
| `frontend/src/components/layout/nav-config.ts` | **modified** — Timetable links for `ADMIN` and `FACULTY` |
| `frontend/package.json` | **modified** — `test:e2e:phase3` script |

### Documentation

`docs/API.md` (Phase 3 register + error codes), `docs/ARCHITECTURE.md` (§7 timetable workflow,
permission matrix, frontend tree, database/security notes, sections renumbered 1–11),
`README.md` (Phase 3 feature table, scripts, roadmap), `docs/PHASE3_REPORT.md` (this file).

---

## 2. Database Changes

`005_phase3_timetable.sql` (new file; earlier migrations are never edited):

```sql
ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE timetable_entries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_timetable_course   ON timetable_entries (course_id);
CREATE INDEX IF NOT EXISTS idx_timetable_room_day ON timetable_entries (room, day_of_week);
```

- `DEFAULT true` means every seeded row stays active and the seed script is untouched
  (`timetable=30` before and after).
- The two new indexes cover the delete/heal path and the room conflict/filter path; the existing
  `idx_timetable_day_section (day_of_week, section, semester)` and `idx_timetable_faculty
  (faculty_id)` already cover section/faculty conflicts and filters (documented in the file).
- **No schema change for attendance.** `attendance` references `students` + `courses`, never
  `timetable_entries`, so archiving (or even a permitted hard delete) cannot cascade away or
  orphan a single attendance row.
- Constraints already in `003` still guard the data: `CHECK (end_time > start_time)` and
  `UNIQUE (course_id, day_of_week, start_time, section)`.

---

## 3. New APIs

| Method | Path | Role | Purpose |
| ------ | ---- | ---- | ------- |
| `GET` | `/api/timetable?day=&facultyId=&courseId=&section=&room=&status=` | FACULTY (own) \| ADMIN | Register with filters; `status` = `ACTIVE` (default) \| `ARCHIVED` \| `ALL` |
| `GET` | `/api/timetable/options` | ADMIN | Courses, faculty, sections with student counts (form reference data) |
| `GET` | `/api/timetable/:entryId` | FACULTY (own) \| ADMIN | Single entry |
| `POST` | `/api/timetable` | ADMIN | Create (conflict-checked) → `201` |
| `PATCH` | `/api/timetable/:entryId` | ADMIN | Partial edit incl. `isActive` (restore/archive) |
| `DELETE` | `/api/timetable/:entryId?permanent=false` | ADMIN | Archive (default) or hard delete |

Conflict response (409):

```json
{ "error": { "code": "TIMETABLE_CONFLICT",
  "message": "Room L-901 is already booked on Saturday 09:00-10:00 by CS301 (Section A)",
  "details": { "conflictTypes": ["ROOM"],
               "conflicts": [ { "type": "ROOM", "entryId": "…", "day": "Saturday",
                                "startTime": "09:00", "endTime": "10:00", "room": "L-901",
                                "section": "A", "courseCode": "CS301", "message": "…" } ] } } }
```

Full request/response shapes, validation rules and the role table are in
[`docs/API.md`](API.md#timetable-register-phase-3).

---

## 4. Timetable Workflow

```
admin opens /admin/timetable  →  GET /timetable?status=ACTIVE (+ options)
        ↓
"New class" / "Edit"  →  form (course · faculty · section · room · day · times)
        ↓
POST /timetable   or   PATCH /timetable/:id
        ↓
BEGIN
  pg_advisory_xact_lock(TIMETABLE_WRITE_LOCK)          ← single writer per session
  load course (404) · load faculty (404) · assert section has students (400 INVALID_SECTION)
  derive semester + department from the course
  findConflicts() over active rows for that day, overlapping (start < newEnd AND end > newStart):
      FACULTY  same faculty_id        ROOM  lower(trim(room)) equal
      SECTION  same section + semester
      edit path excludes the row being edited → no self-conflict
  409 TIMETABLE_CONFLICT {conflictTypes, conflicts}  → ROLLBACK
  exact duplicate of an archived row (course + day + start + section) → revive that row
  INSERT … or UPDATE …   → reload → response DTO
COMMIT
        ↓
students' /students/me/timetable, faculty /attendance/classes and the register
all read the same rows on the next request
```

Design decisions worth repeating:

- **One timetable system.** Attendance, faculty and student views all read `timetable_entries`;
  there is no second copy to drift.
- **Overlap, not equality.** `10:00–11:00` and `11:00–12:00` are compatible (touching), while
  `10:00–12:00` and `11:00–13:00` clash. Rooms are compared case-insensitively after trimming
  (`" l-901 "` = `"L-901"`).
- **Derived, never client-supplied:** `semester` and `department` come from the course row, so a
  forged body cannot place a class into a semester the course does not run in.
- **Serialised writes:** conflict check and write share one transaction behind a session advisory
  lock, so two simultaneous creates cannot both pass the check and then both insert.
- **Revive instead of a constraint error:** creating a slot identical to an archived one
  reactivates it, which keeps `UNIQUE (course, day, start, section)` meaningful.

---

## 5. Deletion Strategy

The task allowed either "restrict when attendance depends on it" or "archive with a flag".
Phase 3 does **both**, because they answer different needs:

| | Archive (`DELETE /:id`) | Permanent (`DELETE /:id?permanent=true`) |
| --- | --- | --- |
| Effect | `is_active = false`, `archived_at = now()` | row removed |
| Attendance rows | untouched (no FK either way) | untouched (no FK either way) |
| Visible to students / faculty / attendance classes | no, immediately | no |
| Reversible | yes — `PATCH { isActive: true }` | no |
| Allowed when history exists | always | **no** — `409 DEPENDENCY_CONFLICT` with `details: { attendanceRecords, remediation: "ARCHIVE" }` |

Why this shape:

1. **Nothing can break silently.** Because `attendance` has no FK to `timetable_entries`, a hard
   delete would *not* corrupt data — but it would remove the class a faculty member still needs to
   correct past marks for. The archive keeps the slot restorable and the UI says so in plain
   language before the admin clicks.
2. **History is the gate, not guesswork.** The permanent path counts attendance rows for that
   course + section + semester (the same key attendance is written with) and refuses while the
   count is non-zero, so an admin cannot orphan a class mid-semester.
3. **The UI makes the safe path the obvious one.** The delete dialog leads with "Archive
   (recommended)" and disables "Delete permanently" with the record count as the reason; it is
   only enabled for a class that has never had attendance (e.g. a slot just created).
4. **Archived rows stay addressable.** Students, faculty class lists, attendance rosters and the
   student schedule all filter `is_active = true`; opening an archived class's roster returns
   `404`. Restore is a single `PATCH`.

---

## 6. Authorization

| Action | Student | Faculty | Admin |
| ------ | ------- | ------- | ----- |
| Read register (`GET /timetable`) | ❌ 403 | ✅ own classes only | ✅ full register + filters |
| Read `GET /timetable/options` | ❌ 403 | ❌ 403 | ✅ |
| Read `GET /timetable/:id` | ❌ 403 | ✅ own entry, else 403 | ✅ |
| Create / edit (`POST`, `PATCH`) | ❌ 403 | ❌ 403 | ✅ (conflict-checked) |
| Archive / delete (`DELETE`) | ❌ 403 | ❌ 403 | ✅ archive-first |
| Read own schedule (`/students/me/timetable`) | ✅ section + semester | — | — |

Enforcement is entirely server-side:

- `timetable.routes.ts` mounts `requireRole("FACULTY", "ADMIN")` on reads and
  `requireRole("ADMIN")` on every write — a student never reaches the service.
- For `FACULTY`, `listEntries` **overwrites** a crafted `facultyId` filter with the caller's own
  `faculties.id`, and `getEntry` compares ownership before returning, so the register cannot be
  pried open through query parameters or another entry's UUID.
- Attendance was already ownership-checked through `loadEntryForUser`; Phase 3 only added the
  `is_active` guard there (an archived class is `404`, not a usable roster).
- Frontend `RoleGuard`s (`/admin/timetable` → ADMIN, `/faculty/timetable` → FACULTY) are UX only
  and mirror the API, as everywhere else in the project.

---

## 7. Frontend Changes

**Admin `/admin/timetable`** — `TimetableManager`:

- Filters: room search (substring), day, section, faculty, status (`Active` / `Archived` / `All`);
  the entry-count badge and an "Admin only" badge sit next to the "New class" action.
- Register table: day, time, course, faculty, section, room, student count, status, and per-row
  actions — active rows get **Edit** + **Archive**, archived rows get **Restore** + **Delete**.
- `TimetableEntryDialog` handles create and edit: course (with semester in the label), faculty,
  section (filtered to the course's semester, showing the roster size), room, day, start/end time
  and, in edit mode, an Active/Archived switch. Server `TIMETABLE_CONFLICT` errors are expanded
  into a list of the actual clashing classes (`type: message`) instead of a generic toast, so the
  admin can see *what* is in the way without leaving the dialog.
- `TimetableDeleteDialog` explains both paths, states the record count that blocks a hard delete,
  and keeps "Delete permanently" disabled while history exists.

**Faculty `/faculty/timetable`** — `FacultyTimetable`: three stat cards (classes this week, today,
rooms in use), day tabs and a read-only list. No write controls are rendered at all, matching the
API's `403`.

**Student `/timetable`** — unchanged markup; it now simply never receives archived rows.

**Navigation** — `nav-config.ts` adds "Timetable" → `/admin/timetable` (ADMIN) and
`/faculty/timetable` (FACULTY); the student item already existed.

---

## 8. Tests

| Suite | Previous | New | Notes |
| ----- | -------- | --- | ----- |
| API (`backend/tests/api.smoke.mjs`) | **80** | **147** | Phase 1+2's 80 retained unchanged + 67 Phase 3 assertions |
| E2E Phase 1 (`frontend/e2e/phase1.e2e.js`) | **26** | **26** | untouched, still green |
| E2E Phase 2 (`frontend/e2e/phase2.e2e.mjs`) | **48** | **48** | untouched, still green |
| E2E Phase 3 (`frontend/e2e/phase3.e2e.mjs`) | — | **52** | new suite |
| **E2E total** | **74** | **126** | all three suites green |

Phase 3 API coverage: options/list/filters (day, section, archive view), create (normalised
day/time, derived semester), student timetable and faculty class-list visibility of a new slot,
validation matrix (bad day, bad clock time, reversed times, missing/malformed/unknown course and
faculty, empty room, malformed section, section without students), the three conflict types
(`["FACULTY"]`, `["ROOM"]` case-insensitive, `["SECTION"]`) plus back-to-back allowed, edit rules
(self-save, self-conflict exclusion, section clash, faculty clash, unknown course/section, empty
patch, unknown entry, malformed id), archive semantics (leaves active list, appears in archive
view, disappears from attendance classes, roster 404, leaves student timetable, **attendance
history unchanged**, restore + roster works again), permanent delete (blocked with
`DEPENDENCY_CONFLICT` + `remediation`, allowed for a class with zero attendance via a temporary
section-C student), the full RBAC block (12 student/faculty 403s, faculty filter scoping, admin
cross-read) and deterministic cleanup so a re-run still starts from 30 active slots.

Phase 3 E2E coverage: admin nav + register load, create via dialog (toast + row appears),
duplicate submission showing inline `ROOM` conflict and staying open, dialog dismissal, edit
(save + refresh), archive dialog (explanation text, disabled permanent delete), row leaves the
active view, status filter → archive view → restore → back to active, room search, faculty
read-only page (stats, day tabs, own courses, no write controls), student schedule + bounce off
`/admin/timetable`, API authorization matrix, seeded-slot conflict (`["FACULTY","ROOM","SECTION"]`),
archive → hidden from students and attendance → `DEPENDENCY_CONFLICT` → restore → visible again,
and cleanup back to exactly 30 active entries.

Fixes made while stabilising the suite (worth knowing for the next phase):

1. **Modal pointer-events race.** Radix dialogs lock `body { pointer-events: none }` until their
   close animation ends, so a real `page.click()` on the next control could land on nothing. The
   suite now `settle()`s (dialog gone **and** body unlocked) and clicks buttons through a
   synthetic `.click()`, which also removed a "two dialogs open at once" race where `#tt-room`
   matched the create dialog's input while editing.
2. **Archived duplicates mask conflicts by design.** A create that exactly matches an *archived*
   row revives it (201) instead of returning 409, so the E2E conflict assertion now targets a
   seeded active slot rather than the row the suite itself archived.
3. **Day-dependent fixtures.** "Faculty sees own classes" initially asserted `CS301` on today's
   day; the suite now opens Monday explicitly, so it is stable whatever day it runs.

---

## 9. Known Issues

1. **Attendance ↔ timetable link is by key, not by FK** — the permanent-delete gate uses
   course + section + semester because `attendance` intentionally carries no
   `timetable_entries` id. That means a *new* slot for a class that already has history is also
   protected (correct, but slightly conservative) and there is no per-slot attendance count.
2. **Faculty cannot request changes** — the timetable is purely admin-managed (per scope); there
   is no swap/availability request flow.
3. **Register caps at 1000 rows** (`LIMIT 1000` in `listEntries`) — fine for a term timetable,
   would need pagination for a multi-department rollout.
4. **Room conflicts ignore capacity/attributes** — rooms are matched by name only; there is no
   lab-equipment or capacity model, and non-class bookings (exams, events) are out of scope.
5. **Sections are implicit** — a slot can only target a section that already has students
   (`400 INVALID_SECTION`); there is no admin UI for creating students/sections (unchanged from
   Phase 1).
6. **Endpoint time formats differ** — the register returns `HH:MM`, the pre-existing student
   endpoint returns `HH:MM:SS`; `formatTime` accepts both, but the contract is not uniform.
7. **E2E portability** — the three suites hardcode the system Chrome path and need all three
   services running; still no CI runner (carried over from Phase 2).
8. **Token still in `localStorage`** — pre-existing Phase 1 trade-off, untouched.

---

## 10. Completion Score

| Area | Score | Evidence |
| ---- | ----- | -------- |
| Database & migrations | **100%** | 005 applied by `db:reset`, defaults keep the seed at 30 active slots, no attendance impact |
| Timetable API + conflict detection | **100%** | 6 endpoints, 3 conflict types, advisory-lock transaction, revive path, 67 API assertions |
| Delete strategy / history safety | **100%** | archive default, restore, `DEPENDENCY_CONFLICT` gate, attendance-count proven unchanged by test |
| Admin UI | **100%** | register + filters + create/edit dialog with inline conflicts + archive/restore, E2E-verified |
| Faculty UI | **100%** | read-only week view with stats and day tabs |
| Student visibility | **100%** | schedule loads, archived classes never leak (asserted in API + E2E) |
| Authorization | **100%** | 12 write/read 403s, faculty filter scoping, RoleGuards mirroring the API |
| Seed / demo data | **100%** | unchanged: 12 users, 6 courses, 30 slots, 540 attendance, 18 fees, 12 payments |
| Tests | **100%** | API 147/147, E2E 26/26 + 48/48 + 52/52 |
| Documentation | **100%** | README, API.md, ARCHITECTURE.md updated; this report |
| Out-of-scope backlog | 0% (intentional) | swap requests, room capacity, pagination, non-class bookings, bulk import |

**Phase 3 scope completion: 98%** (the 2% is items in row 10 that were explicitly out of scope:
faculty change requests and multi-department pagination).
**Whole-project completion vs. the full roadmap: ~55%** — Phases 1–3 are done; the AI assistant
(4), prediction (5) and the remaining modules (6) are not started.

---

## 11. Next Recommended Task

**AI chat assistant (Phase 4), first slice: a read-only, role-scoped `/api/ai/ask` endpoint that
answers campus questions from the existing attendance, fee and timetable data, plus an admin
settings screen for API keys.**

Reason: the data foundation the original roadmap assumed is now genuinely operational —
attendance is written by faculty, fees are paid by admins, and the timetable that joins students,
courses, faculty, sections and rooms is now maintained through the API instead of being seed-only.
A grounded Q&A endpoint can therefore answer "my attendance in CS301", "what's due this month" or
"when is my next class" from live rows with the same `requireAuth` + role scoping used everywhere
else, without inventing a second data path. It is also the smallest increment that reuses every
Phase 1–3 pattern (module structure, Zod schema, thin controller, service-owned SQL, `useApi`
screen) and closes the "Not yet implemented" line in the README.
