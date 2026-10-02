# SmartCampus — Frontend/Backend Runtime Integration Report

## Environment

| Layer | Detail |
| --- | --- |
| Repository | `C:\test\tt\smartcampus` (git remote `https://github.com/lords-coder/SmartCampus`, `main` @ `9871292`) |
| Frontend | Next.js **16.3.7** (Turbopack), React 19.2.8 — `http://localhost:3000` |
| Backend | Express **5.1.0** on Node 24, run through `tsx watch` — `http://localhost:4000` |
| Database | PostgreSQL **16** in Docker (`smartcampus-pg`), `smartcampus@localhost:5432/smartcampus` |
| ML | FastAPI + uvicorn in Docker (`smartcampus-ml-service`) — `http://localhost:8001`, model `RandomForestClassifier` v1 |
| Browser | System Chrome via `puppeteer-core` (the same harness the E2E suites use) |

Configuration source of truth is `.env.example` (backend) and `frontend/.env.example`.
`backend/.env` currently sets only `NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN,
FRONTEND_URL, BCRYPT_ROUNDS`; `ML_SERVICE_URL` and `ML_TIMEOUT_MS` are absent and therefore fall
back to the development defaults in `backend/src/config/env.ts` (`http://localhost:8001`,
`5000 ms`). `frontend/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:4000`. No real
secrets are committed.

---

## Startup

Exact commands used, in order:

```bash
# 1. Database (migration + seed from empty schema)
cd C:\test\tt\smartcampus\backend
npm run db:reset -- --yes     # DROP SCHEMA public CASCADE + apply migrations 001-017
npm run migrate               # idempotent -> "[migrate] database is up to date"
npm run seed                  # 18 users, 6 courses, 30 timetable rows, 540 attendance rows, ...

# 2. ML service
cd C:\test\tt\smartcampus
docker compose up -d --no-deps ml-service      # (see "Remaining issues" for the bare form)

# 3. Backend
cd C:\test\tt\smartcampus\backend && npm run dev          # http://localhost:4000

# 4. Frontend
cd C:\test\tt\smartcampus\frontend && npm run dev         # http://localhost:3000
```

Verification at startup:

| Check | Result |
| --- | --- |
| `GET /api/health` | `200 {"status":"ok","database":"up"}` |
| `GET :8001/health` | `200 {"status":"healthy","model_loaded":true,"model_version":"v1"}` |
| `GET :8001/model/info` | `200` RandomForestClassifier, 44 features, 200 estimators |
| `GET /login` | `200`, 18 568 bytes |
| Migrations 001–017 | **all 17 applied from scratch**, no errors |
| Re-run `npm run migrate` | `database is up to date` (idempotent) |
| Seed | `users=18 courses=6 timetable=30 fees=23 payments=12 assessments=122 …` |
| Demo accounts | **18/18 present** across all five roles |
| FK integrity | programmatic check over **all 90 foreign keys → `NONE`** |

Final runtime topology, confirmed by capture of every network request the browser makes:

```
Browser  →  Next.js :3000  →  Express :4000  →  PostgreSQL :5432
                                 └──────────→  FastAPI :8001  →  performance_model.joblib
```

- `browser → :8001` requests across **195 route loads: 0**
- references to port `8001` anywhere in `frontend/src`: **0**
- duplicate `/api/api/...` prefix: **0**
- requests to non-localhost hosts: **0** (the only non-http URL seen was an inline `data:image/svg+xml` URI)
- missing `Authorization` header on an authenticated API call: **0**

---

## Authentication

Driven through the real login form against the real backend. 55/55 in `test:e2e:auth`.

| # | Check | Result |
| --- | --- | --- |
| 1 | Login page loads, exposes `#email`/`#password` | PASS |
| 2 | Valid credentials reach the real backend (`POST /api/auth/login → 200`) | PASS |
| 3 | Backend returns the real envelope (`{success,data:{token,user}}`) | PASS |
| 4 | Frontend stores the session (`localStorage.smartcampus_token` only) | PASS |
| 5 | `/auth/me` resolves the profile (`persisted token authorizes a protected API call :: status=200 attendance=97.8`) | PASS |
| 6 | Role detected and surfaced in the shell (`STUDENT`/`FACULTY`/`ADMIN`/`PARENT`/`ALUMNI` badges) | PASS |
| 7 | Correct dashboard opens for each role (`/dashboard`, `/faculty`, `/admin`, `/parent`, `/alumni`) | PASS |
| 8 | Protected APIs receive the bearer token | PASS |
| 9 | Refresh preserves the session (`session survives a full page reload`) | PASS |
| 10 | Logout works (drives the real shell "Sign out" control → `POST /auth/logout`) | PASS |
| 11 | Protected pages redirect after logout (7 routes checked) | PASS |
| 12 | Switching accounts retains no prior account data (student → admin → student) | PASS |

Additional auth checks: invalid credentials show `Invalid email or password` and store no token;
a tampered token is rejected, explained (`/expired|sign in again/`) and cleared; the browser **back**
button does not re-expose the authenticated dashboard; no raw JWT appears in the DOM; no ML URL or
secret is inlined in the page.

Accounts exercised: **STUDENT** (`aarav.sharma`), **FACULTY** (`ananya.sharma`), **ADMIN**
(`admin@smartcampus.edu`), **PARENT** (`farah.khan`), **ALUMNI** (`arjun.menon`), plus `ravi.sharma`
and `kavitha.verma` as the second and unlinked parents for the scoping test.

---

## Role Verification

### Backend is authoritative (not just frontend hiding)

Role × endpoint matrix, `200` only where permitted, `403` everywhere else:

| Endpoint | STUDENT | FACULTY | ADMIN | PARENT | ALUMNI |
| --- | --- | --- | --- | --- | --- |
| `GET /admin/transport/vehicles` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/placements/companies` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/mess/plans` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/parents` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/certificates/requests` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/library/loans` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/alumni/profiles` | 403 | 403 | **200** | 403 | 403 |
| `GET /admin/hostel/allocations` | 403 | 403 | **200** | 403 | 403 |
| `GET /risk/students` | 403 | **200** | **200** | 403 | 403 |
| `GET /students/me/attendance-summary` | **200** | 403 | 403 | 403 | 403 |
| `GET /students/me/fees-summary` | **200** | 403 | 403 | 403 | 403 |
| `GET /performance/predict` | **200** | 403 | 403 | 403 | 403 |
| `GET /parent/students` | 403 | 403 | 403 | **200** | 403 |
| `GET /alumni/directory` | **200** | **200** | **200** | 403 | **200** |

Frontend-only gates were also exercised: student/faculty/parent/alumni are each bounced off `/admin`
to their own home; a student token called directly against `GET /api/admin/placements/companies`
from inside the browser returns **403**.

### Parent scoping (linked students only)

`parent_student_links`: farah → aarav + diya, ravi → aarav (two guardians of one child, legitimate),
kavitha → rohan.

| Caller → aarav's record | Result |
| --- | --- |
| farah (guardian) | **200** |
| ravi (guardian) | **200** — correct, both are linked to aarav |
| **kavitha (unlinked)** | **404** on `overview`, `attendance`, `fees`, `transport`, `mess`, `placements` |
| student self | 403 |
| admin | 403 |
| random UUID as parent | **404** (no existence leak) |

An unlinked parent never sees data and never learns whether the record exists.

---

## API Integration

Static audit of the full call graph before touching anything:

- **83** `api<T>(...)` call sites, **117** `useApi<T>(...)` call sites, **1** raw `fetch`
  (`components/certificates/student-certificates.tsx:35`) — total **201** frontend API call sites
- **221** backend routes (220 module registrations + `/api/health`)
- **86 distinct static path literals** all resolve to a registered backend route; ~55 dynamic
  template paths checked individually

**No critical or MAJOR contract breaks.** Specifically checked and clean: path typos, nonexistent
endpoints, wrong HTTP methods, camelCase/snake_case body mismatches, response field mismatches,
`/api/api/...` double prefixes, missing bearer headers, hardcoded absolute URLs, mock/fake service
functions.

Every error response was read through a real HTTP client (not a shell wrapper) and none leak
internals:

| Case | Status | Body |
| --- | --- | --- |
| Unknown route | 404 | `NOT_FOUND` "Route GET /api/definitely-not-a-route not found" |
| Student → admin endpoint | 403 | `FORBIDDEN` "Role STUDENT is not allowed to access this resource" |
| No token | 401 | `UNAUTHORIZED` "Missing access token" |
| Malformed token | 401 | `INVALID_TOKEN` "Invalid or expired token" |
| Empty body to `/ai/ask` | 400 | `VALIDATION_ERROR` + `details[0].path="message"` |
| Non-string `message` | 400 | `VALIDATION_ERROR` "Message must be a string" |
| Malformed JSON | 400 | `INVALID_JSON` "Request body must be valid JSON" |
| Body > 100 KB | **413** | `PAYLOAD_TOO_LARGE` "Request body is too large" *(after fix)* |

Scan for stack traces, SQL, filesystem paths, `Traceback` and Python internals across all of the
above: **none found**.

---

## ML Integration

### Chain with the model available

```
Browser → GET /api/performance/predict → Express → feature engineering (44 features)
        → POST :8001/predict → RandomForest → Express → frontend card
```

```
predict HTTP status     : 200
  category              : EXCELLENT
  confidence            : 0.755
  probabilities         : {"AT_RISK":0.035,"EXCELLENT":0.755,"GOOD":0.21}
  model_version         : v1
  prediction_source     : ML
  is_model_prediction   : true
  MISSING FIELDS        : none
```

All six fields currently defined by the API are present. The dashboard card renders
`ML model · v1` and `Confidence: 76% · trained model v1`.

- browser → `:8001` requests during the session: **0**
- a second student returned a distinct prediction (`source=ML`), and supplying another student's
  id could not redirect the prediction (zero/other profile ids are ignored — the JWT decides)

### Fallback with the ML service stopped

ML was killed mid-session, confirmed down, then the page reloaded:

```
predict status           : 200
  prediction_source     : RULE_BASED
  is_model_prediction   : false
  model_version         : rule-based-v1
  category              : EXCELLENT
  fallback reason       : ML_UNREACHABLE
FALLBACK CORRECT        : YES
browser -> :8001 calls  : 0
UI shows a fallback hint: yes  ("ML degraded · Rule-based fallback", "Rule-based fallback · threshold")
```

No fake ML result is shown: `is_model_prediction` is `false`, the model version is explicitly
`rule-based-v1`, and the UI badge changes. ML was then restarted and `npm run test:ml` re-passed
**61/61 against the Dockerized service**.

Degradation modes covered by `test:ml` (61 assertions) include: service down, timeout, malformed
response, missing `model_version`, confidence out of range, category missing from probabilities —
each degrades to `RULE_BASED` with a `reason` and leaks no service internals. Authorization:
anonymous `401`, faculty `403`, admin `403`.

---

## Browser Verification

### Route matrix — every route × every role

**39 frontend page routes × 5 roles = 195 navigations**, all in a real browser.

| Metric | Result |
| --- | --- |
| Navigations | 195 |
| AppShell rendered | **185 / 185 expected** (the other 10 are `/parent/activate` and `/verify/[code]` × 5 roles — intentionally public, outside the shell) |
| Uncaught page errors | **0** |
| Console errors | **2** — both the browser's own "403/404" resource notices on risk detail; the app rendered a correct error state |
| Direct browser → ML calls | **0** |
| `/api/api` double prefix | **0** |
| Missing `Authorization` header | **0** |
| Request loops (same call > 4× per page load) | **0** |
| External hosts | **0** (inline `data:image/svg+xml` URI only) |
| Evaluation failures | **0** |

### Route count (source of truth)

`next build` reports **40 route rows**:

- **39** `page.tsx` files under `src/app`
- `/_not-found` (Next built-in)

The previously reported **43 routes is not reproducible** from the current source
(39 pages + 2 layouts = 41; build table = 40). All **39** page routes were visited and verified.

Note: there is **no `/performance` route**. The performance prediction is rendered by
`components/command-center/command-center.tsx:76` on `/dashboard` (`GET /api/performance/predict`).

---

## E2E

All **16** suites, full re-run after the fixes. No suite deleted, skipped or weakened.

| Suite | Result |
| --- | --- |
| `test:e2e:auth` | **55 / 55** |
| `test:e2e` (Phase 1) | **26 / 26** |
| `test:e2e:phase2` | **48 / 48** |
| `test:e2e:phase3` | **52 / 52** |
| `test:e2e:phase4` | **43 / 43** |
| `test:e2e:phase5` | **48 / 48** |
| `test:e2e:phase6` | **57 / 57** |
| `test:e2e:phase7` | **37 / 37** |
| `test:e2e:phase8` | **29 / 29** |
| `test:e2e:phase9` | **37 / 37** |
| `test:e2e:phase10` | **27 / 27** |
| `test:e2e:phase11` | **23 / 23** |
| `test:e2e:phase12` | **141 / 141** |
| `test:e2e:phase13` | **28 / 28** |
| `test:e2e:phase14` | **22 / 22** |
| `test:e2e:phase15` | **29 / 29** |
| **TOTAL** | **702 / 702** — every suite `exit=0` |

---

## API Tests

Run against fresh data in the required order `reset → migrate → seed → tests`:

```
npm run db:reset -- --yes
npm run migrate
npm run seed
npm run test:api
----------------------------------------
PASSED: 488   FAILED: 0
```

Re-run once more after the `errorHandler` fix: **488 / 488**.

---

## ML Tests

| Suite | Result |
| --- | --- |
| `npm run test:ml` (backend → FastAPI) | **61 / 61** — against the Dockerized ML service |
| `npm run test:feature-parity` | **7 students × 44 features — feature parity OK** |
| `cd ml && python -m pytest` | **33 passed** (16 warnings, all `sklearn` feature-name warnings) |
| ML `/health` | `200 healthy, model_loaded=true, v1` |
| ML `/model/info` | `200` RandomForestClassifier, 44 features |
| Inference smoke (`/predict`) | `200` with a full probabilities object |

---

## Build

| Target | Result |
| --- | --- |
| `backend npm run typecheck` | **PASS** (`exit=0`) |
| `backend npm run build` | **PASS** (`exit=0`) |
| `frontend npx tsc --noEmit` | **PASS** (`exit=0`) |
| `frontend npm run lint` | **PASS** (`exit=0`) |
| `frontend npm run build` | **PASS** — compiled, TypeScript clean, **39/39 static pages**, 40 route rows |

Build success was explicitly *not* treated as sufficient: every route was additionally loaded in a
real browser against the running backend.

---

## Runtime Errors

### Browser console (195 navigations + the 4-role smoke test)

- Uncaught exceptions / `pageerror`: **0**
- Hydration errors: **0**
- Failed module loads: **0**
- Authentication errors: **0**
- Console errors: **2**, both Chrome's own `Failed to load resource: … 403/404` notices on the risk
  detail route caused by a deliberately stale UUID; the application rendered a correct error state
  (`You are not authorized to view this student` / `Student not found`)

### Backend log (clean restart, then a 92-call workload across all five roles)

```
workload: 92 calls, 4xx=58, 5xx=0
  total lines      : 106
  5xx responses     : 0
  Unhandled error   : 0
  pg/db errors      : 0
  ML/8001 failures  : 0
  NO ERRORS FOUND
```

The 58 `4xx` are the expected role-scoping denials from calling every role's endpoints as every
role.

### ML container log

- `ERROR` lines: **0**
- `500` responses: **0**
- Startup: `Model loaded successfully: version=v1`, `Feature count: 44`, `Application startup complete`
- Warnings present (see Remaining issues): a `scikit-learn` pickle-version warning and
  `Model cannot predict these categories: ['AVERAGE']`

### Frontend dev log

- 1130 lines, **no error entries**

---

## Issues Fixed

Exactly two defects were found and fixed. Nothing else was changed.

### 1. `frontend/e2e/auth.e2e.mjs` — auth suite crashed at 16/55 (test integrity)

**Symptom:** `TypeError: Cannot read properties of null (reading 'innerText')` at
`auth.e2e.mjs:155`, so the suite aborted after 16 assertions, printed **no summary** and exited 1.
The other 39 assertions — including account switching, back-button safety and the no-secrets checks
— never ran at all.

**Root cause (verified, not assumed):** sign-out performs a *deliberate* hard navigation
(`app-shell.tsx:79 window.location.replace("/login")`, required so the browser back button cannot
restore the authenticated view). Instrumenting a live sign-out recorded **two navigations to
`/login` within ~100 ms** — the hard navigation plus `AuthGuard`'s `router.replace("/login")` —
and `Execution context was destroyed, most likely because of a navigation`. The helper read
`document.body.innerText` during that window.

**Fix:** `bodyText()` now retries across the navigation and only ever returns real page text —
it never returns `""`, so no assertion can pass vacuously; it throws if the page never becomes
readable. **Every assertion is byte-for-byte unchanged.**

**Result:** `test:e2e:auth` → **55/55**, and `browser back does not re-expose the authenticated
dashboard` passes, confirming the hard navigation itself is correct and was deliberately left alone.

### 2. `backend/src/middleware/errorHandler.ts` — oversized body returned 500 instead of 413

**Symptom:** `POST` with a body over the configured 100 KB limit returned
`500 INTERNAL_SERVER_ERROR` with `"request entity too large"`.

**Root cause:** body-parser raises `entity.too.large` with `status: 413`, but the error handler had
no branch for it, so it fell through to the generic 500 path and was logged as an unhandled error.

**Fix:** a 4xx passthrough branch for body-parser failures (`PAYLOAD_TOO_LARGE` for
`entity.too.large`, otherwise `BAD_REQUEST`), placed after the existing `INVALID_JSON` branch so
malformed JSON still returns 400.

**Verified:** `150000` and `200000` byte bodies → `413 PAYLOAD_TOO_LARGE`; malformed JSON →
`400 INVALID_JSON`; a normal body → `200`. Re-ran the full API suite afterwards: **488/488**.

---

## Remaining Issues

Genuine remaining problems, with nothing hidden.

1. **Bare `docker compose up -d` (the documented first command) fails on this machine.** The running
   `smartcampus-pg` container was created **standalone** — it carries zero
   `com.docker.compose.*` labels and uses an unnamed volume — so Compose tries to create its own
   `smartcampus-pg` and aborts with *"already in use by container 41d5440d…"*. PostgreSQL itself is
   healthy and `docker compose config` renders the correct image/env/healthcheck/port/volume.
   ML was therefore started with `docker compose up -d --no-deps ml-service`, which is verified
   working (container **healthy**, model loaded, backend → ML passes 61/61). I did **not** remove
   the user's DB container. To make the documented path work verbatim, run:
   `docker rm -f smartcampus-pg && docker compose up -d && cd backend && npm run db:reset -- --yes && npm run migrate && npm run seed`
   — this discards the current dev database (it is re-seedable).
   *Side effect of my attempt:* an unused empty volume `smartcampus_smartcampus_pgdata` and a
   `smartcampus_default` network now exist (the latter is used by the ML container).
2. **`scikit-learn` version drift in the ML image.** The model was pickled with 1.9.0; the image
   installs 1.9.1 (`requirements.txt` allows `>=1.5.0`), producing an
   `InconsistentVersionWarning` at load. Predictions are correct and all 61 integration tests pass.
   Pinning `scikit-learn==1.9.0` would silence it — not done, since that is a dependency change.
3. **The model cannot emit the `AVERAGE` category.** Startup logs
   `Model cannot predict these categories: ['AVERAGE']` and serves `AT_RISK/EXCELLENT/GOOD`,
   while `/model/info` declares four `performance_categories`. The model was trained on 12
   synthetic students with no `AVERAGE` examples; this is documented in the model's own metadata
   `limitations` array. Fixing it requires retraining, which is out of scope.
4. **Duplicate API calls in `next dev`.** Every dashboard endpoint is requested exactly **2×** per
   load (`distinct=18 total=36`) — React StrictMode double-invokes effects in development. It is
   bounded (never more than 2), there are no loops, and a production build renders once. Not
   changed, because the fix would be a `reactStrictMode` config change.
5. **Double navigation on logout.** `AuthGuard`'s `router.replace("/login")` races the deliberate
   `window.location.replace("/login")`, producing two navigations ~100 ms apart. The end state is
   always correct and the hard navigation is required by the back-button security test, so the
   application code was left untouched; the test helper was hardened instead (Issue 1).
6. **Minor contract findings from the static audit (not fixed, not runtime blockers):**
   - `backend/src/modules/fees/fees.service.ts:115` — the admin fee summary aggregates over
     unfiltered `fees` while the table applies `q`/`status`, so the summary cards ignore the
     active filters.
   - `backend/src/modules/library/library.controller.ts:118-125` — `GET /admin/library/loans`
     returns `{loans}` normally but `{items,total}` when `status=OVERDUE`; the frontend
     compensates for both shapes today, but the contract is inconsistent.
   - `frontend/src/components/certificates/student-certificates.tsx:16,35` — the only call path
     that bypasses `lib/api.ts`; it re-declares the base URL and builds headers by hand (the
     bearer token is correctly attached).
7. **Stale files still tracked:** `docs/ARCHITECTURE.md_backup` and the root `current_arch.txt`
   (a Phase-4-era dump superseded by `docs/ARCHITECTURE.md`). Left in place deliberately —
   deleting other people's files was out of scope.
8. **Route-count claim.** The figure of **43 frontend routes is not reproducible**: the current
   source has **39 `page.tsx`** files, and `next build` lists **40** route rows (39 + `/_not-found`).

---

## Final Status

### FULL STACK INTEGRATED AND VERIFIED

Evidence: the application was started from a clean database (drop → 17 migrations → seed), run as
four live processes, and driven in a real Chrome session. Browser → Next.js → Express → PostgreSQL
was exercised through **195 route loads across all five roles** plus a **36-step smoke test** of the
Student, Admin, Parent and Alumni flows. Express → FastAPI → the trained model was exercised with
the model up (`prediction_source: ML`, all six API fields present) and with the model **stopped**
(`prediction_source: RULE_BASED`, `is_model_prediction: false`, `ML_UNREACHABLE`, correct UI badge).
The browser never once reached port 8001. Regression suites all pass on current code: API
**488/488**, E2E **702/702**, ML **61/61**, feature parity **7×44**, pytest **33 passed**, and
backend/frontend typecheck + lint + build are all clean. Two defects were found, fixed and re-verified;
the eight remaining items are documented above and are environment, model-data or minor-contract
issues rather than integration failures.
