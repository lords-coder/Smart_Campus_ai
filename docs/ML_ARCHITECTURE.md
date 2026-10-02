# SmartCampus AI — ML Architecture

How a student's performance prediction is actually produced: from the browser,
through the authenticated API, into the Python inference service, and back.

**Read this first:** the shipped model is a demonstration artifact trained on
**6 synthetic students**. It is not academically, clinically or statistically
validated, and its reported accuracy is measured on its own training data. See
[Model limitations](#model-limitations) before drawing any conclusion from a
prediction.

---

## Request flow

```
Browser (STUDENT session)
  │  GET /api/performance/predict
  ▼
Express API  ── requireAuth → requireRole("STUDENT")
  │  identity = req.user.id (JWT subject)      ← never a client-supplied id
  ▼
Performance service
  │  1. resolve students.id from the JWT subject
  │  2. build the 44-feature vector (3 aggregate queries)
  ▼
ML client  ── POST {ML_SERVICE_URL}/predict, AbortController timeout
  │
  ├─ valid response ──────────────►  validate (zod) → prediction_source: "ML"
  │
  └─ unreachable / timeout / 5xx / malformed / degraded model / inconsistent
                                     → prediction_source: "RULE_BASED"
                                       fallback_reason: <typed code>
  ▼
Express response  →  Browser
  "Performance prediction: EXCELLENT · Confidence: 76% · Source: ML model · v1"
```

The browser **never** contacts port 8001. `ML_SERVICE_URL` is server-side
configuration; the port is not exposed to, or reachable from, client code.

### Ownership of each concern

| Concern | Owner |
| ------- | ----- |
| Authentication, role check, student identity | Express |
| Reading the student's own academic records | Express |
| Feature engineering (the 44 columns) | Express |
| Timeout, failure classification, response validation | Express |
| Loading and running the model | Python service |
| Label ordering and probabilities | Python service (`model.classes_`) |
| Rendering, and saying which source produced the number | Frontend |

---

## The 44-feature contract

The trained pipeline in `ml/models/performance_model.joblib` was fitted on
**44 columns in a fixed order**. The scaler and classifier were trained on that
exact matrix, so a renamed, reordered or missing column silently corrupts every
prediction — there is no partial credit.

**One authoritative list** lives in
`backend/src/modules/performance/performance.features.ts` (`ML_FEATURE_NAMES`).
The order is verified against the model's own metadata by
`backend/tests/feature-parity.mjs`, so the two cannot drift apart unnoticed.

The Python service re-orders the payload into the model's column order using the
artifact's own `feature_names`, so the caller cannot mis-align the vector by
accident. A missing feature is a `400`, not a silent zero.

### Source mapping

Definitions are reproduced from `ml/training/feature_engineering.py`. Parity is
asserted numerically: `npm run test:feature-parity` compares the SQL-built
vector against the Python engine for every seeded student.

| # | Model feature | Backend source | Calculation | Missing data |
| - | ------------- | -------------- | ----------- | ------------ |
| 0 | `attendance_percentage` | `attendance` | `attended / total * 100`, where *attended* is `status IN ('PRESENT','LATE')` and *total* is **every** attendance row | `0.0` when the student has no attendance rows |
| 1 | `total_classes` | `attendance` | `COUNT(*)` of attendance rows, all statuses | `0` |
| 2 | `avg_assessment_percentage` | `assessments` | `AVG(marks_obtained / max_marks * 100)` | `0.0` |
| 3 | `total_assessments` | `assessments` | `COUNT(*)` | `0` |
| 4 | `assignment_submission_rate` | `assignments` | `COUNT(*) FILTER (submitted) / COUNT(*) * 100` | `0.0` |
| 5 | `total_assignments` | `assignments` | `COUNT(*)` | `0` |
| 6 | `avg_assignment_score` | `assignments` | `AVG(score) FILTER (submitted)` — **on the 0–10 scale**, not a percentage | `0.0` |
| 7 | `academic_score` | derived | `0.30·attendance + 0.50·avg_assessment + 0.20·(submission_rate/100 · avg_score·10)`, clamped to 0–100 | `0.0` |
| 8–13 | `attendance_<CODE>` | `attendance` × `courses` | Per course: `attended / total * 100`, over every attendance row for that course | `0.0` when the course has no rows |
| 14–19 | `assessment_<CODE>` | `assessments` × `courses` | Per course: `AVG(marks_obtained / max_marks * 100)` | `0.0` |
| 20, 22, 24, 26, 28, 30 | `assign_sub_<CODE>` | `assignments` × `courses` | Per course: `COUNT(submitted) / COUNT(*) * 100` over **all** assignments in the course | `0.0` |
| 21, 23, 25, 27, 29, 31 | `assign_score_<CODE>` | `assignments` × `courses` | Per course: `AVG(score) FILTER (submitted)` | `0.0` |
| 32–43 | `assess_<TYPE>_avg` / `assess_<TYPE>_count` | `assessments` | Per `assessment_type` in QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT: mean percentage and row count | `0.0` / `0` |

`<CODE>` covers the six courses the model was trained on: `CS301`, `CS305`,
`CS311`, `CS315`, `CS321`, `MA201`.

### Semantics that are easy to get wrong

- **`LEAVE` counts against attendance.** Only `PRESENT` and `LATE` count as
  attended, but every row — including `ABSENT` and `LEAVE` — is in the
  denominator.
- **`avg_assignment_score` is out of 10**, not a percentage. `compute_academic_score`
  multiplies it by 10 before weighting. Reporting it as 0–100 would inflate
  `academic_score` by an order of magnitude.
- **Averages ignore NULL scores**, matching pandas `.mean()`. A submitted
  assignment with no score contributes to the submission rate but not the mean.
- **A course the student never touched yields `0.0`, not a missing value.** The
  model was fitted on complete rows, so a partial vector would be a different
  kind of wrong.
- **Whole record history, no date window.** Features cover every row, matching
  the training-time queries exactly.
- `NULLIF(max_marks, 0)` guards the division. The training code has no such
  guard and would produce `inf`; with the seeded data (`max_marks >= 10`) the
  two are numerically identical.

### Query cost

Three aggregate queries per prediction, regardless of how many courses exist —
no per-course or per-student query loops, so there is no N+1 behaviour as the
catalogue grows.

---

## Inference API

`POST {ML_SERVICE_URL}/predict`

Request — every feature name must be present; extra keys are ignored.

```json
{ "features": { "attendance_percentage": 97.78, "...": 0, "academic_score": 92.21 } }
```

Response.

```json
{
  "category": "EXCELLENT",
  "confidence": 0.755,
  "probabilities": { "AT_RISK": 0.035, "EXCELLENT": 0.755, "GOOD": 0.21 },
  "model_version": "v1",
  "features_used": ["attendance_percentage", "..."],
  "model_loaded": true,
  "feature_count": 44,
  "predicted_at": "2026-10-01T20:13:25.429111+00:00",
  "model_trained_at": "2026-09-30T05:26:37.300007Z"
}
```

Other endpoints: `GET /health` (status, loaded flag, version, feature count,
class list) and `GET /model/info` (the training metadata).

| Status | Cause |
| ------ | ----- |
| `200` | Prediction produced |
| `400` | A required feature is missing from the payload |
| `422` | Payload is not a valid feature map (empty, null, or non-numeric values) |
| `500` | The pipeline itself failed — logged server-side, generic message returned |
| `503` | No model loaded |

Error bodies never contain stack traces, filesystem paths, or model internals.
A test asserts this by making the pipeline raise.

### Probability and class correctness

Class labels come from `model.classes_`, never from an assumed four-band
taxonomy. The shipped model was trained on data containing **no AVERAGE
example**, so it has three classes and can never emit that label. The service
returns exactly those three, and the service logs a warning at startup naming
the bands it cannot predict.

A band being *absent* means "the model cannot say", which is deliberately
different from "the model says zero". Nothing fabricates an `AVERAGE`
probability.

---

## Failure handling

`ML_SERVICE_URL` defaults to `http://localhost:8001`; set it to
`http://ml-service:8001` when the backend runs inside the Compose network.
`ML_TIMEOUT_MS` (default `5000`) bounds the call with an `AbortController`.

| `fallback_reason` | Trigger |
| ----------------- | ------- |
| `ML_DISABLED` | `ML_SERVICE_URL` is blank |
| `ML_UNREACHABLE` | Connection refused / DNS failure |
| `ML_TIMEOUT` | No response within `ML_TIMEOUT_MS` |
| `ML_BAD_STATUS` | Non-2xx from the service (body is never read) |
| `ML_INVALID_RESPONSE` | Unparseable body, schema mismatch, `model_loaded: false`, confidence outside 0–1, or a category absent from its own probability map |

In every one of those cases the endpoint still answers `200` with
`prediction_source: "RULE_BASED"` and `is_model_prediction: false`. The
threshold estimate is a fallback, not a model output: it is versioned
`rule-based-v1`, and its confidence is a band distance, never presented as model
confidence.

The client additionally verifies that the remote probability vector agrees with
the reported category and confidence, so a malformed or mislabelled response is
rejected rather than surfaced.

---

## Security

| Actor | `GET /api/performance/predict` | `GET /api/performance` |
| ----- | ------------------------------ | ---------------------- |
| `STUDENT` | `200`, own prediction | `200`, own features |
| `FACULTY` | `403` | `403` |
| `ADMIN` | `403` | `403` |
| anonymous | `401` | `401` |

- The student is resolved from the JWT subject. A `?studentId=` query parameter
  is ignored, and there is no parameter through which one student could request
  another's prediction.
- No client-supplied feature, mark, category or confidence is ever trusted; the
  backend derives the whole vector from the authenticated student's own rows.
- The ML service holds no credentials, has no database access, and knows no
  student identities — it scores a vector and nothing else.

---

## Model limitations

The model is honest about being a demo, and the metadata records these too:

- **Trained on 6 synthetic students.** The reported `accuracy: 1.0` and
  `f1_weighted: 1.0` are measured on the training data itself. They say nothing
  about real-world accuracy.
- **No `AVERAGE` class.** Zero training examples, so the model cannot predict
  it. Confusion is between `AT_RISK`, `EXCELLENT` and `GOOD` only.
- **Class imbalance.** 3 EXCELLENT, 1 GOOD, 0 AVERAGE, 2 AT_RISK. `class_weight`
  was `balanced` at training time, which helps but does not remove the skew.
- **No real university data.** No multi-semester history, no validated outcome
  data. Not usable for any real academic decision.
- **Predictions are explainable only as correlations** with the 44 engineered
  features. They are not causal, and the feature importance values in the
  metadata are not interpretable as causal weights.
- **Predictions are point-in-time.** Features use the full record history, so a
  prediction does not drift as new terms are added.

The rule-based fallback is equally modest: it is a fixed threshold over a
weighted composite, useful only so the dashboard degrades honestly rather than
pretending a model answered.

---

## Running it

```bash
# Terminal 1 — ML service
cd ml/inference && python -m uvicorn main:app --host 0.0.0.0 --port 8001

# or the whole Compose stack
docker compose up -d postgres ml-service

# Terminal 2 — API
cd backend && npm run dev          # reads ML_SERVICE_URL / ML_TIMEOUT_MS from .env
```

`backend/.env`:

```
ML_SERVICE_URL=http://localhost:8001
ML_TIMEOUT_MS=5000
```

To exercise the degraded path, stop the ML service — or point `ML_SERVICE_URL`
at a closed port. The dashboard then reads *"Rule-based fallback"* instead of
naming a model, and the API still answers.

### Tests

| Command | Covers |
| ------- | ------ |
| `cd ml && python -m pytest` | Feature engineering, artifact, metadata, and the inference service contract (33 tests) |
| `cd backend && npm run test:feature-parity` | The SQL vector matches the Python engine for every seeded student |
| `cd backend && npm run test:ml` | The real ML path plus unreachable, timeout, 5xx, malformed, degraded-model and inconsistent-response degradation (61 assertions) |
| `cd backend && npm run test:api` | Prediction payload, source marker, and the full authorization matrix |
| `cd frontend && npm run test:e2e:phase5` | Dashboard rendering of category, confidence, source and version |
| `... E2E_ML_EXPECTED_SOURCE=RULE_BASED` | The same suite with the ML service down |

---

## Retraining

The model was **not** retrained as part of this integration. If it is
retrained, update the `ML_FEATURE_NAMES` contract in the same change and
regenerate the parity reference; `test:feature-parity` and the Python contract
tests will fail loudly if the code and the artifact disagree.
