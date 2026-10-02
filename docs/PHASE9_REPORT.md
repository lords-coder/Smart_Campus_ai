# Phase 9 — Hostel + Transport Management

## Executive Summary

Phase 9 adds two complete ERP modules — hostel and transport management —
as student self-service portals, admin management consoles, and parent
read-only cards. Both run on real PostgreSQL workflows with transactional
allocation integrity, role-based access, and full test coverage, and both
work with the AI layer entirely disabled.

**All previous phases remain green.** API suite: 324/324 (270 prior + 54
new). E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 + 37 (Phases 1, 2, 3, 4, 5, 7, 8,
9) all passing. (Phase 6 has no suite file — pre-existing gap, unchanged.)

---

## 1. Phase 9 Architecture

Same modular monolith: `modules/hostel/` and `modules/transport/` (service
+ thin controller + student router + admin router + zod schemas), registered
in `routes/index.ts` as `/api/hostel`, `/api/admin/hostel`,
`/api/transport`, `/api/admin/transport`. Parent views reuse both services
through the Phase 8 link check at
`GET /api/parent/students/:id/{transport,hostel}`. No new roles, no new auth
machinery, no microservices, no AI dependency.

---

## 2. Hostel System

Two hostels (Aryabhata/BOYS, Gargi/GIRLS) with named wardens; six rooms
across SINGLE/DOUBLE/TRIPLE/QUAD types; allocations for four students
(Aarav+Rohan share A-101 as a roommate demo; Diya and Ishita are day
scholars exercising empty states); one OPEN complaint, one PENDING
room-change request, one APPROVED visitor seeded.

Dashboards show real aggregates (rooms, occupied/vacant beds, occupancy %,
pending allocations, open complaints, pending room changes) from single
grouped queries.

---

## 3. Room & Allocation Logic

- One ACTIVE bed per student and one ACTIVE occupant per (room, bed) via
  partial unique indexes; capacity/bed-range via the
  `enforce_hostel_capacity()` trigger.
- Allocate/transfer/review-approve run in transactions with row locks, so a
  bed can never be double-booked and a room can never overfill — verified by
  collision, double-allocation, and over-capacity tests.
- Students request room changes (one pending max, active allocation
  required); approving executes the move server-side (vacate + allocate
  first free bed). Students can never change their own allocation.
- The student room list exposes vacancy only — occupant names are
  admin/staff-side data (verified by payload scan).

---

## 4. Complaint / Visitor System

Complaints (`ELECTRICAL/PLUMBING/CLEANING/FURNITURE/INTERNET/OTHER`,
`OPEN→IN_PROGRESS→RESOLVED/CLOSED`, priority-tracked) are student-created
and admin-triaged; students have no status-write path. Visitors
(`PENDING→APPROVED/REJECTED→COMPLETED`) require present-or-future dates and
are admin-reviewed. Roommates see each other's names only (shared living
space); all other student data stays scoped.

---

## 5. Transport System

Three vehicles (BUS/MINIBUS/VAN incl. one in MAINTENANCE), two staff drivers
(no logins — roster profiles only), two routes with sequenced timed stops,
three student assignments with auto-generated passes, one active route
alert, plus transport fee rows in the existing ledger. Statuses
(`ACTIVE/MAINTENANCE/INACTIVE` vehicles, `ACTIVE/ENDED` assignments,
`INFO/WARNING/CRITICAL` alerts) are staff-maintained; no GPS in this phase,
with pickup times following the published schedule.

---

## 6. Route / Vehicle / Pass Logic

- Duplicate registration numbers, license numbers, route codes, and
  per-route stop sequences are rejected (`409`).
- One ACTIVE assignment per student; stops must belong to the route
  (trigger + service checks, `400` on mismatch); inactive routes/vehicles
  cannot take assignments.
- Assigning a student auto-generates a unique bus pass in the same
  transaction and returns it on the assignment list.

---

## 7. Parent Integration

The Phase 8 dashboard gains two cards per linked student: transport (route,
pickup stop/time, vehicle, pass number/status) and hostel (hostel, room,
bed, roommate *count*, fees). Roommate names, risk data, and staff notes
stay excluded. Both endpoints re-check the ACTIVE link (404 otherwise) and
are covered by linked/unlinked API and E2E assertions.

---

## 8. Role Matrix

| Capability | STUDENT | ADMIN | FACULTY | PARENT |
| ---------- | ------- | ----- | ------- | ------ |
| View own hostel / transport | ✅ | ❌ 403 | ❌ 403 | — (own portal cards) |
| File complaints / requests / visitors | ✅ own only | — | ❌ | ❌ |
| Manage hostels, rooms, allocations, reviews | ❌ 403 | ✅ | ❌ 403 | ❌ 403 |
| Manage fleet, routes, assignments, alerts | ❌ 403 | ✅ | ❌ 403 | ❌ 403 |
| View linked transport / hostel | — | — | — | ✅ link-checked |

No WARDEN role was introduced: hostel/transport management needs no separate
identity system, and admin-only management keeps the RBAC surface unchanged
(documented decision).

---

## 9. Security / IDOR

- Students reach only own records (no id parameters on self-service routes);
  the student room list strips occupant names.
- Admin routers are `requireRole("ADMIN")`; faculty/parent/student get 403
  (asserted per router).
- Parent transport/hostel reuses `requireLinkedStudentUserId` (404 on forged
  or unlinked ids, asserted).
- Zod validation on all bodies/queries; bounded limits; centralized errors.

---

## 10. Database Changes

`011_phase9_hostel_transport.sql`: 13 tables — `hostels`, `hostel_rooms`,
`hostel_allocations` (+ capacity trigger, anti-double-booking indexes),
`hostel_complaints`, `hostel_room_change_requests`, `hostel_visitors`,
`transport_drivers`, `transport_vehicles`, `transport_routes`,
`transport_route_stops`, `transport_assignments` (+ stop-route trigger),
`transport_passes`, `transport_alerts` — with query-pattern indexes and
`updated_at` triggers throughout. Previous migrations untouched.

---

## 11. API

See `docs/API.md` § Hostel/Transport. Conventions followed throughout:
`{ success, data, message }` envelopes, 201 on creates, 409 on conflicts,
404 on unknown ids, `ApiError` codes (`ALLOCATION_CONFLICT`,
`DUPLICATE_RESOURCE`, `VALIDATION_ERROR`).

---

## 12. Frontend

- `/hostel`, `/transport` (STUDENT, guarded): allocation/roommate/warden
  cards, fee lists, complaint/change/visitor workflows with dialogs,
  route timeline with pass and alerts, honest empty states.
- `/admin/hostel`, `/admin/transport` (ADMIN, guarded): stat cards, tabbed
  registers with filters, create/allocate/transfer/vacate dialogs, inline
  review actions.
- Nav entries for STUDENT (`Hostel`, `Transport`) and ADMIN (same); parent
  dashboard cards; `/ai` and `/profile` already parent-capable from Phase 8.

---

## 13. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **324/324** | 270 prior + 54 Phase 9 (auth, rooms, allocation/collision/capacity/transfer/vacate, complaints, room-change approve-moves, visitors, vehicles/drivers/routes/stops, assignments+passes, alerts, parent views, IDOR) |
| E2E Phase 1 | **26/26** | |
| E2E Phase 2 | **48/48** | |
| E2E Phase 3 | **52/52** | |
| E2E Phase 4 | **43/43** | (one run caught a dropped admin AI-assistant nav entry from an earlier edit; restored and re-verified — regression testing working as intended) |
| E2E Phase 5 | **5/5** | (pre-existing trailing selector crash unchanged; all 5 checks pass) |
| E2E Phase 6 | n/a | No suite file (pre-existing gap, unchanged) |
| E2E Phase 7 | **37/37** | |
| E2E Phase 8 | **29/29** | |
| E2E Phase 9 (`frontend/e2e/phase9.e2e.mjs`) | **37/37** | Student portals + empty states, admin allocation/triage/vehicle flows, parent visibility, guards, API checks |
| Python ML | artifacts verified | `performance_model.joblib` v1 loads; pre-existing pytest packaging issue untouched |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 25 routes incl. `/hostel`, `/transport`, `/admin/hostel`, `/admin/transport` |
| DB migrate/seed | PASS | 011 applies; hostel + transport demo data seeded |

Seed-fee note: hostel/transport fee rows were kept off Aarav's account on
purpose — the Phase 1 suite asserts his exact totals (96000, fully paid).
All other fee assertions are relational and unaffected (register grows
18 → 23 records, outstanding 129750 → 226750, both asserted as `> 0` /
presence checks).

---

## 14. Limitations

1. **No live GPS or driver app.** Vehicle status is manual; schedules are
   published times. Schema is ready (vehicle + status + alert entities).
2. **No warden role.** Admin-only management is a deliberate scope decision;
   per-hostel staff scoping belongs with a future staffing model.
3. **No mess billing, biometric access, or transport notifications.**
   Deferred per the brief (email/SMS automation explicitly out of scope).
4. **No hostel/transport AI Q&A.** The ERP works fully without AI; adding
   scoped intents is future work reusing the Phase 8 parent-AI pattern.
5. **Room-change "any room" picks first vacancy** in the current hostel —
   reasonable for MVP, not a preference engine.
6. **Pre-existing verification debt untouched:** Phase 6 E2E gap, Phase 5
   trailing crash, pytest packaging (all documented, none worsened).

---

## 15. Next Recommended Phase

**Phase 10 — Digital Certificates.**

Rationale: with every core ERP workflow operational (academics, fees,
hostel, transport) across all four roles, the next highest-value university
workflow is verifiable credential issuance (bonafide, transcripts,
conduct certificates): request/approve/issue flow reusing the
invitation-style token pattern from Phase 8, admin issuance console, and
student/parent read-only downloads — still no blockchain needed for the MVP.
Do not implement it here.
