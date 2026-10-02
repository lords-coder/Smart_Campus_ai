# Phase 11 — Library Management System

## Executive Summary

Phase 11 adds a complete university library ERP module: searchable
catalogue with copies, student reservations with a FIFO queue, transactional
issue/return/renew, overdue tracking with fines settled into the existing
fee ledger, admin circulation management, and read-only parent visibility.

**All previous phases remain green.** API suite: 383/383 (351 prior + 32
new). E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 + 37 + 27 + 23 (Phases 1, 2, 3,
4, 5, 7, 8, 9, 10, 11) all passing. (Phase 6 has no suite file —
pre-existing gap, unchanged.)

---

## 1. Phase 11 Architecture

Same modular monolith: `modules/library/` (service, thin controller,
student router + admin router, zod schemas), registered as `/api/library`
and `/api/admin/library`. Parents reuse the Phase 8 link check at
`GET /api/parent/students/:id/library`. No new roles, no auth changes, no
AI dependency — the module works fully with the provider disabled.

---

## 2. Catalogue

Twelve seeded titles across Computer Science, Mathematics, Physics,
Chemistry, Literature, History, and Economics (clearly demo holdings).
Authors/categories are denormalized text columns — a documented MVP
decision avoiding normalization without a workflow to justify it. Search
covers title/author/ISBN with category, author, and availability filters;
results are paginated (`page`/`limit`, max 100) with windowed totals;
detail shows copies and live availability. Indexes on title (full-text),
author, category, ISBN, and active flag.

---

## 3. Copies

`book_copies` rows carry accession numbers (unique), locations, and states
(`AVAILABLE/ISSUED/RESERVED/LOST/DAMAGED/MAINTENANCE`). Copies become
`ISSUED` only through the issue transaction (direct status writes to
`ISSUED` are rejected); the student room list equivalent here — the public
catalogue — never exposes borrower identities.

---

## 4. Loan Workflow

Issue locks the copy, verifies availability and book status, resolves the
student, enforces the borrowing limit, honors reservation priority, creates
the loan, and flips the copy — atomically, so two admins can never issue
the same copy. Returns lock the loan, compute overdue days, upsert the fine
fee row, close the loan, and either hold the copy `RESERVED` for the next
waiter or free it to `AVAILABLE`. Renewals extend by the loan period unless
the limit is hit, the loan is overdue, or others wait.

---

## 5. Reservation Workflow

`WAITING → READY → FULFILLED`, plus `CANCELLED`/`EXPIRED`, strictly FIFO by
`requested_at` with queue positions exposed. One live reservation per
student/book (partial unique index). Returns promote the longest waiter;
cancelling a READY hold passes it on (or frees the copy); issuing to the
head waiter fulfills automatically.

---

## 6. Fine Calculation

`overdue_days × Rs.10/day`, capped at Rs.500, all centralized in
`library.service.ts` (`LIBRARY_FINE_PER_DAY`, `LIBRARY_MAX_FINE`,
`LIBRARY_LOAN_DAYS = 14`, `LIBRARY_MAX_ACTIVE_LOANS = 4`,
`LIBRARY_MAX_RENEWALS = 2`, `LIBRARY_MAX_ACTIVE_RESERVATIONS = 3`).
Overdue passage alone never writes anything — fines materialize only at
return finalization, recalculated fresh each time.

---

## 7. Fee Ledger Integration

Fines are ordinary `fees` rows (`Library Fine - overdue N days`) linked by
the new nullable `fees.library_loan_id` (partial unique: exactly one fee
row per loan, so recalculation never duplicates). They appear in the fee
register, student fee pages, and payment history, payable through the
existing admin payment endpoints. No second ledger, no payment-system
changes.

---

## 8. Parent Integration

`GET /api/parent/students/:id/library` returns active loans (title, due,
overdue, renewals), live reservations (title, status, queue position), and
the fine total — behind the standard link check (404 on forged/unlinked,
403 for wrong roles). The parent dashboard renders it as a compact card;
parents cannot reserve, renew, return, or touch records.

---

## 9. Role Matrix

| Action | Student | Parent | Faculty | Admin |
| ------ | ------- | ------ | ------- | ----- |
| Search / view catalogue | ✅ | — | ✅ read-only | ✅ |
| Reserve / renew / cancel own | ✅ | ❌ | ❌ | — |
| View own loans / fines | ✅ | — | ❌ | — |
| View linked library summary | — | ✅ | ❌ | — |
| Issue / return / manage all | ❌ | ❌ | ❌ | ✅ |

No LIBRARIAN role was created — admin-only management keeps the RBAC
surface unchanged (documented decision). Faculty stays read-only with no
write path anywhere.

---

## 10. Security / IDOR Protection

- Ownership via JWT → profile on every self-service read/mutation; no id
  parameters to forge (verified: Diya cannot see Aarav's loans).
- Admin routers are `requireRole("ADMIN")` (faculty/student/parent 403,
  asserted per family).
- Parent views link-checked (404 on forged/unlinked).
- Zod on all bodies/queries; bounded pagination; centralized errors.

---

## 11. Database Changes

`013_phase11_library.sql`: `books` (+ full-text/author/category/ISBN
indexes), `book_copies` (+ anti-double-issue partial unique),
`library_loans` (+ student/status/due indexes), `library_reservations`
(+ FIFO partial unique, book/student/status indexes), and the additive
`fees.library_loan_id` column with its partial unique index. Plus
`updated_at` triggers. Prior migrations untouched.

---

## 12. API

See `docs/API.md` § Library management. Student (catalogue, loans,
reservations, fines, reserve/renew/cancel), admin (books, copies, loans
+ overdue view, issue, return, reservations, fines), parent (summary).
Standard envelopes; `409 DUPLICATE_RESOURCE` / `ALLOCATION_CONFLICT` /
`RESERVATION_CONFLICT` on rule violations.

---

## 13. Frontend

- `/library` (STUDENT + FACULTY read-only): search/filter/pagination,
  detail panel with reserve, loans with renew, reservations with queue
  position and cancel, fine summary distinguishing ledger vs accruing.
- `/admin/library` (ADMIN): tabbed catalogue/loans/overdue/reservations/
  fines registers with search, filters, dialogs (book/copy/issue), and
  inline return/review actions.
- Dashboard Library StatCard (borrowed count, next due, fine) + quick
  action; parent dashboard library card; nav entries for STUDENT and ADMIN.

---

## 14. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **383/383** | 351 prior + 32 Phase 11 (auth, catalogue/search/filter/pagination/detail, faculty read-only, reserve/duplicate, loan/reservation lists, admin book/copy + duplicates, issue/double-issue, renew + cross-student block, on-time return with no fine, overdue list, overdue return with ledger upsert, double return, FIFO promotion, queue-blocked renew, cancel, fine summary, parent linked/unlinked/mutate-block, faculty admin-block) |
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
| E2E Phase 11 (`frontend/e2e/phase11.e2e.mjs`) | **23/23** | Student portal (search, detail, reserve, renew, dashboard card), admin catalogue/issue/return/overdue flows, parent visibility, guards, API checks |
| Python ML | artifacts verified | `performance_model.joblib` v1 loads; pre-existing pytest packaging issue untouched |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 29 routes incl. `/library`, `/admin/library` |
| DB migrate/seed | PASS | 013 applies; 12 books, 22 copies, 3 loans, 2 reservations, 1 fine seeded |

Seed-fee note (same discipline as Phase 9): no new fee rows touch Aarav,
whose exact totals (96000, fully paid) the Phase 1 suite asserts. The
library fine fixture lands on Rohan (relational assertions only).

---

## 15. Limitations

1. **No notifications engine.** Due-soon/overdue surface in the portal,
   dashboard card, and parent view; no push/email (explicitly out of scope).
2. **No RFID/barcode hardware or gate integration.** Accession numbers are
   typed identifiers; scanners belong with hardware phases.
3. **No AI librarian or recommendation model.** Explicitly deferred; the
   ERP works fully without AI.
4. **Denormalized authors/categories.** Fine for search/filter at this
   scale; normalize when per-author workflows arrive.
5. **"Any room" equivalent:** reservation holds are book-level, not
   copy-specific, until issuance — correct for FIFO, documented.
6. **Pre-existing verification debt untouched:** Phase 6 E2E gap, Phase 5
   trailing crash, pytest packaging (documented, none worsened).

---

## 16. Next Recommended Phase

**Phase 12 — Placement Cell (core ERP).**

Rationale: with every other core workflow operational (academics, fees,
hostel, transport, certificates, library) across all roles, the remaining
high-value university workflow is placements: company/drive registry,
eligibility rules from academic records, student applications with the
request→review→select shape proven in Phases 9–11, offer tracking, and
parent-visible summaries reusing the Phase 8 link model. Do not implement
it here.
