# Phase 13 — Alumni Management & Relations ERP

## Executive Summary

Phase 13 adds a complete alumni relations module: verified directory with
privacy controls, a request→accept→complete mentorship workflow, events
with capacity-safe registration, recorded giving via campaigns, and an
admin console with aggregate analytics — plus a first-class `ALUMNI` role
for graduate logins.

**All previous phases remain green.** API suite: 415/415 (383 prior + 32
new). E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 + 37 + 27 + 23 + 28 (Phases 1,
2, 3, 4, 5, 7, 8, 9, 10, 11, 13) all passing. (Phase 6 and Phase 12 have no
suite files — pre-existing gaps, unchanged.)

---

## 1. Phase 13 Architecture

Same modular monolith: `modules/alumni/` (service, thin controller,
shared role-gated router + admin router, zod schemas), registered as
`/api/alumni` and `/api/admin/alumni`. No auth rewrite (JWT + `requireRole`
throughout), no AI dependency, no notification subsystem, no payment
gateway.

---

## 2. Alumni Profiles

`alumni_profiles` links `user_id → users` (the graduate's login, role
`ALUMNI` enforced by DB trigger) with an optional `student_id → students`
preserving academic history. Name/email live only in `users` — never
duplicated. Professional fields (company, position, industry, location,
bio, LinkedIn/GitHub, mentorship offering/topics/mode/availability) plus
`visibility` (PUBLIC/PRIVATE), `verification` (UNVERIFIED/VERIFIED), and
`status` (PENDING/ALUMNI/INACTIVE) controlled by admin. Alumni edit only
their own professional fields; verification, status, year, program, and
department are admin-only.

---

## 3. Directory

`/alumni` with search (name/company/role), industry/company/year/
department/location filters, mentor-only toggle, and pagination (max
100/page). The query hard-filters to VERIFIED + PUBLIC + ALUMNI and
selects professional fields only. Detail view shows the same safe shape.
Seeded result: 3 listed (2 mentors), 1 private hidden, 1 pending hidden.

---

## 4. Mentorship

Students discover mentors (directory `mentorsOnly`), request with topic +
message, track status, and cancel live requests. Alumni accept/reject
incoming and complete active ones. Duplicates blocked by partial unique
index (409); transitions row-locked per `MENTORSHIP_TRANSITIONS`
(`REQUESTED→ACCEPTED|REJECTED|CANCELLED`, `ACCEPTED→COMPLETED|CANCELLED`);
mentors must actively offer; cross-mentor writes return 404. Seeded:
Aarav→Arjun REQUESTED, Sneha↔Divya ACCEPTED.

---

## 5. Events

Admin creates events (type, location, times, capacity, audience
ALL/STUDENTS/ALUMNI) through `DRAFT→PUBLISHED→CLOSED|COMPLETED`
(+`CANCELLED`). Registration is transactional: published-only, audience
checked by role, capacity counted under row lock (`409 EVENT_FULL`),
duplicate-safe (409). Students/alumni cancel their own; admins view
rosters and mark attendance. Seeded: 2 published (one with 2
registrations), 1 draft.

---

## 6. Contributions

Campaigns (`DRAFT/ACTIVE/CLOSED`, targets, dates) with progress from
`RECORDED` totals only. Alumni pledges record as `PLEDGED` (intentions,
not payments); admins record/confirm as `RECORDED`. No gateway, no fake
confirmations — stated in UI copy and here. Seeded: Library Expansion
Fund (Rs.500,000 target) with Rs.35,000 recorded + Rs.5,000 pledged.

---

## 7. Privacy

Directory paths never select emails or internal records; private and
pending profiles are invisible except to owner/admin; mentorship payloads
carry coordination names only; analytics are counts and breakdowns.
Parents have no alumni routes at all (403, tested) — no admin data
reaches them by default.

---

## 8. Role Matrix

| Action | Student | Alumni | Parent | Faculty | Admin |
| ------ | ------- | ------ | ------ | ------- | ----- |
| Browse visible alumni | ✅ | ✅ | ❌ 403 | ✅ read-only | ✅ |
| Edit own alumni profile | — | ✅ own | — | — | ✅ |
| Offer mentorship | — | ✅ own flag | — | — | — |
| Request mentorship | ✅ | — | ❌ | ❌ | — |
| Manage own mentorship | own requests | own inbox | — | — | ✅ all |
| View events | ✅ | ✅ | ❌ 403 | ✅ | ✅ |
| Register for event | ✅ eligible | ✅ eligible | ❌ 403 | ✅ eligible | ✅ |
| Create/manage events | ❌ | ❌ | ❌ | ✅ | ❌ |
| View campaigns | ✅ | ✅ | ❌ | ✅ | ✅ |
| Pledge contribution | ❌ | ✅ own | ❌ | ✅ record | ❌ |

Backend authorization is authoritative throughout.

---

## 9. Security / IDOR Protection

- Ownership via JWT → profile on all self-service paths (alumni edit only
  their row — verified by unchanged-victim assertion).
- Admin router is `requireRole("ADMIN")` (student/alumni 403, asserted).
- Cross-mentor writes return 404 (existence not leaked).
- Forged/unknown ids return 404; role violations 403; validation 400.
- Zod on all bodies/queries; bounded pagination; centralized errors.

---

## 10. Database Changes

`015_phase13_alumni.sql`: `ALUMNI` added to the `users` role CHECK,
`alumni_profiles` (+ role trigger, status/verification/year/industry/
company indexes), `alumni_mentorships` (+ live-pair partial unique),
`alumni_events` (+ status/starts indexes), `alumni_event_registrations`
(+ unique pair), `alumni_campaigns`, `alumni_contributions`, plus
`updated_at` triggers. Prior migrations untouched.

---

## 11. API

See `docs/API.md` § Alumni relations. Shared role-gated router
(directory, profile, mentorships, events, campaigns) + admin router
(profiles, mentorships, events, registrations, campaigns, contributions,
analytics). Standard envelopes; `409 DUPLICATE_RESOURCE`/`EVENT_FULL`,
`400 INVALID_TRANSITION`/`VALIDATION_ERROR`.

---

## 12. Frontend

- `/alumni` (STUDENT/FACULTY/ALUMNI): searchable directory with verified
  badges, mentor flags, detail panel.
- `/alumni/mentorship`: role-aware — student discovery + requests,
  alumni inbox + history.
- `/alumni/events`, `/alumni/campaigns`: registration flows, pledge
  forms, progress bars.
- `/alumni/profile` (ALUMNI-only): self-service editing with visibility
  control.
- `/admin/alumni` (ADMIN): tabbed profiles/verification, mentorships,
  events + rosters + attendance, campaigns/contributions, aggregates-only
  analytics.
- Student dashboard card (mentors offering + upcoming events) + quick
  action; nav entries for STUDENT/FACULTY/ALUMNI and ADMIN.

---

## 13. Analytics

Totals, verified/mentor counts, mentorship pipeline, published events,
registrations, recorded contribution sums, and year/department/industry
breakdowns — all SQL aggregates, no individual rows. Placement-rate-style
care is applied: every figure states its denominator (e.g. recorded-only
totals exclude pledges).

---

## 14. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **415/415** | 383 prior + 32 Phase 13 (auth, directory visibility/search/pagination/mentor filter/profile, parent blocks, mentorship request/duplicate/non-mentor/list/accept/bad-transition/cross-mentor/complete, events list/register/duplicate/capacity/cancel/parent block, campaigns/pledge/student block, verification queue/verify, analytics shape + student block, profile update + cross-profile isolation) |
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
| E2E Phase 13 (`frontend/e2e/phase13.e2e.mjs`) | **28/28** | Student directory/search/profile/request/events, alumni profile/accept, admin verify/event dialog, guards, API checks |
| Python ML | artifacts verified | `performance_model.joblib` v1 loads; pre-existing pytest packaging issue untouched |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 37 routes incl. `/alumni/*`, `/admin/alumni` |
| DB migrate/seed | PASS | 015 applies; 5 alumni, 2 mentorships, 3 events, 2 registrations, 1 campaign, 3 contributions seeded |

---

## 15. Limitations

1. **Demo alumni are fictional.** Stated in seed descriptions, UI-adjacent
   docs, and here — never imply real partnerships.
2. **No messaging system.** Mentorship coordination happens out-of-band;
   the ERP tracks state, not conversations.
3. **No payment gateway.** Pledges are intentions; `RECORDED` means
   office-confirmed, not processed.
4. **No notifications engine.** Event/mentorship updates surface in-portal
   (explicitly out of scope, consistent with prior phases).
5. **No AI matching.** Mentor discovery is filter-based; recommendations
   remain future work.
6. **Alumni without digitized records.** `student_id` is optional, so
   graduates lacking ERP history still onboard; academic cross-features
   degrade gracefully.
7. **Pre-existing verification debt untouched:** Phase 6/12 E2E gaps,
   Phase 5 trailing crash, pytest packaging (documented, none worsened).

---

## 16. Next Recommended Phase

**Phase 14 — Mess & Canteen Billing (core ERP).**

Rationale: with every other core workflow operational (academics, fees,
hostel, transport, certificates, library, placements, alumni) across all
roles, the remaining high-value daily-operations workflow is mess
management: meal plans, attendance-linked billing reusing the fees-ledger
pattern, and student/parent read-only views — following the
catalogue→subscription→billing shape proven in Phases 9–13. Do not
implement it here.
