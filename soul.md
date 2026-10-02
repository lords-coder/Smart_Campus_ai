# Soul of SmartCampus AI

> Everything that defines this project: architecture, every API endpoint, every database
> table, every route, auth rules, ML contract, commands, and known gotchas.
> Companion to `README.md` (quick start) and `docs/` (deep dives per domain).

---

## 1. Project identity

**SmartCampus AI** — an AI-powered college/university management platform: authentication with
role-based access control, a PostgreSQL data model, campus modules for **students, faculty,
admins, parents and alumni**, a grounded AI assistant, a Python ML service that scores student
performance, and a single dark application shell tying it together.

- **Style:** modular monolith — one backend, one frontend, one database, one Python service. No microservices.
- **Phases shipped:** 1–15 (foundation → academics → operations → AI → ML → every campus service).
- **Scale:** 44 frontend routes, 487 API regression assertions + 85 registration/approval assertions, 750 E2E assertions (55 auth + 48 registration + 647 phase suites), 61 ML-integration assertions, 33 Python tests.
- **Scope of phases:**

| Phase | Scope | Report |
|---|---|---|
| 1 | Foundation: auth, RBAC, PostgreSQL, student API, dashboard | — |
| 2 | Attendance marking, fee register, payments | `docs/PHASE2_REPORT.md` |
| 3 | Timetable register, conflict detection, archive-first delete | `docs/PHASE3_REPORT.md` |
| 4 | AI chat assistant grounded in live campus data | `docs/PHASE4_REPORT.md` |
| 5 | Performance prediction served by trained Python model | `docs/ML_ARCHITECTURE.md` |
| 6 | Personalized learning recommendations | `docs/PHASE6_REPORT.md` |
| 7 | Dropout risk & intervention dashboard | `docs/PHASE7_REPORT.md` |
| 8 | Parent portal: invitations, read-only guardian access | `docs/PHASE8_REPORT.md` |
| 9 | Hostel & transport management | `docs/PHASE9_REPORT.md` |
| 10 | Digital certificates with QR verification | `docs/PHASE10_REPORT.md` |
| 11 | Library: catalogue, loans, renewals, fines | `docs/PHASE11_REPORT.md` |
| 12 | Placement cell: drives, eligibility, applications, offers | — (backend + E2E exist, no report/API-doc) |
| 13 | Alumni: directory, mentorship, events, giving | `docs/PHASE13_REPORT.md` |
| 14 | Mess & canteen management with billing | `docs/PHASE14_REPORT.md` |
| 15 | Transport live-tracking readiness (staff-reported telemetry) | `docs/PHASE15_REPORT.md` |
| — | Global dark AppShell + design system (one shell, five roles) | `docs/FRONTEND_INTEGRATION_REPORT.md` |

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.3.7 (App Router, Turbopack), React 19.2.8, TypeScript (strict), Tailwind CSS v4, shadcn/ui, radix-ui, lucide-react |
| Backend | Node.js 20+ (runs on 24), Express 5, TypeScript (`tsx` dev / `tsc` build), Zod v4 |
| Database | PostgreSQL 16 in Docker (`postgres:16-alpine`), raw SQL migrations, `pg` driver — no ORM |
| Auth | JWT HS256 (issuer `smartcampus-ai`) + bcryptjs, backend-enforced RBAC on every route |
| AI | Provider abstraction: OpenAI `gpt-4o-mini` or deterministic mock; allowlisted read-only tools; per-user rate limit |
| ML | Python 3.11, FastAPI, scikit-learn `RandomForestClassifier`, joblib |
| Design | Dark design language generated into stylesheets + a token layer |
| Testing | API smoke suite, Puppeteer E2E (system Chrome), pytest, feature-parity check, shell/a11y/visual probes |

Ports: **5432** PostgreSQL · **4000** Express · **3000** Next.js · **8001** FastAPI ML.

---

## 3. Architecture

```
Browser (Next.js 16, React 19)
   |  Authorization: Bearer <jwt>          one API client (lib/api.ts), one fetch hook
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
  → cors()                      allow-listed origins only (FRONTEND_URL, credentials=false)
  → express.json()              100kb body limit
  → request logger              METHOD /path -> status (ms)   [never logs bodies]
  → routes/index.ts             mounted at /api
      → middleware/validate()   Zod schema → 400 VALIDATION_ERROR (replaces req.body with parsed data)
      → authenticate.requireAuth()    verifies HS256 JWT + issuer, THEN re-reads the user row from PG
      → authenticate.requireRole(...) 403 FORBIDDEN if role not allowed
      → controller              thin: parse validated input, call service, shape response
      → service                 owns ALL SQL and domain logic
  → middleware/errorHandler     ZodError / ApiError / PG error → uniform envelope + status
```

### Universal design rules

- Controllers are thin; **services own all SQL and domain logic**.
- Every response goes through one envelope helper (`utils/response.ts` → `sendSuccess`/`sendError`); every failure is an `ApiError`.
- The backend is the **authoritative** authorization layer; the frontend `RoleGuard` is UX only.
- Students' data is always scoped by `WHERE user_id = $1` — no endpoint trusts a `studentId` from the client.
- The browser only talks to Express — never to the database or the ML service.
- One timetable system: attendance, faculty week view and student schedule all read `timetable_entries`.
- Archive-first deletes: timetable, and hard deletes are refused while dependent history exists.

### Module template (adding a feature)

```
backend/src/modules/<name>/
├── <name>.routes.ts       router + requireAuth/requireRole + validate() wiring
├── <name>.controller.ts   request/response only
├── <name>.service.ts      SQL + domain logic
├── <name>.schemas.ts      Zod schemas (optional)
└── <name>.types.ts        DTO shapes (optional)
```
Register in `src/routes/index.ts`, add a numbered migration, add frontend types + `useApi<T>()` call.

---

## 4. Project layout

```
smartcampus-project/
├── backend/                        Express API (modular monolith)
│   ├── src/
│   │   ├── config/                 env.ts (validated) · db.ts (pg pool, withTransaction)
│   │   ├── middleware/             authenticate.ts · validate.ts · errorHandler.ts
│   │   ├── modules/                15 folders: auth, students, attendance, fees, timetable,
│   │   │                           ai, performance (+recommendations +risk), parent, hostel,
│   │   │                           transport, certificates, library, placements, alumni, mess
│   │   ├── routes/index.ts         route registry (mounted at /api)
│   │   ├── scripts/                migrate.ts · seed.ts (1453 lines) · reset-db.ts
│   │   ├── utils/                  jwt · password · response envelope · date · ApiError · roles
│   │   ├── app.ts                  Express app factory
│   │   └── server.ts               listener + graceful shutdown (SIGINT/SIGTERM)
|   `-- tests/                      api.smoke.mjs (487) - registration.flow.mjs (85) - ml-integration.mjs (61) - feature-parity.mjs
│   └── .env                        [created locally; *.example files are NOT in this copy]
├── frontend/                       Next.js app
│   ├── src/
│   │   ├── app/                    routes; "(app)" group = authenticated shell
│   │   │   ├── page.tsx            splash/redirect by role
│   │   │   ├── login/              public sign-in
│   │   │   ├── parent/activate/    public parent invitation activation
│   │   │   ├── verify/[code]/      public certificate verification
│   │   │   └── (app)/              36 protected pages behind AuthGuard + AppShell
│   │   ├── components/
│   │   │   ├── layout/             app-shell · nav-config · command-palette · page-container · stat-card · brand-mark
│   │   │   ├── command-center/     student dashboard surface (5 files)
│   │   │   ├── auth/               guards.tsx (AuthGuard/RoleGuard) · login-form
│   │   │   ├── providers/          auth-provider.tsx (session context)
│   │   │   ├── ui/                 15 shadcn primitives
│   │   │   ├── states/             loading / error / empty
│   │   │   └── <domain>/           admin · ai · alumni · attendance · certificates · dashboard ·
│   │   │                           faculty · fees · hostel · library · mess · parent · placements ·
│   │   │                           recommendations · risk · transport
│   │   ├── hooks/use-api.ts        shared data hook (data / loading / error / reload)
│   │   ├── lib/                    api.ts client · auth.ts token store · types.ts (~29KB) · format.ts · utils.ts
│   │   └── styles/                 theme-dark.css · command-center.css(+overrides) · app-shell.css(+overrides)
│   ├── e2e/                        16 Puppeteer suites (auth + phase1 … phase15)
│   ├── scripts/                    style codemods + shell/visual/a11y probes
│   └── .env.local                  [created locally]
├── ml/                             Python ML service
│   ├── inference/main.py           FastAPI app (POST /predict, GET /health, GET /model/info)
│   ├── models/                     performance_model.joblib (~170KB, committed) + metadata.json
│   ├── training/                   feature_engineering.py · train.py
│   ├── tests/                      pytest suite (33 tests)
│   └── Dockerfile                  python:3.11-slim, uvicorn on 8001
├── database/migrations/            001_core_users … 017_phase15_transport_telemetry (17 SQL files)
├── docs/                           API · ARCHITECTURE · ML · UI system · per-phase reports
├── docker-compose.yml              postgres 16 + ml-service
├── README.md                       quick start + the registration/approval model
└── soul.md                         this file
```

---

## 5. Running the project

### Prerequisites
- Node.js 20.9+ (tested on 24) and npm 10+
- Python 3.11+ (only for ML service/tests, or skip — Docker covers it)
- Docker Desktop (PostgreSQL + ML service containers)

### Commands (from `smartcampus-project/`)

```bash
# 1. Database (+ ML service)
docker compose up -d

# 2. Backend
cd backend
npm install
# create .env with DATABASE_URL + JWT_SECRET (see §6) — NOTE: .env.example is missing in this copy
npm run migrate               # applies database/migrations/*.sql in order, transactional
npm run seed                  # bootstrap ONLY: migrations + the SUPER_ADMIN account
npm run seed:test             # test-only fixtures (never a deployment)

# 3. Frontend
cd ../frontend
npm install
# create .env.local with NEXT_PUBLIC_API_URL=http://localhost:4000

# 4. Run (two terminals)
cd backend  && npm run dev      # http://localhost:4000  (tsx watch src/server.ts)
cd frontend && npm run dev      # http://localhost:3000  (next dev, Turbopack)
```

ML service alternative (local instead of Docker):
```bash
cd ml && pip install -r requirements.txt
cd inference && python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### Backend scripts

| Script | Purpose |
|---|---|
| `npm run dev` | tsx watch server |
| `npm run build` / `start` | tsc → `dist/server.js` / node |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | apply pending migrations (tracked in `schema_migrations`) |
| `npm run seed` | destructive demo rebuild (18 users, 6 courses, 30 slots, 540 attendance rows…) |
| `npm run db:reset -- --yes` | DROP SCHEMA public CASCADE + migrate (refuses without `--yes`) |
| `npm run test:api` | 487 API assertions (needs API running; mutates DB) |
| `npm run test:ml` | 61 assertions: real ML path + every degradation mode |
| `npm run test:feature-parity` | SQL feature vector == Python feature vector |

### This machine's current live state (session notes)

- **Project root:** `C:\test\SmartCampus_AI_updated_source\smartcampus-project`
- **`.env.example` files do not exist in this copy.** Created manually:
  - `backend/.env` → `DATABASE_URL=postgresql://smartcampus:smartcampus_dev@localhost:5432/smartcampus`, random `JWT_SECRET`, `JWT_EXPIRES_IN=1d`, `FRONTEND_URL=http://localhost:3000`, `PORT=4000`, `BCRYPT_ROUNDS=10`, `AI_PROVIDER=auto`, `ML_SERVICE_URL=http://localhost:8001`
  - `frontend/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`
- **Stale container conflicts fixed:** old manually-created containers renamed to
  `smartcampus-pg-old` and `smartcampus-ml-service-old` (data preserved, not deleted).
- **Stray lockfile:** `C:\test\SmartCampus_AI_updated_source\package-lock.json` (one level up)
  makes Next.js infer the wrong workspace root (warning only; app runs). Fix: delete it or set
  `turbopack.root` in `next.config.ts`.
- **npm allow-scripts warnings:** esbuild/unrs-resolver postinstall scripts are blocked by npm's
  allow-scripts policy; `tsx`/`next` verified working anyway.
- **Detached dev servers:** started via `Start-Process cmd "/c npm run dev > log"` with logs at
  `%TEMP%\opencode\backend.log` and `%TEMP%\opencode\frontend.log`. They survive the shell but
  not a reboot — rerun `npm run dev` in `backend/` and `frontend/`.

### Verification checklist (all passing when written)

| Check | Result |
|---|---|
| `GET /api/health` | `{"status":"ok","database":"up"}` |
| `POST /api/auth/login` (admin) | 200, JWT issued, role ADMIN |
| `GET /api/performance/predict` (student) | 200, `prediction_source: ML` |
| `GET /health` (ML :8001) | `healthy`, `model_loaded: true`, v1, 44 features |
| `GET /` and `/login` (:3000) | HTTP 200 |

---

## 6. Environment variables

`.env` files are git-ignored; the `*.example` templates are supposed to be committed (missing here).

| Variable | Used by | Purpose | Example / default |
|---|---|---|---|
| `DATABASE_URL` | backend | **required** PostgreSQL connection | `postgresql://user:pass@localhost:5432/smartcampus` |
| `JWT_SECRET` | backend | **required** HS256 signing key (64+ random chars, never commit) | — |
| `UNIVERSITY_EMAIL_DOMAIN` | backend | **required** the only domain a public registration may use | `smartcampus.edu` |
| `ADMIN_REGISTRATION_CODE` | backend | **required secret** code an `ADMIN` registration must carry (server-side only) | — |
| `FACULTY_REGISTRATION_CODE` | backend | **required secret** code a `FACULTY` registration must carry (server-side only) | — |
| `SUPER_ADMIN_EMAIL` | bootstrap | **required** e-mail of the single SUPER_ADMIN account | — |
| `SUPER_ADMIN_PASSWORD` | bootstrap | **required secret** its initial password; bcrypt hashed on the way in | — |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` | backend | rate limit for the public auth endpoints (per IP) | `1000` / `900000` |
| `JWT_EXPIRES_IN` | backend | token lifetime | `1d` |
| `FRONTEND_URL` | backend | CORS allow-list origin (comma-separated OK) | `http://localhost:3000` |
| `PORT` | backend | API port | `4000` |
| `BCRYPT_ROUNDS` | backend | password hashing cost | `10` |
| `AI_PROVIDER` | backend | `auto` (default) / `mock` / `openai` | `auto` |
| `OPENAI_API_KEY` | backend | enables real provider in `auto`; empty → mock | `sk-...` |
| `AI_MODEL` | backend | chat model | `gpt-4o-mini` |
| `AI_TIMEOUT_MS` / `AI_MAX_TOKENS` | backend | provider timeout / answer cap | `12000` / `400` |
| `AI_MAX_MESSAGE_LENGTH` | backend | chat message cap (chars) | `1000` |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | backend | per-user chat limit | `30` / `60000` |
| `ML_SERVICE_URL` | backend | ML base URL — **server-side only, browser never sees it** | `http://localhost:8001` (Docker network: `http://ml-service:8001`) |
| `ML_TIMEOUT_MS` | backend | backend→ML ceiling; on timeout prediction degrades | `5000` |
| `NEXT_PUBLIC_API_URL` | frontend | backend base URL (only public var) | `http://localhost:4000` |
| `MODEL_PATH` / `METADATA_PATH` | ml-service (compose) | joblib + metadata paths inside container | `/app/ml/models/...` |
| `PROTOTYPE_ROOT` | frontend build:styles | location of the visual prototype (styles regeneration) | two dirs up by default |

Fail-fast: `backend/src/config/env.ts` throws at boot if `DATABASE_URL`, `JWT_SECRET`,
`UNIVERSITY_EMAIL_DOMAIN`, `ADMIN_REGISTRATION_CODE`, `FACULTY_REGISTRATION_CODE`,
`SUPER_ADMIN_EMAIL` or `SUPER_ADMIN_PASSWORD` is missing.

---

## 7. Accounts, registration and approval

**A freshly bootstrapped database contains exactly one account: SUPER_ADMIN.** There are no demo
users and no demo credentials in the seed path, the UI or the docs.

| Role | How the account is created |
|---|---|
| `SUPER_ADMIN` | Bootstrapped once from configuration (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`), role `SUPER_ADMIN`, status `ACTIVE` |
| `STUDENT` | `/register` → `PENDING_APPROVAL` → SUPER_ADMIN approval |
| `FACULTY` | `/register` + `FACULTY_REGISTRATION_CODE` → approval |
| `ADMIN` | `/register` + `ADMIN_REGISTRATION_CODE` → approval |
| `PARENT` | admin invitation at `/admin/parents` → `/parent/activate` (unchanged Phase 8 flow) |
| `ALUMNI` | verified by an admin before the alumni surfaces open |

Role homes: STUDENT → `/dashboard` · FACULTY → `/faculty` · ADMIN → `/admin` · PARENT → `/parent` ·
ALUMNI → `/alumni` · SUPER_ADMIN → `/super-admin`.

### Registration lifecycle
```
public /register (role: STUDENT | FACULTY | ADMIN only)
   → users.status = 'PENDING', registrations.status = 'PENDING_APPROVAL', NO JWT
   → SUPER_ADMIN approves  → users.status = 'ACTIVE', registrations.status = 'APPROVED'
   → SUPER_ADMIN rejects   → users.status = 'REJECTED', registrations.status = 'REJECTED'
```
`REGISTRATION_STARTED` is a valid `registrations.status` reserved for resumable multi-step
registrations; the current single-submit wizard goes straight to `PENDING_APPROVAL`.

### Server-enforced rules
- Only `STUDENT`/`FACULTY`/`ADMIN` may be requested. `PARENT`, `ALUMNI`, `SUPER_ADMIN` are rejected
  by the Zod enum (400).
- University domain: the address must end in `UNIVERSITY_EMAIL_DOMAIN`, else 400
  `INVALID_EMAIL_DOMAIN`. Login is *not* domain-restricted (SUPER_ADMIN may be on another domain).
- Password: min 8, ≥1 uppercase, ≥1 number, ≥1 special character, plus a matching
  `confirmPassword` (Zod, server-side). bcrypt hash only; never returned.
- `ADMIN` / `FACULTY` must carry the correct `code`, compared against
  `ADMIN_REGISTRATION_CODE` / `FACULTY_REGISTRATION_CODE` on the server. Wrong code → 400
  `INVALID_REGISTRATION_CODE` and **no row is written**. Codes are never sent to the browser and are
  never stored in the `registrations.submission` payload.
- Duplicate address → 409 `EMAIL_TAKEN`.
- Role escalation is impossible from the client: a role only becomes effective after the code check
  (faculty/admin) **and** a SUPER_ADMIN approval.
- Profile rows (`students` / `faculties`) are created inside the same transaction as the pending
  user, using the schema's real fields (`students`: student_no, department, semester, section,
  batch_year; `faculties`: employee_no, department, designation). ADMIN has no profile table, so
  its professional details live in `registrations.submission`.
- `users.phone` was added by migration 018 to carry the registration phone number.

### Login behaviour
| Account state | Result |
|---|---|
| `ACTIVE` + correct password | JWT, role-based redirect |
| `PENDING` + correct password | 403 `REGISTRATION_PENDING` — *"Your registration is still pending approval."* |
| `REJECTED` + correct password | 403 `REGISTRATION_REJECTED` — *"Your registration was not approved. Please contact the administration."* |
| `SUSPENDED` | 403 `ACCOUNT_SUSPENDED` |
| wrong password / unknown e-mail | 401 `INVALID_CREDENTIALS` (generic; no existence leak) |

`requireAuth` re-reads the user row on **every** request and rejects `status <> 'ACTIVE'`, so a
suspension or rejection takes effect immediately even for a token issued a minute earlier.

### Account help / password recovery (administrative, not e-mail)
1. `POST /api/auth/password-help` (public, rate-limited) creates a persisted request
   (`password_help_requests`, status `OPEN`). A request for an unknown address still succeeds —
   no enumeration.
2. SUPER_ADMIN works the queue at `/super-admin` → *Password assistance*: open, mark in progress,
   resolve, reject, add internal notes.
3. To recover access the administrator issues a **single-use reset link**:
   `POST /api/super-admin/password-help/:id/reset` mints a 32-byte token, stores only its SHA-256
   hash with a 24-hour expiry, returns the link once, and flips the request to `IN_PROGRESS`.
4. The user opens `/reset-password?token=…` and sets a new password. The backend claims the token
   (`UPDATE … WHERE used_at IS NULL`, so a replay loses the race) and replaces the hash — the old
   password stops working at once. Replay → 400 `TOKEN_ALREADY_USED`; expired → `TOKEN_EXPIRED`;
   unknown → `INVALID_RESET_TOKEN`.
5. Passwords and hashes are never returned by any endpoint, including to administrators.

### Test fixtures (not part of a deployment)
`npm run seed:test` loads a deterministic dataset (18 users, 6 courses, 30 slots, 540 attendance
rows, fees, hostel, transport, library, placements, alumni, mess) plus the SUPER_ADMIN. It exists
**only** so the API/E2E suites have data; `npm run seed` / `npm run bootstrap` never create it.

---

## 8. Auth & RBAC

### Token model
- Login → bcrypt compare (10 rounds) → JWT `{ sub, role, email }`, **HS256**, issuer `smartcampus-ai`, expiry `JWT_EXPIRES_IN` (default 1d).
- Frontend stores token in `localStorage` key `smartcampus_token`; attaches `Authorization: Bearer <jwt>`.
- **`requireAuth` re-reads the user row from the DB on every request** — role changes/deletions apply immediately; JWT is not the source of truth.
- On any 401 the API client clears the token and dispatches `smartcampus:unauthorized`; `AuthProvider` flips to signed-out; `AuthGuard` routes to `/login`.
- Logout is stateless (client discards token); `POST /api/auth/logout` returns `{ loggedOut: true }`.

### Middleware order (canonical)
`cors → json(100kb) → logger → validate(zod) → requireAuth → requireRole(...) → controller → service → errorHandler`

### Roles
- `ROLES` (code + DB CHECK after migration 015): `STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN`
- `ACTIVE_ROLES`: `STUDENT | FACULTY | ADMIN` (the operational self-service roles; PARENT/ALUMNI/SUPER_ADMIN are gated by route-level `requireRole`, which is intentional and unchanged).
- `SUPER_ADMIN` is **operational**: bootstrapped once, approves registrations, handles account help, manages users, and inherits every ADMIN surface (see §7 and the permission matrix below).
- Public registration accepts only `STUDENT`, `FACULTY` and `ADMIN`; every one of them must be approved by SUPER_ADMIN before it can sign in.
- DB triggers enforce role side-conditions: `enforce_parent_link_role()` (link parent must be PARENT), `enforce_alumni_profile_role()` (alumni profile user must be ALUMNI).

### Permission matrix (summary)

| Action | STUDENT | FACULTY | ADMIN | PARENT | ALUMNI | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| Own attendance/fees/timetable reads | ✅ | — (403) | — | — | — | — |
| Mark attendance / manage classes | ❌ 403 | ✅ own timetable entries | ✅ any | — | — | ✅ any (as ADMIN) |
| Fee register + record payments | ❌ | ❌ | ✅ | — | — | ✅ |
| Timetable register CRUD (conflict-checked) | ❌ | read own only | ✅ all writes | — | — | ✅ all writes |
| AI assistant `/api/ai/ask` | own data | own classes | institute scope | linked-child scope | — | institute scope |
| Performance prediction | ✅ own | 403 | 403 | — | — | 403 |
| Recommendations | ✅ own | 403 | 403 | headlines of linked child | — | 403 |
| Risk dashboard | own analysis only | assigned courses | full cohort | — | — | full cohort |
| Interventions CRUD | ❌ | in-scope students | ✅ | ❌ | — | ✅ |
| Parent invitations/links mgmt | ❌ | ❌ | ✅ | — | — | ✅ |
| Read linked child (attendance/fees/timetable/hostel/transport/certs/library/mess) | ❌ | ❌ | ❌ | ✅ ACTIVE link | — | ❌ |
| Hostel/transport/certificates/library/mess admin surfaces | self-service subset | catalogue read (library) | ✅ all admin | read-only cards | — | ✅ all admin |
| Certificate request/track/download | ✅ own | — | approve/reject/issue/revoke | read child's issued | — | approve/reject/issue/revoke |
| Alumni directory/profile/events/giving | directory+events | directory+events | ✅ admin | ❌ 403 (directory) | ✅ self-service | ✅ admin |
| Placements | apply to drives | browse | manage companies/drives/pipeline | — | — | ✅ manage |
| **Register an account** | own (pending → approved) | own (code + approval) | own (code + approval) | invitation only | admin-verified | ❌ not publicly |
| **Approve/reject registrations** | ❌ 403 | ❌ 403 | ❌ 403 | — | — | ✅ only |
| **Password-help queue + reset links** | ❌ 403 | ❌ 403 | ❌ 403 | — | — | ✅ only |
| **Suspend/reactivate users** | ❌ | ❌ | ❌ | — | — | ✅ only |

**IDOR rules baked in everywhere:**
- Ownership chain: `req.user.id (JWT sub) → students.user_id → enrollments.student_id`; client `studentId` params are ignored or re-derived.
- `users.id` ≠ `students.id` — profile tables reference `students.id`; services resolve it (`getStudentProfileId`).
- Accessing another student's resource returns **404, not 403** (no existence leak) — fees, parent links, certificates.
- Parent reads re-check the ACTIVE `parent_student_links` row server-side; forged/unlinked IDs → 404.
- Faculty timetable filters are overwritten server-side with the caller's own `faculties.id`.

### Special flows
- **Parent invitation:** admin creates (student + email + relationship, expiry 1–168h) → 256-bit token shown once, **SHA-256 stored** → parent activates at `/parent/activate` (single-use, `SELECT … FOR UPDATE`) → creates PARENT account + ACTIVE link → JWT.
- **Public certificate verification:** `GET /api/certificates/verify/:code` — no auth, IP rate-limited 120/min, returns masked data only.
- **Registration:** `POST /api/auth/register` creates user + profile in one transaction; 409 `EMAIL_TAKEN`.

---

## 9. API reference

**Base URL:** `http://localhost:4000/api` · **Auth:** `Authorization: Bearer <jwt>`

### Response envelope

```jsonc
// success
{ "success": true,  "data": <payload>, "message": "OK" }        // creates → 201
// failure
{ "success": false, "error": { "code": "SNAKE_CASE", "message": "...", "details": [...] } }
```
A few documented examples show bare payloads (`GET /auth/me`, `GET /students/me`) — the implementation generally wraps everything.

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod rejected input (`details` = field issues) |
| `INVALID_JSON` / `INVALID_SECTION` / `FUTURE_DATE` / `DUPLICATE_STUDENT` / `STUDENT_NOT_IN_CLASS` / `EMPTY_ROSTER` / `INVALID_AMOUNT` / `OVERPAYMENT` / `INVITATION_REVOKED`/`USED`/`EXPIRED` / `INVALID_TRANSITION` | 400 | feature-specific |
| `UNAUTHORIZED` / `INVALID_TOKEN` / `INVALID_CREDENTIALS` | 401 | missing/invalid token or wrong password |
| `FORBIDDEN` | 403 | role not allowed |
| `NOT_FOUND` | 404 | unknown route/record (also used instead of 403 for IDOR) |
| `EMAIL_TAKEN` / `DUPLICATE_RESOURCE` / `TIMETABLE_CONFLICT` / `DEPENDENCY_CONFLICT` / `INVITATION_EXISTS` / `ALLOCATION_CONFLICT` / `RESERVATION_CONFLICT` / `EVENT_FULL` | 409 | uniqueness/state conflicts |
| `PAYLOAD_TOO_LARGE` | 413 | body > 100kb |
| `RATE_LIMITED` | 429 | AI 30/min/user; cert verify 120/min/IP (sends `Retry-After`) |
| `INTERNAL_SERVER_ERROR` | 500 | generic in production |
| `AI_UNAVAILABLE` / `AI_TIMEOUT` | 503 / 504 | AI provider failed / timed out |
| PG `23505` → `DUPLICATE_RESOURCE`, `23503` → `REFERENCE_ERROR`, `22*`/`23*` → `DATABASE_CONSTRAINT_ERROR` | 409/400 | translated by errorHandler |

### Pagination / filter conventions
- `GET /students/me/attendance?limit=` → 1–100 (default 20), newest first.
- `GET /fees?q=&status=` → cap 500 rows; status `PENDING|PARTIAL|PAID`; open fees first.
- `GET /timetable?day=&facultyId=&courseId=&section=&room=&status=` → `{ entries, total }`; status `ACTIVE` (default) `ARCHIVED` `ALL`.
- `GET /risk/students` → `{ items, total, page, limit }`-style paginated, max 200, filters `riskLevel/section/course`, sorted CRITICAL→LOW.
- `GET /library/books` → `{ items, total, page, limit }`, max 100/page; query `q/category/author/available`.
- `?day=Monday…` on student/parent timetable; `?date=YYYY-MM-DD` on attendance roster; `?scope=today|tomorrow|week` on mess menu.
- `DELETE /timetable/:id?permanent=false` (default archive).
- `GET /certificates/:id/download?view=1` (inline PDF).

### Endpoint inventory (~185)

**Health (1)** — `GET /api/health` (public; DB ping, 503 when degraded).

**Auth (6)** — `/register`, `/login`, `/password-help` and `/reset-password` are public and
rate-limited; no auth endpoint ever returns a hash, a code or a reset token that was not just
minted.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | request a STUDENT/FACULTY/ADMIN account → 201 `{ status: "PENDING_APPROVAL", message }`, **no token**; faculty/admin also need their verification `code` |
| POST | `/auth/login` | public | email+password → `{ token, user }`; 403 `REGISTRATION_PENDING` / `REGISTRATION_REJECTED` / `ACCOUNT_SUSPENDED` instead of a token |
| GET | `/auth/me` | any | current user + profile (null profile for ADMIN/SUPER_ADMIN) |
| POST | `/auth/logout` | any | `{ loggedOut: true }` (stateless) |
| POST | `/auth/password-help` | public | file an account-help request → `{ message }`; always succeeds (no enumeration) |
| POST | `/auth/reset-password` | public | consume a single-use reset token and set a new password |

**SUPER_ADMIN (8)** — mounted at `/api/super-admin` with `requireAuth + requireRole("SUPER_ADMIN")`;
a normal ADMIN, FACULTY or STUDENT gets 403.

| Method | Path | Purpose |
|---|---|---|
| GET | `/super-admin/registrations?status=&role=&q=` | `{ items, total }`; status `ALL`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED` |
| GET | `/super-admin/registrations/:id` | one registration with its submission payload |
| PATCH | `/super-admin/registrations/:id/approve` | activate the account (`users.status → ACTIVE`); 409 on a non-pending row |
| PATCH | `/super-admin/registrations/:id/reject` | `{ reason? }` → `users.status → REJECTED` |
| GET | `/super-admin/users?status=&role=&q=` | `{ items, total }` for user management |
| PATCH | `/super-admin/users/:id/status` | `{ status: "ACTIVE" \| "SUSPENDED" }` |
| GET | `/super-admin/password-help?status=` | `{ items, total }` of help requests |
| PATCH | `/super-admin/password-help/:id` | `{ status, adminNotes? }` — IN_PROGRESS / RESOLVED / REJECTED |
| POST | `/super-admin/password-help/:id/reset` | mint a single-use reset link, returned once |

**Students (5)** — all `requireRole("STUDENT")`:
`GET /students/me` · `GET /students/me/attendance-summary` · `GET /students/me/fees-summary` ·
`GET /students/me/attendance?limit=` · `GET /students/me/timetable?day=`

**Attendance (3)** — FACULTY (own) | ADMIN (all):
`GET /attendance/classes` · `GET /attendance/classes/:timetableEntryId?date=` (roster + alreadySubmitted) ·
`POST /attendance` (batch, 201, transactional idempotent upsert on student+course+date)

**Fees (3)**:
`GET /fees?q=&status=` (ADMIN) · `POST /fees/:feeId/payments` (ADMIN, 201, FOR UPDATE + OVERPAYMENT check) ·
`GET /fees/:feeId/payments` (ADMIN or STUDENT-own, others 404)

**Timetable (6)** — reads FACULTY(own)|ADMIN; writes ADMIN:
`GET /timetable` · `GET /timetable/options` (ADMIN) · `GET /timetable/:entryId` ·
`POST /timetable` (advisory-locked conflict detection: FACULTY/ROOM/SECTION → 409 with `conflictTypes`) ·
`PATCH /timetable/:entryId` · `DELETE /timetable/:entryId?permanent=false` (archive default; hard delete blocked by attendance → 409 `DEPENDENCY_CONFLICT`)

**AI (1)**:
`POST /ai/ask` — STUDENT|FACULTY|ADMIN|PARENT; message 1–1000 chars; returns
`{ answer, intent, sources, context, provider }`; intents `ATTENDANCE / COURSE_ATTENDANCE / FEES /
FEE_HISTORY / TIMETABLE / NEXT_CLASS / GENERAL`; rate-limited 30/min.

**Performance (2)** — STUDENT only:
`GET /performance/predict` (ML or rule-based fallback + `fallback_reason`) · `GET /performance` (8 aggregate features).

**Recommendations (2)** — STUDENT only:
`GET /recommendations` (deterministic categories/priorities; thresholds attendance 70 / assessment 60 / assignment 65) ·
`GET /recommendations/study-plan` (optional AI; failure → `{ studyPlan: null, fallback: true }`).

**Risk & interventions (10)** — student: own only; FACULTY: assigned courses; ADMIN: all:
`GET /risk/own/analysis` · `GET /risk/own/intervention-plan` · `GET /risk/students` (max 200) ·
`GET /risk/stats` · `GET /risk/students/:studentId` · `…/trends` · `…/interventions` (GET/POST) ·
`POST /risk/interventions` (alias) · `PATCH /risk/interventions/:interventionId`
(status ∈ OPEN/IN_PROGRESS/COMPLETED/DISMISSED).

**Parent portal (13)**:
Public `POST /parent/activate` (201) · PARENT: `GET /parent/students`,
`…/:studentId/{overview,attendance,fees,timetable,recommendations,notices,hostel,transport,library,mess,certificates}` (all link-checked) ·
ADMIN: `GET /admin/parents`, `GET|POST /admin/parents/invitations`, `PATCH …/invitations/:id/revoke`, `PATCH /admin/parents/links/:linkId`.

**Hostel (24)**:
STUDENT: `GET /hostel/{me,rooms,complaints,room-changes,visitors}` + `POST /hostel/{complaints,room-changes,visitors}` ·
ADMIN: `GET|POST /admin/hostel/{dashboard,hostels,rooms,allocations,complaints,room-changes,visitors}` +
`PATCH /admin/hostel/allocations/:id/{vacate,transfer}` + `PATCH /admin/hostel/{complaints,room-changes,visitors}/:id[/review]` ·
PARENT: `GET /parent/students/:id/hostel`.

**Transport (20)**:
STUDENT `GET /transport/me` · ADMIN `GET|POST /admin/transport/{dashboard,vehicles,drivers,routes,stops,assignments,alerts}` +
`PATCH` variants (`vehicles/:id`, `routes/:id`, `stops/:id`, `assignments/:id/end`, `alerts/:id`) + `GET routes/:id` ·
telemetry (Phase 15): `POST /admin/transport/telemetry`, `POST /admin/transport/simulation`,
`GET /admin/transport/vehicles/:id/location`, `GET /admin/transport/tracking` ·
PARENT `GET /parent/students/:id/transport`.

**Certificates (13)** — state machine `PENDING→APPROVED→ISSUED→REVOKED` / `PENDING→REJECTED`:
STUDENT `POST /certificates/requests` (201) + `GET /certificates{,/requests,/:id}` + `GET /certificates/:id/download` ·
public `GET /certificates/verify/:verificationCode` ·
ADMIN `GET /admin/certificates/requests[/:id]`, `PATCH …/{approve,reject}`, `POST …/issue` (201), `PATCH /admin/certificates/:id/revoke` ·
PARENT `GET /parent/students/:studentId/certificates`.
Number format `SC-YYYY-XXX-NNNNNN`; verification code 12 chars; PDFs stateless (pdfkit + QR → `/verify/<code>`).

**Library (21)** — policy: 14-day loans, ₹10/day fine (₹500 cap), max 4 active loans, 2 renewals, 3 reservations:
User: `GET /library/{books,books/:id,my-loans,my-reservations,my-fines}` · `POST /library/books/:id/reserve` ·
`POST /library/loans/:id/renew` · `POST /library/reservations/:id/cancel` ·
ADMIN: `GET|POST /admin/library/books`, `PATCH …/books/:id`, `GET|POST /admin/library/copies`, `PATCH …/copies/:id`,
`GET /admin/library/loans?status=`, `POST /admin/library/{issue,return}`, `GET /admin/library/{reservations,fines}`,
`PATCH /admin/library/reservations/:id/cancel` · PARENT `GET /parent/students/:id/library`.

**Placements (module exists; NOT documented in API.md — Phase 12 doc gap)**
Backend implements companies/drives/applications/interviews/offers + eligibility + analytics under
`/api/placements` and `/api/admin/placements` (see `modules/placements/` and `e2e/phase12.e2e.mjs`).

**Alumni (28)**:
Shared: `GET /alumni/{directory,directory/:id,events,campaigns}` · `GET|PATCH /alumni/me/profile` ·
`GET /alumni/me/mentorships` + `PATCH …/:id` · `POST /alumni/mentorships[/:id/cancel]` ·
`POST /alumni/events/:id/{register,cancel}` · `POST /alumni/me/contributions` ·
ADMIN: `/admin/alumni/{profiles,mentorships,events,campaigns,contributions,analytics}` with
`POST` creates, `PATCH` updates + `events/:id/registrations` + `registrations/:id/attend`.
Mentorship transitions `REQUESTED→ACCEPTED|REJECTED|CANCELLED`, `ACCEPTED→COMPLETED|CANCELLED`.

**Mess & canteen (29)**:
STUDENT: `GET /mess/{plan,menu,meals,billing,canteen,feedback}` · `POST /mess/{enroll,enrollment/cancel,orders,orders/:id/cancel,feedback}` ·
ADMIN: `GET|POST|PATCH /admin/mess/{plans,menu,items,orders}` + `DELETE …/menu/:id` + `POST …/meals/record` +
`GET …/meals` + `POST …/billing` (idempotent monthly sweep: `Mess Plan - YYYY-MM`, `Canteen - YYYY-MM`) +
`GET …/feedback[/analytics]` + `PATCH …/orders/:id` (pipeline PENDING→CONFIRMED→READY→COMPLETED / CANCELLED) ·
PARENT `GET /parent/students/:id/mess`.

---

## 10. Database schema

PostgreSQL 16 · raw SQL migrations applied in filename order, each in a transaction, tracked in
`schema_migrations`. Earlier migrations are never edited. Extensions: `pgcrypto` (001).
**56 tables, 3 sequences** (`student_no_seq`, `faculty_no_seq`, `certificate_no_seq`).

### 001–003: core, academics, records

- **`users`** (001): `id UUID PK` · `name TEXT` (len≥2) · `email TEXT UNIQUE` · `password_hash TEXT` ·
  `role TEXT CHECK IN (STUDENT,FACULTY,ADMIN,PARENT,SUPER_ADMIN)` — **015 adds ALUMNI** ·
  `created_at/updated_at`. Indexes on role and `lower(email)`.
- **`students`** (002): `id PK` · `user_id UNIQUE FK→users CASCADE` · `student_no UNIQUE` ·
  `department DEFAULT 'Unassigned'` · `semester 1–12` · `section DEFAULT 'A'` · `batch_year` · `admission_on`.
- **`faculties`** (002): `id PK` · `user_id UNIQUE FK` · `employee_no UNIQUE` · `department` · `designation`.
- **`courses`** (002): `id PK` · `code UNIQUE` · `name` · `credits 1–6` · `department` · `semester` ·
  `faculty_id FK→faculties SET NULL`.
- **`enrollments`** (002): `id PK` · `student_id FK` · `course_id FK` · `enrolled_on` ·
  `status CHECK (ACTIVE,DROPPED,COMPLETED)` · `UNIQUE(student_id,course_id)`.
- **`attendance`** (003): `id PK` · `student_id FK` · `course_id FK` · `date DATE` ·
  `status CHECK (PRESENT,ABSENT,LATE,LEAVE)` · `recorded_by FK→faculties SET NULL` ·
  `UNIQUE(student_id,course_id,date)`. **Deliberately NO FK to timetable_entries** — archiving a slot never orphans history.
- **`fees`** (003 +013 +016): `id PK` · `student_id FK` · `fee_type TEXT` (billing key) · `amount NUMERIC(12,2)≥0` ·
  `amount_paid≥0` with `CHECK amount_paid<=amount` · `due_date` · `status (PENDING,PARTIAL,PAID)` ·
  `library_loan_id` (013, partial UNIQUE) · partial uniques for `Mess Plan - %` and `Canteen - %` per student (016).
- **`fee_payments`** (004): `id PK` · `fee_id FK CASCADE` · `amount>0` ·
  `payment_method CHECK (CASH,BANK_TRANSFER,UPI,CARD)` · `reference ≤100` · `recorded_by FK→users SET NULL`.
  Immutable history.
- **`timetable_entries`** (003 +005): `id PK` · `course_id FK` · `faculty_id FK SET NULL` · `room` ·
  `day_of_week CHECK (Monday…Sunday)` · `start_time/end_time` (`CHECK end>start`) · `section` ·
  `semester` · `department` · **`is_active BOOLEAN DEFAULT true` + `archived_at`** (005) ·
  `UNIQUE(course_id,day_of_week,start_time,section)`.

### 006–009: performance, recommendations, risk

- **`assessments`** (006): `student_id FK` · `course_id FK` ·
  `assessment_type CHECK (QUIZ,MIDTERM,FINAL,PROJECT,LAB,ASSIGNMENT)` ·
  `marks_obtained ≥0`, `max_marks>0`, `CHECK marks<=max` · `assessed_on`.
- **`assignments`** (006): `student_id` · `course_id` · `title` · `submitted BOOL` · `score/max_score` (nullable, ordered) · `due_date` · `submitted_on`.
- **`learning_resources`** (007): `course_id FK` · `title` · `description` ·
  `resource_type CHECK (VIDEO,NOTES,PRACTICE,ARTICLE,REMEDIAL)` · `topic` ·
  `difficulty (beginner,intermediate,advanced)` · `url` · `active`.
- **`risk_snapshots`** (008/009): `student_id` · `calculated_on` (`UNIQUE(student,day)`) ·
  `risk_level CHECK (CRITICAL,HIGH,MODERATE,LOW)` · `risk_score 0–100` ·
  `attendance_/assessment_/assignment_{current,previous,change}` NUMERIC · `signals JSONB DEFAULT '[]'`.
- **`interventions`** (008): `student_id` · `created_by FK→users RESTRICT` · `risk_level_at_creation` ·
  `intervention_type CHECK (ACADEMIC_REVIEW,ATTENDANCE_SUPPORT,ASSESSMENT_SUPPORT,ASSIGNMENT_SUPPORT,REMEDIAL_SUPPORT,FACULTY_MEETING,GENERAL_FOLLOW_UP)` ·
  `notes` · `status (OPEN,IN_PROGRESS,COMPLETED,DISMISSED) DEFAULT OPEN` · `follow_up_date`.

### 010: parent portal

- **`parent_student_links`**: `parent_user_id FK` · `student_id FK` ·
  `relationship_type (PARENT,GUARDIAN,SPONSOR)` · `status (ACTIVE,REVOKED)` · `UNIQUE(parent,student)` ·
  trigger `enforce_parent_link_role()`.
- **`parent_invitations`**: `student_id FK` · `parent_email` · `relationship_type` · `token_hash UNIQUE` ·
  `status (PENDING,ACCEPTED,REVOKED,EXPIRED)` · `expires_at` · `used_at` · `created_by FK`.

### 011: hostel & transport

- **`hostels`**: `name UNIQUE` · `block` · `category (BOYS,GIRLS,COED)` · `warden_name` · `active`.
- **`hostel_rooms`**: `hostel_id FK` · `room_number` · `floor` · `room_type (SINGLE…QUAD)` ·
  `capacity 1–4` · `status (AVAILABLE,FULL,MAINTENANCE)` · `UNIQUE(hostel,room)`.
- **`hostel_allocations`**: `room_id` · `student_id` · `bed_number≥1` · `allocated_on/vacated_on` ·
  `status (ACTIVE,VACATED,PENDING)` · partial uniques: one ACTIVE per student, one ACTIVE per (room,bed) ·
  trigger `enforce_hostel_capacity()`.
- **`hostel_complaints`**: `student_id` · `room_id?` · `category (ELECTRICAL,PLUMBING,CLEANING,FURNITURE,INTERNET,OTHER)` ·
  `description≥5` · `status (OPEN,IN_PROGRESS,RESOLVED,CLOSED)` · `priority (LOW,MEDIUM,HIGH)` · `resolved_at`.
- **`hostel_room_change_requests`**: `student_id` · `current_room_id` · `requested_room_id?` · `reason≥5` ·
  `status (PENDING,APPROVED,REJECTED)` · `reviewed_by`.
- **`hostel_visitors`**: `student_id` · `visitor_name` · `relation` · `visit_date/time` ·
  `status (PENDING,APPROVED,REJECTED,COMPLETED)`.
- **`transport_drivers`**: `name` · `phone` · `license_no UNIQUE` · `active`.
- **`transport_vehicles`**: `registration_number UNIQUE` · `vehicle_type (BUS,MINIBUS,VAN)` ·
  `capacity 1–80` · `status (ACTIVE,MAINTENANCE,INACTIVE)` · `driver_id? FK SET NULL`.
- **`transport_routes`**: `route_code UNIQUE` · `name` · `active`.
- **`transport_route_stops`**: `route_id FK` · `name` · `sequence≥1` · `scheduled_time` · `active` · `UNIQUE(route,sequence)`.
- **`transport_assignments`**: `student_id` · `route_id` · `stop_id FK RESTRICT` · `vehicle_id?` ·
  `start_date/end_date` · `status (ACTIVE,ENDED)` · partial unique one ACTIVE per student ·
  trigger `enforce_assignment_stop_route()`.
- **`transport_passes`**: `student_id` · `assignment_id` · `pass_number UNIQUE` · `valid_from/until` ·
  `status (ACTIVE,EXPIRED,REVOKED)` · `CHECK valid_until>=valid_from`.
- **`transport_alerts`**: `route_id` · `title≥3` · `detail` · `severity (INFO,WARNING,CRITICAL)` · `active` · `created_by`.

### 012: certificates

- **`certificate_requests`**: `student_id` · `certificate_type (BONAFIDE,TRANSCRIPT,CONDUCT,ENROLLMENT)` ·
  `status (PENDING,APPROVED,REJECTED,ISSUED,REVOKED)` · `purpose ≤2000` · `rejection_reason?` ·
  `reviewed_by/at` · `issued_by/at` · `certificate_id? FK` · partial unique one PENDING per (student,type).
- **`certificates`**: `request_id UNIQUE FK` · `student_id` · `certificate_type` ·
  `certificate_number UNIQUE` · `verification_code UNIQUE` · `status (ISSUED,REVOKED)` · `issued_at` · `revoked_at` ·
  sequence `certificate_no_seq`.

### 013: library

- **`books`**: `title` · `subtitle` · `isbn UNIQUE` · `author` · `publisher` · `category` · `edition` ·
  `description` · `publication_year 1500–2100?` · `active` · GIN tsvector index on title.
- **`book_copies`**: `book_id FK` · `accession_number UNIQUE` · `location` ·
  `status (AVAILABLE,ISSUED,RESERVED,LOST,DAMAGED,MAINTENANCE)`.
- **`library_loans`**: `copy_id FK RESTRICT` · `student_id` · `issued_at` · `due_at DATE` · `returned_at?` ·
  `renewed_count≥0` · `status (ACTIVE,RETURNED)` · `issued_by/returned_by` · partial unique one ACTIVE per copy.
- **`library_reservations`**: `book_id` · `student_id` · `status (WAITING,READY,FULFILLED,CANCELLED,EXPIRED)` ·
  `requested_at` · `fulfilled_at?` · `cancelled_at?` · partial unique per (book,student) in WAITING/READY.

### 014: placements

- **`companies`**: `name` · `industry` · `company_type (PRODUCT,SERVICE,STARTUP,CONSULTING,GOVERNMENT,NON_PROFIT,OTHER)` ·
  website/location/description/contact_* · `active`.
- **`placement_drives`**: `company_id FK` · `title` · `job_role` · `description` · `package_min/max` ·
  `currency` · `employment_type (FULL_TIME,PART_TIME,INTERNSHIP,CONTRACT)` · `work_mode (ONSITE,REMOTE,HYBRID)` ·
  `location` · `openings≥1` · `application_deadline` · `drive_date?` · `min_cgpa?` · `max_backlogs?` ·
  `min_attendance?` · `eligible_departments TEXT[]` · `eligible_semesters INT[]` · `graduation_year?` ·
  `status (DRAFT,OPEN,CLOSED,CANCELLED,COMPLETED)` · `CHECK package_max>=package_min`.
- **`placement_applications`**: `drive_id` · `student_id` ·
  `status (APPLIED,SHORTLISTED,INTERVIEW,SELECTED,WAITLISTED,REJECTED,WITHDRAWN)` · `applied_at` · `withdrawn_at?` ·
  partial unique live (drive,student).
- **`placement_interviews`**: `application_id` · `round_name` · `round_number≥1` · `scheduled_at` ·
  `location` · `status (SCHEDULED,COMPLETED,CANCELLED,MISSED)` · `feedback`.
- **`placement_offers`**: `application_id` · `package_amount>0` · `currency` · `employment_type` ·
  `joining_date?` · `offer_status (PENDING,ACCEPTED,DECLINED,WITHDRAWN)` · `issued_at` ·
  partial unique live per application.

### 015: alumni

- **`alumni_profiles`**: `user_id UNIQUE FK` · `student_id?` · `graduation_year 1950–2100` ·
  program/department/company/position/industry/location · `bio ≤2000` · `linkedin_url/github_url` ·
  `offers_mentorship` · `mentorship_topics` · `mentorship_mode (ONLINE,ONSITE,BOTH)` · `availability ≤500` ·
  `visibility (PUBLIC,PRIVATE)` · `verification (UNVERIFIED,VERIFIED)` · `status (PENDING,ALUMNI,INACTIVE)` ·
  trigger `enforce_alumni_profile_role()`.
- **`alumni_mentorships`**: `alumni_id` · `student_id` · `topic` · `message ≤2000` ·
  `status (REQUESTED,ACCEPTED,REJECTED,COMPLETED,CANCELLED)` · `requested_at` · `accepted_at/completed_at?` ·
  partial unique live pair.
- **`alumni_events`**: `title` · `description` ·
  `event_type (MEET,CAREER_TALK,NETWORKING,GUEST_LECTURE,MENTORSHIP_SESSION,REUNION,INDUSTRY_PANEL,OTHER)` ·
  `location` · `starts_at/ends_at` · `capacity≥1` · `audience (ALL,STUDENTS,ALUMNI)` ·
  `status (DRAFT,PUBLISHED,CLOSED,CANCELLED,COMPLETED)`.
- **`alumni_event_registrations`**: `event_id` · `user_id` · `status (REGISTERED,CANCELLED,ATTENDED)` · `UNIQUE(event,user)`.
- **`alumni_campaigns`**: `title` · `description` · `target_amount≥0` · `status (DRAFT,ACTIVE,CLOSED)` · `start_date/end_date`.
- **`alumni_contributions`**: `campaign_id` · `alumni_id` · `amount>0` · `currency` ·
  `status (PLEDGED,RECORDED,CANCELLED)` · `reference`.

### 016: mess & canteen

- **`mess_plans`**: `name` · `description` · `billing_type (MONTHLY,WEEKLY,MEAL_BASED)` · `price≥0` ·
  `meals_per_day 1–6` · `active`.
- **`mess_enrollments`**: `student_id` · `plan_id RESTRICT` · `start_date/end_date` ·
  `status (ACTIVE,PAUSED,CANCELLED,EXPIRED)` · `auto_renew` · partial unique ACTIVE per student.
- **`mess_menu`**: `meal_date` · `meal_type (BREAKFAST,LUNCH,SNACKS,DINNER)` · `menu_description` ·
  `calories?` · `active` · `UNIQUE(meal_date,meal_type)`.
- **`meal_attendance`**: `student_id` · `meal_date` · `meal_type` · `consumed` · `recorded_by` · `UNIQUE(student,date,meal)`.
- **`canteen_items`**: `name` · `category (BEVERAGE,SNACK,MEAL,DESSERT,OTHER)` · `description` · `price≥0` · `available`.
- **`canteen_orders`**: `student_id` · `status (PENDING,CONFIRMED,READY,COMPLETED,CANCELLED)` ·
  `total_amount≥0` · `fee_id? FK` · `ordered_at` · `completed_at/cancelled_at?`.
- **`canteen_order_items`**: `order_id` · `item_id RESTRICT` · `quantity 1–50` · `unit_price` · `total_price`
  (prices snapshotted at order time; table has `created_at` only).
- **`mess_feedback`**: `student_id` · `meal_date` · `meal_type` · `rating 1–5` · `comment ≤1000`.

### 017: transport telemetry (Phase 15)

- **`transport_vehicle_telemetry`**: `vehicle_id FK` · `latitude/longitude DOUBLE` (paired by CHECK,
  range-checked) · `speed_kmh≥0` · `heading_deg 0–359` · `stop_sequence≥1` · `recorded_at` ·
  `source (MANUAL,SIMULATED,DEVICE) DEFAULT SIMULATED`.
- **`transport_route_progress`**: `vehicle_id` · `route_id` · `current_stop_id?/next_stop_id?` ·
  `progress_pct 0–100` · `tracking_status (MOVING,IDLE,OFFLINE) DEFAULT IDLE` · `recorded_at`.

### 018: registration, approval and account help

- **`users`** (altered): `+ status TEXT NOT NULL DEFAULT 'ACTIVE'` with
  `CHECK (status IN ('PENDING','ACTIVE','REJECTED','SUSPENDED'))` · `+ phone TEXT`.
  Indexes: `idx_users_status`, `idx_users_role_status`.
- **`registrations`**: `id` · `user_id UNIQUE FK→users CASCADE` · `requested_role
  (STUDENT,FACULTY,ADMIN)` · `status (REGISTRATION_STARTED,PENDING_APPROVAL,APPROVED,REJECTED)
  DEFAULT PENDING_APPROVAL` · `submission JSONB` (submitted profile info; never the password,
  confirmation or verification code) · `rejection_reason?` · `reviewed_by FK→users SET NULL` ·
  `reviewed_at?` · timestamps + `trg_registrations_updated_at`.
  Indexes on `status`, `requested_role`, `created_at DESC`, `(status, created_at DESC)`.
- **`password_help_requests`**: `id` · `user_id? FK→users SET NULL` · `email` ·
  `requester_role?` · `contact?` · `message` · `status (OPEN,IN_PROGRESS,RESOLVED,REJECTED)
  DEFAULT OPEN` · `admin_notes?` · `handled_by? FK→users` · `handled_at?` · timestamps.
  Indexes on `status`, `created_at DESC`, `lower(email)`.
- **`password_reset_tokens`**: `id` · `user_id FK→users CASCADE` · `request_id? FK→password_help_requests`
  · `token_hash UNIQUE` (SHA-256; the raw token is shown once and never stored) ·
  `expires_at` · `used_at?` · `created_by?`. Indexes on `expires_at`, `user_id`.

**Cross-cutting:** every table except `enrollments`, `canteen_order_items`, `mess_feedback` has
`updated_at` + a `trg_*_updated_at` trigger via `set_updated_at()`. Money is `NUMERIC(12,2)`; dates
leaving the API go through `utils/date.ts#toLocalDateString` (local midnight, avoids UTC off-by-one).

---

## 11. Backend internals

### config/
- `env.ts` — dotenv load of `backend/.env`, fail-fast on `DATABASE_URL`/`JWT_SECRET`, exports typed `env` (see §6).
- `db.ts` — `pg` Pool (max 10, idle 30s) + `query<T>` / `queryOne<T>` / `withTransaction(fn)` (BEGIN/COMMIT/ROLLBACK) / `pingDatabase()`.

### middleware/
- `authenticate.ts` — `requireAuth` (Bearer extract → `verifyToken` → **reload user row from PG** → `req.user {id,name,email,role}`); `requireRole(...roles)` → 403.
- `validate.ts` — `validate(schema, "body"|"query"|"params")`; `safeParse`; replaces `req.body` with parsed data, query → `req.validatedQuery`.
- `errorHandler.ts` — `notFoundHandler` (404 with method+path) and mapper:
  ZodError→400 `VALIDATION_ERROR` · ApiError→its status/code · JSON parse→400 `INVALID_JSON` ·
  body-parser 413 `PAYLOAD_TOO_LARGE` · PG 23505→409, 23503→409, 22*/23*→400 · else 500 (masked in production).

### utils/
- `ApiError.ts` — class with factories `badRequest/unauthorized/forbidden/notFound/conflict` (400/401/403/404/409).
- `response.ts` — `sendSuccess(res, data, message="OK", status=200)` / `sendError(res, status, code, message, details?)`.
- `asyncHandler.ts` — promise wrapper forwarding rejections to next().
- `jwt.ts` — `signToken({sub,role,email})` issuer `smartcampus-ai`; `verifyToken` validates issuer + shape.
- `password.ts` — bcryptjs hash/compare with `env.bcryptRounds`.
- `date.ts` — `WEEKDAYS`, `toDateString()`, `currentWeekday()`, `toLocalDateString()`, `addDays(n)`.
- `roles.ts` — `ROLES` (6) / `ACTIVE_ROLES` (3) / `isActiveRole()`.
- `types/express.d.ts` — augments `Request.user`.

### scripts/
- `migrate.ts` — sorted `database/migrations/*.sql`, tracked in `schema_migrations`, each in a transaction.
- `seed.ts` (1453 lines) — runs migrate first, truncates ~60 tables `RESTART IDENTITY CASCADE`, rebuilds all demo data deterministically (see §7), prints summary + dev invite token.
- `reset-db.ts` — drop/create schema + migrate; requires `--yes`.

### app.ts / server.ts
- `createApp()`: disable `x-powered-by` · CORS (comma list, credentials false) · `express.json({limit:"100kb"})` · timing logger · mount `/api` · notFound · errorHandler.
- `server.ts`: listen, log port+CORS, graceful SIGINT/SIGTERM shutdown.

### AI module internals
- `ai.service.ask` pipeline: **(1)** deterministic intent routing (regex, no model) → **(2)** `retrieve(actor, route)` via allowlisted read-only tools (existing services only) → **(3)** system prompt with grounding rules + minimized context (no ids/credentials) → **(4)** provider completion → **(5)** `{ answer, intent, sources, context, provider }`.
- `ai.provider.ts` — `AiProvider` interface; `OpenAiProvider` (12s AbortController, maxTokens 400);
  `MockProvider` (deterministic); `createProvider()`: `auto` = OpenAI iff `OPENAI_API_KEY` set, else mock.
- Tool matrix: attendance/fees/timetable/next-class per role; faculty refused for fees; admin refused for per-class attendance; injection/secret/out-of-scope → fixed refusal (GENERAL intent, empty sources).
- Rate limit keyed on authenticated `user.id`.

---

## 12. Frontend internals

### Guards & session
- No `middleware.ts` — all auth is client-side: `AuthProvider` (session from `GET /auth/me`, listens for
  `smartcampus:unauthorized`, revalidates on `pageshow` bfcache) → `AuthGuard` in `(app)/layout.tsx`
  (anonymous → `/login`) → per-page `RoleGuard` (wrong role → `router.replace(roleHome(role))`).
- Logout uses hard `window.location.replace("/login")` to defeat router back-cache.

### Route map (40 pages)

**Public:** `/` (role redirect) · `/login` · `/register` (role-picker + wizard) ·
`/forgot-password` (account-help request) · `/reset-password?token=` (single-use reset) ·
`/parent/activate` · `/verify/[verificationCode]`.

**Registration UX** (`components/auth/register-wizard.tsx`): pick Student / Teacher / Administrator
→ credentials (password checklist + show/hide + confirmation) → *verification* step for faculty and
admin only (students skip it) → personal/profile details mapped to the real schema columns →
review → submit. Progress indicator, Back/Next, per-field errors and a pending-confirmation screen
that links back to `/login`. The verification codes are never present in the bundle — the step only
asks for one, and the server decides.

**Student (STUDENT):** `/dashboard` (CommandCenter) · `/attendance` · `/fees` · `/timetable` ·
`/performance` (ML prediction UI) · `/recommendations` · `/hostel` · `/transport` · `/certificates` ·
`/mess` (tabs: mess/canteen/feedback).

**Shared multi-role:** `/ai` (STUDENT|FACULTY|ADMIN|PARENT) · `/library` (STUDENT|FACULTY) ·
`/placements` (STUDENT|FACULTY) · `/profile` (STUDENT|FACULTY|ADMIN|PARENT).

**Faculty (FACULTY):** `/faculty` (AttendanceManager home) · `/faculty/timetable` ·
`/faculty/risk` · `/faculty/risk/[studentId]`.

**Admin (ADMIN):** `/admin` (FeeManagement home) · `/admin/timetable` · `/admin/risk` ·
`/admin/risk/[studentId]` · `/admin/parents` · `/admin/hostel` · `/admin/transport` ·
`/admin/library` · `/admin/certificates` · `/admin/mess` · `/admin/placements` · `/admin/alumni`.

**Super Admin (SUPER_ADMIN):** `/super-admin` — three sections:
*Registration requests* (All/Pending/Approved/Rejected filters, view detail, approve, reject with a
reason), *Password assistance* (open a request, mark in progress, resolve, reject, add notes, issue
a single-use reset link shown once), *User management* (list/search, suspend, reactivate, with the
current session and other SUPER_ADMINs protected from the UI). Approval widens the list filter to
`ALL` so the reviewer sees the resulting state.

**Parent (PARENT):** `/parent` (ParentDashboard, read-only).

**Alumni:** `/alumni` (directory: STUDENT|FACULTY|ALUMNI) · `/alumni/profile` (ALUMNI) ·
`/alumni/mentorship` (STUDENT|ALUMNI) · `/alumni/events` (STUDENT|FACULTY|ALUMNI) ·
`/alumni/campaigns` (STUDENT|ALUMNI).

Role homes (`lib/format.ts#roleHome`): FACULTY→`/faculty`, ADMIN→`/admin`, PARENT→`/parent`,
ALUMNI→`/alumni`, SUPER_ADMIN→`/super-admin`, default→`/dashboard`.

**SUPER_ADMIN inheritance (both layers):** `requireRole(...)` lets a `SUPER_ADMIN` through whenever
`ADMIN` is in the accepted list, and `RoleGuard` applies the same rule in the UI, so SUPER_ADMIN
reaches every admin surface without editing 15 route registrations or 15 nav entries. A
`requireRole("SUPER_ADMIN")` router stays SUPER_ADMIN-only — a normal ADMIN is refused there.

### Shell & design system
- One dark `AppShell` for all roles: grouped role-aware sidebar (`nav-config.ts` — groups Home,
  Academics, AI & Insights, Finance, Campus, Career, People, Profile), sticky header, ⌘K command
  palette (same role-filtered nav list, longest-href active matching), account menu, off-canvas
  mobile drawer (hidden from tab order when closed).
- Stylesheets are **generated** from a prototype outside the repo:
  - `styles/app-shell.css` ← `scripts/scope-command-center-css.mjs` (shell rules)
  - `styles/command-center.css` ← same script (student dashboard, re-anchored under `.command-center-surface`)
  - `styles/theme-dark.css` ← `scripts/build-dark-theme.mjs` (shadcn tokens re-pointed at dark palette + re-maps raw light Tailwind shades)
  - hand-written: `*-overrides.css` (never regenerated)
  - Regenerate: `npm run build:styles` (`PROTOTYPE_ROOT` overrides prototype location).
- Nav is generated from real route guards, so the sidebar can never offer a bouncing link.

### API layer
- `lib/api.ts` — the **only** fetch call site: base `NEXT_PUBLIC_API_URL ?? http://localhost:4000` +
  `/api`; Bearer from token store; `cache: "no-store"`; optional AbortController timeout; unwraps the
  envelope and returns `data`; throws `ApiError {status, code, message, details}` (`TIMEOUT`,
  `NETWORK_ERROR`, `INVALID_RESPONSE` included); on 401 → clearToken + `smartcampus:unauthorized`.
- `lib/auth.ts` — localStorage key `smartcampus_token`.
- `hooks/use-api.ts` — `useApi<T>(path|null)` → `{ data, loading, error, reload }`; identity-based
  re-arm on path change; stale-response discarding.
- `lib/types.ts` (~29KB) — every DTO. `lib/format.ts` — currency (INR en-IN), dates/times, tones,
  `roleHome`, `toISODate`, status→class maps.

---

## 13. ML service (Phase 5)

### Flow
```
Browser (STUDENT) → GET /api/performance/predict
  → Express: requireAuth + requireRole("STUDENT"); identity from JWT only
  → resolve students.id → build 44-feature vector (3 aggregate queries, no N+1)
  → POST {ML_SERVICE_URL}/predict (AbortController, ML_TIMEOUT_MS=5000)
       valid → zod-validate → prediction_source: "ML"
       unreachable/timeout/5xx/malformed → prediction_source: "RULE_BASED" + fallback_reason
  → 200 always (degradation is not an error) → UI shows source badge
```
The browser **never** contacts :8001; ML service has no credentials and no DB access.

### Inference API (`ml/inference/main.py`)
- `POST /predict` — `{ features: { <44 names> } }` (all required; extras ignored; missing → 400;
  non-numeric/empty → 422; pipeline failure → 500 generic; no model → 503).
  Response: `{ category, confidence, probabilities, model_version: "v1", features_used,
  model_loaded, feature_count, predicted_at, model_trained_at }`.
- `GET /health` → status/loaded/version/feature count/class list. `GET /model/info` → training metadata.

### Feature contract (44 features, fixed order)
Authoritative list: `backend/src/modules/performance/performance.features.ts` (`ML_FEATURE_NAMES`),
verified against model metadata (`npm run test:feature-parity`).

| # | Features |
|---|---|
| 0–1 | `attendance_percentage`, `total_classes` |
| 2–3 | `avg_assessment_percentage`, `total_assessments` |
| 4–6 | `assignment_submission_rate`, `total_assignments`, `avg_assignment_score` (**0–10 scale**) |
| 7 | `academic_score` = `0.30·attendance + 0.50·avg_assessment + 0.20·(rate/100 · score·10)`, clamped 0–100 |
| 8–13 | `attendance_<CODE>` per course (CS301, CS305, CS311, CS315, CS321, MA201) |
| 14–19 | `assessment_<CODE>` per course |
| 20–31 | `assign_sub_<CODE>`, `assign_score_<CODE>` per course |
| 32–43 | `assess_<TYPE>_avg/count` for QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT |

Semantics: `LEAVE` counts against attendance; NULL scores ignored; untouched course → `0.0`;
whole history (no date window); Python re-orders by artifact's own `feature_names` — missing feature
is a 400, never a silent zero.

### Model
- RandomForestClassifier, joblib at `ml/models/performance_model.joblib` (committed ~170KB).
- **Classes: `AT_RISK`, `EXCELLENT`, `GOOD`** — `AVERAGE` had zero training examples and can never be emitted.
- Trained on **6 synthetic students**; reported accuracy/f1 = 1.0 is training-set only. Demo artifact.
- Class imbalance: 3 EXCELLENT, 1 GOOD, 2 AT_RISK (`class_weight="balanced"`).
- Retrain: `ml/training/train.py` — must update `ML_FEATURE_NAMES` in the same change or parity tests fail.

### Fallback modes (`prediction_source: "RULE_BASED"`, still HTTP 200)
| `fallback_reason` | Trigger |
|---|---|
| `ML_DISABLED` | `ML_SERVICE_URL` blank |
| `ML_UNREACHABLE` | connection refused / DNS failure |
| `ML_TIMEOUT` | no answer within `ML_TIMEOUT_MS` |
| `ML_BAD_STATUS` | non-2xx |
| `ML_INVALID_RESPONSE` | bad schema, `model_loaded:false`, confidence outside 0–1, category absent from its own probability map |

Fallback is versioned `rule-based-v1`; its confidence is a band distance, never presented as model
confidence. UI always shows the source badge ("ML model · v1" vs "Rule-based fallback").

### Tests
`cd ml && python -m pytest` (33) · `npm run test:feature-parity` · `npm run test:ml` (61) ·
`E2E_ML_EXPECTED_SOURCE=RULE_BASED npm run test:e2e:phase5` (degraded path).

---

## 14. Key domain workflows

1. **Attendance:** faculty picks class → roster for date → `POST /attendance` batch →
   transaction; roster recomputed from enrollments; unknown/duplicate students rejected;
   `ON CONFLICT (student,course,date) DO UPDATE` (idempotent, `isUpdate:true`); `recorded_by`
   preserved via COALESCE; student summaries recompute on next fetch.
2. **Fee payment:** `SELECT … FOR UPDATE` on fee row → overpay check → insert immutable `fee_payments`
   → update `fees.amount_paid/status` (PENDING/PARTIAL/PAID) → commit.
3. **Timetable:** advisory-locked write transaction → validate course/faculty/section-has-students →
   derive semester/department from course → conflict scan (FACULTY/ROOM/SECTION vs active rows;
   edit excludes self) → 409 `TIMETABLE_CONFLICT {conflictTypes}` or write. Archive default;
   hard delete only with zero attendance history; identical-to-archived create revives the row.
4. **AI ask:** auth → role → Zod → 30/min rate → intent regex → allowlisted service tools →
   grounded context → provider → `{answer,intent,sources}`.
5. **Recommendations:** thresholds (attendance <70, assessment <60, assignment <65); priority
   HIGH/MEDIUM/LOW from weakness count + distance; resources filtered by course/topic/difficulty,
   LIMIT 3/2/1; categories COURSE_WEAKNESS…REMEDIAL_SUPPORT.
6. **Risk:** trends = last 21d/30d vs prior; deterministic score 0–100 (not probability);
   ≥70 CRITICAL ≥50 HIGH ≥30 MODERATE else LOW; daily `risk_snapshots` backfilled on demand;
   advisory only — never blocks/disciplines.
7. **Parent portal:** invitation (SHA-256 token, single-use) → activation → ACTIVE link →
   link-checked reads reusing student services; payment internals and risk notes excluded by construction.
8. **Hostel/transport:** partial unique indexes enforce one ACTIVE bed/assignment;
   allocate/transfer/approve in transactions with `FOR UPDATE`; hostel & transport fees are ordinary
   `fees` rows (`fee_type` prefix) — no second ledger; passes auto-generated with assignments.
9. **Certificates:** row-locked state machine; atomic issuance (number + code + row + request update);
   stateless deterministic PDF (pdfkit + QR → `/verify/<code>`); public verify returns masked fields only.
10. **Library:** FIFO reservations by `requested_at`; one ACTIVE loan per copy; renewals blocked while
    others wait or when overdue; return promotes longest waiter; overdue derived live; fine
    upserted once per loan into `fees` (₹10/day, ₹500 cap); policy constants centralized in `library.service.ts`.
11. **Mess/canteen:** one ACTIVE enrollment; order prices snapshotted; monthly billing sweep recomputes
    `Mess Plan - YYYY-MM` / `Canteen - YYYY-MM` rows idempotently (partial uniques guard duplicates).
12. **Telemetry:** ADMIN-only ingestion; DB CHECKs on coordinates; `MOVING`/`IDLE`/`OFFLINE` from
    latest point age (15 min) + speed; progress = clamped `currentSequence/lastSequence` (null, never
    guessed); "Demo tracking" badges everywhere.

---

## 15. Testing

### Backend
```bash
cd backend
npm run typecheck && npm run build
npm run test:api               # 487 assertions; API must be running; mutates DB
npm run test:registration      # 85 assertions: registration, approval, codes, password help
npm run test:feature-parity    # SQL vector == Python vector
```

### ML
```bash
cd ml && python -m pytest       # 33 tests
```

### Frontend static
```bash
cd frontend
npx tsc --noEmit && npm run lint && npm run build
```

### E2E (needs Postgres + API + frontend running; system Chrome; seeds first unless `E2E_SKIP_SEED=1`)
```bash
cd frontend
npm run test:e2e:auth          # 55: login, session, guards, logout, back button
npm run test:e2e:registration # 48: register -> pending -> approve -> sign in, codes, help, responsive
npm run test:e2e               # phase 1 (26)
npm run test:e2e:phase2        # attendance + payments (48)
npm run test:e2e:phase3        # timetable (52)
npm run test:e2e:phase4        # AI chat (43)
npm run test:e2e:phase5        # ML prediction (48)  [E2E_ML_EXPECTED_SOURCE=RULE_BASED for fallback]
npm run test:e2e:phase6        # recommendations (57)
npm run test:e2e:phase7        # risk (37)
npm run test:e2e:phase8        # parent portal (29)
npm run test:e2e:phase9        # hostel + transport (37)
npm run test:e2e:phase10       # certificates (27)
npm run test:e2e:phase11       # library (23)
npm run test:e2e:phase12       # placements (141)
npm run test:e2e:phase13       # alumni (28)
npm run test:e2e:phase14       # mess (22)
npm run test:e2e:phase15       # tracking (29)
```

### Probes
```bash
npm run build:styles    # regenerate design layer (self-verifying, fails on leak)
npm run probe:shell     # 90 assertions: roles, nav, drawer, palette, all routes
npm run probe:visual    # screenshots + light-container/overflow audit
npm run probe:a11y      # reduced-motion + focus-ring checks
```

---

## 16. Honest limitations & gotchas

**Product limitations (from README/docs):**
- ML model trained on 6 synthetic students — demo only, not for real academic decisions; no `AVERAGE` class.
- Transport "live tracking" is staff-reported/simulated telemetry, not GPS — UI says "Demo tracking".
- Sessions in `localStorage` (XSS-explainable); httpOnly cookies, refresh tokens, helmet, global rate
  limiting are deferred hardening items (only `/ai/ask` and cert-verify are throttled).
- Payments are an internal ledger — no gateway, no refunds/reversals.
- Individual pages aren't redesigned yet — shell + token layer changed how pages are painted, not their layout
  (roadmap: "Frontend 2.0").
- Generated stylesheets depend on a prototype outside the repo (`PROTOTYPE_ROOT`); the committed
  generated files are the source of truth.
- `docs/API.md` is **stale for Phase 12 (placements)** — module implemented but undocumented there.
- Not implemented (explicit): blockchain certificates, biometric/QR attendance, email/SMS automation,
  grade entry, bulk fee generation.

**This-copy gotchas (found while running it):**
- `.env.example` files are missing — create `backend/.env` and `frontend/.env.local` manually (§5).
- Stale Docker containers named `smartcampus-pg` / `smartcampus-ml-service` blocked compose — renamed
  to `*-old` (data preserved). Remove them when no longer needed: `docker rm smartcampus-pg-old smartcampus-ml-service-old`.
- Stray `package-lock.json` one level above the project makes Next infer a wrong workspace root (warning only).
- npm allow-scripts blocks esbuild's postinstall (warning); `tsx` verified working regardless.
- `seed` is destructive — never run it against data you care about.
- E2E/mutation tests mutate the DB — re-run `npm run seed` afterwards for a clean demo state.
- `GET /api/students` (if called) is student-scoped, not an admin list — admin-facing student data
  comes through module-specific endpoints; a 403 there is expected behavior, not a bug.
- Sign-in route is `/login` (not `/signin`).

---

## 17. Documentation map

| Document | Covers |
|---|---|
| `README.md` | quick start, the registration/approval model, env vars, layout, test commands |
| `docs/API.md` | full API reference (⚠ placements missing) |
| `docs/ARCHITECTURE.md` | request lifecycle, auth model, permission matrix, workflows, security baseline |
| `docs/ML_ARCHITECTURE.md` | 44-feature contract, Express→FastAPI flow, fallback modes, limitations |
| `docs/UI_DESIGN_SYSTEM.md` | tokens, shell classes, spacing, transitions, rules |
| `docs/FRONTEND_INTEGRATION_REPORT.md` | prototype integration + global AppShell |
| `docs/RUNTIME_INTEGRATION_REPORT.md` | runtime wiring report |
| `docs/PHASE2–15_REPORT.md` | per-phase scope, decisions, assertion counts |
| `frontend/AGENTS.md` / `CLAUDE.md` | Next.js 16 agent rules (breaking changes vs older Next; read `node_modules/next/dist/docs/` before writing Next code) |
| `soul.md` | this file — the single full-detail reference |
