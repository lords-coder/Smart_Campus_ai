# Phase 7 — Dropout Risk & Intervention Dashboard

## Executive Summary

Phase 7 adds an **advisory early-warning system** on top of Phases 1–6: temporal
trend analysis over attendance/assessments/assignments, transparent deterministic
risk scoring, faculty/admin risk dashboards, and database-backed intervention
tracking with an optional AI suggestion layer.

Risk outputs are **signals for authorized human review**. The system never
suspends, blocks, grades, disciplines, or otherwise acts against a student
automatically.

**All previous phases remain green.** API suite: 242/242 (228 prior + 14 new).
E2E: 26 + 48 + 52 + 43 + 5 + 37 (Phases 1, 2, 3, 4, 5, 7) all passing.

---

## 1. Risk Architecture

```
Campus data (dated attendance / assessment / assignment rows)
       |
       v
Temporal trends per student (current vs previous window)
       |
       v
Deterministic scoring 0-100 (internal indicator, NOT a probability)
       |
       v
Risk level: CRITICAL / HIGH / MODERATE / LOW
       |
       v
risk_snapshots (daily persistence) + interventions (staff actions)
       |
       v
/faculty/risk + /admin/risk dashboards (+ optional AI suggestion)
```

Core files:

| File | Role |
|------|------|
| `backend/src/modules/performance/performance.risk.ts` | Trends, scoring, snapshots, interventions, AI plan |
| `backend/src/modules/performance/performance.risk.routes.ts` | `/api/risk/*` endpoints with role + scope guards |
| `database/migrations/008_phase7_risk_interventions.sql` | `risk_snapshots` + `interventions` tables |
| `database/migrations/009_phase7_risk_fix.sql` | Adds `updated_at` to `risk_snapshots` (trigger requirement) |
| `frontend/src/components/risk/*` | Dashboard, table, filters, summary, trends, intervention UI |
| `frontend/src/app/(app)/faculty/risk`, `admin/risk` | Role-guarded pages + `[studentId]` detail views |
| `frontend/e2e/phase7.e2e.mjs` | 37-assertion E2E suite |

---

## 2. Temporal Trend Calculation

Windows chosen to match the seeded data distribution (attendance ~42 days,
assessments ~90 days, assignments ~60 days):

| Domain | Current window | Previous window | Minimum data |
|--------|---------------|----------------|--------------|
| Attendance | last 21 days | prior 21 days (22–42d ago) | ≥ 3 records per window |
| Assessments | last 30 days | 31–60 days ago | ≥ 1 record per window |
| Assignments | last 30 days (by `due_date`) | 31–60 days ago | ≥ 1 record per window |

Each trend is `{ current, previous, change, trend }` where `trend` is
`DECLINING` (change ≤ −3), `IMPROVING` (≥ +3), `STABLE`, or
`INSUFFICIENT_DATA`. Percentages round to 1 decimal. Attendance counts
`PRESENT`/`LATE` as attended; assessments use mean `(marks/max)*100`;
assignments use mean score of submitted work (unsubmitted = 0 in the window mean
only when the row falls in-window and is submitted — matching Phase 5 semantics).

---

## 3. Risk Levels

Centralized in `performance.risk.ts`:

```ts
RISK_LEVELS = { CRITICAL, HIGH, MODERATE, LOW }
```

Thresholds on the 0–100 internal score: **≥ 70 CRITICAL · ≥ 50 HIGH ·
≥ 30 MODERATE · else LOW**. Levels render as text badges (never color-only).

---

## 4. Risk Scoring

Transparent additive rules (documented in code and API reference):

| Signal | Points |
|--------|--------|
| Attendance decline severe (≤ −15) / moderate (≤ −8) / mild (≤ −3) | 25 / 15 / 5 |
| Assessment decline severe / moderate / mild | 25 / 15 / 5 |
| Assignment decline severe / moderate / mild | 20 / 12 / 6 |
| Current attendance very low (< 50) / low (< 60) | 15 / 10 |
| Current assessment avg very low (< 40) / low (< 50) | 15 / 10 |
| Current assignment completion very low (< 40) / low (< 50) | 15 / 10 |
| Multi-domain bonus (2+ domains declining) | +10 |

Score is capped to 0–100 and described in UI copy as an *internal indicator*,
never as a dropout probability. Insufficient-data windows contribute nothing.

Seeded demo outcomes (verified): Aarav LOW (5), Diya LOW (5), Ishita LOW (0,
improving), Sneha HIGH (55, assessment+assignment decline), Rohan CRITICAL (90,
triple decline), Karthik CRITICAL (95, triple decline + very low current).

---

## 5. Intervention Model

`interventions` table: `student_id` → `students.id`, `created_by` →
`users.id` (set server-side from JWT), `risk_level_at_creation`, `notes`
(≤ 2000 chars), `follow_up_date` (`YYYY-MM-DD`), `status`
(`OPEN` → `IN_PROGRESS` → `COMPLETED`, or `DISMISSED`).

Types: `ACADEMIC_REVIEW, ATTENDANCE_SUPPORT, ASSESSMENT_SUPPORT,
ASSIGNMENT_SUPPORT, REMEDIAL_SUPPORT, FACULTY_MEETING, GENERAL_FOLLOW_UP`.
No invented university programs — types are generic support categories and the
detail page links Phase 6 recommendations contextually via shared metrics.

---

## 6. Role Permissions

| Capability | STUDENT | FACULTY | ADMIN |
|------------|---------|---------|-------|
| Own high-level analysis (`/risk/own/*`) | ✅ (minimized) | ❌ 403 | ❌ 403 |
| Risk list / stats | ❌ 403 | ✅ own courses | ✅ all |
| Student detail + trends | ❌ 403 | ✅ own courses | ✅ |
| Create intervention | ❌ 403 | ✅ own courses | ✅ |
| Update intervention | ❌ 403 | ✅ in-scope | ✅ |
| See other students / staff notes | ❌ | ❌ (scope-enforced) | ✅ (own dashboard only) |

Student-facing scope decision: students see their own `riskLevel`, factual
`signals`, `trends`, and `currentMetrics` — no numeric-score emphasis, no
intervention records, no staff identities, no peer data.

---

## 7. Security

- JWT ownership throughout: `req.user` (re-validated against DB per request).
- Faculty scope derived from `timetable_entries.faculty_id` → active courses →
  enrolled students (`assertFacultyCanAccessStudent` on every detail/write
  path). Forged `studentId`/`courseId`/`section` cannot widen access (tested:
  crafted `section=Z9` returns empty; unknown UUID returns 403/404).
- `created_by` is always the authenticated user; the frontend never supplies
  ownership.
- Zod validation on list filters, intervention create/update bodies, and date
  formats; malformed input → 400, never 500.

---

## 8. Privacy / Data Minimization

- Staff list returns only: name, email, student no., section, level, score,
  signals, trend triples, open-intervention count, snapshot date.
- No passwords, tokens, fee amounts, or unrelated records in risk payloads.
- Student own-analysis omits interventions, staff names, and scores emphasis.
- No risk records are logged server-side beyond standard request logs.

---

## 9. AI Intervention Plan

Optional `GET /risk/own/intervention-plan` reuses the Phase 4 `AiProvider`.
Context = verified risk facts only. The model may phrase supportive guidance;
it cannot assign risk, invent evidence/programs/deadlines, diagnose, or
decide discipline. Failure → `{ interventionPlan: null, fallback: true }`
with deterministic analysis intact. Not exercised against a live provider in
tests (mock provider path covered by fallback unit behavior).

---

## 10. API

See `docs/API.md` § Phase 7. Endpoint summary:

- `GET /risk/own/analysis`, `GET /risk/own/intervention-plan` (STUDENT)
- `GET /risk/students` (list, filters, backfills snapshots), `GET /risk/stats`
- `GET /risk/students/:studentId`, `/trends`, `/interventions`
- `POST /risk/students/:studentId/interventions` (+ `/interventions` alias)
- `PATCH /risk/interventions/:interventionId`

Envelope: standard `{ success, data, message }`; errors via `ApiError`
(401/403/404/400).

---

## 11. Frontend

- `/faculty/risk` + `/admin/risk`: stats cards, section/search inputs, level +
  trend filters, sortable-by-severity table (name, section, level, score,
  top signals, open interventions), detail links.
- `/faculty/risk/[studentId]`, `/admin/risk/[studentId]`: header with level +
  score, evidence list ("Review recommended"), three trend cards with bar
  visualization, current-metrics grid, intervention history + create/update
  dialog (type, notes, follow-up date, status on edit).
- Language: "Review recommended", "monitoring indicators", "early-warning
  signals" — never "will drop out".
- Nav: "Risk Indicators" (FACULTY), "Risk Overview" (ADMIN); students see
  neither and are bounced from both routes by `RoleGuard`.

---

## 12. Testing

| Suite | Result | Notes |
|-------|--------|-------|
| API (`backend/tests/api.smoke.mjs`) | **242/242** | 228 prior + 14 Phase 7 (auth, scoping, detail, own-analysis minimization, validation, CRUD, IDOR) |
| E2E Phase 1 | **26/26** | |
| E2E Phase 2 | **48/48** | |
| E2E Phase 3 | **52/52** | |
| E2E Phase 4 | **43/43** | |
| E2E Phase 5 | **5/5** | (suite's pre-existing trailing selector crash unchanged; all 5 checks pass) |
| E2E Phase 7 (`frontend/e2e/phase7.e2e.mjs`) | **37/37** | Faculty flow (dashboard→filter→detail→trends→create), admin flow (overview→detail→update), student scoping, API guards |
| E2E Phase 6 | n/a | No `phase6.e2e.mjs` suite exists in repo (pre-existing gap); Phase 6 verified via API (`/recommendations` returns 6 HIGH recs for weak student post-fix) |
| Python ML | artifacts verified | `performance_model.joblib` (pipeline v1) + metadata load; pytest suite has a pre-existing packaging import issue unrelated to Phase 7 |
| Backend typecheck / build | PASS / PASS | |
| Frontend lint | PASS (0 warnings) | |
| Frontend build | PASS | 18 routes incl. `/faculty/risk`, `/admin/risk` (+ dynamic details) |
| DB reset/migrate/seed | PASS | 008 + 009 apply cleanly; seed emits trend-differentiated data |

---

## 13. Limitations

1. **Deterministic, not predictive.** No dropout ML model; scores are
   heuristic indicators. Real historical dropout labels do not exist in this
   dataset, and none are fabricated.
2. **Demo-scale data.** Six students; window thresholds tuned to the 42/60/90-day
   seed distribution. Validity on real data is unproven.
3. **No protected attributes.** Risk uses only attendance/assessment/assignment
   signals. Demographic data is not collected and must not be added as
   features without a fairness review.
4. **Snapshot granularity.** Daily snapshots per student; intraday changes
   collapse to the latest calculation.
5. **Faculty scope follows timetable assignments.** Staff with no active
   `timetable_entries` see an empty dashboard by design.
6. **Phase 5/6 ID fix side effect (positive).** Correcting `users.id` →
   `students.id` resolution changed absolute assessment/assignment values
   system-wide (previously 0 for all students). This was a real data bug;
   absolute numbers in older screenshots/reports may differ from current output.
7. **Phase 6 E2E gap.** No automated Phase 6 suite exists; coverage is via API
   checks only.

---

## 14. Next Recommended Phase

**Phase 8 — Parent Portal (read-only, invitation-based).**

Rationale: Phases 5–7 built the full student-support data story (prediction →
recommendations → risk → interventions); the remaining stakeholder without
visibility is the parent/guardian. Scope: `PARENT` role activation (already in
the DB CHECK constraint), student→guardian linking table + invitation flow,
read-only views (attendance summary, fee status, recommendation headlines —
no risk scores, no staff notes, no peer data), and explicit consent scoping.
Do NOT include email automation in Phase 8; defer notifications until access
controls are proven.
