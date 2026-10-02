# SmartCampus AI — Complete Project Documentation

### A self-contained reference. Everything needed to understand, run, evaluate and defend this project is in this one file.

---

## Contents

**Part I — The project**
1. [Executive summary](#1-executive-summary)
2. [Problem, solution and impact](#2-problem-solution-and-impact)
3. [What has been built](#3-what-has-been-built)
4. [Technology stack](#4-technology-stack)
5. [Innovations](#5-innovations)

**Part II — The engineering**
6. [Architecture](#6-architecture)
7. [Repository layout](#7-repository-layout)
8. [Backend internals](#8-backend-internals)
9. [Frontend internals](#9-frontend-internals)
10. [Database](#10-database)
11. [The 44 mechanisms that make it work](#11-the-44-mechanisms-that-make-it-work)

**Part III — Accounts and access**
12. [Roles and permissions](#12-roles-and-permissions)
13. [Registration and approval](#13-registration-and-approval)
14. [Authentication and RBAC](#14-authentication-and-rbac)
15. [Account help and recovery](#15-account-help-and-recovery)

**Part IV — Interfaces**
16. [API reference](#16-api-reference)
17. [The ML model](#17-the-ml-model)

**Part V — Operations**
18. [How to run it](#18-how-to-run-it)
19. [Configuration](#19-configuration)
20. [Testing and verification](#20-testing-and-verification)
21. [Domain workflows](#21-domain-workflows)

**Part VI — Honesty**
22. [Limitations](#22-limitations)
23. [If asked in a review](#23-if-asked-in-a-review)
24. [Future scope](#24-future-scope)

---

# Part I — The project

## 1. Executive summary

SmartCampus AI is an AI-powered college and university management platform delivered as a **modular
monolith**: one frontend, one backend, one database, one Python service. There are no microservices,
no message queue and no ORM.

It covers the daily work of a campus across **six roles** — student, faculty, administrator,
super administrator, parent and alumni — in **15 delivery phases**, plus a registration and
approval system built on top of them.

| | |
|---|---|
| Phases delivered | **1 – 15** |
| Frontend routes | **44** (7 public + 37 authenticated) |
| Backend modules | **16** |
| SQL migrations | **18** |
| Database | 59 domain tables, 239 indexes, 61 triggers, 637 CHECK constraints |
| Source files | 148 frontend + 108 backend |
| API regression suite | **487 assertions** |
| Registration & approval suite | **85 assertions** |
| ML integration suite | **61 assertions** |
| Python unit tests | **33** |
| Browser end-to-end suites | **750 assertions** across 17 suites |
| Shell & accessibility probes | **90 assertions** |
| **Total automated assertions** | **1,566** |

Ports: **5432** PostgreSQL · **4000** API · **3000** web app · **8001** ML inference.

---

## 2. Problem, solution and impact

### The problem

College administration runs on disconnected systems. Attendance in one, fees in another, timetables
on a notice board, hostel and transport on paper registers. Three consequences repeat everywhere:

1. **Students find out too late.** A missed-attendance threshold or a fee deadline is discovered
   when it has already cost something.
2. **Staff re-key the same facts.** The same student record is typed into attendance sheets, fee
   registers, hostel forms and library cards.
3. **Nobody sees the whole student.** A pattern — falling attendance, slipping assessments,
   unsubmitted assignments — is visible in aggregate but never in one place, so it is never acted on
   early.

### The solution

One platform where a student's academic record is recorded once and every surface reads from it:

- **Faculty** mark attendance against the timetable; the record is immediately visible to the student.
- **Administrators** manage fees, timetables, hostel, transport, library, mess and placements, each
  with integrity rules enforced by the database rather than by convention.
- **Students** see attendance, dues, timetable, performance prediction, personalised learning
  recommendations and a risk self-assessment.
- **Parents** get a read-only view of their linked child's academics — invitation-only, never
  self-service.
- **An AI assistant** answers grounded questions about real campus data, restricted per role.
- **A risk engine** flags students whose attendance, assessments or assignments are declining and
  lets staff record interventions.
- **A machine-learning service** scores each student from a 44-feature academic vector, and degrades
  honestly when it is unavailable.

### The impact claim, stated carefully

The measurable claim is **not** better grades — that would need a study this project did not run.
The defensible claims are:

- **Single source of truth** for a student's academic record, eliminating re-keying across modules.
- **Early visibility**: attendance, assessment and assignment trends surface decline before a
  threshold is crossed.
- **Least-privilege by construction**: role checks are enforced server-side on every route, and
  cross-student access is structurally impossible rather than filtered.
- **Honest automation**: when the ML service or the AI provider is unavailable, the system says so
  and labels the degraded result, rather than silently presenting an estimate as a measurement.

---

## 3. What has been built

| Phase | Capability |
|---|---|
| 1 | Foundation: authentication, RBAC, PostgreSQL model, student API, dashboard |
| 2 | Attendance marking, fee register, payment recording |
| 3 | Timetable register with faculty/room/section conflict detection and archive-first delete |
| 4 | AI chat assistant grounded in live campus data, scoped per role |
| 5 | Performance prediction served by a trained Python model |
| 6 | Deterministic personalised learning recommendations |
| 7 | Dropout-risk indicators, trends and staff interventions |
| 8 | Parent portal: invitations, activation, read-only guardian access |
| 9 | Hostel and transport management |
| 10 | Digital certificates with QR verification and public validation |
| 11 | Library: catalogue, copies, circulation, reservations, renewals, fines |
| 12 | Placement cell: companies, drives, eligibility, applications, interviews, offers |
| 13 | Alumni: verified directory, mentorship, events, giving campaigns |
| 14 | Mess and canteen management with monthly billing into the fee ledger |
| 15 | Transport tracking readiness: staff-reported telemetry and route progress |
| — | One dark application shell and a generated design system for all six roles |
| — | Public registration with server-side verification codes and Super Admin approval |
| — | Administrative account help with single-use password reset links |

---

## 4. Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.3.7 (App Router, Turbopack), React 19.2.8, TypeScript strict, Tailwind CSS v4, shadcn/ui + radix-ui, lucide-react |
| Backend | Node.js 20.9+ (developed on 24), Express 5, TypeScript (`tsx` dev, `tsc` build), Zod 4 |
| Database | PostgreSQL 16 (`postgres:16-alpine`), raw SQL migrations, `pg` driver — no ORM |
| Authentication | JWT HS256 (issuer `smartcampus-ai`) + bcrypt, backend-enforced RBAC |
| AI | Provider abstraction — OpenAI `gpt-4o-mini` or a deterministic mock; allowlisted read-only tools; per-user rate limiting |
| Machine learning | Python 3.11, FastAPI, scikit-learn `RandomForestClassifier`, joblib |
| Testing | API smoke suite, Puppeteer E2E, pytest, feature-parity harness, shell/visual/accessibility probes |

---

## 5. Innovations

Five things in this project are worth singling out.

**1. Registrations cannot be self-activated.** Public registration always creates an *inactive*
account. For faculty and administrator roles the request must additionally carry a verification code
that is compared **on the server** and never sent to the browser. The role only becomes effective
after a super administrator approves it. There is no code path where a browser-supplied `role`
becomes a live permission.

**2. The ML layer degrades honestly instead of failing.** If the inference service is unreachable,
slow, misbehaving or reports a result inconsistent with itself, the API still returns `200` — with
`prediction_source: "RULE_BASED"`, a typed `fallback_reason`, and `is_model_prediction: false`. The
user interface renders a source badge. A degraded estimate is never presented as a model prediction.

**3. Integrity lives in the database, not in application code.** Beyond the obvious constraints:
trigger functions reject a parent link whose user is not a parent, an alumni profile whose user is
not an alumnus, a bed number beyond the room's capacity, and a transport stop that belongs to a
different route. Partial unique indexes enforce "one active bed per student", "one active loan per
copy", "one pending certificate request per type" across eight domains.

**4. A design system generated from a prototype, verified by the generator.** The stylesheets are
produced by codemods that re-anchor and rename rules, then **assert their own output** — exiting
non-zero if a document-level selector leaked, if a shell rule was altered, or if a prototype token
could shadow a design-system token. Fifteen already-verified modules became dark-themed without being
rewritten.

**5. Tests walk the real user journey.** Because registration now produces inactive accounts, the
API suite creates its throwaway students by *actually registering them, asserting the pending login
is blocked, having a super administrator approve, and then signing in* — the same path a real
student takes.

---

# Part II — The engineering

## 6. Architecture

```
Browser (Next.js 16, React 19)
   |  Authorization: Bearer <jwt>        one API client, one fetch hook
   v
Express API (port 4000) — modular monolith, one module per domain
   |  validate (Zod) -> requireAuth -> requireRole -> controller -> service -> SQL
   v
PostgreSQL 16 (port 5432)               migrations in database/migrations/*.sql

Express  ->  FastAPI ML service (port 8001)  ->  RandomForest
              the browser NEVER talks to the ML service
```

### Request lifecycle

```
HTTP request
  -> cors()                     allow-listed origins only, credentials disabled
  -> express.json()             100 KB body limit
  -> request timer              METHOD /path -> status (ms); never logs bodies
  -> routes/index.ts            mounted at /api
      -> middleware/validate()  Zod -> 400 VALIDATION_ERROR; replaces req.body with parsed data
      -> requireAuth()          verify HS256 + issuer, then RE-READ the user row from PostgreSQL
      -> requireRole(...)       403 FORBIDDEN (SUPER_ADMIN passes wherever ADMIN is accepted)
      -> controller             thin: read validated input, call service, shape response
      -> service                owns ALL SQL and domain logic
  -> errorHandler               ZodError / ApiError / PG error -> one envelope + status
```

### Rules that hold everywhere

- Controllers are thin; **services own all SQL and domain logic**.
- Every response passes through one envelope helper; every failure is a typed `ApiError`.
- The backend is the **authoritative** authorization layer. The frontend role guard is user experience
  only.
- Student data is scoped by `WHERE user_id = $1`. No endpoint trusts a client-supplied student id.
- The browser talks only to Express — never to the database, never to the ML service.
- One timetable system: attendance, the faculty week view and the student schedule read the same rows.
- Archive-first deletes; a hard delete is refused while dependent history exists.
- Validation happens on the server even when the client also validates.

### Module template

```
backend/src/modules/<name>/
  <name>.routes.ts      router + requireAuth/requireRole + validate wiring
  <name>.controller.ts  request/response only
  <name>.service.ts     SQL + domain logic
  <name>.schemas.ts     Zod schemas (optional)
  <name>.types.ts       DTO shapes (optional)
```

A module is registered once in `src/routes/index.ts`, gets a numbered migration, and gains frontend
types plus a `useApi<T>()` call. Most domain modules export **two** routers — a user-facing one and
an `/admin/...`-prefixed one — so one module owns a domain end to end (parent, hostel, transport,
certificates, library, placements, alumni, mess).

---

## 7. Repository layout

```
smartcampus-project/
|-- backend/                             Express API
|   |-- src/                             108 files
|   |   |-- app.ts                       createApp(): CORS, 100KB JSON, timer, /api, 404, errorHandler
|   |   |-- server.ts                    listen + SIGINT/SIGTERM graceful shutdown
|   |   |-- config/env.ts                7 required variables, fail-fast, typed env (ai{}, ml{})
|   |   |-- config/db.ts                 pg Pool + query / queryOne / withTransaction / pingDatabase
|   |   |-- middleware/                  authenticate.ts, validate.ts, errorHandler.ts
|   |   |-- routes/index.ts              route registry + /health
|   |   |-- scripts/                     migrate.ts, seed.ts, bootstrap.ts,
|   |   |                                bootstrap-super-admin.ts, seed-test.ts, reset-db.ts
|   |   |-- utils/                       ApiError.ts, response.ts, asyncHandler.ts, jwt.ts,
|   |   |                                password.ts, date.ts, roles.ts
|   |   |-- types/express.d.ts           augments Request with user
|   |   `-- modules/                     16 modules
|   |       auth/            routes, controller, service, schemas
|   |       super-admin/     routes, controller, service, schemas, types
|   |       students/        routes, controller, service, types
|   |       attendance/      routes, controller, service, schemas, types
|   |       fees/            routes, controller, service, schemas, types
|   |       timetable/       routes, controller, service, schemas, types
|   |       ai/              routes, controller, service, tools, provider, schemas, types
|   |       performance/     routes, controller, service, features, ml-client,
|   |       |                recommendations.{routes,ts}, risk.{routes,ts}, types
|   |       parent/          routes, controller, service, schemas, types
|   |       hostel/          routes, controller, service, schemas, types
|   |       transport/       routes, controller, service, schemas, types
|   |       certificates/    routes, controller, service, document, schemas, types
|   |       library/         routes, controller, service, schemas, types
|   |       placements/      routes, controller, service, schemas, types
|   |       alumni/          routes, controller, service, schemas, types
|   |       mess/            routes, controller, service, schemas, types
|   |-- tests/                         api.smoke.mjs (2,730 lines), ml-integration.mjs (327),
|   |                                  registration.flow.mjs (325), feature-parity.mjs (84)
|   |-- .env.example                   committed template, no secrets
|   `-- .env                           local, git-ignored
|-- frontend/                          Next.js app
|   |-- src/                           148 files
|   |   |-- app/                       42 page.tsx + layouts + globals.css
|   |   |   |-- page.tsx               role-based redirect
|   |   |   |-- login/ register/ forgot-password/ reset-password/
|   |   |   |   parent/activate/ verify/[verificationCode]/
|   |   |   `-- (app)/                 AuthGuard + AppShell, 37 guarded pages
|   |   |-- components/                23 folders, 89 files
|   |   |   |-- layout/ (6)            app-shell, nav-config, command-palette,
|   |   |   |                          page-container, stat-card, brand-mark
|   |   |   |-- auth/ (5)              guards, login-form, register-wizard,
|   |   |   |                          password-help-form, reset-password-form
|   |   |   |-- providers/ (1)         auth-provider.tsx
|   |   |   |-- super-admin/ (3)       registration-requests, password-assistance,
|   |   |   |                          user-management
|   |   |   |-- ui/ (15)               shadcn primitives including textarea
|   |   |   |-- states/ (3)            loading, error, empty
|   |   |   |-- command-center/ (5)    student dashboard design layer
|   |   |   `-- 17 domain folders      admin(12) risk(10) recommendations(6)
|   |   |                              alumni(5) mess(3) and others
|   |   |-- hooks/use-api.ts           data / loading / error / reload
|   |   |-- lib/                       api.ts, auth.ts, types.ts (133 types),
|   |   |                              format.ts, utils.ts
|   |   `-- styles/                    3 generated + 2 hand-written stylesheets
|   |-- e2e/                           17 Puppeteer suites (auth, registration, phase 1-15)
|   |-- scripts/                       2 codemods + 5 probes
|   `-- .env.example / .env.local
|-- ml/                                Python ML service
|   |-- inference/main.py              FastAPI: POST /predict, GET /health, GET /model/info
|   |-- training/                      feature_engineering.py, train.py
|   |-- models/                        performance_model.joblib (committed, ~170 KB)
|   |                                 + performance_model_metadata.json
|   |-- tests/                         pytest suite (33 tests) + _parity_dump.py
|   `-- Dockerfile                     python:3.11-slim, uvicorn on 8001, healthcheck
|-- database/migrations/               001_core_users ... 018_registration_approval_system (18)
|-- docs/                              API, ARCHITECTURE, ML_ARCHITECTURE, UI_DESIGN_SYSTEM,
|                                      integration reports, PHASE2-15 reports
|-- docker-compose.yml                 PostgreSQL 16 + ML service
|-- README.md                          downloader quick start
|-- MODEL.md                           the ML model in full
`-- soul.md                            this document
```

---

## 8. Backend internals

### Configuration (`config/env.ts`)

Loads `backend/.env` through dotenv. **Seven variables are required** — `DATABASE_URL`,
`JWT_SECRET`, `UNIVERSITY_EMAIL_DOMAIN`, `ADMIN_REGISTRATION_CODE`, `FACULTY_REGISTRATION_CODE`,
`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` — and a single fail-fast error lists everything missing
at boot, rather than failing at the first request. Optional numeric parsing for tuning values.
Exports a typed environment object with nested `ai` and `ml` blocks.

### Database access (`config/db.ts`)

A `pg` connection pool (max 10 connections, 30-second idle timeout, idle-error logging) plus four
helpers: `query<T>()` returning rows, `queryOne<T>()` returning a row or null,
`withTransaction(fn)` wrapping BEGIN/COMMIT/ROLLBACK with client release in `finally`, and
`pingDatabase()`.

`withTransaction` is the **only** way any module opens a transaction.

### Middleware

**`authenticate.ts`** — `requireAuth` extracts the bearer token, verifies it, then **re-reads the
user row from the database** so a role change, suspension or deletion takes effect immediately; a
non-active account is rejected as `401 ACCOUNT_DISABLED`. `requireRole(...roles)` returns
`403 FORBIDDEN` for a disallowed role, with super-administrator inheritance (see §12).

**`validate.ts`** — `validate(schema, "body" | "query" | "params")` runs `safeParse`, replaces
`req.body` with the parsed data so controllers can trust it, stores query results on
`req.validatedQuery`, and forwards a `ZodError`.

**`errorHandler.ts`** — the central mapper. `ZodError` → 400 `VALIDATION_ERROR`; `ApiError` passes
through with its own status and code; malformed JSON → 400 `INVALID_JSON`; oversized body → 413
`PAYLOAD_TOO_LARGE`; PostgreSQL `23505` → 409 `DUPLICATE_RESOURCE`, `23503` → 409
`REFERENCE_ERROR`, any `22*`/`23*` → 400 `DATABASE_CONSTRAINT_ERROR`; anything else → 500 with the
message masked in production. A not-found handler answers 404 with the method and path.

### Utilities

`ApiError.ts` (factories `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, each
optionally taking a code and details) · `response.ts` (`sendSuccess`, `sendError`, envelope types) ·
`asyncHandler.ts` (promise wrapper so rejections reach the error handler) · `jwt.ts` (`signToken`,
`verifyToken`, issuer validation) · `password.ts` (bcrypt hash and verify) · `date.ts`
(`WEEKDAYS`, `toDateString`, `currentWeekday`, `toLocalDateString`, `addDays`) · `roles.ts`
(`ROLES`, `Role`, `ACTIVE_ROLES`, `isActiveRole`).

### Scripts

`migrate.ts` applies every `.sql` file from the migrations directory in sorted order, records each in
`schema_migrations`, and wraps each file in its own transaction. `reset-db.ts` drops and recreates the
public schema and refuses to run without an explicit `--yes`. `seed.ts` and `bootstrap.ts` apply
migrations and create the single super administrator. `bootstrap-super-admin.ts` holds the reusable,
idempotent creation function — deliberately separate from the command-line entry so that importing it
never re-executes the script. `seed-test.ts` builds the deterministic fixture dataset used only by
automated tests.

### Application and server

`createApp()` disables `x-powered-by`, builds CORS from a comma-separated allow-list with
credentials off, applies a 100 KB JSON body limit, installs a request timer that never logs bodies,
mounts `/api`, then the not-found and error handlers. `server.ts` listens, logs the port and CORS
origin, and closes on `SIGINT`/`SIGTERM`.

### AI module

The assistant pipeline is: **1)** deterministic intent routing by regular expression — the language
model never chooses the intent; **2)** `retrieve(actor, route)` through an allowlist of read-only
tools that call the existing services, so data-scoping rules are re-applied automatically;
**3)** a system prompt with grounding rules, a per-role scope note and minimised context containing
no identifiers, tokens or credentials; **4)** provider completion; **5)** a response of
`{ answer, intent, sources, context, provider }`.

`ai.provider.ts` isolates the vendor SDK behind an `AiProvider` interface; `auto` resolves to the
real provider only when an API key exists, otherwise a deterministic mock is used. The mock honours
sentinel prompts that request a simulated failure or timeout, so provider-failure branches are
exercised in tests without a live key. `ai.tools.ts` dispatches per role with a refusal default and
scopes parent questions to their linked child, resolved server-side.

---

## 9. Frontend internals

### Route map — 44 routes

**Public (7):** `/` role-based redirect · `/login` · `/register` · `/forgot-password` ·
`/reset-password` · `/parent/activate` · `/verify/[verificationCode]`.

**Authenticated group (37).** The group contributes no URL segment; an `AuthGuard` and the
`AppShell` wrap it, and every page gates its content with a role guard.

| Area | Routes | Roles |
|---|---|---|
| Student | `/dashboard`, `/attendance`, `/fees`, `/timetable`, `/performance`, `/recommendations`, `/hostel`, `/transport`, `/certificates`, `/mess` | STUDENT |
| Shared | `/ai` | STUDENT, FACULTY, ADMIN, PARENT |
| Shared | `/library`, `/placements` | STUDENT, FACULTY |
| Shared | `/profile` | STUDENT, FACULTY, ADMIN, PARENT |
| Faculty | `/faculty`, `/faculty/timetable`, `/faculty/risk`, `/faculty/risk/[studentId]` | FACULTY |
| Admin | `/admin`, `/admin/timetable`, `/admin/risk`, `/admin/risk/[studentId]`, `/admin/parents`, `/admin/hostel`, `/admin/transport`, `/admin/library`, `/admin/certificates`, `/admin/mess`, `/admin/placements`, `/admin/alumni` | ADMIN |
| Parent | `/parent` | PARENT |
| Alumni | `/alumni`, `/alumni/profile`, `/alumni/mentorship`, `/alumni/events`, `/alumni/campaigns` | ALUMNI, and per route STUDENT/FACULTY |
| Super admin | `/super-admin` | SUPER_ADMIN |

### Session and guards

There is no server middleware; authentication is client-side. The auth provider exposes
`{ status, user, profile, sessionExpired, login, logout, refresh }`, reads the session from
`GET /auth/me`, listens for a `smartcampus:unauthorized` browser event, and re-validates on the
`pageshow` event so a back/forward-cache restore cannot resurrect a dead session. `AuthGuard` bounces
anonymous visitors to `/login`; `RoleGuard` redirects a wrong role to its own home and otherwise
renders a plain "no access" panel. Sign-out performs a hard navigation so the router cache cannot
restore the previous page.

### The shell

One dark shell serves all six roles: a grouped, role-aware sidebar; a sticky header; a command
palette on Ctrl/⌘+K driven by the *same* role-filtered navigation list; an account menu; and an
off-canvas mobile drawer that closes on route change and is removed from the tab order while closed.
Transient surfaces close when the path changes. Two dead controls from the visual prototype — a
search button and a notification bell — were deliberately dropped.

### The generated design system

The stylesheets are produced by codemods from a visual prototype rather than hand-copied, and each
generator verifies its own output and exits non-zero on a leak.

| File | Size | Origin |
|---|---|---|
| `command-center.css` | ~39.7 KB | generated — prototype rules re-anchored under the dashboard surface |
| `app-shell.css` | ~15.5 KB | generated — shell rules only, palette re-declared on the shell |
| `theme-dark.css` | ~5.6 KB | generated — semantic tokens re-pointed at the dark palette, plus a remap of raw shades actually used in source |
| `command-center-overrides.css` | ~4.8 KB | hand-written, survives regeneration |
| `app-shell-overrides.css` | ~10.8 KB | hand-written, survives regeneration |

Import order inside the global stylesheet: Tailwind, animation utilities, the design-system theme,
the generated dark theme, the generated command-center sheet, its overrides, the generated shell
sheet, its overrides. The root layout imports only the global stylesheet.

This is how fifteen already-verified modules became dark-themed without being rewritten: the
semantic tokens were re-pointed, and the roughly two hundred raw colour utilities used directly by
page components were remapped by role rather than hand-edited across forty files.

### Data layer

`lib/api.ts` is the only place the browser calls `fetch`. It attaches the bearer token, sends
`cache: "no-store"`, supports an abort timeout, unwraps the response envelope and returns the payload
— or throws a typed error carrying status, code, message and details. On a 401 with a token in hand
it clears the token and broadcasts an unauthorized event.

`hooks/use-api.ts` gives every page `{ data, loading, error, reload }` and accepts a null path to skip
the request while authentication resolves. `lib/types.ts` holds 133 exported types covering every API
shape. `lib/format.ts` centralises currency formatting, dates and times, status tone maps, the role
home route and transport status wording.

### Registration experience

A single wizard: choose a role (student, teacher, administrator) → credentials with a live password
checklist, show/hide and confirmation → a verification step **for faculty and administrators only** →
personal details mapped to the real schema columns → a review step → submit → a pending confirmation
linking back to `/login`. It has a progress indicator, back/next controls and per-field errors. The
verification codes never appear in the browser bundle; the step only asks for one, and the server
decides.

---

## 10. Database

PostgreSQL 16. Raw SQL migrations applied in filename order, each file in its own transaction, tracked
in a `schema_migrations` table. Historical migrations are never edited.

**59 domain tables** · **239 indexes** · **61 triggers** · **637 CHECK constraints** · extension
`pgcrypto` · money stored as `NUMERIC(12,2)`.

| # | Migration | Contents |
|---|---|---|
| 001 | `core_users` | `users`, the shared `set_updated_at()` trigger, two sequences |
| 002 | `academics` | `students`, `faculties`, `courses`, `enrollments` |
| 003 | `student_records` | `attendance`, `fees`, `timetable_entries` |
| 004 | `phase2_operations` | `fee_payments` |
| 005 | `phase3_timetable` | alters `timetable_entries` (active flag, archive timestamp, register indexes) |
| 006 | `phase5_performance` | `assessments`, `assignments` |
| 007 | `phase6_recommendations` | `learning_resources` |
| 008 | `phase7_risk_interventions` | `risk_snapshots`, `interventions` |
| 009 | `phase7_risk_fix` | idempotent repair of the snapshot timestamp |
| 010 | `phase8_parent_portal` | `parent_student_links`, `parent_invitations` |
| 011 | `phase9_hostel_transport` | 6 hostel tables, 7 transport tables, 2 invariant triggers, partial unique indexes |
| 012 | `phase10_certificates` | `certificate_requests`, `certificates` |
| 013 | `phase11_library` | `books` (full-text index), `book_copies`, `library_loans`, `library_reservations` |
| 014 | `phase12_placements` | `companies`, `placement_drives`, `placement_applications`, `placement_interviews`, `placement_offers` |
| 015 | `phase13_alumni` | 6 alumni tables; adds the alumnus role to the user role constraint |
| 016 | `phase14_mess_canteen` | 8 mess and canteen tables + period fee partial unique indexes |
| 017 | `phase15_transport_telemetry` | `transport_vehicle_telemetry`, `transport_route_progress` |
| 018 | `registration_approval_system` | alters `users` (+status, +phone), `registrations`, `password_help_requests`, `password_reset_tokens` |

### Table reference

**Core** — `users(id, name, email UNIQUE, password_hash, role CHECK over six values, status,
phone, created_at, updated_at)` · `students(id, user_id UNIQUE FK CASCADE, student_no UNIQUE,
department, semester 1–12, section, batch_year, admission_on)` · `faculties(id, user_id UNIQUE FK,
employee_no UNIQUE, department, designation)` · `courses(id, code UNIQUE, name, credits 1–6,
department, semester, faculty_id FK SET NULL)` · `enrollments(student_id, course_id, enrolled_on,
status ACTIVE|DROPPED|COMPLETED, UNIQUE(student, course))`.

**Records** — `attendance(student_id, course_id, date, status PRESENT|ABSENT|LATE|LEAVE,
recorded_by FK faculties, UNIQUE(student, course, date))`. Deliberately **no** foreign key to
`timetable_entries`, so archiving a class can never orphan history. `fees(student_id, fee_type,
amount, amount_paid, due_date, status PENDING|PARTIAL|PAID, CHECK amount_paid <= amount,
library_loan_id)` · `fee_payments(fee_id CASCADE, amount > 0, payment_method
CASH|BANK_TRANSFER|UPI|CARD, reference <= 100, recorded_by FK users SET NULL)` ·
`timetable_entries(course_id, faculty_id?, room, day_of_week, start_time, end_time CHECK end > start,
section, semester, department, is_active, archived_at, UNIQUE(course, day, start, section))`.

**Performance and risk** — `assessments(student_id, course_id, assessment_type
QUIZ|MIDTERM|FINAL|PROJECT|LAB|ASSIGNMENT, marks_obtained, max_marks CHECK marks <= max,
assessed_on)` · `assignments(student_id, course_id, title, submitted, score, max_score, due_date,
submitted_on)` · `learning_resources(course_id, title, description, resource_type
VIDEO|NOTES|PRACTICE|ARTICLE|REMEDIAL, topic, difficulty, url, active)` · `risk_snapshots(student_id,
calculated_on UNIQUE, risk_level, risk_score 0–100, current/previous/change for attendance,
assessment and assignment, signals JSONB)` · `interventions(student_id, created_by RESTRICT,
risk_level_at_creation, intervention_type over 7 values, notes, status
OPEN|IN_PROGRESS|COMPLETED|DISMISSED, follow_up_date)`.

**Parent** — `parent_student_links(parent_user_id, student_id, relationship_type, status
ACTIVE|REVOKED, UNIQUE pair)` with a role-enforcing trigger · `parent_invitations(student_id,
parent_email, relationship_type, token_hash UNIQUE, status
PENDING|ACCEPTED|REVOKED|EXPIRED, expires_at, used_at, created_by)`.

**Hostel** — `hostels` · `hostel_rooms(UNIQUE hostel+room_number, capacity 1–4, status)` ·
`hostel_allocations(bed_number, status, two partial unique indexes, capacity trigger)` ·
`hostel_complaints(category, description, status, priority, resolved_at)` ·
`hostel_room_change_requests(reason, status, reviewed_by)` · `hostel_visitors(visitor_name,
relation, visit_date, visit_time, status)`.

**Transport** — `transport_drivers(license_no UNIQUE)` · `transport_vehicles(registration_number
UNIQUE, vehicle_type, capacity 1–80, status, driver_id?)` · `transport_routes(route_code UNIQUE)` ·
`transport_route_stops(route_id, sequence >= 1, scheduled_time, UNIQUE route+sequence)` ·
`transport_assignments(stop_id RESTRICT, vehicle_id?, status, active partial unique, stop/route
trigger)` · `transport_passes(pass_number UNIQUE, validity window CHECK, status)` ·
`transport_alerts(title, severity, active, created_by)` ·
`transport_vehicle_telemetry(vehicle_id, paired/range-checked coordinates, speed, heading,
stop_sequence, recorded_at, source MANUAL|SIMULATED|DEVICE)` · `transport_route_progress(vehicle_id,
route_id, current/next stop, progress_pct 0–100, tracking_status MOVING|IDLE|OFFLINE, recorded_at)`.

**Certificates** — `certificate_requests(certificate_type BONAFIDE|TRANSCRIPT|CONDUCT|ENROLLMENT,
status over 5 values, purpose, rejection_reason, reviewed/issued audit columns, pending partial
unique)` · `certificates(request_id UNIQUE, student_id, certificate_number UNIQUE,
verification_code UNIQUE, status ISSUED|REVOKED, issued_at, revoked_at)`.

**Library** — `books(isbn UNIQUE, full-text title index)` · `book_copies(accession_number UNIQUE,
status over 6 values)` · `library_loans(copy_id RESTRICT, due_at, returned_at, renewed_count,
status, issued_by/returned_by, active partial unique)` · `library_reservations(status over 5 values,
requested_at, partial unique while waiting or ready)`.

**Placements** — `companies(company_type over 7 values)` · `placement_drives(package range CHECK,
employment type, work mode, openings, deadline, drive date, eligibility thresholds, eligible
department and semester arrays, status over 5 values)` · `placement_applications(status over 7
values, live partial unique)` · `placement_interviews(round, scheduled_at, status over 4 values)` ·
`placement_offers(package_amount > 0, offer_status over 4 values, live partial unique)`.

**Alumni** — `alumni_profiles(user_id UNIQUE FK, student_id?, graduation_year, employment fields,
bio, links, mentorship preferences, visibility, verification, status, role trigger)` ·
`alumni_mentorships(topic, message, status over 5 values, live partial unique)` ·
`alumni_events(type over 8 values, time CHECK, capacity, audience, status over 5 values)` ·
`alumni_event_registrations(UNIQUE event+user)` · `alumni_campaigns(target_amount, status, date
CHECK)` · `alumni_contributions(amount > 0, status PLEDGED|RECORDED|CANCELLED)`.

**Mess and canteen** — `mess_plans(billing_type, price, meals_per_day)` ·
`mess_enrollments(status over 4 values, auto_renew, active partial unique)` ·
`mess_menu(meal_type, UNIQUE date+type)` · `meal_attendance(UNIQUE student+date+meal)` ·
`canteen_items(category, price, available)` · `canteen_orders(status over 5 values, total_amount,
fee_id?)` · `canteen_order_items(quantity, unit price snapshot, total)` ·
`mess_feedback(rating 1–5, comment)`.

**Registration and account help (018)** — `registrations(user_id UNIQUE FK, requested_role
STUDENT|FACULTY|ADMIN, status REGISTRATION_STARTED|PENDING_APPROVAL|APPROVED|REJECTED, submission
JSONB, rejection_reason, reviewed_by, reviewed_at)` · `password_help_requests(user_id? FK SET NULL,
email, requester_role?, contact?, message, status OPEN|IN_PROGRESS|RESOLVED|REJECTED, admin_notes,
handled_by?, handled_at?)` · `password_reset_tokens(user_id FK, request_id?, token_hash UNIQUE,
expires_at, used_at?, created_by?)`.

---

## 11. The 44 mechanisms that make it work

The non-obvious engineering decisions, each verified against the source.

### Concurrency and integrity

1. **Timetable writes are serialised by an advisory lock.** Every timetable write path opens a
   transaction and first takes a transaction-scoped advisory lock, so two concurrent overlapping-room
   inserts cannot both pass the conflict scan. This closes a real check-then-act window that unique
   indexes alone would miss.
2. **Edited rows are pinned.** After the advisory lock, a `SELECT ... FOR UPDATE` fixes the row
   version the conflict check reads.
3. **One shared timestamp trigger, installed by a loop.** Migrations do not hand-write trigger DDL; a
   `FOREACH` loop installs the shared function on every table that has an update timestamp.
4. **Invariants the database itself defends.** Trigger functions reject a parent link whose user is
   not a parent; an alumnus profile whose user is not an alumnus; a bed number beyond the room's
   capacity and an already-full room (with self-exclusion on update); and a transport stop belonging
   to a different route — a cross-table rule no foreign key can express.
5. **Partial unique indexes encode "one live X"** across hostel, transport, certificates, library,
   placements, alumni and mess. History rows stay unlimited because the predicate covers only the
   live state.
6. **Money cannot be overdrawn twice.** Payment recording locks with a table-scoped `FOR UPDATE` on
   the joined relation; the overpayment check is then authoritative, and the same rule also exists as
   a CHECK constraint.
7. **Single-use tokens are claimed atomically.** A password reset updates the token row only while it
   is unused and aborts the transaction when no row matched, so a concurrent replay loses the race.
   Parent invitations use the same pattern with an explicit row lock.
8. **PostgreSQL error codes become typed API errors centrally**, so a unique-constraint race surfaces
   as a typed 409 rather than a 500.
9. **One transaction primitive** for the whole codebase.

### Authorization

10. **`requireAuth` re-reads the user row on every request.** The token is never the source of truth.
11. **Super administrator inheritance is one expression**, giving the highest role every administrative
    surface without editing fifteen route registrations — while super-admin-only routers stay
    exclusive.
12. **The user interface applies the same rule** so the frontend can never disagree with the API.
13. **Student endpoints take no identifier at all**, so cross-student access is structurally
    impossible rather than filtered.
14. **404 instead of 403 when existence would leak**, with the reasoning written in the code;
    certificates fold ownership into the SQL so wrong-owner and missing-id are indistinguishable.
15. **Faculty reach students by teaching assignment, not by role** — the faculty's active course set
    is intersected with the student's enrolments.
16. **The AI tool layer dispatches on the actor's role with a refusal default**, and resolves a
    parent's child server-side.

### Resilience and degradation

17. **The ML client never throws.** Every failure resolves to a typed reason; the endpoint still
    answers 200 with a rule-based estimate, a typed reason, and an explicit "this is not a model
    prediction" flag.
18. **A failed ML response body is never read**, so stack traces and filesystem paths cannot leak.
    Two semantic guards beyond schema validation also degrade: a model reporting itself as not
    loaded, and a probability vector that does not contain its own reported category.
19. **AI failures use different statuses than ML failures** — timeout versus unavailable.
20. **The mock AI provider can be told to fail**, so provider-failure branches are tested without an
    API key.
21. **The health endpoint answers 503 when the database is unreachable** while keeping the same
    envelope shape.
22. **Risk snapshots heal themselves on read** — only the students missing today's row are computed,
    in parallel, and per-student failures do not break the page. List queries avoid N+1 with a
    lateral join.
23. **Billing sweeps are convergent, not additive** — re-running never double-charges.
24. **Attendance submission is idempotent**, and a re-submission never erases the original recorder.

### Frontend generation and design

25. **One prototype stylesheet generates two host stylesheets.**
26. **Selector rewriting is order-sensitive** so a universal rule cannot swallow a descendant form.
27. **A brace-depth scanner, not a regular expression, splits the stylesheet**, because a regex cannot
    distinguish a declaration block from a nested rule.
28. **Prototype tokens are renamed** so they cannot shadow design-system tokens, which would otherwise
    turn a subtle hover into full-strength colour; the radius namespace is excluded as Tailwind's own.
29. **The generators self-verify and exit non-zero on a leak.**
30. **The dark theme is generated by scanning the source** for the colour utilities actually used, then
    remapping them. The remapping is prefix-driven rather than shade-driven so solid brand blocks keep
    their contrast; neutral families get a chroma floor to stay in the intended hue family; and the
    genuinely ambiguous shades are declared explicitly — the script **throws** on a new one rather
    than guessing.
31. **Navigation is generated from the real route guards**, so the sidebar can never offer a link that
    bounces. The active entry is chosen by longest match, because one route is a prefix of another.
32. **One API client for the whole app.**
33. **The data hook resets state during render rather than in an effect**, so loading and error state
    change synchronously with the request identity instead of flashing stale state for a frame.
34. **Back/forward cache is handled explicitly**, hard-navigating when a restored session is dead,
    because a restored document's client router cannot reliably complete a client-side redirect.

### Determinism and correctness

35. **A seeded integer PRNG, not the language's random source**, with five independent named streams so
    adding fixtures in one area cannot shift generated values in another.
36. **Local-midnight date handling**, because the database driver parses date columns as local
    midnight and a UTC conversion would shift values back a day in positive offsets.
37. **Timezone-safe overdue arithmetic**, zeroing both timestamps before dividing.
38. **ML label ordering comes from the fitted artifact**, never from a hard-coded taxonomy — the
    training set contains no examples of one band, so the model has three classes and the service says
    so at boot.
39. **The feature-name array is the contract**; the builder iterates that array so the payload always
    has exactly the expected number of entries.
40. **Feature parity asserts order, not just membership**, with a tolerance that accounts for the two
    implementations performing the same arithmetic in a different order.
41. **Library fines are an upsert keyed on the loan**, so recalculating a fine updates one row and
    recomputes its status instead of duplicating.

### Test rig

42. **The API suite walks the real registration journey** to obtain a usable account — register,
    assert the pending login is blocked, have a super administrator approve, sign in — reading
    privileged credentials from the environment file rather than hard-coding them.
43. **ML degradation is tested for real**: a stub service on a random port plus a second backend
    process pointed at it, asserting each failure mode and that internals never leak.
44. **Model classes are read from the running service** rather than hard-coded, so assertions describe
    the deployed model.
45. **Feature parity is a two-sided harness** — the real Python extraction runs against the live
    database and the Node side diffs the SQL implementation against it.
46. **Probes assert invariants the end-to-end suites do not**: exactly one current navigation link per
    route, drawer focus moved in and returned on escape, focus unreachable inside a closed drawer, no
    horizontal overflow, reduced-motion behaviour (handling a browser quirk where collapsed durations
    are reported in exponent notation), light-container detection, clipped headings, and treating an
    error-state string as a failure even when the expected word is present.
47. **No browser download** — the suites drive the system Chrome already installed.

---

# Part III — Accounts and access

## 12. Roles and permissions

### The six roles

`STUDENT` · `FACULTY` · `ADMIN` · `PARENT` · `ALUMNI` · `SUPER_ADMIN`

The database's role constraint includes all six. A separate `ACTIVE_ROLES` list marks student,
faculty and administrator as the self-service roles; the other three are gated at the route level,
which is deliberate.

### How each account comes into existence

| Role | Route to existence |
|---|---|
| `SUPER_ADMIN` | Bootstrapped **once** from configuration — role and status set at creation |
| `STUDENT` | Public registration → pending approval → super-admin approval |
| `FACULTY` | Public registration + faculty verification code → approval |
| `ADMIN` | Public registration + administrator verification code → approval |
| `PARENT` | Administrator invitation → activation link |
| `ALUMNI` | Verified by an administrator before the alumni surfaces open |

There are **no demo accounts**. A freshly bootstrapped database contains exactly one account and zero
sample rows.

### Permission matrix

| Capability | STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| Own attendance, fees, timetable | yes | 403 | 403 | — | — | 403 |
| Mark attendance, manage classes | 403 | own classes | any | — | — | any |
| Fee register, record payments | 403 | 403 | yes | — | — | yes |
| Timetable register, all writes | 403 | read own | yes | — | — | yes |
| AI assistant | own data | own classes | institute | linked child | 403 | institute |
| Performance prediction | own | 403 | 403 | — | — | 403 |
| Recommendations | own | 403 | 403 | headlines | — | 403 |
| Risk dashboard | own analysis | assigned courses | full cohort | — | — | full cohort |
| Interventions | 403 | in-scope | yes | 403 | — | yes |
| Parent invitations and links | 403 | 403 | yes | — | — | yes |
| Read a linked child | 403 | 403 | 403 | active link | — | 403 |
| Hostel, transport, certificates, library, mess admin | self-service | library catalogue | all | read-only | — | all |
| Certificate actions | own | — | approve/issue/revoke | child's issued | — | approve/issue/revoke |
| Alumni surfaces | directory, events | directory, events | admin | 403 | self-service | admin |
| Placements | apply | browse | manage | — | — | manage |
| **Register an account** | own, pending | own + code | own + code | invitation | admin-verified | not publicly |
| **Approve or reject registrations** | 403 | 403 | 403 | — | — | **only** |
| **Password-help queue and reset links** | 403 | 403 | 403 | — | — | **only** |
| **Suspend or reactivate users** | 403 | 403 | 403 | — | — | **only** |

**How super-administrator inheritance works.** The role gate admits a super administrator wherever
administrator is accepted — a single conditional in one middleware and one in the user interface,
rather than fifteen route edits. A route gated for super administrators alone remains exclusive, so
a normal administrator is refused there.

### Cross-student access rules

- The ownership chain runs from the token subject to the student profile to the enrolment. Client
  student identifiers are ignored or re-derived.
- A user's id and a student profile's id are different things; profile tables reference the profile
  id, and services resolve it.
- **404 is returned instead of 403** wherever a 403 would confirm that a record exists.
- Faculty timetable filters are overwritten server-side with the caller's own faculty id.
- Parent reads re-check the active link row server-side; a forged identifier yields 404.
- The prediction path derives every feature from the authenticated student's own rows; no parameter
  lets one student request another's prediction.

---

## 13. Registration and approval

### The lifecycle

```
public registration (student | faculty | administrator only)
   |
   +-- one transaction:
   |     users(status = 'PENDING', phone)
   |     students or faculties profile row, from the submitted details
   |     registrations(status = 'PENDING_APPROVAL', submission JSONB)
   |
   +-- 201 { status: "PENDING_APPROVAL", message }
         NO TOKEN IS EVER ISSUED HERE

super admin approves -> users.status = 'ACTIVE', registrations.status = 'APPROVED', reviewer + timestamp
super admin rejects  -> users.status = 'REJECTED', registrations.status = 'REJECTED', reason stored
```

A `REGISTRATION_STARTED` value is also valid for resumable multi-step registrations; the current
single-submit wizard goes straight to `PENDING_APPROVAL`.

### Server-enforced rules

- **Only three roles are requestable.** Parent, alumnus and super administrator are rejected by the
  validation schema — in the browser *and* on the server.
- **University address required.** The address must end in the configured domain, otherwise
  `400 INVALID_EMAIL_DOMAIN`. Sign-in is deliberately *not* domain-restricted, because the super
  administrator may be on a different domain.
- **Password policy, validated on the server:** minimum 8 characters, at least one uppercase letter,
  at least one number, at least one special character, maximum 72 (the bcrypt limit), plus a matching
  confirmation. The interface shows the same rules as a live checklist.
- **Verification codes.** Faculty and administrator registrations must supply a code, compared on the
  server against the configured values. A wrong code stops registration **before any row is written**
  and answers `400 INVALID_REGISTRATION_CODE`. Codes are never sent to the browser, never stored, and
  never echoed in an error.
- **Duplicate addresses** are rejected with `409 EMAIL_TAKEN`, case-insensitively.
- **Profile rows use the real schema** rather than inventing columns: student number, department,
  semester, section and batch year for students; employee number, department and designation for
  faculty. Administrators have no profile table, so their professional details live in the
  registration submission.
- **No escalation is possible.** A role becomes effective only after the code check *and* an
  approval. The browser can send any role value it likes; the server decides what it means.
- **Never persisted in the submission:** the password, its confirmation, and the verification code.

### Sign-in behaviour

| Account state | Result |
|---|---|
| Active, correct password | Token issued, role-based redirect |
| Pending, correct password | **403** — *"Your registration is still pending approval."* |
| Rejected, correct password | **403** — *"Your registration was not approved. Please contact the administration."* |
| Suspended | **403** — disabled message |
| Wrong password or unknown address | **401** — one identical message, no enumeration |

The status check runs **after** the password verifies, so a wrong password never reveals that an
account exists or what state it is in. Because authentication re-reads the user row, a rejection or
suspension also invalidates any token already in circulation.

---

## 14. Authentication and RBAC

### Token model

Sign-in verifies the password with bcrypt, then issues a JSON web token carrying the subject, role
and e-mail. It is signed with HS256 under a secret from configuration, carries an issuer claim, and
expires after a configurable lifetime (one day by default). The browser stores it in local storage
and sends it as a bearer token.

Authentication **re-reads the user row on every request**, so role and status changes apply
immediately. On any 401 the API client clears the token and broadcasts an unauthorized event; the auth
provider flips to signed-out and records that the session expired, which is distinct from a
deliberate sign-out. Sign-out is stateless — the client discards the token.

*Known trade-off, stated plainly:* storing the token in local storage means a cross-site scripting
vulnerability could read it. httpOnly cookies are a known hardening step that was deliberately
deferred because it requires cookie-credential CORS work.

### Middleware order

`CORS → JSON body limit → request timer → Zod validation → authentication → role gate → controller
→ service → error handler`

### Security baseline

Implemented: bcrypt hashing; token expiry and issuer validation; secrets only in the git-ignored
environment file; a role gate on every route; ownership checks that prevent cross-student access;
server-side input validation on every write; parameterised SQL everywhere; row locks around money
writes; multi-table transactions with advisory locks where needed; a CORS allow-list; the framework
header disabled; a body size limit; no password or hash fields in any response; and a generic error
message in production.

Deferred: httpOnly cookie sessions, refresh tokens, a global audit log, security headers, and a
payment gateway.

---

## 15. Account help and recovery

Recovery is administrative rather than an automated e-mail flow — deliberately, because a real
deployment would add a mail provider without changing the model.

1. The user submits a request at `/forgot-password` with their address, optionally their account type,
   the reason, and contact details. This creates a persisted **open** request. The response is
   identical for unknown addresses, so it cannot be used to enumerate accounts. **No password is ever
   requested or stored.**
2. A super administrator works the queue: open a request, mark it in progress, resolve it, reject it,
   and add internal notes.
3. To actually restore access, the administrator **issues a single-use reset link**. The backend mints
   a 32-byte random token, stores **only its SHA-256 hash** with a 24-hour expiry, returns the link
   exactly once, and marks the request in progress.
4. The user opens the link and sets a new password. The backend claims the token atomically and
   replaces the password hash, so the previous password stops working immediately. Replaying the link
   fails, an expired link fails, and an unknown link fails — each with a distinct typed error.
5. **Passwords and hashes are never displayed to anyone**, administrators included. The interface says
   so explicitly where an administrator would otherwise expect to see one.

---

# Part IV — Interfaces

## 16. API reference

**Base URL** `http://localhost:4000/api` · **Authentication** `Authorization: Bearer <jwt>`

### Response envelope

```jsonc
// success (creates return 201)
{ "success": true,  "data": <payload>, "message": "OK" }

// failure
{ "success": false, "error": { "code": "SNAKE_CASE", "message": "...", "details": [...] } }
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | schema validation failed; details list the field issues |
| `INVALID_EMAIL_DOMAIN` | 400 | registration address is not a university address |
| `INVALID_REGISTRATION_CODE` | 400 | wrong faculty or administrator verification code |
| `FUTURE_DATE`, `DUPLICATE_STUDENT`, `STUDENT_NOT_IN_CLASS`, `EMPTY_ROSTER` | 400 | attendance rules |
| `INVALID_AMOUNT`, `OVERPAYMENT` | 400 | fee payment rules; outstanding balance in details |
| `INVALID_TRANSITION` | 400 | illegal state machine move |
| `INVALID_RESET_TOKEN`, `TOKEN_ALREADY_USED`, `TOKEN_EXPIRED` | 400 | password reset |
| `REGISTRATION_PENDING`, `REGISTRATION_REJECTED`, `ACCOUNT_SUSPENDED` | 403 | sign-in blocked by account state |
| `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED` | 401 | authentication |
| `FORBIDDEN` | 403 | role not permitted |
| `NOT_FOUND` | 404 | unknown route or record; also used instead of 403 to avoid leaking existence |
| `EMAIL_TAKEN`, `DUPLICATE_RESOURCE`, `TIMETABLE_CONFLICT`, `DEPENDENCY_CONFLICT`, `INVITATION_EXISTS`, `ALLOCATION_CONFLICT`, `RESERVATION_CONFLICT`, `EVENT_FULL`, `NO_USER_LINKED` | 409 | conflicts |
| `PAYLOAD_TOO_LARGE` | 413 | body over the limit |
| `RATE_LIMITED` | 429 | assistant quota, certificate verification, or public auth endpoints |
| `AI_UNAVAILABLE` / `AI_TIMEOUT` | 503 / 504 | AI provider failed or timed out |
| `INTERNAL_SERVER_ERROR` | 500 | generic in production |

### Pagination and filtering

Attendance history: `limit` 1–100, default 20, newest first. Fee register: text search and a status
filter, capped at 500 rows, open balances first. Timetable: filters for day, faculty, course, section,
room and status, returning entries with a total. Risk list: up to 200 rows, filters for level, section
and course, sorted most severe first. Library catalogue: paginated to at most 100 per page with text,
category, author and availability filters. Plus day, date, scope, inline-view and permanent-delete
query parameters, and status/role/search/paging parameters on the super-administrator lists.

### Endpoint inventory

**Health (1)** — liveness with database status; answers 503 when the database is unreachable.

**Auth (6)** — registration, sign-in, account help and password reset are public and rate-limited;
session and sign-out require a token.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | request a student, faculty or administrator account → 201 pending, **no token**; faculty and administrator also send a `code` |
| POST | `/auth/login` | public | issue a token; 403 for pending, rejected or suspended accounts |
| GET | `/auth/me` | any | current user plus a role-shaped profile (null for administrator roles) |
| POST | `/auth/logout` | any | stateless acknowledgement |
| POST | `/auth/password-help` | public | file an account-help request |
| POST | `/auth/reset-password` | public | consume a single-use token and set a new password |

**Students (5, student only)** — profile, attendance summary, fees summary, attendance history,
timetable for a day.

**Attendance (3, own classes for faculty / any for administrator)** — list classes, fetch a roster
with existing statuses for a date, submit a batch (transactional and idempotent).

**Fees (3)** — register (administrator), record a payment (administrator, row-locked with an
overpayment guard), payment history (administrator, or a student for their own records; others 404).

**Timetable (6)** — list with filters, form options, single entry, create with conflict detection,
update, and delete (archive by default).

**AI (1)** — ask a question; returns an answer with its intent, the sources used, the retrieved
context and the provider that answered.

**Performance (2, student only)** — prediction with source and fallback reason; and the aggregate
features behind it.

**Recommendations (2, student only)** — deterministic recommendations; and an optional study plan that
degrades to a null plan with a fallback flag.

**Risk (10)** — a student's own analysis and intervention plan; and, for faculty and administrators,
the cohort list with filters, statistics, per-student detail, trends, and intervention create, read and
update.

**Parent (13)** — public activation; a parent's link-checked reads of a linked child's overview,
attendance, fees, timetable, recommendation headlines, notices, hostel, transport, certificates,
library and mess; and administrator management of parent accounts, invitations and links.

**Hostel (24)** — student self-service reads and request creation; administrator management of
hostels, rooms, allocations (with vacate and transfer), complaints, room-change review and visitors.

**Transport (20 plus telemetry)** — student status; administrator management of vehicles, drivers,
routes, stops, assignments, passes and alerts; telemetry ingestion and simulation for tracking; and
parent visibility.

**Certificates (13)** — student requests, tracking and download; public verification by code;
administrator review, approval, rejection, issuance and revocation; parent read-only view.

**Library (21)** — catalogue search and detail, loans, reservations and fines for users; catalogue and
copy administration, issuing, returns, reservation queue and fines for administrators; parent
summary.

**Placements** — companies, drives, eligibility, application lifecycle, shortlist to interview to
offer pipeline, and analytics, under both a user router and an administrator router.

**Alumni (28)** — a verified directory, profiles, mentorship requests and responses, events with
registration, giving campaigns and contributions; plus administrator management of all of these and
aggregate analytics.

**Mess and canteen (29)** — student plans, enrolment, menu, meal usage, billing, catalogue, orders and
feedback; administrator menu, meal records, item catalogue, order advancement, the billing sweep and
feedback analytics; parent summary.

**Super administrator (9)** — registration list, detail, approve and reject; user list and status
change; password-help list, update and reset-link issuance. Gated on authentication plus the
super-administrator role, so a normal administrator, faculty member or student receives 403.

---

## 17. The ML model

### Model card

| Field | Value |
|---|---|
| Type | `RandomForestClassifier` in a pipeline with a standard scaler |
| Version | v1 |
| Trained | 2026-09-30 |
| Artifact | `ml/models/performance_model.joblib` (≈166 KB, committed) |
| Artifact contents | pipeline, feature names, taxonomy, training timestamp, version |
| Hyper-parameters | 200 trees, max depth 10, balanced class weights, fixed random seed |
| Feature count | **44**, in a fixed order |
| Classes it can emit | **`AT_RISK`, `EXCELLENT`, `GOOD`** |
| Classes in the taxonomy | four, including `AVERAGE` — which is unreachable |
| Training rows | **6** |
| Class support | 3 excellent, 1 good, 0 average, 2 at risk |
| Data source | synthetic demo seed data |
| Serving | FastAPI + uvicorn on port 8001, containerised |

### What it predicts, and what it refuses to predict

The model returns a performance band with a confidence and a full class-probability vector. The
`AVERAGE` band exists in the taxonomy but has **zero training examples**, so the fitted model has
three classes and can never emit it. This is reported rather than hidden:

- at boot the service logs which taxonomy bands it cannot predict;
- label ordering is read from the fitted artifact's `classes_`, never from the constant taxonomy;
- the probability vector is keyed by the model's own classes, so a consumer can distinguish *"the
  model says zero"* from *"the model cannot say"*;
- a test asserts the average band is absent from the probabilities and that there are exactly three.

The service also deliberately **does not** access the database, authenticate anyone, know that a
student exists, or accept a category or confidence from the caller. Every number it returns comes from
the fitted pipeline.

### The 44 features

Six course codes are in the contract: **CS301, CS305, CS311, CS315, CS321, MA201**. Six assessment
types: **QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT**.

**Group A — 8 aggregate features.** Attendance percentage (attended divided by total × 100, where
attended means present or late; zero when there are no records) · total classes (count of *all*
attendance rows) · average assessment percentage (mean of marks over maximum × 100) · total
assessments · assignment submission rate · total assignments · average assignment score (**on a 0–10
scale**, submitted only) · academic score (the composite below).

**Group B — 6 per-course attendance features**, each that course's attended over total × 100; a course
with no records is `0.0`, never missing.

**Group C — 6 per-course assessment features**, mean percentage per course; `0.0` when absent.

**Group D — 12 per-course assignment features** — a submission rate and an average score for each of
the six courses.

**Group E — 12 per-assessment-type features** — an average and a count for each of the six types.

**Semantics worth stating.** A leave counts **against** attendance, because the denominator includes
every row. The average assignment score is out of ten, not a percentage — the single easiest thing to
misread. Null scores are ignored, matching the averaging library's behaviour. The whole history is
used, with no date window. Feature **order** is part of the contract: a renamed, reordered or dropped
column silently corrupts predictions, and the service rejects a missing feature outright rather than
zero-filling it.

### How the training labels are derived

This is the most important caveat, and it is a real limitation.

Labels are not human-assigned outcomes. They are produced by a **deterministic formula over the same
features the model receives**:

```
assignment component = (submission rate / 100) × (average assignment score × 10)

academic score = 0.30 × attendance percentage
              + 0.50 × average assessment percentage
              + 0.20 × assignment component                    (clamped to 0–100)

band = EXCELLENT if ≥ 85, GOOD if ≥ 70, AVERAGE if ≥ 55, otherwise AT_RISK
```

**Consequence:** the model is approximating a known arithmetic function of its own inputs. It cannot
discover a relationship the formula does not already encode. With six rows and a formula-derived
target, the reported scores measure almost nothing. The 30/50/20 weights are a design choice, not a
learned parameter — and they are mirrored in the backend so the rule-based fallback estimates a
student exactly as the model was trained to.

### Training

Load from PostgreSQL; compute features and labels; drop identifier columns; fill any nulls; fit a
pipeline of a standard scaler plus the forest; evaluate; save the artifact and metadata.

The evaluation step has **two branches**. For small data it fits on the full dataset and reports
**training** metrics, recording the method as `full_dataset_training` and copying the training
accuracy into the cross-validation field. For normal data it does a stratified 80/20 split plus
five-fold cross-validation.

This model took the small-data branch, because the average class had zero examples and there were six
rows total. That single fact explains every number below.

### Reported metrics, and what they mean

| Metric | Value |
|---|---|
| accuracy, weighted precision/recall/F1 | 1.0 |
| "cross-validation" mean / std | 1.0 / 0.0 |
| macro average | 0.75 |
| per-class F1 | excellent 1.0 (3), good 1.0 (1), **average 0.0 (0)**, at risk 1.0 (2) |
| train size / test size | **6 / 6** |
| evaluation method | **`full_dataset_training`** |

**These are training-set scores on six rows.** There is no held-out test set — the same six students
were used for fitting and for scoring, so accuracy 1.0 means the forest memorised six examples, which
a 200-tree forest will always do. **The cross-validation field is not cross-validation** in this
branch; it is the training accuracy. **The macro average of 0.75 is the honest number in the file**,
dragged down entirely by the empty class that the weighted average hides. The metadata's student count
of twelve is a bookkeeping artefact — it adds train and test sizes, double-counting the same six rows.

### Feature importance

The top feature holds under 4% of total importance and the spread across 44 features runs from about
0.039 down to 0.006, with one feature at exactly zero. With six rows the trees barely differentiate
the inputs. These importances are noise at this sample size, are correlational at best, and are never
causal weights.

### The inference service

**`POST /predict`** takes a feature map. Order does not matter to the caller — the service reorders
using the artifact's own feature names. Unknown extra keys are ignored with a warning. **Missing keys
are a hard error** naming them, never a silent zero. Non-numeric, boolean, NaN and infinite values are
rejected. It returns the category, the confidence (the maximum class probability), the probability
vector, the model version, the ordered features used, whether a model was loaded, the feature count,
and both the prediction and training timestamps.

Status codes: 400 for a missing feature or a non-finite value; 422 when the body is not a valid
feature map; 500 for a pipeline failure, with the detail logged server-side and a generic message
returned; 503 when no model is loaded. **No error body ever contains a stack trace, a filesystem path
or model internals.**

**`GET /health`** reports status, whether a model is loaded, the version, the training timestamp, the
feature count and the class list. This is the endpoint the container health check polls and the one
the browser tests read their expected classes from. **`GET /model/info`** returns the full metadata
document including the metrics and the limitations list.

At startup the app loads the model; if that fails it still starts and answers 503 with a loud log
rather than refusing to boot, and the container health check makes the failure visible.

### Integration

```
Browser (student session) → GET /api/performance/predict
  → Express: authentication + student role; identity from the token only
  → resolve the profile, build the 44 features from that student's own rows
    (3 aggregate queries regardless of course count — no N+1)
  → POST to the inference service with an abort timeout
       valid → validated → prediction_source: ML
       otherwise → 200 with prediction_source: RULE_BASED and a typed reason
  → the dashboard card renders an explicit source badge
```

**Ownership split.** Express owns authentication, identity, record reading, feature engineering,
timeout and failure classification, and response validation. Python owns loading the artifact,
reordering features, predicting, and deciding the label order. The frontend owns rendering and stating
the source. **The browser never contacts port 8001**; the service URL is server-side configuration,
and the only public variable in the whole application is the API base URL.

### Degradation

The client **never throws**. It returns either a validated prediction or a typed reason.

| Reason | Trigger |
|---|---|
| `ML_DISABLED` | the service URL is blank — the deliberate "model off" switch |
| `ML_UNREACHABLE` | connection refused, DNS failure, or any other non-abort error |
| `ML_TIMEOUT` | no answer within the configured ceiling |
| `ML_BAD_STATUS` | any non-2xx — **the body is deliberately never read** |
| `ML_INVALID_RESPONSE` | unparseable body, schema mismatch, model reporting itself not loaded, confidence outside 0–1, or **a probability map missing its own reported category** |

On any of these the endpoint still answers **200**, with the rule-based estimate, the source marked as
rule-based, `is_model_prediction: false`, version `rule-based-v1`, and the typed reason. The fallback
confidence is a band distance and is never presented as model confidence. The interface always shows
which source produced the number, and the degraded path can be proved deliberately by running the
phase-5 browser suite with the expected source overridden to rule-based.

### A concrete weakness worth stating

Feeding the model a vector with **all 36 per-course features set to zero** — exactly what a real
student with no records produces — and varying only the headline figure:

| Input | Model says |
|---|---|
| 0% attendance, all detail zero | AT_RISK (0.79) |
| **90% attendance, all detail zero** | **AT_RISK (0.74)** |
| 0% attendance, all detail zero | AT_RISK (0.79) |

A student with 90% attendance and nothing else is confidently called at risk. The cause is structural:
the label formula weights attendance at 30% and assessments at 50%, so with assessments and
assignments at zero **no** attendance value can reach the "good" threshold of 70. The model learned the
formula perfectly, which means the 36 detailed features carry almost no independent signal — it has
roughly **8 effective inputs, not 44**. Fixing this requires reweighting the label formula and
retraining on a larger cohort, not tweaking hyper-parameters.

### Feature-parity testing

Two implementations of the same feature engineering exist — one in the backend serving predictions,
one in Python used for fitting. A silent divergence would poison every prediction, so parity is
asserted mechanically. A helper script runs the **real** Python extraction against the live database
and writes a reference file with sorted keys; the Node side then builds each student's vector through
the SQL path and compares the **exact order** of all 44 names, each value within a tight absolute and
relative tolerance, and the vector length itself. Current result: **6 students × 44 features, parity
OK.** A companion test posts the same vector twice and asserts identical output, catching silent
column reordering at the service boundary.

If the model is retrained with a different feature set, the feature-name contract must be updated in
the same change — otherwise the parity and contract tests fail loudly, by design.

---

# Part V — Operations

## 18. How to run it

### Prerequisites

Node.js 20.9 or newer with npm 10 or newer · Docker Desktop · Python 3.11 or newer, only for the ML
service and its tests.

### Step 1 — database

```bash
docker compose up -d
docker compose ps        # wait until the database reports healthy
```

### Step 2 — backend

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Fill in the seven required values. Generate a strong signing key with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then create the schema and the single starting account:

```bash
npm run seed              # migrations + the super administrator, idempotent
```

### Step 3 — frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
```

### Step 4 — ML service (optional but recommended)

```bash
docker compose up -d ml-service          # easiest, already built
# or locally:
cd ml
pip install -r requirements.txt -r inference/requirements.txt
cd inference && python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

Without it, predictions degrade to a rule-based estimate and the interface says so.

### Step 5 — run

Two terminals:

```bash
cd backend  && npm run dev      # http://localhost:4000
cd frontend && npm run dev      # http://localhost:3000
```

Open the web app and sign in with the super-administrator address and password you configured.

### Commands

**Backend:** `dev` · `build` · `start` · `typecheck` · `migrate` (apply pending migrations) ·
`seed` (bootstrap: migrate and create the super administrator, idempotent, no sample data) ·
`bootstrap` (the same under its own name) · `seed:test` (**destructive** fixtures for automated tests
only) · `db:reset -- --yes` (drop and re-migrate, refuses without the flag) · `test:api` ·
`test:registration` · `test:ml` · `test:feature-parity`.

**Frontend:** `dev` · `build` · `start` · `lint` · `build:styles` (regenerate the design layer) ·
`probe:shell` · `probe:visual` · `probe:a11y` · `test:e2e` · `test:e2e:auth` ·
`test:e2e:registration` · `test:e2e:phase2` … `test:e2e:phase15`.

### A clean database contains exactly one account

```
users=1  students=0  courses=0  registrations=0  password_help=0
<your configured super-admin address>  SUPER_ADMIN  ACTIVE
```

---

## 19. Configuration

Environment files are git-ignored; the `.example` templates are committed and carry no secrets.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | HS256 signing key, 64 or more random characters |
| `UNIVERSITY_EMAIL_DOMAIN` | yes | — | the only domain a public registration may use |
| `ADMIN_REGISTRATION_CODE` | yes | — | **secret** code an administrator registration must carry |
| `FACULTY_REGISTRATION_CODE` | yes | — | **secret** code a faculty registration must carry |
| `SUPER_ADMIN_EMAIL` | yes | — | address of the one super-administrator account |
| `SUPER_ADMIN_PASSWORD` | yes | — | **secret** its initial password, hashed on the way in |
| `JWT_EXPIRES_IN` | | `1d` | token lifetime |
| `FRONTEND_URL` | | `http://localhost:3000` | CORS origin; also builds reset links |
| `PORT` | | `4000` | API port |
| `BCRYPT_ROUNDS` | | `10` | bcrypt cost |
| `AUTH_RATE_LIMIT_MAX` | | `1000` | public auth requests per client per window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | | `900000` | that window, 15 minutes |
| `AI_PROVIDER` | | `auto` | `auto`, `mock` or `openai` |
| `OPENAI_API_KEY` | | — | enables the real provider; empty means the mock |
| `AI_MODEL` | | `gpt-4o-mini` | chat model |
| `AI_TIMEOUT_MS` / `AI_MAX_TOKENS` | | `12000` / `400` | provider timeout and answer cap |
| `AI_MAX_MESSAGE_LENGTH` | | `1000` | question length cap |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | | `30` / `60000` | per-user assistant quota |
| `ML_SERVICE_URL` | | `http://localhost:8001` | inference base URL — **server-side only** |
| `ML_TIMEOUT_MS` | | `5000` | backend-to-service ceiling before degradation |
| `MODEL_PATH` / `METADATA_PATH` | | set in compose | artifact locations inside the container |
| `NEXT_PUBLIC_API_URL` | | `http://localhost:4000` | the only public variable |
| `PROTOTYPE_ROOT` | | machine-local | where the visual prototype lives, for style regeneration |

---

## 20. Testing and verification

| Suite | How to run | Result |
|---|---|---|
| API regression | seed the fixtures, then `npm run test:api` | **487 passed, 0 failed** |
| Registration and approval | `npm run test:registration` | **85 passed, 0 failed** |
| ML integration | `npm run test:ml` | **61 passed, 0 failed** |
| Feature parity | `npm run test:feature-parity` | parity OK, 6 students × 44 features |
| Python unit tests | `cd ml && python -m pytest` | **33 passed** |
| Browser: authentication | `npm run test:e2e:auth` | **55 passed, 0 failed** |
| Browser: registration journeys | `npm run test:e2e:registration` | **48 passed, 0 failed** |
| Browser: phase 1 | `npm run test:e2e` | **26 passed** |
| Browser: phases 2–15 | `npm run test:e2e:phase2` … `:phase15` | **48, 52, 43, 48, 57, 37, 29, 37, 27, 23, 141, 28, 22, 29 — all 0 failures** |
| **Browser total** | 17 suites | **750 assertions, 0 failures** |
| Shell probe | `npm run probe:shell` | **90 passed, 0 failed** |
| Static analysis | backend typecheck and build; frontend typecheck, lint and build | clean |

**Conventions.** Phase suites re-seed with the fixture script unless told to skip. Every browser suite
drives the Chrome already installed on the machine. The API and ML suites need the server running and
mutate the database, so re-seed afterwards for a clean demonstration state. The degraded prediction
path can be proved deliberately by overriding the expected source. Probes write screenshots to a
git-ignored directory.

---

## 21. Domain workflows

1. **Attendance marking.** A faculty member picks a class, chooses a date, and the roster loads with
   any statuses already recorded. Marking happens locally as a draft; submitting sends the batch.
   The roster is recomputed from enrolments, unknown or duplicated students are rejected with the
   offending identifiers listed, the whole batch commits in one transaction, and re-submitting is a
   safe upsert that never erases the original recorder. Student summaries recompute on the next read.

2. **Fee payment.** An administrator opens a balance, the payment is recorded under a row lock, an
   overpayment is rejected and rolled back, an immutable payment row is written, and the fee's paid
   amount and status are recomputed. There is no payment gateway.

3. **Timetable conflict detection.** The write runs inside a transaction behind an advisory lock; the
   course, faculty and section are validated; semester and department are derived **from the course,
   never from the client**; faculty, room and section overlaps are scanned against active entries with
   the edited row excluded; a conflict returns 409 with the conflict types and rolls back. Delete
   archives by default, and a hard delete is refused while attendance history references the class.

4. **AI assistant.** Authentication, role gate, validation, rate limit, deterministic intent routing,
   allowlisted service tools, a grounded minimised context, then provider completion with sources.
   Injection attempts, secret-seeking and cross-user phrasing all receive a fixed refusal.

5. **Recommendations.** Thresholds of 70% attendance, 60% assessment and 65% assignment; priority from
   the number of weaknesses and how far below threshold each metric sits; resources filtered by
   course, topic and difficulty and capped by priority. The study plan is an optional enhancement, not
   a dependency.

6. **Dropout risk.** Trends compare the recent window against the previous one for each of attendance,
   assessment and assignment. A deterministic 0–100 score — explicitly **not** a probability — maps to
   four levels by threshold. Daily snapshots are backfilled on read. The engine is advisory: the system
   never suspends, blocks, grades or disciplines anyone.

7. **Parent portal.** An invitation with a hashed, single-use, expiring token is created by an
   administrator; the parent activates it and an active link is created; every subsequent read re-checks
   that link server-side and reuses the existing student services unchanged. Payment internals and risk
   notes are excluded by construction rather than filtered.

8. **Hostel and transport.** Partial unique indexes enforce one active bed and one active assignment;
   allocation, transfer and room-change approval run in transactions under row locks; hostel and
   transport charges are ordinary fee rows under a type prefix, so there is no second ledger; passes
   are generated in the same transaction as the assignment.

9. **Certificates.** A row-locked state machine with two legal paths; atomic issuance writing the
   number, the verification code, the certificate row and the request update together; **stateless**
   PDFs regenerated deterministically from the row on every download, with a QR pointing at the public
   verification page; and a public verification endpoint that returns only masked fields.

10. **Library.** Catalogue, reserve, issue, borrow, renew, return, fine, ledger. One active loan per
    copy; reservations are first-come-first-served by request time; issuing a copy somebody else is
    waiting for is refused; a return promotes the longest waiter; overdue is derived rather than
    stored; and the fine is upserted once per loan into the fee ledger. Policy constants — fine per
    day, cap, loan length, active-loan limit, renewal limit, reservation limit — are centralised in
    the service.

11. **Placements.** Companies, drives, eligibility across attendance, assessments, department,
    semester and batch, applications, shortlisting, interviews and offers, with atomic offers and
    analytics.

12. **Alumni.** A verified directory, mentorship requests with row-locked transitions, events with
    capacity and audience eligibility, and recorded giving. A pledge is an intention, not a payment;
    only recorded contributions count toward totals.

13. **Mess and canteen.** Plans, enrolment, menu, usage, billing and the fee ledger; and catalogue,
    order with a price snapshot, billing and the ledger. Re-running the monthly sweep converges instead
    of duplicating.

14. **Transport tracking.** Ingestion is administrator-only; the database range-checks coordinates;
    movement status derives from the age of the latest point and the reported speed; route progress is
    clamped to the route and is null when a sequence is missing — **never guessed**; and the interface
    labels the whole feature as demonstration tracking.

---

# Part VI — Honesty

## 22. Limitations

### About the machine-learning model

1. Trained on **six synthetic students**. No real university data was used.
2. Reported metrics are **training-set scores** — the evaluation method is recorded as
   `full_dataset_training` with train and test sizes both six. Accuracy 1.0 is memorisation.
3. The **cross-validation field is not cross-validation** in that branch; it is the training accuracy.
4. **No average band** — zero support, so it is unreachable, and the service says so at boot.
5. The **label is a deterministic function of the model's own inputs**, so it approximates a known
   formula and the 36 detailed features carry little independent signal (see §17).
6. **Class imbalance** 3/1/0/2, mitigated by balanced class weights, which re-weight the loss rather
   than creating examples.
7. **Feature importances are noise** at this sample size and correlational at best.
8. **Point-in-time only** — the whole history is used, with no time window and no drift handling.
9. **Not usable for any real academic decision** — no promotion, grading or disciplinary use. The same
   advice appears in the interface and in the artifact's own limitations list.

### About the platform

- Transport "live tracking" is staff-reported or simulated telemetry, **not GPS**, and is labelled as
  demonstration tracking everywhere.
- Sessions are stored in local storage, which is explainable by cross-site scripting. httpOnly
  cookies, refresh tokens, security headers, an audit log and global rate limiting are deferred; only
  the assistant route, certificate verification and the public auth endpoints are throttled.
- Payments are an internal ledger — no gateway, no refunds or reversals.
- Individual pages have not been redesigned: the shell and token layer changed how pages are painted,
  not how they are laid out.
- The generated stylesheets originate from a prototype stored outside the repository; until it is
  vendored in, the committed generated files are the source of truth.
- The endpoint reference in the `docs/` folder is **stale for placements** — the module is fully
  implemented and has the largest browser suite, but is not documented there.
- Not implemented, by choice: blockchain certificates, biometric attendance, e-mail or SMS automation,
  grade entry, bulk fee generation.

### Operational notes

- `npm run seed` is safe and idempotent; `npm run seed:test` is destructive and exists only for tests.
- Stale containers can block Compose: remove them and retry.
- A stray lock file outside the frontend directory makes Next.js infer the wrong workspace root —
  harmless, but deletable.
- The auth rate limit is per client per window, so many suites from one address can hit it; raise the
  configured maximum for local test runs.
- Student numbers are capped at 20 characters by the administrator schemas.

### Honest verification notes

- The API assertion count moved from 488 to 487 because two registration assertions were merged into
  the real register-approve-sign-in journey. **No assertion was deleted to make a test pass.**
- One stale browser expectation looked for a label the interface renders slightly differently; it was
  corrected **in the test**, not the product, because the product behaviour was already right.
- The super-administrator router was initially mounted without its role gate, which the new
  registration suite caught immediately — a normal administrator could list registrations — and it
  was fixed before completion. It is recorded here because a test suite that catches its own project's
  authorisation bug is worth knowing about.

---

## 23. If asked in a review

| Question | Answer that holds up |
|---|---|
| **How accurate is the model?** | It reports 100%, but that is training accuracy on six synthetic students — the metadata records `full_dataset_training` with train and test sizes both six. It demonstrates the integration, not a validated model. |
| **Why is there no average band?** | The training set had no average examples, so the fitted forest has three classes. Rather than fabricate a zero, the service reads the artifact's own classes and logs at boot which band it can never emit. |
| **What happens if the ML service is down?** | The endpoint still returns 200 with a rule-based estimate, an explicit source marker and a typed reason, and the interface labels it as a fallback. There are five typed failure modes and all of them are tested. |
| **How do you stop one student seeing another's prediction?** | The feature vector is built from the token subject's own rows; no parameter changes the target, and the browser suite asserts that a forged student identifier changes nothing. |
| **How do you know the two feature implementations agree?** | A parity harness runs the real Python extraction against the live database and diffs it against the SQL path — exact 44-name order plus a tight tolerance, currently six students × 44 features. |
| **Could someone pass their own score to the model?** | No. The service accepts only a feature map and produces every number itself, and the backend rejects any response whose probability map disagrees with its own reported category. |
| **How does registration prevent privilege escalation?** | Registration always creates an inactive account. Faculty and administrator requests must carry a code verified on the server, and only a super administrator can activate the role. The browser's role field never becomes a permission by itself. |
| **How do you test password recovery safely?** | The administrator issues a single-use link whose token is stored only as a hash. The user sets their own new password, which invalidates the old one immediately, and no password or hash is ever displayed to anyone. |
| **Where does the concurrency safety come from?** | Timetable writes serialise behind a transaction-scoped advisory lock, payments lock the fee row in the joined relation, and single-use tokens are claimed with a conditional update so a replay loses the race. |
| **Would you use this on a real student?** | No — and the artifact, the documentation and the interface all say so. The engineering is production-shaped; the model is a demonstration. |

---

## 24. Future scope

**Make the model defensible.** This is the highest-value work and it is not a hyper-parameter change:

1. Generate a proper cohort — realistically 50–100 synthetic students — rather than six.
2. **Reweight the label formula** so the 36 per-course features genuinely drive the outcome, which
   also fixes the failure mode where a 90%-attendance student is called at risk.
3. Add a **held-out split** with stratified or repeated cross-validation, so the reported numbers
   estimate something real.
4. Add **calibration**, because a raw maximum class probability from an uncalibrated forest is not a
   confidence.
5. Once live, add **drift monitoring** and per-band error tracking.

**Platform work, roughly in order of value:**

- Frontend 2.0 — redesign individual pages against the existing shell and token layer.
- Complete the endpoint reference so the placements module is documented alongside the rest.
- Vendor the visual prototype into the repository so style regeneration is reproducible for anyone.
- httpOnly cookie sessions with refresh rotation, closing the stored-token exposure.
- Security headers, a structured audit log for approvals and account-help handling, and global rate
  limiting.
- A real mail provider for invitations and password-reset delivery, which would remove the manual
  step in account recovery.
- Grade entry and bulk fee generation, and a genuine payments integration.

---

*End of document. This file is self-contained: it requires no other file in the repository to be
understood, run or evaluated.*