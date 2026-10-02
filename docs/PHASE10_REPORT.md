# Phase 10 — Digital Certificates & Document Verification

## Executive Summary

Phase 10 adds a complete certificate workflow — student requests, admin
review/approve/reject, transactional issuance with unique numbers and
verification codes, server-generated PDF documents with QR codes, public
verification (VALID / REVOKED / NOT FOUND), and read-only parent visibility.

**All previous phases remain green.** API suite: 351/351 (324 prior + 27
new). E2E: 26 + 48 + 52 + 43 + 5 + 37 + 29 + 37 + 27 (Phases 1, 2, 3, 4, 5,
7, 8, 9, 10) all passing. (Phase 6 has no suite file — pre-existing gap,
unchanged.)

---

## 1. Phase 10 Architecture

Same modular monolith: `modules/certificates/` (service, document renderer,
thin controller, three routers, zod schemas), registered as
`/api/certificates` (STUDENT), `/api/admin/certificates` (ADMIN), and
`/api/certificates/verify` (public, rate-limited). Parent visibility reuses
the Phase 8 link check. No blockchain: QR codes referencing ERP-verified
records are the authenticity mechanism, as specified.

---

## 2. Certificate Workflow

Student selects type (BONAFIDE / TRANSCRIPT / CONDUCT / ENROLLMENT) with
requirements shown → submits purpose → tracks PENDING → sees APPROVED →
downloads the issued PDF with QR → opens `/verify/<code>`. Admin lists with
status/type/search filters → opens detail (student + attendance/enrollment
context) → approves, rejects (reason required), issues (number + code
generated), or revokes issued certificates. Parents see issued certificates
per linked student with verify links.

---

## 3. State Machine

`PENDING → APPROVED → ISSUED → REVOKED`, plus `PENDING → REJECTED`. Every
transition runs in a transaction with `SELECT ... FOR UPDATE`; anything
else returns `400 INVALID_TRANSITION` (re-approve, double issue, issue
without approval, re-revoke all tested). Issuance atomically creates the
certificate row and flips the request; revocation flips both rows so the
document stays verifiable as REVOKED.

---

## 4. Certificate Generation

Numbers (`SC-YYYY-XXX-NNNNNN`, e.g. `SC-2026-TRN-000101`) come from the
`certificate_no_seq` sequence inside the issue transaction — unique by
construction with a constraint backstop. Codes are 12-char
`randomBytes(9).toString("base64url")` with unique-constraint retries.
Seed reserves sequences 1–100 for demo fixtures (`setval(...,100)`).

---

## 5. QR Verification

Each PDF embeds a QR code (qrcode lib) pointing at
`{FRONTEND_URL}/verify/<code>`. The public page (dark, distinct from the
portal) shows VALID with number/type/masked name/institution/date, REVOKED
with a warning, or NOT FOUND — no login, rate-limited to 120/min/IP.
**QR verification implemented; blockchain explicitly not implemented.**

---

## 6. Parent Integration

`GET /api/parent/students/:id/certificates` returns issued (and revoked,
status-labelled) certificates behind `requireLinkedStudentUserId` — 404 on
forged/unlinked ids, 403 for non-parents. Parents cannot request, approve,
issue, or revoke (all 403, tested). The parent dashboard card shows number,
date, status, and verify links.

---

## 7. Role Matrix

| Action | Student | Parent | Faculty | Admin |
| ------ | ------- | ------ | ------- | ----- |
| Request own certificate | ✅ | ❌ | ❌ | ❌ |
| View own request | ✅ | ❌ | ❌ | ✅ |
| View linked student's issued certificates | ❌ | ✅ | ❌ | ✅ |
| Approve / reject request | ❌ | ❌ | ❌ | ✅ |
| Issue certificate | ❌ | ❌ | ❌ | ✅ |
| Revoke certificate | ❌ | ❌ | ❌ | ✅ |
| Public verification | ✅ | ✅ | ✅ | ✅ |

Faculty has no certificate permissions anywhere (UI, API, AI — asserted).
Backend authorization is authoritative throughout.

---

## 8. Security / IDOR Protection

- Ownership via `WHERE student_id` on every student read/download; cross-
  student reads and downloads return 404 (tested both).
- Admin router is `requireRole("ADMIN")`; faculty/student/parent get 403
  (tested per route family).
- Verification codes are unguessable randoms (never sequential ids); the
  verify payload is payload-scanned for emails, fees, attendance, scores,
  and secrets.
- Download streams with JWT-checked ownership; filenames derive from the
  validated certificate number (no path traversal, no user filenames, no
  files stored anywhere).
- Duplicate PENDING requests blocked by partial unique index (409).

---

## 9. Database Changes

`012_phase10_certificates.sql`: `certificate_no_seq` sequence,
`certificate_requests` (type/status checks, partial anti-duplicate index,
review/issue audit columns, FK to certificate added idempotently) and
`certificates` (1:1 request link, student FK, unique number, unique code,
status, timestamps) with query-pattern indexes and `updated_at` triggers.
Prior migrations untouched.

---

## 10. API

See `docs/API.md` § Digital certificates. Student (request/list/issued/
detail/download), admin (filtered list/detail/approve/reject/issue/revoke),
parent (issued list), public verify. Standard envelopes and `ApiError`
codes (`INVALID_TRANSITION`, `DUPLICATE_RESOURCE`, `VALIDATION_ERROR`,
`RATE_LIMITED` on verify).

---

## 11. Frontend

- `/certificates` (STUDENT): type-aware request dialog with hints, request
  tracking with rejection reasons, issued cards with auth-fetched
  view/download (blob URLs, since JWTs live in localStorage) and verify
  links.
- `/admin/certificates` (ADMIN): status/type/search filters, selectable
  request list, detail with academic context, approve/reject-with-reason/
  issue/revoke actions with error surfacing.
- `/verify/[code]` (public): dark verification experience, VALID/REVOKED/
  NOT FOUND states, minimal data, no portal chrome.
- Nav: `Certificates` for STUDENT and ADMIN; parent dashboard card.

---

## 12. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **351/351** | 324 prior + 27 Phase 10 (auth, create/duplicate/type validation, ownership list, admin list, faculty/student blocks, issue-without-approval, approve/re-approve, unique numbering, double issue, reject validation, revoke/re-revoke, VALID/REVOKED/NOT FOUND verify + payload scan, cross-student read/download blocks, real PDF download check, parent linked/unlinked/approve-block) |
| E2E Phase 1 | **26/26** | |
| E2E Phase 2 | **48/48** | |
| E2E Phase 3 | **52/52** | |
| E2E Phase 4 | **43/43** | |
| E2E Phase 5 | **5/5** | (pre-existing trailing selector crash unchanged; all 5 checks pass) |
| E2E Phase 6 | n/a | No suite file (pre-existing gap, unchanged) |
| E2E Phase 7 | **37/37** | |
| E2E Phase 8 | **29/29** | |
| E2E Phase 9 | **37/37** | |
| E2E Phase 10 (`frontend/e2e/phase10.e2e.mjs`) | **27/27** | Student request flow, admin approve→issue flow, parent visibility + guards, public VALID/REVOKED/NOT FOUND, API transition/IDOR/revoke-verify checks |
| Python ML | artifacts verified | `performance_model.joblib` v1 loads; pre-existing pytest packaging issue untouched |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 27 routes incl. `/certificates`, `/admin/certificates`, `/verify/[verificationCode]` |
| DB migrate/seed | PASS | 012 applies; 6 requests + 2 certificates seeded |

---

## 13. Known Limitations

1. **Demo branding, demo data.** PDFs are official-looking but carry
   explicit demo disclaimers; transcript content summarizes internal
   indicators rather than official marks.
2. **No file store.** PDFs regenerate deterministically per download —
   cheap at this scale; a CDN/object-store cache belongs with production
   hardening, not the MVP.
3. **No email/SMS delivery.** Issuance is portal-visible only.
4. **No advanced signatures or blockchain.** Explicitly deferred per brief.
5. **Pre-existing verification debt untouched:** Phase 6 E2E gap, Phase 5
   trailing crash, pytest packaging (documented, none worsened).

---

## 14. Next Recommended Phase

**Phase 11 — Library Management (core ERP).**

Rationale: with every other core workflow operational (academics, fees,
hostel, transport, certificates) across all roles, the remaining
high-value ERP workflow is the library: catalogue + copies, issue/return
with due dates and fine computation reusing the fees ledger pattern,
reservations, and student/parent read-only views — following the
request→approve→fulfil workflow shape proven in Phases 9–10. Do not
implement it here.
