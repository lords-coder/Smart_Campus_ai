# Phase 8 — Parent Portal

## Executive Summary

Phase 8 activates the `PARENT` role (permitted by the schema since Phase 1)
and delivers a secure, read-only guardian portal: admin-managed invitations,
token-based activation, a parent dashboard covering attendance/fees/timetable/
recommendation headlines plus derived notices, and linked-child-scoped AI
access — all reusing the existing auth, services, and AI infrastructure.

**All previous phases remain green.** API suite: 270/270 (242 prior + 28 new).
E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 (Phases 1, 2, 3, 4, 5, 7, 8) all passing.

---

## 1. Parent Architecture

```
Admin creates invitation (student + parent email + relationship)
       |
       v
Single-use token: raw shown once to admin; SHA-256 stored; 7-day expiry
       |
       v
Parent activates at /parent/activate -> PARENT users row + ACTIVE link
       |
       v
Parent JWT -> ACTIVE parent_student_links row -> student -> permitted reads
```

No parallel auth system. Parents log in through the same bcrypt/JWT
middleware, `requireAuth`/`requireRole`, session provider, and guards.
`ACTIVE_ROLES` was deliberately left unchanged: `PARENT` needs no
operational write paths.

Core files:

| File | Role |
|------|------|
| `backend/src/modules/parent/` | service, thin controller, routes (public + `PARENT` + `ADMIN` routers), zod schemas, types |
| `database/migrations/010_phase8_parent_portal.sql` | `parent_student_links` + `parent_invitations` |
| `frontend/src/components/parent/` + `app/(app)/parent` + `app/parent/activate` | Dashboard, switcher, cards, activation form |
| `frontend/src/components/admin/parent-management.tsx` + `app/(app)/admin/parents` | Accounts/links/invitations UI |
| `frontend/e2e/phase8.e2e.mjs` | 29-assertion E2E suite |

---

## 2. Parent-Student Relationship

`parent_student_links(parent_user_id → users, student_id → students,
relationship_type PARENT/GUARDIAN/SPONSOR, status ACTIVE/REVOKED,
UNIQUE(parent_user_id, student_id))`, indexed on both FKs plus status. A
database trigger (`enforce_parent_link_role`) rejects links whose holder is
not a `PARENT` user, so no application path can attach a student to a
non-parent account. One parent may hold many ACTIVE links (multi-student
families are a first-class case: the dashboard switcher and the activation
upsert both support it). Revocation is a status flip — history is preserved.

---

## 3. Invitation System

Admin-only creation (`POST /api/admin/parents/invitations`): validates the
student, rejects duplicate pending invitations for the same student+email
(`409 INVITATION_EXISTS`), stores only the SHA-256 hash of a 256-bit random
token with a bounded lifetime (1–168h, default 168h). The raw token returns
once in the creation response and is rendered once in the admin UI; nothing
is emailed (out-of-band relay is documented in the UI copy).

---

## 4. Authentication

`POST /api/parent/activate` (public): row-locks the invitation by token hash,
then enforces exists → not revoked → not used → not expired (expired rows are
flipped to `EXPIRED`). Creates the `PARENT` users row (or reuses an existing
`PARENT` account for second-child invitations; non-parent email collisions
return `409 EMAIL_TAKEN`), upserts the ACTIVE link, marks the invitation
`ACCEPTED`, and returns a standard JWT login. Parent login/logout/session
flows are byte-identical to every other role.

---

## 5. Authorization

- `PARENT` router: `requireAuth + requireRole("PARENT")`; every
  `:studentId` handler calls `requireLinkedStudentUserId`, which returns the
  linked student's `users.id` or throws **404** (existence not leaked).
- `ADMIN` router: `requireAuth + requireRole("ADMIN")` for parents list,
  invitations, and link updates.
- Frontend `RoleGuard("PARENT")` on `/parent`; parents bounce from
  `/admin*` and `/faculty/risk`; students bounce from `/parent`.

---

## 6. Data Visibility

Parents receive, per linked student: overview (identity + department/semester/
section + attendance %, assessment avg, counts, performance category),
attendance summary, fee summary (records with balance/status/due dates — no
payment controls), timetable (default today, `?day=` supported),
recommendation headlines (category/priority/reason + public resource
title/url/type + counts), and derived notices (attendance < 75%, pending
fees + next due, today's class count).

Excluded by construction (endpoints never query those tables/fields): risk
scores and snapshots, intervention records and staff notes, fee payment
methods/references/recorders, other students, secrets, password hashes.

---

## 7. API

See `docs/API.md` § Phase 8. Parent reads reuse existing services unchanged
by resolving the linked student's `users.id` server-side
(`studentsService.*`, `getStudentPerformanceFeatures`/`predictPerformance`
category-only, `generateRecommendations` headline-mapped) — no service
duplication. Errors follow project conventions: 401/403/404/400 with
`INVITATION_*` codes for token failures.

---

## 8. Frontend

- `/parent` (PARENT-only): student switcher (hidden for single-link), notice
  cards, four stat cards, course-wise attendance, fee status, today's
  classes, learning-focus headlines with a link into the AI assistant.
- `/parent/activate` (public): token prefilled from `?token=`, name +
  password form, signs in to `/parent` on success; expired/used/invalid
  tokens surface friendly backend messages.
- `/admin/parents` (ADMIN-only): parent accounts with links + revoke,
  invitations with status/expiry + revoke, creation dialog (fee-register
  search as student finder), one-time link display.
- Shell updates: `roleHome(PARENT) → /parent`, `ParentProfile` in the session
  union, PARENT nav (Home, AI Assistant, Profile), AI starters for parents,
  profile page linked-student list.

---

## 9. AI Integration

`POST /api/ai/ask` now admits `PARENT` under the existing rate limit. The new
`parentRetrieve` branch loads links, prefers a *named linked* child from the
message (else the first link), and runs the standard student retrieval
against the child's records under a parent-labelled context. A named
*unlinked* student resolves to the default linked child plus a scope note —
verified to never leak (`childName` assertion in tests). Child-family words
and possessives became routing stopwords so "my child's attendance" reaches
`ATTENDANCE`, and tool-set scope notes now take precedence over the generic
cross-user note (behavior for other roles unchanged).

---

## 10. Security

- Backend-controlled relationships: a frontend-supplied id pair is never
  sufficient; each read re-validates the ACTIVE link row.
- Token hygiene: 256-bit entropy, hashed storage, bounded expiry, row-locked
  single-use consume, no passwords in invitations, no email infrastructure.
- Role isolation matrix (§6 of this report) enforced server-side and covered
  by 28 API + 29 E2E assertions, including forged-id, revoked-link,
  cross-student, and AI-leak cases.

---

## 11. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **270/270** | 242 prior + 28 Phase 8 (invitations, activation/expiry/reuse, auth, ownership, scope scan, isolation, parent AI, revoke) |
| E2E Phase 1 | **26/26** | |
| E2E Phase 2 | **48/48** | |
| E2E Phase 3 | **52/52** | |
| E2E Phase 4 | **43/43** | |
| E2E Phase 5 | **5/5** | (pre-existing trailing selector crash unchanged; all 5 checks pass) |
| E2E Phase 6 | n/a | No suite file (pre-existing gap, unchanged) |
| E2E Phase 7 | **37/37** | |
| E2E Phase 8 (`frontend/e2e/phase8.e2e.mjs`) | **29/29** | Admin invitation UI, public activation, dashboard sections, switcher, guards, API checks |
| Python ML | artifacts verified | Unchanged by Phase 8 |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 21 routes incl. `/parent`, `/parent/activate`, `/admin/parents` |
| DB migrate/seed | PASS | 010 applies; 3 parents + 4 links + 1 pending invite seeded |

---

## 12. Limitations

1. **No email/SMS automation.** Invitation delivery is out-of-band by design;
   the admin UI shows the link once.
2. **Student finder reuse.** The invitation dialog locates students via the
   admin fee-register search, so students without fee records need a
   dedicated lookup (future admin-student directory work).
3. **Read-only.** Parents cannot pay fees, edit data, or manage
   interventions — by design, with UI copy directing them to the office.
4. **Notices are derived, not pushed.** No notification engine or history
   was built; the notices endpoint computes from live data per request.
5. **Pre-existing verification debt untouched:** Phase 6 has no E2E suite,
   Phase 5 E2E crashes after its passing checks, Python pytest has a
   packaging import issue. None were worsened.

---

## 13. Next Recommended Task

**Phase 9 — Hostel & Transport Management (core ERP).**

Rationale: with the multi-role platform complete (student/faculty/admin/
parent), the remaining high-value ERP workflows are residential and transit
operations: hostel room allocation + warden role scoping, transport routes +
vehicle tracking + driver assignments, and parent-visible transport status
reusing the Phase 8 link model. This continues the "ERP foundation before
flashy AI" product principle and directly reuses the RBAC, migration, seed,
and dashboard patterns established in Phases 2–8. Do not implement it here.
