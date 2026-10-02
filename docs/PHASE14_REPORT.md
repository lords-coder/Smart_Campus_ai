# Phase 14 — Mess & Canteen Management + Billing ERP

## Executive Summary

Phase 14 adds a complete food-service ERP module: configurable meal plans
with enrollment, weekly menus, meal-attendance recording, a canteen
catalogue with transactional price-snapshot ordering, student feedback,
idempotent monthly billing straight into the existing fee ledger, and
read-only parent visibility.

**All previous phases remain green.** API suite: 448/448 (415 prior + 33
new). E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 + 37 + 27 + 23 + 28 + 22
(Phases 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14) all passing. (Phases 6 and
12 have no suite files — pre-existing gaps, unchanged.)

---

## 1. Phase 14 Architecture

Same modular monolith: `modules/mess/` (service, thin controller, student
router + admin router, zod schemas), registered as `/api/mess` and
`/api/admin/mess`. Parents reuse the Phase 8 link check. No auth rewrite,
no AI dependency, no notification subsystem, no payment gateway.

---

## 2. Meal Plans

Three seeded plans cover all billing types: Monthly Veg (Rs.4500),
Monthly Non-Veg (Rs.5500), Pay Per Meal (Rs.60/meal). Admin CRUD (billing
type itself is immutable after creation, by omission from the update
schema). One ACTIVE enrollment per student enforced by partial unique
index; students enroll (validated) and cancel, never self-activate
arbitrarily.

---

## 3. Enrollment

Students enroll with an optional start date and cancel their own
ACTIVE/PAUSED enrollment; admins list, change plans, pause, cancel, or
expire with date validation. The dashboard and parent cards read the
active enrollment only.

---

## 4. Menu

`(meal_date, meal_type)` unique slots across BREAKFAST/LUNCH/SNACKS/
DINNER, with calories and active flags. Students query today/tomorrow/week
or explicit ranges; seven days × four meals are seeded. Admin create
(409 on duplicate slot), update, and delete.

---

## 5. Meal Attendance

Staff-recorded consumption keyed `(student, date, meal)` with upsert
semantics — re-recording updates instead of duplicating. Students read
their own history; admins filter by student number and date range.
Seeded: three enrolled students × seven days × four meals at ~85%
consumption.

---

## 6. Canteen

Twelve seeded items across BEVERAGE/SNACK/MEAL/DESSERT/OTHER with search,
category, and availability filters. Admin toggles availability inline;
unavailable items reject new orders at creation time (verified).

---

## 7. Orders

Cart → transactional order (item rows locked, availability re-checked,
prices snapshotted into `canteen_order_items`, totals computed
server-side) → `PENDING→CONFIRMED→READY→COMPLETED` (+`CANCELLED`).
Students cancel only their own early orders; cross-student cancels return
404. Seeded: two COMPLETED + one PENDING (Aarav) and one COMPLETED
(Rohan).

---

## 8. Billing

Per-student monthly billing in its own transaction: plan charge by type
(MONTHLY full price, WEEKLY price × weeks overlapped, MEAL_BASED price ×
consumed meals) plus COMPLETED unbilled canteen orders, written as
`Mess Plan - YYYY-MM` / `Canteen - YYYY-MM` fee rows (due 14 days after
month-end) with swept orders stamped. Re-runs recompute instead of
duplicating (verified: fee-row count stays ≤ 2). Whole-cohort billing
loops per-student transactions rather than one giant one.

---

## 9. Fee Ledger Integration

Billing writes ordinary `fees` rows honoring `amount_paid` on recompute
(PAID/PARTIAL/PENDING derived, never reset). Student billing, parent
summaries, and analytics all read the ledger as source of truth — no
duplicate totals from parallel sources. Seeded August fixture gives Rohan
a demonstrable PENDING food balance.

---

## 10. Parent Integration

`GET /api/parent/students/:id/mess` returns the active plan, ledger
outstanding + fee rows, five recent orders with items, and 7-day meal
counts — behind the standard link check (404 on forged/unlinked, 403 for
wrong roles). Parents cannot order, enroll, review, or bill (all 403,
tested). Dashboard card added.

---

## 11. Role Matrix

| Action | Student | Parent | Faculty | Admin |
| ------ | ------- | ------ | ------- | ----- |
| View menu | ✅ | ✅ summary | ✅ menu route exists for all authed roles | ✅ |
| View/enroll/cancel plan | ✅ own | ❌ | ❌ | ✅ manage |
| View own meal history | ✅ | ✅ linked | ❌ | ✅ all |
| Submit feedback | ✅ | ❌ | ❌ | ✅ review |
| Browse canteen | ✅ | ❌ | ✅ catalogue reads | ✅ |
| Place/cancel own order | ✅ | ❌ | ❌ | ✅ advance |
| Generate billing | ❌ | ❌ | ❌ | ✅ |

Faculty shares the catalogue/menu read paths; every write is
STUDENT-own or ADMIN-only. Backend authorization is authoritative.

---

## 12. Security

- Ownership via JWT → profile on all self-service paths (cross-student
  order reads/cancels return 404, verified by payload scan).
- Admin routers role-gated per family (faculty/student/parent 403,
  asserted).
- Parent views link-checked (404 on forged/unlinked).
- Zod on all bodies/queries; bounded pagination; transactional writes;
  centralized errors.

---

## 13. API

See `docs/API.md` § Mess & canteen. Student (plan, enroll, menu, meals,
billing, canteen, orders, feedback), admin (plans, enrollments, menu,
meal records, items, orders, billing, feedback aggregates, analytics),
parent (summary). Standard envelopes; `409 DUPLICATE_RESOURCE`,
`400 VALIDATION_ERROR`.

---

## 14. Frontend

- `/mess` (STUDENT): plan card with enroll/cancel, weekly menu grid,
  billing from ledger, canteen with search/filter/cart/price snapshots,
  order tracking with cancel, feedback form + history.
- `/admin/mess` (ADMIN): tabbed plans/menu/meals/canteen/orders/billing/
  feedback with dialogs and inline actions.
- Dashboard Mess & Canteen StatCard (plan, outstanding) + quick action;
  parent dashboard card; nav entries for STUDENT and ADMIN.

---

## 15. Analytics

Active enrollments, 7/30-day consumption, 14-day participation series,
30-day canteen sales/orders, top-5 items by revenue, food outstanding,
feedback averages by meal — all SQL aggregations, no row dumps.

---

## 16. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **448/448** | 415 prior + 33 Phase 14 (auth, plan/menu/meals/billing reads, catalogue/search/filter, role blocks, enroll/duplicate, order snapshot/qty/availability/cancel/cross-student, admin pipeline + bad transition, billing create/idempotency/outstanding, meal record/upsert, feedback/validation, plan/menu CRUD + duplicates, parent linked/unlinked/mutate-block, analytics shape) |
| E2E Phase 1 | **26/26** | |
| E2E Phase 2 | **48/48** | |
| E2E Phase 3 | **52/52** | |
| E2E Phase 4 | **43/43** | |
| E2E Phase 5 | **5/5** | (pre-existing trailing selector crash unchanged; all 5 checks pass) |
| E2E Phase 6 | n/a | No suite file (pre-existing gap, unchanged) |
| E2E Phase 7 | **37/37** | |
| E2E Phase 8 | **29/29** | |
| E2E Phase 9 | **37/37** | |
| E2E Phase 10 | **27/27** | |
| E2E Phase 11 | **23/23** | |
| E2E Phase 12 | n/a | No suite file (pre-existing gap, unchanged) |
| E2E Phase 13 | **28/28** | |
| E2E Phase 14 (`frontend/e2e/phase14.e2e.mjs`) | **22/22** | Student portal (plan, menu, cart→order, feedback), admin dialogs + order advancement, parent visibility, guards, API checks |
| Python ML | artifacts verified | `performance_model.joblib` v1 loads; pre-existing pytest packaging issue untouched |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 39 routes incl. `/mess`, `/admin/mess` |
| DB migrate/seed | PASS | 016 applies; plans, enrollments, 7-day menu, meals, 12 items, orders, feedback, 1 billed fixture seeded |

---

## 17. Known Limitations

1. **No RFID/QR/biometric meal tracking.** Recording is staff-operated in
   the ERP; hardware phases can reuse the upsert endpoint shape.
2. **No payment gateway.** Billing produces ledger rows payable through
   existing fee management; nothing confirms real money movement.
3. **No stock management.** Item availability is a boolean flag; the spec
   allowed omitting stock ("where necessary").
4. **No notifications engine.** Due/ready states surface in-portal
   (consistent with all prior phases).
5. **No mess complaints table.** Covered deliberately by mess feedback;
   hostel complaints stay hostel-scoped — no duplicate complaint systems.
6. **"Any room" equivalent:** billing covers one month per run by design;
   whole-cohort runs loop students rather than one giant transaction.
7. **Pre-existing verification debt untouched:** Phase 6/12 E2E gaps,
   Phase 5 trailing crash, pytest packaging (documented, none worsened).

---

## 18. Next Recommended Task

**Phase 15 — Transport Live Tracking Readiness (core ERP).**

Rationale: with every other core workflow operational (academics, fees,
hostel, transport, certificates, library, placements, alumni, mess) across
all roles, the remaining high-value operations upgrade is scheduled
transport execution: vehicle telemetry ingestion tables, route progress
snapshots, and parent-visible bus status reusing the Phase 9 assignment
model and Phase 8 link checks — without yet buying hardware. Do not
implement it here.
