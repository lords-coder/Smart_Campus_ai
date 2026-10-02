# Phase 6 — Personalized Learning Recommendations Engine

## Executive Summary

Phase 6 extends SmartCampus AI from **Performance Prediction** → **Weak Area Identification** → **Personalized Recommendations** → **Curated Learning Resources** → **Optional AI Study Plan**.

The recommendation engine is **deterministic and database-grounded**. It reuses Phase 5 performance features, identifies academic weaknesses per course using centralized thresholds, assigns priorities via transparent rules, matches curated resources, and optionally uses the Phase 4 AI provider for natural-language explanation — without ever inventing academic facts.

**All previous phases (1–5) remain fully functional.** 228/228 API tests pass. 169/169 E2E tests (Phases 1–4) + 5/5 (Phase 5) + 6/6 (Phase 6) pass.

---

## 1. Recommendation Architecture

```
Student logs in (JWT)
       |
       v
GET /api/recommendations  (STUDENT-only, JWT-derived identity)
       |
       v
generateRecommendations(studentId)
       |
       |-- getStudentPerformanceFeatures()  [reuse Phase 5 service]
       |-- Enrolled courses (enrollments table)
       |-- Per-course assessments, assignments, attendance
       |
       v
Deterministic weakness detection per course:
  - Attendance < 70%  -> ATTENDANCE weakness
  - Assessments < 60% -> ASSESSMENT weakness
  - Assignments < 65% -> ASSIGNMENT weakness
       |
       v
Priority calculation (deterministic):
  - HIGH: 3+ weaknesses OR any metric >15 pts below threshold
  - MEDIUM: 2 weaknesses OR 1 metric 8-15 pts below threshold
  - LOW: 1 weakness with metric <8 pts below threshold
       |
       v
Resource matching (learning_resources table):
  - Filter by course_id, topic relevance, difficulty, priority
  - LIMIT 3 (HIGH), 2 (MEDIUM), 1 (LOW)
  - Fallback: no filters, just course_id + active
       |
       v
Structured response { summary, recommendations[] }
```

### Data Flow

| Step | Source | Method |
|------|--------|--------|
| Overall features | `getStudentPerformanceFeatures()` | Phase 5 service |
| Enrolled courses | `enrollments` + `courses` | SQL JOIN |
| Assessment averages | `assessments` table | `AVG((marks_obtained/max_marks)*100) GROUP BY course_id` |
| Assignment rates | `assignments` table | `AVG(submitted_score/max_score)`, `COUNT`, `SUM(submitted)` |
| Attendance per course | `attendance` table | `COUNT(present+late)/COUNT(*) GROUP BY course_id` |

---

## 2. Data Sources

| Table | Role |
|-------|------|
| `students` | Authenticated student lookup (JWT → user_id → student_id) |
| `enrollments` | Active courses for the student (status = 'ACTIVE') |
| `courses` | Course metadata (code, name, credits, faculty) |
| `assessments` | Per-student per-course marks (marks_obtained, max_marks, assessment_type) |
| `assignments` | Per-student per-course assignments (submitted, score, max_score, due_date) |
| `attendance` | Per-student per-course per-date records (PRESENT/LATE/ABSENT/LEAVE) |
| `learning_resources` | Curated resources matched to recommendations |

All data is **real, seeded, and deterministic**. No mock data in production paths.

---

## 3. Thresholds (Centralized)

Defined once in `backend/src/modules/performance/performance.recommendations.ts`:

```ts
export const THRESHOLDS = {
  ATTENDANCE_WARNING: 70,   // %
  ASSESSMENT_WARNING: 60,   // %
  ASSIGNMENT_WARNING: 65,   // %
};
```

**Rationale:**
- Attendance 70% aligns with typical university minimum attendance policies
- Assessment 60% is a common passing threshold
- Assignment 65% reflects completion + quality expectation

**Not scattered** — any threshold change is a single-line edit.

---

## 4. Course Weakness Logic

For each **active enrollment**, the engine computes three percentages:

| Metric | Source | Weak if |
|--------|--------|---------|
| Attendance % | `attendance` table | < 70% |
| Assessment % | `assessments` table | < 60% |
| Assignment % | `assignments` table | < 65% |

A course is "weak" if **any** metric is below its threshold.

**Weakness indicator** = `{ type: "ATTENDANCE"|"ASSESSMENT"|"ASSIGNMENT", value: actual%, threshold: configured% }`

---

## 5. Priority Logic

Every recommendation receives a priority based on **count and severity** of weaknesses:

| Priority | Rule |
|----------|------|
| **HIGH** | 3+ weakness indicators, OR any single metric >15 points below its threshold |
| **MEDIUM** | 2 weakness indicators, OR 1 metric 8–15 points below threshold |
| **LOW** | 1 weakness indicator with metric <8 points below threshold |

**Examples:**
- Student has 65% attendance (5 pts below 70) + 58% assessments (2 pts below 60) → 2 weaknesses, both minor → **MEDIUM**
- Student has 50% attendance (20 pts below 70) → 1 severe weakness → **HIGH**
- Student has 68% attendance (2 pts below 70) → 1 minor weakness → **LOW**

**Primary category** is the weakest metric: ATTENDANCE > ASSESSMENT > ASSIGNMENT.

**Factual reason** generated from actual values:
> "Your assessment average in MA201 is 54%, below the warning threshold of 60%."

The AI **never generates** the reason — it is constructed from real backend values.

---

## 6. Resource Schema

**Migration:** `database/migrations/007_phase6_recommendations.sql`

```sql
CREATE TABLE learning_resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  resource_type    TEXT NOT NULL CHECK (resource_type IN ('VIDEO','NOTES','PRACTICE','ARTICLE','REMEDIAL')),
  topic            TEXT NOT NULL,
  difficulty       TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  url              TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:** `course_id`, `topic`, `resource_type`, `active`
**Trigger:** `trg_learning_resources_updated_at` (auto-updates `updated_at`)

---

## 7. Resource Matching

Deterministic matching by **course + category + priority**:

| Category | Topic filter | Difficulty filter | Limit by priority |
|----------|-------------|-------------------|-------------------|
| ATTENDANCE | `%attendance%` | NOT advanced | HIGH: 3, MEDIUM: 2, LOW: 1 |
| ASSESSMENT | `%assessment%` | NOT beginner | same |
| ASSIGNMENT | `%assignment%` | NOT beginner | same |
| COURSE_WEAKNESS | (none) | NOT advanced | same |
| STUDY_ACTION | `%study%` | beginner/intermediate | same |
| REMEDIAL_SUPPORT | `%remedial%` | beginner | same |

**Fallback:** if no resources match filters, retry with only `course_id = $1 AND active = true` + same LIMIT.

**Result:** Every recommendation gets 1–3 relevant resources (or 0 if none exist for the course).

---

## 8. Optional AI Explanation

Reuses Phase 4's `AiProvider` abstraction (`backend/src/modules/ai/ai.provider.ts`).

### Context passed to AI (verified facts only)

```json
{
  "scopeNote": "SmartCampus deterministic recommendation engine output — academic facts only",
  "recommendations": [
    {
      "course": "Discrete Mathematics",
      "courseCode": "ma201-uuid",
      "category": "ASSESSMENT",
      "priority": "HIGH",
      "reason": "Your assessment average in MA201 is 54%, below the warning threshold of 60%",
      "metrics": { "attendancePercentage": 88, "assessmentPercentage": 54, "assignmentSubmissionRate": 92, "totalAssignments": 3 },
      "resources": [{ "title": "Proof Techniques...", "type": "VIDEO", "topic": "proof techniques" }]
    }
  ]
}
```

### System prompt (abridged)

> "You are SmartCampus AI. Generate a concise, supportive study plan for the student based on the provided deterministic recommendation data. Convert the facts into natural language guidance. **Do NOT invent any academic data** (marks, attendance, courses, deadlines, resources). Do NOT generate policy or disciplinary content. Output in markdown."

### AI failure handling

| Failure type | Result |
|--------------|--------|
| Provider unavailable / timeout / rate limit / auth error | Returns structured recommendations with `studyPlan: null`, `fallback: true`, message: "Recommendations generated (AI unavailable — deterministic engine used)" |
| Empty recommendations | Returns "No recommendations available — your academic performance is strong across all courses." |

**The deterministic engine is the primary feature.** AI is pure enhancement.

---

## 9. Security

| Protection | Implementation |
|------------|----------------|
| JWT ownership | `req.user.id` → `students` table → `enrollments.student_id` |
| No `studentId` param | Frontend never supplies authoritative studentId; backend derives from JWT |
| Role enforcement | `requireAuth, requireRole("STUDENT")` on router; FACULTY/ADMIN → 403 |
| Cross-student guard | Identical to Phase 4/5: E2E test confirms Student A cannot access Student B's data |
| IDOR prevention | All data scoped by `WHERE student_id = $1` using JWT-derived ID |

**Verified by E2E test:**
- Unauthenticated → redirect to `/login`
- Non-student role → blocked (403)
- Ownership derived from JWT only

---

## 10. API Reference

### `GET /api/recommendations`

**Auth:** JWT required · Role: `STUDENT` only

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": { "highPriority": 2, "mediumPriority": 1, "coursesNeedingAttention": 2 },
    "recommendations": [
      {
        "courseId": "...",
        "courseName": "Discrete Mathematics",
        "category": "ASSESSMENT",
        "priority": "HIGH",
        "reason": "Your assessment average in MA201 is 54%, below the warning threshold of 60%",
        "metrics": { "attendancePercentage": 88, "assessmentPercentage": 54, "assignmentSubmissionRate": 92, "totalAssignments": 3 },
        "resources": [{ "id": "...", "title": "...", "resource_type": "VIDEO", "topic": "...", "difficulty": "beginner", "url": "..." }],
        "resourceCount": 1
      }
    ]
  },
  "message": "Recommendations generated"
}
```

### `GET /api/recommendations/study-plan`

**Auth:** JWT required · Role: `STUDENT` only

**Response:**
```json
{
  "success": true,
  "data": {
    "studyPlan": "# Study Plan\n\n## Discrete Mathematics (HIGH)\nFocus on...",
    "recommendations": [{ "course": "Discrete Mathematics", "category": "ASSESSMENT", "priority": "HIGH", "reason": "..." }],
    "fallback": false
  },
  "message": "Study plan generated"
}
```

---

## 11. Frontend

### Routes

| Route | Component | Protection |
|-------|-----------|------------|
| `/recommendations` | `RecommendationsPage` | `AuthGuard` + `RoleGuard(STUDENT)` |

### Components (`frontend/src/components/recommendations/`)

| Component | Purpose |
|-----------|---------|
| `learning-summary.tsx` | 3 summary cards: High priority, Medium priority, Courses needing attention |
| `recommendation-filters.tsx` | Filter chips: All / High / Medium / Low |
| `recommendation-list.tsx` | Renders filtered recommendation cards; empty state handling |
| `recommendation-card.tsx` | Course name, category badge, priority badge, factual reason, metrics grid, resource cards |
| `priority-badge.tsx` | Color-coded badge (red/yellow/green) |
| `resource-card.tsx` | Resource type icon, title, description, topic/difficulty badges, external link |

### Dashboard Integration

Added to student dashboard (`/dashboard`):
- New **StatCard**: "Recommendations" showing courses needing attention, high/medium counts
- Link: "View recommendations" → `/recommendations`

---

## 12. Testing

### API Tests (13 new assertions)

| # | Test | Expected |
|---|------|----------|
| 1 | Student can retrieve own recommendations | 200, structured data |
| 2 | Unauthenticated → 401 | 401 UNAUTHORIZED |
| 3 | Non-student role behavior | 403 FORBIDDEN (FACULTY/ADMIN) |
| 4 | No studentId param overrides ownership | 200, own data only |
| 5 | Weak course identified correctly | Course with low metrics appears |
| 6 | Attendance recommendation works | ATTENDANCE category when <70% |
| 7 | Assessment recommendation works | ASSESSMENT category when <60% |
| 8 | Assignment recommendation works | ASSIGNMENT category when <65% |
| 9 | Priority calculation works | HIGH/MEDIUM/LOW per rules |
| 10 | Resource matching works | Resources attached per category/priority |
| 11 | Empty-data behavior | Empty state, no fabricated data |
| 12 | No matching resource behavior | Fallback or empty array |
| 13 | AI provider failure doesn't break | `fallback: true`, `studyPlan: null` |

### E2E Tests (Phase 6 — 6 flows)

| Flow | Steps |
|------|-------|
| Main | Student login → Dashboard summary card → `/recommendations` → Cards visible → Metrics visible → Priority visible → Resources visible |
| Filters | Priority filter (High/Medium/Low) → Course filter → Clear/reset |
| Error state | API failure → Friendly UI state |
| Empty state | No recommendation data → Friendly empty state |
| Auth - Unauthenticated | Redirect to `/login` |
| Auth - Non-student | Blocked (403) |

### Regression Verification (All Green)

| Suite | Tests |
|-------|-------|
| Phase 1 E2E | 26/26 |
| Phase 2 E2E | 48/48 |
| Phase 3 E2E | 52/52 |
| Phase 4 E2E | 43/43 |
| Phase 5 E2E | 5/5 |
| Phase 6 E2E | 6/6 |
| API Suite | 228/228 |
| Backend Typecheck | PASS |
| Backend Build | PASS |
| Frontend Typecheck | PASS |
| Frontend Build | PASS |
| Frontend Lint | PASS |
| DB Reset/Migrate/Seed | PASS |

---

## 13. Limitations

1. **Demo resources only** — 30 curated resources seeded (5 per course). URLs point to public educational sites or placeholder pages. Not official university materials. Clearly labeled in UI.

2. **Data dependency** — Recommendations require assessments, assignments and attendance data. Students with no data see empty state with "Keep up the good work!" message. No fabricated recommendations.

3. **Deterministic only** — No collaborative filtering, ML recommender, or neural network. Rules are explicit, auditable, and centralized.

4. **AI explanation optional** — Works without any AI provider configured (uses deterministic mock or falls back gracefully).

5. **Single-semester scope** — Current seed data covers one semester. Multi-semester aggregation is a future enhancement.

6. **Model limitation** — Phase 5 ML model trained on 6 synthetic students; 100% accuracy is an artifact. Phase 6 recommendations use deterministic thresholds, not ML.

---

## 14. Next Recommended Task

**Phase 7 — Dropout Risk & Intervention Dashboard**

Extend the recommendation engine to:
- Add temporal trend analysis (attendance decline, grade trajectory)
- Define dropout risk levels (CRITICAL/HIGH/MODERATE/LOW) with escalation rules
- Faculty-facing intervention dashboard with student risk list, alert notifications, and action tracking
- Admin analytics: cohort-level risk heatmaps, retention forecasts
- Parent portal (opt-in) with weekly academic summary emails

This builds directly on Phase 5+6 infrastructure (performance features, recommendation engine, resource system) and reuses the existing AI provider for intervention plan generation.