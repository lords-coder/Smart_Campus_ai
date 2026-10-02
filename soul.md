# soul.md — The Complete Soul of SmartCampus AI

> One document that holds everything about this project: what it is, how it is built, every
> endpoint, every table, every rule, every distinctive mechanism, how to run it, and how it is
> verified. Written against the code as it stands, not against intentions.
>
> Companion documents: `README.md` (quick start for a downloader) · `docs/API.md` (endpoint
> reference) · `docs/ARCHITECTURE.md` (request lifecycle, permission matrix) ·
> `docs/ML_ARCHITECTURE.md` (feature contract) · `docs/PHASE*.md` (per-phase reports).

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [The distinctive things](#2-the-distinctive-things)
3. [Architecture](#3-architecture)
4. [Repository layout](#4-repository-layout)
5. [Running it](#5-running-it)
6. [Environment variables](#6-environment-variables)
7. [Accounts, registration and approval](#7-accounts-registration-and-approval)
8. [Auth and RBAC](#8-auth-and-rbac)
9. [API surface](#9-api-surface)
10. [Database](#10-database)
11. [Backend internals](#11-backend-internals)
12. [Frontend internals](#12-frontend-internals)
13. [ML service](#13-ml-service)
14. [Domain workflows](#14-domain-workflows)
15. [Testing and verification](#15-testing-and-verification)
16. [Limitations, gotchas and honest notes](#16-limitations-gotchas-and-honest-notes)
17. [Document map](#17-document-map)

---

## 1. What this project is

An AI-powered college/university management platform. A modular monolith — one frontend, one
backend, one database, one Python service. No microservices, no message queue, no ORM.

| | |
|---|---|
| Phases shipped | **1 – 15** |
| Frontend routes | **44** (7 public + 37 behind the authenticated shell) |
| Frontend source files | 148 (`frontend/src`) |
| Backend source files | 108 (`backend/src`) across **16 modules** |
| SQL migrations | **18** |
| Database | 59 domain tables + `schema_migrations`, 239 indexes, 61 triggers, 637 CHECK constraints |
| API regression | 487 assertions |
| Registration/approval suite | 85 assertions |
| ML integration suite | 61 assertions |
| Python unit tests | 33 |
| End-to-end (browser) | **750 assertions** across 17 Puppeteer suites |
| Shell/accessibility probes | 90 assertions |

### Phases

| Phase | Scope | Report |
|---|---|---|
| 1 | Foundation: auth, RBAC, PostgreSQL model, student API, dashboard | — |
| 2 | Attendance marking, fee register, payments | `docs/PHASE2_REPORT.md` |
| 3 | Timetable register, conflict detection, archive-first delete | `docs/PHASE3_REPORT.md` |
| 4 | AI chat assistant grounded in live campus data | `docs/PHASE4_REPORT.md` |
| 5 | Performance prediction served by a trained Python model | `docs/ML_ARCHITECTURE.md` |
| 6 | Personalized learning recommendations | `docs/PHASE6_REPORT.md` |
| 7 | Dropout risk and intervention dashboard | `docs/PHASE7_REPORT.md` |
| 8 | Parent portal: invitations and read-only guardian access | `docs/PHASE8_REPORT.md` |
| 9 | Hostel and transport management | `docs/PHASE9_REPORT.md` |
| 10 | Digital certificates with QR verification | `docs/PHASE10_REPORT.md` |
| 11 | Library: catalogue, loans, renewals, fines | `docs/PHASE11_REPORT.md` |
| 12 | Placement cell: drives, eligibility, applications, offers | — (no report; see §16) |
| 13 | Alumni: directory, mentorship, events, giving | `docs/PHASE13_REPORT.md` |
| 14 | Mess and canteen management with billing | `docs/PHASE14_REPORT.md` |
| 15 | Transport live-tracking readiness (staff-reported telemetry) | `docs/PHASE15_REPORT.md` |
| — | Global dark AppShell + generated design system for all roles | `docs/FRONTEND_INTEGRATION_REPORT.md` |
| — | Registration, Super Admin approval, account help | this document, §7 |

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.3.7 (App Router, Turbopack), React 19.2.8, TypeScript strict, Tailwind v4, shadcn/ui + radix-ui, lucide-react, `cn` |
| Backend | Node 20.9+ (runs on 24), Express 5, TypeScript (`tsx` dev / `tsc` build), Zod 4 |
| Database | PostgreSQL 16 (`postgres:16-alpine`), raw SQL migrations, `pg` driver — no ORM |
| Auth | JWT HS256 (issuer `smartcampus-ai`) + bcryptjs, backend-enforced RBAC |
| AI | Provider abstraction: OpenAI `gpt-4o-mini` or a deterministic mock; allowlisted read-only tools; per-user rate limit |
| ML | Python 3.11, FastAPI, scikit-learn `RandomForestClassifier`, joblib |
| Testing | API smoke suite, Puppeteer E2E (system Chrome), pytest, feature-parity harness, shell/visual/a11y probes |

Ports: **5432** PostgreSQL · **4000** Express · **3000** Next.js · **8001** FastAPI.

---

## 2. The distinctive things

The parts that are not boilerplate — the decisions that make this codebase behave the way it does.
Each is verified against the source.

### 2.1 Concurrency and integrity

1. **Timetable writes are serialised by an advisory lock.** Every timetable write path opens a
   transaction and first takes `pg_advisory_xact_lock(TIMETABLE_WRITE_LOCK)`
   (`timetable.service.ts:449,534,637`), so two concurrent overlapping-room inserts cannot both pass
   the conflict scan. This closes a real TOCTOU window that plain unique indexes would miss.
2. **Edited rows are pinned too.** After the advisory lock, `SELECT id … FOR UPDATE` fixes the row
   version used by the conflict check (`timetable.service.ts:536,639`).
3. **One `set_updated_at()` trigger function, installed by a loop.** Migrations do not hand-write
   trigger DDL; a `FOREACH … EXECUTE format('CREATE TRIGGER trg_%s_updated_at …')` DO block installs
   it on every table that has `updated_at` (`001_core_users.sql:25-44` and 11 later migrations).
4. **Invariants the database itself defends.** `enforce_parent_link_role()` rejects a
   `parent_user_id` whose role is not `PARENT`; `enforce_alumni_profile_role()` requires `ALUMNI`;
   `enforce_hostel_capacity()` rejects `bed_number > capacity` and an already-full room (with
   self-exclusion on update); `enforce_assignment_stop_route()` rejects a stop that belongs to a
   different route — a cross-table rule no foreign key can express.
5. **Partial unique indexes encode "one live X".** `uq_hostel_alloc_active_student`,
   `uq_hostel_alloc_active_bed`, `uq_transport_assign_active_student`,
   `uq_library_loans_active_copy`, `uq_library_res_active`, `uq_cert_requests_pending`,
   `uq_placement_apps_live`, `uq_placement_offers_live`, `uq_alumni_mentorship_live`,
   `uq_mess_enroll_active`, `uq_fees_library_loan`, `uq_fees_mess_period`, `uq_fees_canteen_period`.
   History rows stay unlimited because the predicate only covers the live state.
6. **Money cannot be overdrawn twice.** `recordPayment` locks with `FOR UPDATE OF f` scoped to the
   joined table (`fees.service.ts:143-154`), then the `amount > balance` check is authoritative; the
   same rule is also a CHECK constraint (`amount_paid <= amount`, `003_student_records.sql:29`).
7. **Single-use tokens are claimed atomically.** A password reset does
   `UPDATE … SET used_at = now() WHERE id = $1 AND used_at IS NULL` and aborts the transaction when
   `rowCount === 0` (`auth.service.ts:306-318`), so a concurrent replay loses the race. Parent
   invitations use the same pattern with `FOR UPDATE`.
8. **Postgres error codes become typed API errors centrally.** `23505 → 409 DUPLICATE_RESOURCE`,
   `23503 → 409 REFERENCE_ERROR`, `22*`/`23* → 400 DATABASE_CONSTRAINT_ERROR`
   (`errorHandler.ts:59-73`), so a partial-unique race surfaces as a typed error, never a 500.
9. **One transaction primitive.** `withTransaction(fn)` in `config/db.ts:30-43` is the only way any
   module opens a transaction — BEGIN/COMMIT/ROLLBACK with `client.release()` in `finally`.

### 2.2 Authorization

10. **`requireAuth` re-reads the user row on every request.** The JWT is never the source of truth
    (`authenticate.ts:27-58`), so a role change, suspension or deletion takes effect immediately;
    `status !== 'ACTIVE'` becomes `401 ACCOUNT_DISABLED`.
11. **SUPER_ADMIN inherits ADMIN access in one expression.**
    `isSuperAdmin && roles.includes("ADMIN") ? true : roles.includes(user.role)`
    (`authenticate.ts:64-80`). One line gives the highest role every admin surface without editing
    fifteen route registrations — and `requireRole("SUPER_ADMIN")` routers stay exclusive.
12. **The UI applies the same rule.** `RoleGuard` mirrors it client-side
    (`guards.tsx:52,58`) so the frontend can never disagree with the API.
13. **Student endpoints take no identifier at all.** `/students/me/*` paths carry no id; the scope is
    `req.user.id`, so IDOR is structurally impossible rather than filtered
    (`students.routes.ts:9-23`).
14. **404 instead of 403 when existence would leak.** A student asking for another student's fee
    record gets `notFound("Fee record not found")` with the comment *"Do not leak the existence of
    another student's fee record"* (`fees.service.ts:220-233`), while a genuine faculty attempt still
    gets 403 because the role itself is out of scope. Certificates fold ownership into the SQL
    (`WHERE c.id = $1 AND c.student_id = $2`) so wrong-owner and missing-id are the same 404.
15. **Faculty reach students by teaching assignment, not by role.**
    `assertFacultyCanAccessStudent` intersects the faculty's active `timetable_entries.course_id`
    set with the student's `enrollments` (`performance.risk.routes.ts:82-90`).
16. **The AI tool layer dispatches on the actor's role and defaults to refusal**
    (`ai.tools.ts:30-47`), so a role it does not implement can never reach data. Parent questions
    re-enter the student retriever with a proxy actor resolved *server-side* from
    `parent_student_links` (`ai.tools.ts:594-618`).

### 2.3 Resilience and degradation

17. **The ML client never throws.** `requestMlPrediction` returns
    `{ok:true} | {ok:false, reason}` with reasons `ML_DISABLED | ML_UNREACHABLE | ML_TIMEOUT |
    ML_BAD_STATUS | ML_INVALID_RESPONSE` (`performance.ml-client.ts:27-37`). The endpoint still
    answers **HTTP 200** with `prediction_source: "RULE_BASED"`, `model_version: "rule-based-v1"`,
    `is_model_prediction: false` and a typed `fallback_reason` — degradation is a state, not an error.
18. **A failed ML response body is never read** (`performance.ml-client.ts:66-70`), so stack traces
    and filesystem paths from the Python service cannot leak. Two extra semantic guards beyond
    schema validation also degrade: `model_loaded === false`, and a `probabilities` map that does not
    contain its own reported `category` (`:90-99`).
19. **AI failures use different statuses than ML failures**: provider timeout → `504 AI_TIMEOUT`,
    everything else → `503 AI_UNAVAILABLE` (`ai.service.ts:170-175`).
20. **The mock provider can be told to fail.** `MockProvider` honours sentinel prompts ("simulate
    provider failure" / "… timeout") so provider-failure branches are exercised in tests with no API
    key (`ai.provider.ts:143-156`).
21. **`/health` answers 503 when the database is unreachable** while still using the success
    envelope shape, with `status: "degraded"` (`routes/index.ts:30-46`).
22. **Risk snapshots heal themselves on read.** `ensureRiskSnapshots` computes only the students
    missing today's row, in parallel, and swallows per-student failures so the page still renders
    (`performance.risk.ts:441-463`). List queries then use `LEFT JOIN LATERAL (… ORDER BY
    calculated_on DESC LIMIT 1)` — explicitly no N+1 (`performance.risk.routes.ts:149-174`).
23. **Billing sweeps are convergent, not additive.** `billStudentMonth` re-derives both fee rows via
    `upsertFoodFee` and bills only orders with `fee_id IS NULL`, then stamps `fee_id`, so re-running
    never double-charges (`mess.service.ts:634-706`).
24. **The attendance submit is idempotent.** `ON CONFLICT (student_id, course_id, date) DO UPDATE`
    with `recorded_by = COALESCE(EXCLUDED.recorded_by, attendance.recorded_by)`, so an admin
    re-submission never erases the original faculty recorder (`attendance.service.ts:220-231`).

### 2.4 Frontend generation and design system

25. **One prototype stylesheet generates two host stylesheets.**
    `scope-command-center-css.mjs` emits `command-center.css` (rules verbatim, document-level
    selectors re-anchored under `.command-center-surface`) *and* `app-shell.css` (only shell-led
    rules, palette re-declared on `.app-shell`).
26. **Selector rewriting is order-sensitive.** Pseudo-element forms are rewritten before the bare
    `*` lookahead so a `*` rule cannot swallow a descendant form
    (`scope-command-center-css.mjs:52-63`).
27. **A brace-depth scanner, not a regex, splits the stylesheet.** It tracks comments and string
    literals because a regex cannot tell a declaration block from a nested rule (`:157-200`).
28. **Prototype tokens are renamed so they cannot shadow shadcn's.** `--accent*` becomes `--sc-*`,
    because leaving it would turn `hover:bg-accent` into full-strength aqua; `--radius-*` is excluded
    as Tailwind's own namespace (`:132-145`).
29. **The generators self-verify and exit non-zero on a leak.** They assert no document-level
    selector survived unscoped, every shell selector leads with a shell class, the palette tokens
    exist, no `--accent*` reference remains, and each shell rule body is byte-identical to its source
    modulo the rename (`:368-435`).
30. **The dark theme is generated by scanning the source.** `build-dark-theme.mjs` parses Tailwind's
    `theme.css` for `oklch()` values and scans `src/**` for directly-used `bg-/text-/border-…-<family>-<shade>`
    utilities, then re-points the semantic tokens and remaps those raw shades — which is how fifteen
    already-verified modules became dark without being rewritten. Shade remapping is
    **prefix-driven, not shade-driven** (a shade used as a surface at 400+ keeps Tailwind's default so
    solid brand blocks retain contrast), neutrals get a chroma floor (0.012/0.008) to stay in the
    navy hue family, and the three genuinely ambiguous shades are declared explicitly — the script
    **throws** on a new one rather than guessing (`build-dark-theme.mjs:44-163`).
31. **Navigation is generated from the real route guards.** Each `NavItem` carries the exact roles
    its page's `RoleGuard` accepts, so the sidebar can never offer a link that bounces
    (`nav-config.ts:26-58`). The active entry is chosen by **longest match**, because `/admin` is a
    prefix of `/admin/transport` (`:164-181`).
32. **One API client for the whole app.** `lib/api.ts` unwraps the envelope and returns
    `payload.data`; a 2xx with an unreadable body becomes `INVALID_RESPONSE`; any 401 with a token in
    hand clears the token and fires `UNAUTHORIZED_EVENT`.
33. **`useApi` resets state during render, not in an effect.** The request identity is
    `${path}#${version`, compared against the last key while rendering, so loading/error reset
    synchronously with the key instead of flashing stale state for a frame (`use-api.ts:26-32`).
34. **bfcache is handled explicitly.** On `pageshow` with `event.persisted` the session is re-read,
    and on failure the app hard-navigates with `window.location.replace("/login")`, because a
    restored document's client router cannot reliably finish a `router.replace()`
    (`auth-provider.tsx:73-84`).

### 2.5 Determinism and correctness details

35. **`mulberry32`, not `Math.random`.** The test seed uses a 32-bit integer PRNG
    (`seed-test.ts:22-31`) and **five independent named streams** so adding fixtures to one area
    cannot shift generated values in another (`:257,347,398,449,1347`).
36. **Local-midnight date handling.** node-pg parses `DATE` columns as *local* midnight, so
    `toISOString()` would shift values back a day east of Greenwich. `toLocalDateString()` accepts
    `Date | string` and slices strings at 10 chars (`utils/date.ts:23-31`); the frontend mirrors it
    with `new Date(\`${isoDate}T00:00:00\`)` (`format.ts:9-12`).
37. **Overdue arithmetic is timezone-safe.** `overdueDaysSince` zeroes both timestamps to local
    midnight before dividing, because `due_at::date` versus `now()` follows the session timezone and
    can disagree by a day (`library.service.ts:57-69`).
38. **ML labels come from the artifact, never from a constant.** The probability vector is keyed by
    `model.classes_`, because the training set contains no AVERAGE examples — three classes, not four
    (`ml/inference/main.py:117-126`). At boot the service logs which taxonomy bands it can never
    predict (`:197-203`).
39. **The 44-name feature array is the contract.** The builder iterates `ML_FEATURE_NAMES` (not its
    own object literal) so an unrecognised feature resolves to `0.0` and the payload always has
    exactly `ML_FEATURE_COUNT` entries (`performance.features.ts:22,74-77,289-303`).
40. **Feature parity asserts order, not just membership.** `feature-parity.mjs` compares
    `JSON.stringify` of the full vector against a Python dump with a 1e-6 absolute plus 1e-9 relative
    epsilon, and separately asserts each student's vector length is exactly 44
    (`feature-parity.mjs:17-25,40-48,75-79`).
41. **Fines are an upsert keyed on the loan.** Recalculation updates the single fee row and recomputes
    PAID/PARTIAL/PENDING from `amount_paid`, so recalculating never duplicates
    (`library.service.ts:450-471`, backed by `uq_fees_library_loan`).

### 2.6 Testing rig

42. **The smoke suite walks the real user journey to get a usable account.** Because public
    registration now yields an inactive PENDING account, `registerApprovedStudent` registers →
    asserts the pending login is `403 REGISTRATION_PENDING` → has SUPER_ADMIN approve →
    logs in again (`api.smoke.mjs:58-139`). It reads privileged credentials from `backend/.env`
    rather than hardcoding them, and generates student numbers inside the 20-char schema limit.
43. **ML degradation is tested for real.** `ml-integration.mjs` stands up a stub HTTP server on a
    random port, spawns a **second backend process** on port 4187 pointed at it, and asserts each
    bad-response mode yields HTTP 200 + `RULE_BASED` + the exact reason — plus that the raw body
    never contains `.joblib`, `Traceback` or `/app/ml` (`:13-27,289-317`).
44. **Model classes are read from the running service.** E2E reads the `classes` array from the ML
    service `/health` instead of hardcoding it, so probability assertions describe the deployed model
    (`phase5.e2e.mjs:26-30,71-88`).
45. **Feature parity is a two-sided harness.** `ml/tests/_parity_dump.py` runs the real
    `extract_features` against the live database and writes `_parity_reference.json` with
    `sort_keys=True`; the Node side diffs the SQL implementation against it.
46. **Probes assert invariants E2E does not.** The shell probe checks structure and ARIA across five
    roles at three widths: exactly one `aria-current` link per route, drawer focus moved in and
    returned on Escape, focus *not* reachable inside a closed drawer, and no horizontal overflow
    (`probe-app-shell.mjs:67-197`). The a11y probe compares `transitionDuration` before and after
    `emulateMediaFeatures`, handling Chrome's `"1e-05s"` collapsed-duration quirk numerically
    (`probe-a11y.mjs:44-72`). The visual probe hunts light containers (`r,g,b > 190` inside
    `.app-shell`), overflow and clipped headings (`probe-visual-qa.mjs:60-90`). The module-flow probe
    treats an error-state string as a **failure** even when the expected word is present, so a page
    rendering an error boundary cannot pass (`probe-module-flows.mjs:96-119`).
47. **No browser download.** Every E2E suite uses `puppeteer-core` with the system Chrome
    executable — no Chromium fetch, no version skew.

---

## 3. Architecture

```
Browser (Next.js 16, React 19)
   |  Authorization: Bearer <jwt>          one API client (lib/api.ts), one fetch hook (use-api.ts)
   v
Express API (port 4000)  — modular monolith, one module per domain
   |  validate (Zod) -> requireAuth -> requireRole -> controller -> service -> SQL
   v
PostgreSQL 16 (port 5432)                 migrations in database/migrations/*.sql

Express  ->  FastAPI ML service (port 8001)  ->  RandomForest
             the browser NEVER talks to the ML service
```

### Request lifecycle

```
HTTP request
  → cors()                      allow-listed origins only, credentials disabled
  → express.json()              100kb body limit
  → request timer               METHOD /path -> status (ms); never logs bodies
  → routes/index.ts             mounted at /api
      → middleware/validate()   Zod → 400 VALIDATION_ERROR; replaces req.body with parsed data
      → requireAuth()           verify HS256 + issuer, then RE-READ the user row from PG
      → requireRole(...)        403 FORBIDDEN (SUPER_ADMIN passes wherever ADMIN is accepted)
      → controller              thin: read validated input, call service, shape response
      → service                 owns ALL SQL and domain logic
  → errorHandler                ZodError / ApiError / PG error → one envelope + status
```

### Rules that hold everywhere

- Controllers are thin; **services own all SQL and domain logic**.
- Every response goes through `utils/response.ts`; every failure is an `ApiError`.
- The backend is the **authoritative** authorization layer; `RoleGuard` is UX only.
- Student data is scoped by `WHERE user_id = $1`; no endpoint trusts a client-supplied `studentId`.
- The browser talks only to Express — never to the database, never to the ML service.
- One timetable system: attendance, the faculty week view and the student schedule read the same rows.
- Archive-first deletes; hard deletes are refused while dependent history exists.
- Validation happens on the server even when the client also validates.

### Module template

```
backend/src/modules/<name>/
├── <name>.routes.ts       router + requireAuth/requireRole + validate wiring
├── <name>.controller.ts   request/response only
├── <name>.service.ts      SQL + domain logic
├── <name>.schemas.ts      Zod (optional)
├── <name>.types.ts        DTO shapes (optional)
```
Register once in `src/routes/index.ts`, add a numbered migration, add frontend types and a
`useApi<T>()` call. Most modules export two routers — a student/user-facing one and an
`/admin/...`-prefixed one — so a single module owns a domain end to end
(`parent`, `hostel`, `transport`, `certificates`, `library`, `placements`, `alumni`, `mess`).

---

## 4. Repository layout

```
smartcampus-project/
├── backend/                              Express API (modular monolith)
│   ├── src/                              108 files
│   │   ├── app.ts                        createApp(): CORS, 100kb JSON, timer, /api, 404, errorHandler
│   │   ├── server.ts                     listen + SIGINT/SIGTERM graceful shutdown
│   │   ├── config/env.ts                 7 required vars, fail-fast, typed env (ai{} ml{} blocks)
│   │   ├── config/db.ts                  pg Pool + query/queryOne/withTransaction/pingDatabase
│   │   ├── middleware/                   authenticate.ts · validate.ts · errorHandler.ts
│   │   ├── routes/index.ts               route registry + /health
│   │   ├── scripts/                      migrate.ts · seed.ts · bootstrap.ts ·
│   │   │                                 bootstrap-super-admin.ts · seed-test.ts · reset-db.ts
│   │   ├── utils/                        ApiError.ts · response.ts · asyncHandler.ts · jwt.ts ·
│   │   │                                 password.ts · date.ts · roles.ts
│   │   ├── types/express.d.ts            augments Request with user
│   │   └── modules/                      16 modules
│   │       ├── auth/            routes · controller · service · schemas
│   │       ├── super-admin/     routes · controller · service · schemas · types
│   │       ├── students/        routes · controller · service · types
│   │       ├── attendance/      routes · controller · service · schemas · types
│   │       ├── fees/            routes · controller · service · schemas · types
│   │       ├── timetable/       routes · controller · service · schemas · types
│   │       ├── ai/              routes · controller · service · tools · provider · schemas · types
│   │       ├── performance/     routes · controller · service · features · ml-client ·
│   │       │                    recommendations.{routes,ts} · risk.{routes,ts} · types
│   │       ├── parent/          routes · controller · service · schemas · types
│   │       ├── hostel/          routes · controller · service · schemas · types
│   │       ├── transport/       routes · controller · service · schemas · types
│   │       ├── certificates/    routes · controller · service · document · schemas · types
│   │       ├── library/         routes · controller · service · schemas · types
│   │       ├── placements/      routes · controller · service · schemas · types
│   │       ├── alumni/          routes · controller · service · schemas · types
│   │       └── mess/            routes · controller · service · schemas · types
│   ├── tests/                            api.smoke.mjs (2730 lines) · ml-integration.mjs (327) ·
│   │                                     registration.flow.mjs (325) · feature-parity.mjs (84)
│   ├── .env.example                      committed template (no secrets)
│   └── .env                              local, git-ignored
├── frontend/                             Next.js app
│   ├── src/                              148 files
│   │   ├── app/                          42 page.tsx + layouts + globals.css
│   │   │   ├── page.tsx                  role-based redirect
│   │   │   ├── login/ register/ forgot-password/ reset-password/ parent/activate/ verify/[code]
│   │   │   └── (app)/                    AuthGuard + AppShell, 37 guarded pages
│   │   ├── components/                   23 folders, 89 files
│   │   │   ├── layout/ (6)               app-shell · nav-config · command-palette ·
│   │   │   │                             page-container · stat-card · brand-mark
│   │   │   ├── auth/ (5)                 guards · login-form · register-wizard ·
│   │   │   │                             password-help-form · reset-password-form
│   │   │   ├── providers/ (1)            auth-provider.tsx
│   │   │   ├── super-admin/ (3)          registration-requests · password-assistance · user-management
│   │   │   ├── ui/ (15)                  shadcn primitives (incl. textarea)
│   │   │   ├── states/ (3)               loading · error · empty
│   │   │   ├── command-center/ (5)       student dashboard design layer
│   │   │   └── 17 domain folders         admin(12) risk(10) recommendations(6) alumni(5) mess(3) …
│   │   ├── hooks/use-api.ts              data / loading / error / reload
│   │   ├── lib/                          api.ts · auth.ts · types.ts (133 types) · format.ts · utils.ts
│   │   └── styles/                       3 generated + 2 hand-written stylesheets
│   ├── e2e/                              17 Puppeteer suites (auth, registration, phase1–15)
│   ├── scripts/                          2 codemods + 5 probes
│   └── .env.example / .env.local
├── ml/                                   Python ML service
│   ├── inference/main.py                 FastAPI: POST /predict, GET /health, GET /model/info
│   ├── training/                         feature_engineering.py · train.py
│   ├── models/                           performance_model.joblib (committed, ~170KB) + metadata.json
│   ├── tests/                            pytest suite (33 tests) + _parity_dump.py
│   └── Dockerfile                        python:3.11-slim, uvicorn on 8001
├── database/migrations/                  001_core_users … 018_registration_approval_system (18 files)
├── docs/                                 API · ARCHITECTURE · ML_ARCHITECTURE · UI_DESIGN_SYSTEM ·
│                                          RUNTIME/FRONTEND_INTEGRATION reports · PHASE2–15
├── docker-compose.yml                    postgres 16 + ml-service
├── README.md                             downloader quick start
├── soul.md                               this document
└── current_arch.txt                      raw architecture dump
```

---

## 5. Running it

### Prerequisites
Node.js 20.9+ (npm 10+) · Docker Desktop · Python 3.11+ only for the ML service and its tests.

### Commands

```bash
# 1. database (+ optional ML service)
docker compose up -d

# 2. backend
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env   → fill in the 7 required values
npm run seed              # migrations + the single SUPER_ADMIN account

# 3. frontend
cd ../frontend
npm install
cp .env.example .env.local

# 4. run (two terminals)
cd backend  && npm run dev   # :4000
cd frontend && npm run dev   # :3000
```

### Backend scripts

| Script | What it does |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` / `start` | `tsc` → `dist/server.js` / `node dist/server.js` |
| `typecheck` | `tsc --noEmit` |
| `migrate` | apply pending `.sql` files, tracked in `schema_migrations` |
| `seed` | bootstrap: migrate + create SUPER_ADMIN (idempotent, **no demo data**) |
| `bootstrap` | identical to `seed` under its own name |
| `seed:test` | **destructive** deterministic fixtures for the automated suites only |
| `db:reset -- --yes` | `DROP SCHEMA public CASCADE` + re-migrate; refuses without the flag |
| `test:api` / `test:registration` / `test:ml` / `test:feature-parity` | the four suites (§15) |

### Frontend scripts

`dev` · `build` · `start` · `lint` · `build:styles` (regenerate the design layer) ·
`probe:shell` · `probe:visual` · `probe:a11y` · `test:e2e` · `test:e2e:auth` ·
`test:e2e:registration` · `test:e2e:phase2` … `test:e2e:phase15`.

### A clean database contains exactly one account

```
users=1  students=0  courses=0  registrations=0  password_help=0
hitman@3600.ac.in SUPER_ADMIN ACTIVE      ← only if you configured it so
```

---

## 6. Environment variables

`.env` files are git-ignored; the `*.example` templates are committed and carry no secrets.

| Variable | Used by | Required | Default | Purpose |
|---|---|---|---|---|
| `DATABASE_URL` | backend | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | backend | ✅ | — | HS256 signing key, 64+ random chars |
| `UNIVERSITY_EMAIL_DOMAIN` | backend | ✅ | — | the only domain a public registration may use |
| `ADMIN_REGISTRATION_CODE` | backend | ✅ | — | **secret** code an `ADMIN` registration must carry |
| `FACULTY_REGISTRATION_CODE` | backend | ✅ | — | **secret** code a `FACULTY` registration must carry |
| `SUPER_ADMIN_EMAIL` | bootstrap | ✅ | — | e-mail of the one SUPER_ADMIN account |
| `SUPER_ADMIN_PASSWORD` | backend | ✅ | — | **secret** its initial password, bcrypt-hashed on the way in |
| `JWT_EXPIRES_IN` | backend | | `1d` | token lifetime |
| `FRONTEND_URL` | backend | | `http://localhost:3000` | CORS origin; also builds reset links |
| `PORT` | backend | | `4000` | API port |
| `BCRYPT_ROUNDS` | backend | | `10` | bcrypt cost |
| `AUTH_RATE_LIMIT_MAX` | backend | | `1000` | public auth requests per IP per window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | backend | | `900000` | that window (15 min) |
| `AI_PROVIDER` | backend | | `auto` | `auto` / `mock` / `openai` |
| `OPENAI_API_KEY` | backend | | — | enables the real provider; empty ⇒ mock |
| `AI_MODEL` | backend | | `gpt-4o-mini` | chat model |
| `AI_TIMEOUT_MS` / `AI_MAX_TOKENS` | backend | | `12000` / `400` | provider timeout / answer cap |
| `AI_MAX_MESSAGE_LENGTH` | backend | | `1000` | chat message cap |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | backend | | `30` / `60000` | per-user chat limit |
| `ML_SERVICE_URL` | backend | | `http://localhost:8001` | ML base URL — **server-side only** |
| `ML_TIMEOUT_MS` | backend | | `5000` | backend→ML ceiling before degradation |
| `MODEL_PATH` / `METADATA_PATH` | ml-service | | in compose | artifact locations in the container |
| `NEXT_PUBLIC_API_URL` | frontend | | `http://localhost:4000` | the only public variable |
| `PROTOTYPE_ROOT` | `build:styles` | | machine-local | where the visual prototype lives |

`env.ts` throws at boot listing every missing required variable, so misconfiguration fails loudly
instead of at the first request.

---

## 7. Accounts, registration and approval

### The model

A freshly bootstrapped database contains **exactly one account**: SUPER_ADMIN. There are no demo
users, no demo credentials in the seed path, no demo text in the UI, and no demo rows in the docs.

| Role | How the account comes into existence |
|---|---|
| `SUPER_ADMIN` | bootstrapped once from configuration; role `SUPER_ADMIN`, status `ACTIVE` |
| `STUDENT` | `/register` → `PENDING_APPROVAL` → SUPER_ADMIN approval |
| `FACULTY` | `/register` + faculty verification code → approval |
| `ADMIN` | `/register` + admin verification code → approval |
| `PARENT` | admin invitation at `/admin/parents` → `/parent/activate` |
| `ALUMNI` | verified by an admin before the alumni surfaces open |

Role homes: STUDENT `/dashboard` · FACULTY `/faculty` · ADMIN `/admin` · PARENT `/parent` ·
ALUMNI `/alumni` · SUPER_ADMIN `/super-admin`.

### Lifecycle

```
public /register  (STUDENT | FACULTY | ADMIN only)
   └─ one transaction:
        users(status='PENDING', phone)  +  students|faculties profile  +  registrations(status='PENDING_APPROVAL')
        → 201 { status: "PENDING_APPROVAL", message }   ← NO token is ever issued here

SUPER_ADMIN approve → users.status='ACTIVE'  + registrations.status='APPROVED' + reviewed_by/at
SUPER_ADMIN reject  → users.status='REJECTED' + registrations.status='REJECTED' + rejection_reason
```

`REGISTRATION_STARTED` is a valid `registrations.status` reserved for resumable multi-step
registrations; the single-submit wizard goes straight to `PENDING_APPROVAL`.

### Server-enforced rules

- **Only three roles are requestable.** `PARENT`, `ALUMNI`, `SUPER_ADMIN` are rejected by the Zod
  enum (400) — in the browser *and* on the server.
- **University domain.** The address must end in `UNIVERSITY_EMAIL_DOMAIN`, else 400
  `INVALID_EMAIL_DOMAIN`. Login is deliberately *not* domain-restricted, because SUPER_ADMIN may be
  on a different domain.
- **Password policy (Zod, server-side).** Minimum 8 characters, at least 1 uppercase letter, at
  least 1 number, at least 1 special character, maximum 72 (bcrypt's limit), plus a matching
  `confirmPassword`. The frontend shows the same four rules as a live checklist.
- **Verification codes.** `ADMIN` and `FACULTY` must supply `code`, compared on the server against
  `ADMIN_REGISTRATION_CODE` / `FACULTY_REGISTRATION_CODE`. A wrong code stops registration *before*
  any row is written and answers 400 `INVALID_REGISTRATION_CODE`. Codes are never sent to the
  browser, never stored, and never echoed in an error.
- **Duplicates.** 409 `EMAIL_TAKEN` (case-insensitive).
- **Profile rows use the real schema.** `students(student_no, department, semester, section,
  batch_year)` and `faculties(employee_no, department, designation)`; ADMIN has no profile table, so
  its professional details live in `registrations.submission`.
- **No escalation.** A role becomes effective only after the code check *and* a SUPER_ADMIN
  approval. The browser can send any `role` it likes; the server decides what that means.
- **What is never persisted in `submission`:** the password, its confirmation, and the verification
  code.

### Login behaviour

| Account state | Result |
|---|---|
| `ACTIVE` + correct password | JWT issued, role-based redirect |
| `PENDING` + correct password | **403 `REGISTRATION_PENDING`** — *"Your registration is still pending approval."* |
| `REJECTED` + correct password | **403 `REGISTRATION_REJECTED`** — *"Your registration was not approved. Please contact the administration."* |
| `SUSPENDED` | **403 `ACCOUNT_SUSPENDED`** |
| wrong password / unknown e-mail | **401 `INVALID_CREDENTIALS`** — identical message, no enumeration |

The status check runs **after** the password verifies, so a wrong password never reveals that an
account exists or what state it is in. Because `requireAuth` re-reads the user row, a rejection or
suspension also kills any token already in circulation.

### Account help (administrative recovery, not e-mail)

1. The user submits `/forgot-password` with e-mail, optional account type, reason and contact. This
   creates a persisted `OPEN` request. The response is identical for unknown addresses, so it
   cannot be used to enumerate accounts. **No password is ever requested or stored.**
2. SUPER_ADMIN works the queue at `/super-admin` → *Password assistance*: open, mark in progress,
   resolve, reject, add internal notes.
3. To actually recover access, the administrator **issues a single-use reset link**:
   `POST /api/super-admin/password-help/:id/reset` mints a 32-byte token, stores **only its SHA-256
   hash** with a 24-hour expiry, returns the link once, and flips the request to `IN_PROGRESS`.
4. The user opens `/reset-password?token=…` and sets a new password. The backend claims the token
   atomically and replaces the bcrypt hash, so the old password stops working immediately. Replay →
   400 `TOKEN_ALREADY_USED`; expired → `TOKEN_EXPIRED`; unknown → `INVALID_RESET_TOKEN`.
5. **Passwords and hashes are never displayed to anyone**, administrators included. The UI states
   this explicitly where an administrator would otherwise expect to see one.

### Test fixtures (never a deployment)

`npm run seed:test` loads a deterministic dataset — 18 users, 6 courses, 30 timetable slots, 540
attendance rows, fees/payments, assessments/assignments, learning resources, parent links and an
invitation, hostel, transport (V1 moving, V2 idle, V3 offline), certificates, library with a FIFO
reservation queue, placements across every pipeline state, alumni, mess and one billed month — plus
the SUPER_ADMIN. It exists **only** so the suites have data. `npm run seed` and `npm run bootstrap`
never create it.

---

## 8. Auth and RBAC

### Token model
- Login → bcrypt compare (10 rounds) → JWT `{ sub, role, email }`, **HS256**, issuer
  `smartcampus-ai`, expiry `JWT_EXPIRES_IN` (default 1 day).
- The frontend stores the token in `localStorage` under `smartcampus_token` and sends
  `Authorization: Bearer <jwt>`.
- `requireAuth` verifies the token **and** re-reads the user row, so role and status changes apply
  immediately.
- On any 401 the API client clears the token and dispatches `smartcampus:unauthorized`;
  `AuthProvider` flips to signed-out and sets `sessionExpired`, distinct from a deliberate logout.
- Logout is stateless — the client discards the token; `POST /auth/logout` returns
  `{ loggedOut: true }`.
- Known trade-off: `localStorage` is XSS-explainable. httpOnly cookies are deferred hardening.

### Middleware order
`cors → json(100kb) → timer → validate(Zod) → requireAuth → requireRole(...) → controller → service → errorHandler`

### Roles
`ROLES = STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN`.
`ACTIVE_ROLES = STUDENT | FACULTY | ADMIN` (the self-service roles; PARENT/ALUMNI/SUPER_ADMIN are
gated by route-level `requireRole`, which is intentional). The DB `users.role` CHECK includes all six.

### Permission matrix

| Action | STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| Own attendance / fees / timetable | ✅ | 403 | 403 | — | — | 403 |
| Mark attendance, manage classes | 403 | own classes | any | — | — | any |
| Fee register, record payments | 403 | 403 | ✅ | — | — | ✅ |
| Timetable register CRUD | 403 | read own | ✅ all | — | — | ✅ all |
| AI assistant | own data | own classes | institute | linked child | 403 | institute |
| Performance prediction | own | 403 | 403 | — | — | 403 |
| Recommendations | own | 403 | 403 | headlines | — | 403 |
| Risk dashboard | own only | assigned courses | full cohort | — | — | full cohort |
| Interventions CRUD | 403 | in-scope | ✅ | 403 | — | ✅ |
| Parent invitations / links | 403 | 403 | ✅ | — | — | ✅ |
| Read linked child | 403 | 403 | 403 | ✅ ACTIVE link | — | 403 |
| Hostel / transport / certificates / library / mess admin | self-service | library catalogue | ✅ all | read-only cards | — | ✅ all |
| Alumni surfaces | directory+events | directory+events | ✅ | 403 | ✅ self | ✅ |
| Placements | apply | browse | manage | — | — | manage |
| **Register an account** | own, pending→approved | own + code | own + code | invitation only | admin-verified | not publicly |
| **Approve / reject registrations** | 403 | 403 | 403 | — | — | ✅ only |
| **Password-help queue, reset links** | 403 | 403 | 403 | — | — | ✅ only |
| **Suspend / reactivate users** | 403 | 403 | 403 | — | — | ✅ only |

### IDOR rules
- Ownership chain: `req.user.id (JWT sub) → students.user_id → enrollments.student_id`. Client
  `studentId` parameters are ignored or re-derived.
- `users.id` ≠ `students.id`: profile tables reference `students.id`; services resolve the profile.
- 404 rather than 403 whenever a 403 would confirm that a record exists.
- Faculty timetable filters are overwritten server-side with the caller's own `faculties.id`.
- Parent reads re-check the ACTIVE `parent_student_links` row server-side; forged ids → 404.
- The ML prediction path derives all 44 features from the authenticated student's own rows; there is
  no parameter through which one student could request another's prediction.

---

## 9. API surface

**Base URL** `http://localhost:4000/api` · **Auth** `Authorization: Bearer <jwt>`

### Envelope

```jsonc
// success  (creates return 201)
{ "success": true,  "data": <payload>, "message": "OK" }
// failure
{ "success": false, "error": { "code": "SNAKE_CASE", "message": "...", "details": [...] } }
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod rejected input; `details` lists field issues |
| `INVALID_EMAIL_DOMAIN` | 400 | registration address is not a university address |
| `INVALID_REGISTRATION_CODE` | 400 | wrong admin/faculty verification code |
| `FUTURE_DATE` · `DUPLICATE_STUDENT` · `STUDENT_NOT_IN_CLASS` · `EMPTY_ROSTER` | 400 | attendance rules |
| `INVALID_AMOUNT` · `OVERPAYMENT` | 400 | fee payment rules (`details.outstandingBalance`) |
| `INVALID_TRANSITION` | 400 | illegal state machine move (certificates, mentorship, orders, approvals) |
| `INVALID_RESET_TOKEN` · `TOKEN_ALREADY_USED` · `TOKEN_EXPIRED` | 400 | password reset |
| `REGISTRATION_PENDING` · `REGISTRATION_REJECTED` · `ACCOUNT_SUSPENDED` | 403 | login blocked by account state |
| `UNAUTHORIZED` · `INVALID_TOKEN` · `INVALID_CREDENTIALS` · `ACCOUNT_DISABLED` | 401 | authentication |
| `FORBIDDEN` | 403 | role not allowed |
| `NOT_FOUND` | 404 | unknown route/record; also used instead of 403 for IDOR |
| `EMAIL_TAKEN` · `DUPLICATE_RESOURCE` · `TIMETABLE_CONFLICT` · `DEPENDENCY_CONFLICT` · `INVITATION_EXISTS` · `ALLOCATION_CONFLICT` · `RESERVATION_CONFLICT` · `EVENT_FULL` · `NO_USER_LINKED` | 409 | conflicts |
| `PAYLOAD_TOO_LARGE` | 413 | body over 100kb |
| `RATE_LIMITED` | 429 | AI 30/min/user; auth endpoints per IP; cert verify 120/min/IP |
| `AI_UNAVAILABLE` / `AI_TIMEOUT` | 503 / 504 | AI provider failed / timed out |
| `INTERNAL_SERVER_ERROR` | 500 | generic in production |

### Pagination and filters
- `GET /students/me/attendance?limit=` — 1–100, default 20, newest first.
- `GET /fees?q=&status=` — cap 500 rows; `PENDING|PARTIAL|PAID`; open fees first.
- `GET /timetable?day=&facultyId=&courseId=&section=&room=&status=` — `{ entries, total }`;
  `ACTIVE` (default) / `ARCHIVED` / `ALL`.
- `GET /risk/students` — max 200, filters `riskLevel/section/course`, sorted CRITICAL→LOW.
- `GET /library/books` — `{ items, total, page, limit }`, max 100/page; `q/category/author/available`.
- `?day=Monday…` on student/parent timetable · `?date=YYYY-MM-DD` on the attendance roster ·
  `?scope=today|tomorrow|week` on the mess menu · `?view=1` for an inline certificate PDF ·
  `?permanent=true` to hard-delete a timetable entry.
- SUPER_ADMIN lists: `status`, `role`, `q`, `limit` (≤200), `offset`.

### Endpoint inventory

**Health (1)** — `GET /health` (public; DB ping, 503 when degraded).

**Auth (6)** — `/register`, `/login`, `/password-help`, `/reset-password` are public and
rate-limited; `/me` and `/logout` need a token.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | request STUDENT/FACULTY/ADMIN → 201 pending, **no token**; faculty/admin also send `code` |
| POST | `/auth/login` | public | → `{ token, user }`; 403 for pending/rejected/suspended |
| GET | `/auth/me` | any | user + role-shaped profile (null for ADMIN/SUPER_ADMIN) |
| POST | `/auth/logout` | any | `{ loggedOut: true }` |
| POST | `/auth/password-help` | public | file an account-help request |
| POST | `/auth/reset-password` | public | consume a single-use token, set a new password |

**Students (5, STUDENT)** — `/students/me`, `/me/attendance-summary`, `/me/fees-summary`,
`/me/attendance?limit=`, `/me/timetable?day=`.

**Attendance (3, FACULTY own / ADMIN any)** — `GET /attendance/classes` ·
`GET /attendance/classes/:entryId?date=` · `POST /attendance` (batch, 201, idempotent upsert).

**Fees (3)** — `GET /fees?q=&status=` (ADMIN) · `POST /fees/:feeId/payments` (ADMIN, 201,
`FOR UPDATE` + overpayment guard) · `GET /fees/:feeId/payments` (ADMIN, or STUDENT for own only —
others 404).

**Timetable (6)** — `GET /timetable` · `GET /timetable/options` (ADMIN) · `GET /timetable/:id` ·
`POST /timetable` (advisory-locked, FACULTY/ROOM/SECTION conflicts → 409 with `conflictTypes`) ·
`PATCH /timetable/:id` · `DELETE /timetable/:id?permanent=false` (archive default).

**AI (1)** — `POST /ai/ask` (STUDENT|FACULTY|ADMIN|PARENT) → `{ answer, intent, sources, context,
provider }`; intents `ATTENDANCE / COURSE_ATTENDANCE / FEES / FEE_HISTORY / TIMETABLE /
NEXT_CLASS / GENERAL`.

**Performance (2, STUDENT)** — `GET /performance/predict` (with `prediction_source` and
`fallback_reason`) · `GET /performance` (8 aggregate features).

**Recommendations (2, STUDENT)** — `GET /recommendations` · `GET /recommendations/study-plan`
(`{ studyPlan: null, fallback: true }` when AI fails).

**Risk (10)** — student: `GET /risk/own/analysis`, `/risk/own/intervention-plan`; staff:
`GET /risk/students`, `/risk/stats`, `/risk/students/:id`, `…/trends`, `…/interventions`
(GET/POST), `POST /risk/interventions`, `PATCH /risk/interventions/:id`.

**Parent (13)** — public `POST /parent/activate`; PARENT reads
`/parent/students` and `/parent/students/:id/{overview,attendance,fees,timetable,recommendations,
notices,hostel,transport,library,mess,certificates}` (all link-checked, forged ids → 404); ADMIN
manages `/admin/parents`, `/admin/parents/invitations[/:id/revoke]`, `/admin/parents/links/:id`.

**Hostel (24)** — STUDENT `/hostel/{me,rooms,complaints,room-changes,visitors}` + creates; ADMIN
`/admin/hostel/{dashboard,hostels,rooms,allocations,complaints,room-changes,visitors}` with
`PATCH allocations/:id/{vacate,transfer}` and `PATCH room-changes/:id/review`; PARENT read-only.

**Transport (20 + telemetry)** — STUDENT `/transport/me`; ADMIN `/admin/transport/{dashboard,
vehicles,drivers,routes,stops,assignments,alerts}` with `PATCH`/`GET` variants, plus Phase 15
`POST /admin/transport/telemetry`, `POST /admin/transport/simulation`,
`GET /admin/transport/vehicles/:id/location`, `GET /admin/transport/tracking`; PARENT read-only.

**Certificates (13)** — STUDENT `POST /certificates/requests`, `GET /certificates{,/requests,/:id}`,
`GET /certificates/:id/download`; public `GET /certificates/verify/:verificationCode`;
ADMIN `GET /admin/certificates/requests[/:id]`, `PATCH …/approve`, `PATCH …/reject`,
`POST …/issue`, `PATCH /admin/certificates/:id/revoke`; PARENT read-only.

**Library (21)** — user catalogue/loans/reservations/fines + reserve/renew/cancel; ADMIN
catalogue, copies, issue, return, reservations, fines; PARENT read-only.

**Placements (implemented; ⚠ undocumented in `docs/API.md`)** — `/api/placements` and
`/api/admin/placements`: companies, drives, eligibility, application lifecycle, shortlist →
interview → offer pipeline, analytics.

**Alumni (28)** — shared directory/events/campaigns; `/alumni/me/profile`, `/alumni/me/mentorships`,
`POST /alumni/mentorships[/:id/cancel]`, event register/cancel, contributions; ADMIN profiles,
mentorships, events, registrations, campaigns, contributions, analytics.

**Mess & canteen (29)** — STUDENT plans, enrollment, menu, meals, billing, canteen catalogue,
orders, feedback; ADMIN plans, menu, meal records, items, orders, billing sweep, feedback analytics;
PARENT read-only.

**SUPER_ADMIN (9)** — `/super-admin/registrations` (list, `:id`, `:id/approve`, `:id/reject`),
`/super-admin/users` (list, `:id/status`), `/super-admin/password-help` (list, `:id`,
`:id/reset`). `requireAuth + requireRole("SUPER_ADMIN")`; a normal ADMIN, FACULTY or STUDENT gets 403.

---

## 10. Database

PostgreSQL 16 · raw SQL applied in filename order, each file in its own transaction, recorded in
`schema_migrations` · **59 domain tables**, 239 indexes, 61 triggers, 637 CHECK constraints ·
extension `pgcrypto` (001) · money is `NUMERIC(12,2)` · migrations 001–017 are never edited.

| # | Migration | Tables |
|---|---|---|
| 001 | `core_users` | `users` (+ `set_updated_at()`, `student_no_seq`, `faculty_no_seq`) |
| 002 | `academics` | `students` · `faculties` · `courses` · `enrollments` |
| 003 | `student_records` | `attendance` · `fees` · `timetable_entries` |
| 004 | `phase2_operations` | `fee_payments` |
| 005 | `phase3_timetable` | alters `timetable_entries` (`is_active`, `archived_at`, register indexes) |
| 006 | `phase5_performance` | `assessments` · `assignments` |
| 007 | `phase6_recommendations` | `learning_resources` |
| 008 | `phase7_risk_interventions` | `risk_snapshots` · `interventions` |
| 009 | `phase7_risk_fix` | idempotent `updated_at` repair on `risk_snapshots` |
| 010 | `phase8_parent_portal` | `parent_student_links` · `parent_invitations` |
| 011 | `phase9_hostel_transport` | 6 hostel + 7 transport tables, 2 invariant triggers, partial uniques |
| 012 | `phase10_certificates` | `certificate_requests` · `certificates` (+ `certificate_no_seq`) |
| 013 | `phase11_library` | `books` (GIN tsvector) · `book_copies` · `library_loans` · `library_reservations` |
| 014 | `phase12_placements` | `companies` · `placement_drives` · `placement_applications` · `placement_interviews` · `placement_offers` |
| 015 | `phase13_alumni` | 6 alumni tables; **adds `ALUMNI` to the `users_role_check`** |
| 016 | `phase14_mess_canteen` | 8 mess/canteen tables + period fee partial uniques |
| 017 | `phase15_transport_telemetry` | `transport_vehicle_telemetry` · `transport_route_progress` |
| 018 | `registration_approval_system` | alters `users` (+`status`, +`phone`) · `registrations` · `password_help_requests` · `password_reset_tokens` |

### Table reference

**Core** — `users(id, name, email UNIQUE, password_hash, role CHECK×6, status, phone, created_at,
updated_at)`; `students(id, user_id UNIQUE FK CASCADE, student_no UNIQUE, department, semester 1–12,
section, batch_year, admission_on)`; `faculties(id, user_id UNIQUE FK, employee_no UNIQUE,
department, designation)`; `courses(id, code UNIQUE, name, credits 1–6, department, semester,
faculty_id FK SET NULL)`; `enrollments(student_id, course_id, enrolled_on, status ACTIVE|DROPPED|
COMPLETED, UNIQUE(student,course))`.

**Records** — `attendance(student_id, course_id, date, status PRESENT|ABSENT|LATE|LEAVE,
recorded_by FK faculties, UNIQUE(student,course,date))` — deliberately **no** FK to
`timetable_entries`, so archiving a slot can never orphan history; `fees(student_id, fee_type,
amount, amount_paid, due_date, status PENDING|PARTIAL|PAID, CHECK amount_paid<=amount,
library_loan_id)`; `fee_payments(fee_id CASCADE, amount>0, payment_method CASH|BANK_TRANSFER|UPI|
CARD, reference<=100, recorded_by FK users SET NULL)`; `timetable_entries(course_id, faculty_id?,
room, day_of_week, start_time, end_time CHECK end>start, section, semester, department, is_active,
archived_at, UNIQUE(course,day,start_time,section))`.

**Performance** — `assessments(student_id, course_id, assessment_type QUIZ|MIDTERM|FINAL|PROJECT|
LAB|ASSIGNMENT, marks_obtained, max_marks CHECK marks<=max, assessed_on)`;
`assignments(student_id, course_id, title, submitted, score, max_score, due_date, submitted_on)`;
`learning_resources(course_id, title, description, resource_type VIDEO|NOTES|PRACTICE|ARTICLE|
REMEDIAL, topic, difficulty, url, active)`;
`risk_snapshots(student_id, calculated_on UNIQUE, risk_level, risk_score 0–100, attendance_/
assessment_/assignment_{current,previous,change}, signals JSONB)`;
`interventions(student_id, created_by RESTRICT, risk_level_at_creation, intervention_type×7,
notes, status OPEN|IN_PROGRESS|COMPLETED|DISMISSED, follow_up_date)`.

**Parent** — `parent_student_links(parent_user_id, student_id, relationship_type, status
ACTIVE|REVOKED, UNIQUE(pair))` + role trigger; `parent_invitations(student_id, parent_email,
relationship_type, token_hash UNIQUE, status PENDING|ACCEPTED|REVOKED|EXPIRED, expires_at,
used_at, created_by)`.

**Hostel** — `hostels` · `hostel_rooms(UNIQUE(hostel,room_number), capacity 1–4, status)` ·
`hostel_allocations(bed_number, status, two ACTIVE partial uniques, capacity trigger)` ·
`hostel_complaints(category, description>=5, status, priority, resolved_at)` ·
`hostel_room_change_requests(reason>=5, status, reviewed_by)` ·
`hostel_visitors(visitor_name>=2, relation, visit_date, visit_time, status)`.

**Transport** — `transport_drivers(license_no UNIQUE)` · `transport_vehicles(registration_number
UNIQUE, vehicle_type, capacity 1–80, status, driver_id?)` · `transport_routes(route_code UNIQUE)` ·
`transport_route_stops(route_id, sequence>=1, scheduled_time, UNIQUE(route,sequence))` ·
`transport_assignments(stop_id RESTRICT, vehicle_id?, status, ACTIVE partial unique, stop/route
trigger)` · `transport_passes(pass_number UNIQUE, valid_from/until CHECK, status)` ·
`transport_alerts(title>=3, severity INFO|WARNING|CRITICAL, active, created_by)` ·
`transport_vehicle_telemetry(vehicle_id, lat/lon paired+range CHECK, speed_kmh>=0, heading 0–359,
stop_sequence>=1, recorded_at, source MANUAL|SIMULATED|DEVICE)` ·
`transport_route_progress(vehicle_id, route_id, current/next_stop_id?, progress_pct 0–100,
tracking_status MOVING|IDLE|OFFLINE, recorded_at)`.

**Certificates** — `certificate_requests(certificate_type BONAFIDE|TRANSCRIPT|CONDUCT|ENROLLMENT,
status×5, purpose<=2000, rejection_reason, reviewed_by/at, issued_by/at, certificate_id?,
PENDING partial unique)` · `certificates(request_id UNIQUE, student_id, certificate_number UNIQUE,
verification_code UNIQUE, status ISSUED|REVOKED, issued_at, revoked_at)`.

**Library** — `books(isbn UNIQUE, GIN title index)` · `book_copies(accession_number UNIQUE, status×6)`
· `library_loans(copy_id RESTRICT, due_at, returned_at, renewed_count, status, issued_by/returned_by,
ACTIVE partial unique)` · `library_reservations(status WAITING|READY|FULFILLED|CANCELLED|EXPIRED,
requested_at, partial unique in WAITING/READY)`.

**Placements** — `companies(company_type×7)` · `placement_drives(package_min/max CHECK,
employment_type×4, work_mode×3, openings, application_deadline, drive_date, min_cgpa, max_backlogs,
min_attendance, eligible_departments TEXT[], eligible_semesters INT[], status×5)` ·
`placement_applications(status×7, live partial unique)` ·
`placement_interviews(round_number, scheduled_at, status×4)` ·
`placement_offers(package_amount>0, offer_status×4, live partial unique)`.

**Alumni** — `alumni_profiles(user_id UNIQUE FK, student_id?, graduation_year 1950–2100,
company/position/industry, bio<=2000, linkedin/github, offers_mentorship, mentorship_mode,
visibility, verification, status, role trigger)` · `alumni_mentorships(topic, message<=2000,
status×5, live partial unique)` · `alumni_events(event_type×8, starts_at/ends_at CHECK, capacity,
audience ALL|STUDENTS|ALUMNI, status×5)` · `alumni_event_registrations(UNIQUE(event,user))` ·
`alumni_campaigns(target_amount, status DRAFT|ACTIVE|CLOSED, date CHECK)` ·
`alumni_contributions(amount>0, status PLEDGED|RECORDED|CANCELLED)`.

**Mess** — `mess_plans(billing_type×3, price, meals_per_day 1–6)` ·
`mess_enrollments(status×4, auto_renew, ACTIVE partial unique)` ·
`mess_menu(meal_type×4, UNIQUE(date,type))` · `meal_attendance(UNIQUE(student,date,type))` ·
`canteen_items(category×5, price, available)` · `canteen_orders(status×5, total_amount, fee_id?)` ·
`canteen_order_items(quantity 1–50, unit_price snapshot, total_price)` · `mess_feedback(rating 1–5,
comment<=1000)`.

**Registration (018)** — `registrations(user_id UNIQUE FK, requested_role STUDENT|FACULTY|ADMIN,
status REGISTRATION_STARTED|PENDING_APPROVAL|APPROVED|REJECTED, submission JSONB,
rejection_reason, reviewed_by, reviewed_at)` · `password_help_requests(user_id? FK SET NULL, email,
requester_role?, contact?, message, status OPEN|IN_PROGRESS|RESOLVED|REJECTED, admin_notes,
handled_by?, handled_at?)` · `password_reset_tokens(user_id FK, request_id?, token_hash UNIQUE,
expires_at, used_at?, created_by?)`.

---

## 11. Backend internals

### config
- `env.ts` — dotenv load of `backend/.env`; **7 required variables** validated with a single
  fail-fast error listing everything missing; optional numeric helper; exports typed `env` with
  `port`, `jwt*`, `corsOrigin`, `frontendUrl`, `bcryptRounds`, registration/secret fields and nested
  `ai` and `ml` blocks.
- `db.ts` — `pg` Pool (max 10, 30s idle, idle-error logger) + `query<T>()` (returns rows),
  `queryOne<T>()` (row or null), `withTransaction(fn)`, `pingDatabase()`.

### middleware
- `authenticate.ts` — `requireAuth` (Bearer → `verifyToken` → **re-read user** → `req.user`, 401
  `ACCOUNT_DISABLED` when not ACTIVE) and `requireRole(...roles)` (403, with SUPER_ADMIN inheritance).
- `validate.ts` — `validate(schema, "body"|"query"|"params")`; `safeParse`, replaces `req.body`
  with parsed data, query result on `req.validatedQuery`, forwards `ZodError`.
- `errorHandler.ts` — `notFoundHandler` (404 with method+path) and the central mapper: ZodError→400
  `VALIDATION_ERROR`, `ApiError` passthrough, bad JSON→400 `INVALID_JSON`, body-parser→413
  `PAYLOAD_TOO_LARGE`, PG `23505`/`23503`/`22*`/`23*`, otherwise 500 with the message masked in
  production.

### utils
`ApiError.ts` (factories `badRequest`/`unauthorized`/`forbidden`/`notFound`/`conflict`, each
optionally taking a code and details) · `response.ts` (`sendSuccess`, `sendError`, `ApiSuccess`,
`ApiFailure`) · `asyncHandler.ts` (promise wrapper) · `jwt.ts` (`signToken`, `verifyToken`, issuer
validation) · `password.ts` (bcrypt hash/verify) · `date.ts` (`WEEKDAYS`, `toDateString`,
`currentWeekday`, `toLocalDateString`, `addDays`) · `roles.ts` (`ROLES`, `Role`, `ACTIVE_ROLES`,
`ActiveRole`, `isActiveRole`).

### scripts
`migrate.ts` (sorted `.sql`, tracked, one transaction each, exports `migrate()`) · `reset-db.ts`
(refuses without `--yes`) · `seed.ts` and `bootstrap.ts` (migrate + bootstrap) ·
`bootstrap-super-admin.ts` (**the reusable function, deliberately separate from the CLI entry so
importing it never re-runs the script**) · `seed-test.ts` (deterministic fixtures).

### app / server
`createApp()`: `x-powered-by` off · CORS from a comma-separated allow-list, credentials off ·
`express.json({limit:"100kb"})` · request timer that never logs bodies · `/api` · notFound ·
errorHandler. `server.ts` listens, logs port + CORS, and closes on SIGINT/SIGTERM.

### AI module internals
`ai.service.ask` pipeline: **(1)** deterministic intent routing by regex — the model never chooses
the intent; **(2)** `retrieve(actor, route)` through allowlisted read-only tools that call existing
services (so IDOR scoping is re-applied); **(3)** system prompt with grounding rules, a per-role
scope note and minimised context (no ids, tokens or credentials); **(4)** provider completion;
**(5)** `{ answer, intent, sources, context, provider }`. `ai.provider.ts` isolates the vendor SDK
behind an `AiProvider` interface; `createProvider()` resolves `auto` to OpenAI only when a key
exists. `ai.tools.ts` dispatches per role with a refusal default, and scopes parents to their linked
child server-side.

---

## 12. Frontend internals

### Route map (44)

**Public (7)** — `/` role redirect · `/login` · `/register` · `/forgot-password` ·
`/reset-password` · `/parent/activate` · `/verify/[verificationCode]`.

**`(app)` group (37)** — the group name contributes no URL segment; `AuthGuard` + `AppShell` wrap it.
Every page wraps its content in `RoleGuard`.

| Area | Routes | Roles |
|---|---|---|
| Student | `/dashboard` `/attendance` `/fees` `/timetable` `/performance` `/recommendations` `/hostel` `/transport` `/certificates` `/mess` | STUDENT |
| Shared | `/ai` | STUDENT, FACULTY, ADMIN, PARENT |
| Shared | `/library` `/placements` | STUDENT, FACULTY |
| Shared | `/profile` | STUDENT, FACULTY, ADMIN, PARENT |
| Faculty | `/faculty` `/faculty/timetable` `/faculty/risk` `/faculty/risk/[studentId]` | FACULTY |
| Admin | `/admin` `/admin/timetable` `/admin/risk` `/admin/risk/[studentId]` `/admin/parents` `/admin/hostel` `/admin/transport` `/admin/library` `/admin/certificates` `/admin/mess` `/admin/placements` `/admin/alumni` | ADMIN |
| Parent | `/parent` | PARENT |
| Alumni | `/alumni` `/alumni/profile` `/alumni/mentorship` `/alumni/events` `/alumni/campaigns` | ALUMNI and (per route) STUDENT/FACULTY |
| Super Admin | `/super-admin` | SUPER_ADMIN |

### Session and guards
No `middleware.ts`: auth is client-side. `AuthProvider` exposes
`{ status: loading|authenticated|anonymous, user, profile, sessionExpired, login, logout, refresh }`,
reads the session from `GET /auth/me`, listens for `smartcampus:unauthorized`, and re-validates on
`pageshow` (bfcache). `AuthGuard` bounces anonymous users to `/login`; `RoleGuard` redirects a wrong
role to its home and shows a plain "no access" panel. Logout uses a hard `window.location.replace`
so the router cache cannot resurrect the dashboard.

### Shell
One dark `AppShell` for all roles: grouped role-aware sidebar (`nav-config.ts`), sticky header,
⌘K/ Ctrl+K command palette over the *same* role-filtered nav list, account menu, off-canvas mobile
drawer that closes on route change and is removed from the tab order when closed. Transient surfaces
close on `pathname` change; the prototype's dead search button and notification bell were dropped.

### Stylesheets

| File | Size | Origin |
|---|---|---|
| `command-center.css` | ~39.7 KB | generated by `scope-command-center-css.mjs` |
| `app-shell.css` | ~15.5 KB | generated by the same script |
| `theme-dark.css` | ~5.6 KB | generated by `build-dark-theme.mjs` |
| `command-center-overrides.css` | ~4.8 KB | hand-written, survives regeneration |
| `app-shell-overrides.css` | ~10.8 KB | hand-written, survives regeneration |

Import order in `globals.css`: `tailwindcss` → `tw-animate-css` → `shadcn/tailwind.css` →
`theme-dark.css` → `command-center.css` → `command-center-overrides.css` → `app-shell.css` →
`app-shell-overrides.css`. `layout.tsx` imports only `globals.css`.

### Data layer
`lib/api.ts` is the only `fetch` call site. `hooks/use-api.ts` gives every page
`{ data, loading, error, reload }` and accepts `null` to skip the request while auth resolves.
`lib/types.ts` holds **133 exported types**. `lib/format.ts` centralises currency (INR, en-IN), dates
and times, tones, status→class maps, `roleHome` and transport status wording.

### Registration UX
`components/auth/register-wizard.tsx`: role picker (Student / Teacher / Administrator) → credentials
with live checklist and show/hide → verification step **for faculty and admin only** → details mapped
to real schema columns → review → submit → pending confirmation linking back to `/login`.
Progress indicator, Back/Next, per-field errors. `components/super-admin/*` provides the three
SUPER_ADMIN sections. The verification codes never appear in the bundle; the step only asks for one.

---

## 13. ML service

> This section is the overview. **`MODEL.md` is the full document** — model card, the 44 features
> with formulas, label derivation, training, exactly what the reported metrics mean, the serving
> contract, the degradation matrix, parity testing, complete limitations, and prepared answers for a
> review.

### Flow

```
Browser (STUDENT) → GET /api/performance/predict
  → Express: requireAuth + requireRole("STUDENT"); identity from the JWT only
  → resolve students.id, build the 44-feature vector (3 aggregate queries, no N+1)
  → POST {ML_SERVICE_URL}/predict (AbortController, ML_TIMEOUT_MS)
       valid → validated → prediction_source: "ML"
       otherwise → 200 with prediction_source: "RULE_BASED" + fallback_reason
  → dashboard card with an explicit source badge
```

The browser never contacts :8001. Express owns auth, identity, record reading, feature engineering,
failure classification and response validation; Python owns model loading and label ordering; the
frontend owns rendering and stating the source.

### Inference API
`POST /predict` (`{ features: { …44 names… } }`; extras ignored, missing → 400, non-numeric → 422,
no model → 503, pipeline failure → 500 with a generic message and no stack traces) ·
`GET /health` (status, loaded, version, feature count, class list) · `GET /model/info`.

### The 44 features

| # | Feature |
|---|---|
| 0–1 | `attendance_percentage`, `total_classes` |
| 2–3 | `avg_assessment_percentage`, `total_assessments` |
| 4–6 | `assignment_submission_rate`, `total_assignments`, `avg_assignment_score` (**0–10 scale**) |
| 7 | `academic_score` = `0.30·attendance + 0.50·avg_assessment + 0.20·(rate/100 · score·10)`, clamped 0–100 |
| 8–13 | `attendance_<CODE>` per course |
| 14–19 | `assessment_<CODE>` per course |
| 20–31 | `assign_sub_<CODE>`, `assign_score_<CODE>` per course |
| 32–43 | `assess_<TYPE>_avg` / `assess_<TYPE>_count` for QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT |

`<CODE>` ∈ {CS301, CS305, CS311, CS315, CS321, MA201}. Semantics: `LEAVE` counts against
attendance; NULL scores ignored; an untouched course is `0.0`, never missing; the whole history is
used, with no date window. Authoritative list:
`backend/src/modules/performance/performance.features.ts`.

### Model
`RandomForestClassifier` in `ml/models/performance_model.joblib` (committed, ~170 KB).
**Three classes: `AT_RISK`, `EXCELLENT`, `GOOD`** — the training set contains no `AVERAGE` example, so
the service can never emit it and says so at boot. Trained on **6 synthetic students**; reported
accuracy/f1 of 1.0 are training-set figures. Class imbalance 3/1/2 mitigated with
`class_weight="balanced"`. Retraining with `ml/training/train.py` requires updating
`ML_FEATURE_NAMES` in the same change or the parity tests fail loudly.

### Degradation
`ML_DISABLED` · `ML_UNREACHABLE` · `ML_TIMEOUT` · `ML_BAD_STATUS` · `ML_INVALID_RESPONSE` — every one
still answers **200** with `prediction_source: "RULE_BASED"`, `is_model_prediction: false`,
`model_version: "rule-based-v1"` and the typed reason. The rule-based confidence is a band distance
and is never presented as model confidence. The UI always shows which source produced the number.

---

## 14. Domain workflows

1. **Attendance marking** — faculty picks a class → roster for a date → `POST /attendance` batch →
   roster recomputed from enrollments; unknown/duplicate students rejected with the offending ids;
   one transaction; idempotent upsert; `recorded_by` preserved through `COALESCE`; student summaries
   recompute on next fetch.
2. **Fee payment** — `SELECT … FOR UPDATE` on the fee row → overpayment check → immutable
   `fee_payments` row → `fees.amount_paid` and status recomputed. No gateway.
3. **Timetable conflict detection** — advisory-locked transaction → validate course/faculty/section →
   derive semester and department **from the course, never from the client** → conflict scan
   (FACULTY/ROOM/SECTION against active rows, excluding the edited row) → 409 with `conflictTypes`
   or write. Archive is the default delete; a hard delete is refused while attendance history exists.
4. **AI assistant** — auth → role → Zod → rate limit → intent regex → allowlisted service tools →
   grounded minimised context → provider → answer with sources. Injection, secret-seeking and
   cross-user phrasing get a fixed refusal.
5. **Recommendations** — thresholds attendance < 70, assessment < 60, assignment < 65; priority from
   weakness count and distance below threshold; resources filtered by course/topic/difficulty and
   capped 3/2/1 by priority. The AI study plan is an enhancement only.
6. **Dropout risk** — trends compare the last 21 days (attendance) or 30 days (assessments,
   assignments) against the previous window; a deterministic 0–100 score (**not** a probability);
   ≥70 CRITICAL, ≥50 HIGH, ≥30 MODERATE, else LOW; daily snapshots backfilled on read; advisory
   only — the system never suspends, blocks, grades or disciplines anyone.
7. **Parent portal** — invitation (SHA-256 token, single-use, 7 days) → activation → ACTIVE link →
   link-checked reads that reuse the student services unchanged. Payment internals and risk notes are
   excluded by construction.
8. **Hostel and transport** — partial uniques enforce one active bed and one active assignment;
   allocate/transfer/approve-move in transactions under row locks; hostel and transport fees are
   ordinary `fees` rows (`fee_type` prefix), so there is no second ledger; passes are generated with
   the assignment.
9. **Certificates** — row-locked state machine `PENDING→APPROVED→ISSUED→REVOKED` and
   `PENDING→REJECTED`; atomic issuance (number + verification code + row + request update); PDFs are
   **stateless**, regenerated deterministically from the row on every download (pdfkit + QR); the
   public verify endpoint returns only masked fields.
10. **Library** — catalogue → reserve → issue → borrow → renew → return → fine → fee ledger. One active
    loan per copy; reservations are FIFO by `requested_at`; issuing a copy somebody else is waiting
    for is refused; returns promote the longest waiter; overdue is derived, never stored; fines upsert
    once per loan (₹10/day, ₹500 cap) into `fees`; policy constants centralised in the service.
11. **Placements** — companies → drives → eligibility (attendance, assessment, department, semester,
    batch, backlogs) → application → shortlist → interview → offer, with atomic offers and analytics.
12. **Alumni** — verified directory → mentorship → events → engagement → recorded giving. Pledges
    (`PLEDGED`) are intentions, not payments; only `RECORDED` counts toward totals.
13. **Mess and canteen** — plans → enrollment → menu → usage → billing → fee ledger; catalogue →
    order with a price snapshot → billing → ledger. Re-running the sweep converges instead of
    duplicating.
14. **Transport telemetry** — ADMIN-only ingestion; DB CHECKs on coordinates; `MOVING`/`IDLE`/
    `OFFLINE` from the age of the latest point (15 minutes) and speed; progress clamped to the route,
    `null` when a sequence is missing (**never guessed**); "Demo tracking" badges everywhere.

---

## 15. Testing and verification

| Suite | Command | Result |
|---|---|---|
| API regression | `cd backend && npm run seed:test && npm run test:api` | **487 passed, 0 failed** |
| Registration/approval | `npm run test:registration` | **85 passed, 0 failed** |
| ML integration | `npm run test:ml` | **61 passed, 0 failed** |
| Feature parity | `npm run test:feature-parity` | parity OK — 6 students × 44 features |
| Python unit | `cd ml && python -m pytest` | **33 passed** |
| E2E auth | `cd frontend && npm run test:e2e:auth` | **55 passed, 0 failed** |
| E2E registration | `npm run test:e2e:registration` | **48 passed, 0 failed** |
| E2E phase 1 | `npm run test:e2e` | **26 passed** |
| E2E phases 2–15 | `npm run test:e2e:phase2` … `:phase15` | **48, 52, 43, 48, 57, 37, 29, 37, 27, 23, 141, 28, 22, 29 — all 0 failures** |
| **E2E total** | 17 suites | **750 assertions, 0 failures** |
| Shell probe | `npm run probe:shell` | **90 passed, 0 failed** |
| Static | `npm run typecheck && npm run build` (backend) · `npx tsc --noEmit && npm run lint && npm run build` (frontend) | clean |

### Conventions
- Phase E2E suites self-seed with `npm run seed:test` unless `E2E_SKIP_SEED=1`.
- Every browser suite uses `puppeteer-core` with the system Chrome executable.
- `npm run test:api` and `npm run test:ml` need the API running and mutate the database; re-seed
  afterwards for a clean demo state.
- `E2E_ML_EXPECTED_SOURCE=RULE_BASED npm run test:e2e:phase5` proves the degraded ML path.
- Probes write screenshots to `frontend/artifacts/` (git-ignored).

---

## 16. Limitations, gotchas and honest notes

**Product limitations**
- The ML model is trained on 6 synthetic students. Treat every prediction as a demonstration; the
  reported accuracy is measured on its own training data.
- No `AVERAGE` class exists in the model, so it can never produce one — a deliberate refusal rather
  than a fabricated band.
- Transport "live tracking" is staff-reported or simulated telemetry, **not GPS**; the UI labels it
  "Demo tracking" everywhere.
- Sessions live in `localStorage` (XSS-explainable). httpOnly cookies, refresh tokens, helmet, audit
  logging and global rate limiting are deferred hardening; only the AI route, certificate
  verification and the public auth endpoints are throttled.
- Payments are an internal ledger. No gateway, no refunds or reversals.
- Individual pages have not been redesigned: the shell and token layer changed how pages are painted,
  not how they are laid out.
- The generated stylesheets come from a prototype stored outside the repository (`PROTOTYPE_ROOT`,
  with a machine-local default path); until it is vendored in, the committed generated files are the
  source of truth.
- `docs/API.md` is **stale for Phase 12**: the placements module is fully implemented but not
  documented there.

**Operational gotchas**
- `npm run seed` is safe and idempotent; `npm run seed:test` is destructive and exists only for tests.
- Stale containers can block compose: `docker rm -f smartcampus-pg smartcampus-ml-service`.
- A stray `package-lock.json` outside `frontend/` makes Next.js infer the wrong workspace root
  (warning only; delete it or set `turbopack.root`).
- npm's allow-scripts policy blocks some postinstall scripts (esbuild); `tsx` and `next` work anyway.
- The auth rate limit is per IP per window; a shared IP running many suites can hit it — raise
  `AUTH_RATE_LIMIT_MAX` for local test runs.
- Student numbers are capped at 20 characters by the admin schemas; generated numbers must respect it.

**Honest verification notes**
- The API smoke count moved from 488 to 487 because two registration assertions were merged into the
  real register → approve → login journey; no assertion was deleted to make a test pass.
- One stale E2E expectation in `phase5` (it looked for `Confidence:` while the UI renders
  `Model confidence:`) was fixed in the **test**, not the product; the product behaviour was already
  correct.
- `requireRole` on the SUPER_ADMIN router was initially missing; the new registration suite caught it
  immediately (a normal ADMIN could list registrations) and it was fixed before completion.

---

## 17. Document map

| Document | What it covers |
|---|---|
| `README.md` | downloader quick start, run guide, troubleshooting, env vars, layout, tests |
| `soul.md` | this file — the complete single-reference document |
| `MODEL.md` | **the ML model in full**: model card, the 44 features, label derivation, training, what the reported metrics actually mean, serving contract, degradation matrix, parity testing, limitations, and answers to review questions |
| `docs/API.md` | endpoint reference including registration, Super Admin and account help |
| `docs/ARCHITECTURE.md` | request lifecycle, auth model, permission matrix, workflows, security baseline |
| `docs/ML_ARCHITECTURE.md` | 44-feature contract, Express→FastAPI flow, degradation modes, limitations |
| `docs/UI_DESIGN_SYSTEM.md` | tokens, shell classes, spacing, transitions, rules |
| `docs/FRONTEND_INTEGRATION_REPORT.md` | prototype integration and the global AppShell |
| `docs/RUNTIME_INTEGRATION_REPORT.md` | runtime wiring report |
| `docs/PHASE2_REPORT.md` … `docs/PHASE15_REPORT.md` | per-phase scope, decisions and assertion counts |
| `backend/.env.example`, `frontend/.env.example` | committed configuration templates (no secrets) |
| `frontend/AGENTS.md`, `frontend/CLAUDE.md` | Next.js 16 agent rules — this is *not* the Next.js you know; read `node_modules/next/dist/docs/` before writing Next code |