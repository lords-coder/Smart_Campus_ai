# MODEL.md — The SmartCampus Performance Prediction Model

> Complete reference for the machine-learning component of SmartCampus AI: what the model is,
> what it consumes, how it was trained, exactly what its reported metrics mean, how it is served,
> how it fails safely, and — stated plainly — what it cannot do.
>
> Everything here is read from the shipped code and the committed artifact metadata. Where a number
> is flattering but not meaningful, this document says so.
>
> Related: `soul.md` (whole project) · `docs/ML_ARCHITECTURE.md` (integration contract) ·
> `ml/training/train.py` · `ml/inference/main.py` · `ml/models/performance_model_metadata.json`.

---

## Contents

1. [What this model is](#1-what-this-model-is)
2. [Model card](#2-model-card)
3. [What it predicts — and what it refuses to predict](#3-what-it-predicts--and-what-it-refuses-to-predict)
4. [The 44 features](#4-the-44-features)
5. [How the training labels are derived](#5-how-the-training-labels-are-derived)
6. [Training](#6-training)
7. [Reported metrics — and what they actually mean](#7-reported-metrics--and-what-they-actually-mean)
8. [Feature importance](#8-feature-importance)
9. [The inference service](#9-the-inference-service)
10. [Integration: who owns what](#10-integration-who-owns-what)
11. [Degradation: five ways it fails without breaking](#11-degradation-five-ways-it-fails-without-breaking)
12. [Security properties](#12-security-properties)
13. [Feature-parity testing](#13-feature-parity-testing)
14. [Running, retraining and testing it](#14-running-retraining-and-testing-it)
15. [Limitations](#15-limitations)
16. [If asked in a review](#16-if-asked-in-a-review)
17. [File map](#17-file-map)

---

## 1. What this model is

A `RandomForestClassifier` that maps a **44-number feature vector describing one student's academic
record** to a **performance band** — `EXCELLENT`, `GOOD` or `AT_RISK` — with a confidence and a full
class-probability vector.

It is served by a standalone Python FastAPI service and reached only by the Express backend. The
browser never talks to it.

**In one sentence, and the sentence to use in a review:** *it demonstrates a production-shaped ML
integration — feature contract, versioned artifact, validated boundary, honest degradation and
parity testing — on a model trained for six synthetic students, and it is explicitly not a
validated academic instrument.*

That distinction is the whole story. The *engineering* is real and is what this document mostly
describes. The *model* is a demonstration artifact, and §7 and §15 say exactly why.

---

## 2. Model card

| Field | Value |
|---|---|
| Model type | `RandomForestClassifier` inside a scikit-learn `Pipeline` with a `StandardScaler` step |
| Model version | `v1` |
| Trained at | `2026-09-30T05:26:37.300007Z` |
| Artifact | `ml/models/performance_model.joblib` (165,604 bytes, committed) |
| Artifact contents | `{ pipeline, feature_names, performance_categories, trained_at, model_version }` |
| Metadata | `ml/models/performance_model_metadata.json` |
| Hyper-parameters | `n_estimators=200`, `max_depth=10`, `min_samples_split=2`, `min_samples_leaf=1`, `class_weight='balanced'`, `random_state=42`, `n_jobs=-1` |
| Preprocessing | `StandardScaler` on all 44 features (fitted inside the pipeline, so scaling is part of the saved artifact) |
| Feature count | **44**, in a fixed order |
| Classes the model can emit | **`AT_RISK`, `EXCELLENT`, `GOOD`** (3) |
| Classes in the taxonomy | `EXCELLENT`, `GOOD`, `AVERAGE`, `AT_RISK` (4) — `AVERAGE` is unreachable |
| Training rows | **6** (one per student) |
| Class support | EXCELLENT 3 · GOOD 1 · AVERAGE 0 · AT_RISK 2 |
| Data source | "SmartCampus demo seed data (synthetic)" |
| Serving | FastAPI + uvicorn on port 8001, containerised as `ml-service` |
| Runtime dependencies | `scikit-learn`, `numpy`, `joblib`, `fastapi`, `uvicorn`, `pydantic` |

---

## 3. What it predicts — and what it refuses to predict

### The three bands it can return

| Band | Meaning as a label |
|---|---|
| `EXCELLENT` | composite academic score ≥ 85 |
| `GOOD` | 70 ≤ score < 85 |
| `AT_RISK` | score < 55 |

### The band it can never return

`AVERAGE` (55 ≤ score < 70) exists in the taxonomy but **has zero training examples**, so the fitted
model has three classes and can never emit it. This is not a bug that was papered over — the
service reports it:

- At boot, `lifespan()` compares `model_class_labels()` against the four taxonomy bands and logs
  `Model cannot predict these categories: ['AVERAGE']` (`ml/inference/main.py:197-203`).
- `model_class_labels()` reads `model_pipeline.classes_` rather than assuming the taxonomy
  (`:117-126`).
- The response's `probabilities` map is keyed by the model's own `classes_`, so a consumer can tell
  *"the model says 0"* apart from *"the model cannot say"* (`:78-81, 244-255`).
- A test asserts `"AVERAGE" not in probabilities` and `len(labels) == 3`
  (`ml/tests/test_inference_service.py:171-184`).

Indexing the four-band constant instead of `classes_` would both crash and mislabel — which is
exactly why the code reads the artifact.

### What it will not do, by design

- It does not access the database.
- It does not authenticate anyone.
- It does not know a student exists, let alone who they are.
- It does not accept a category, confidence or probability from the caller — every number it
  returns is produced by the fitted pipeline (`ml/inference/main.py:7-12`).

---

## 4. The 44 features

The authoritative list is `ML_FEATURE_NAMES` in
`backend/src/modules/performance/performance.features.ts`, verified against the artifact by
`backend/tests/feature-parity.mjs`. Six course codes are in the contract: **CS301, CS305, CS311,
CS315, CS321, MA201**. Six assessment types: **QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT**.

### Group A — 8 aggregate features (indices 0–7)

| # | Feature | How it is computed |
|---|---|---|
| 0 | `attendance_percentage` | `attended / total × 100`, where **attended = status IN (PRESENT, LATE)**. `0.0` when the student has no attendance rows |
| 1 | `total_classes` | count of **all** attendance rows, every status |
| 2 | `avg_assessment_percentage` | mean of `marks_obtained / max_marks × 100` across all assessments; `0.0` if none |
| 3 | `total_assessments` | count of assessment rows |
| 4 | `assignment_submission_rate` | `submitted / total × 100`; `0.0` if none |
| 5 | `total_assignments` | count of assignment rows |
| 6 | `avg_assignment_score` | mean `score` of **submitted assignments only**, on the **0–10 scale**; `0.0` if none submitted |
| 7 | `academic_score` | the composite — see §5 |

### Group B — 6 per-course attendance features (8–13)

`attendance_CS301`, `attendance_CS305`, `attendance_CS311`, `attendance_CS315`, `attendance_CS321`,
`attendance_MA201` — each is that course's attended/total × 100. A course the student has no
attendance for is **`0.0`, not missing**.

### Group C — 6 per-course assessment features (14–19)

`assessment_<CODE>` for the same six courses — mean `marks_obtained / max_marks × 100` in that
course; `0.0` when absent.

### Group D — 12 per-course assignment features (20–31)

For each of the six courses, a pair:

- `assign_sub_<CODE>` — submission rate in that course, %
- `assign_score_<CODE>` — mean score of **submitted** assignments in that course, **0–10 scale**

### Group E — 12 per-assessment-type features (32–43)

For each of QUIZ, MIDTERM, FINAL, PROJECT, LAB, ASSIGNMENT, a pair:

- `assess_<TYPE>_avg` — mean percentage in that assessment type; `0.0` if none
- `assess_<TYPE>_count` — how many such assessments exist

### Semantics worth knowing

- **`LEAVE` counts against attendance.** The denominator includes every row, so a leave is a
  non-attendance. Only `PRESENT` and `LATE` count as attended.
- **`avg_assignment_score` is out of 10, not a percentage.** The composite multiplies it by 10
  before weighting. This is the single easiest thing to get wrong when reading the vector.
- **NULL scores are ignored** by the averaging, matching pandas `.mean()` semantics — the reason the
  parity harness compares with an epsilon rather than for exact equality.
- **Whole history, no date window.** Every prediction uses the student's complete record.
- **Feature order is part of the contract.** A renamed, reordered or dropped column silently
  corrupts predictions. The Python service reorders using the artifact's own `feature_names`, and a
  **missing** feature is a `400`, never a silent zero.

---

## 5. How the training labels are derived

This is the most important thing to understand about the model, and it is a genuine limitation.

Labels are **not** human-assigned outcomes. They are produced by a **deterministic formula over the
same features the model is given**:

```
assignment_component = (assignment_submission_rate / 100) × (avg_assignment_score × 10)

academic_score = 0.30 × attendance_percentage
              + 0.50 × avg_assessment_percentage
              + 0.20 × assignment_component          # clamped to [0, 100]

band = EXCELLENT  if academic_score ≥ 85
       GOOD       if ≥ 70
       AVERAGE    if ≥ 55
       AT_RISK    otherwise
```

(`ml/training/feature_engineering.py:48-90`)

**Consequence:** the model is learning to approximate a known arithmetic function of its own inputs.
It is not discovering a hidden relationship, and it cannot generalise beyond what that formula
already encodes. With six rows and a formula-derived target, the reported perfect scores measure
almost nothing (§7).

The weights — 30 % attendance, 50 % assessments, 20 % assignments — are a design choice, not a
learned parameter. They are duplicated in the backend (`computeAcademicScore` in
`performance.features.ts`) so the rule-based fallback estimates a student the same way the model was
trained to.

---

## 6. Training

`ml/training/train.py`, run with `python train.py`.

```
1. Load from PostgreSQL via psycopg2
     students ⋈ users, attendance, assessments, assignments, courses
     (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD, or defaults for the local compose DB)

2. prepare_training_data()
     extract_features()      → per-student StudentFeatures, then a DataFrame
     drop identifiers        → student_id, student_no, name
     fillna(0.0)             → belt and braces; defaults already prevent NaN
     → X (numeric), y (band labels), feature_names (44, ordered)

3. train_model()
     Pipeline([ StandardScaler(),
                RandomForestClassifier(n_estimators=200, max_depth=10,
                                       min_samples_split=2, min_samples_leaf=1,
                                       class_weight='balanced',
                                       random_state=42, n_jobs=-1) ])
     fit(X, y)

4. evaluate_model()  → two branches, see §7

5. save_model()
     joblib.dump({pipeline, feature_names, performance_categories, trained_at, model_version})
     write metadata JSON (metrics, confusion matrix, feature importances, limitations)
```

**`class_weight='balanced'`** is there to counter the 3/1/0/2 class distribution. It re-weights the
loss; it does not create examples.

**`random_state=42`** makes the forest reproducible, so a retrain with the same data yields the same
artifact.

### The two evaluation branches

`evaluate_model()` chooses its method from the data size (`train.py:107-210`):

- **Small data** (`min_class_count < 2` **or** `n_samples < 10`): fit on the full dataset and report
  **training** metrics. Sets `evaluation_method: "full_dataset_training"` and copies the training
  accuracy into `cv_accuracy_mean`.
- **Normal data**: stratified 80/20 split, plus `StratifiedKFold(n_splits=5)` cross-validation, and
  `evaluation_method: "train_test_split"`.

**This model took the small-data branch** (`min_class_count = 0` for AVERAGE, `n_samples = 6`). That
single fact explains every number in §7.

---

## 7. Reported metrics — and what they actually mean

### What the metadata reports

| Metric | Value |
|---|---|
| `accuracy` | 1.0 |
| `precision_weighted` / `recall_weighted` / `f1_weighted` | 1.0 |
| `cv_accuracy_mean` / `cv_accuracy_std` | 1.0 / 0.0 |
| `macro avg` precision / recall / f1 | 0.75 |
| `weighted avg` precision / recall / f1 | 1.0 |
| Per-class f1 | EXCELLENT 1.0 (support 3) · GOOD 1.0 (1) · **AVERAGE 0.0 (0)** · AT_RISK 1.0 (2) |
| Confusion matrix | `[[3,0,0,0],[0,1,0,0],[0,0,0,0],[0,0,0,2]]` (rows/cols in taxonomy order) |
| `train_size` / `test_size` | **6 / 6** |
| `evaluation_method` | **`full_dataset_training`** |

### What those numbers are worth

**They are training-set scores on six rows.** There is no held-out test set: `train_size` and
`test_size` are both 6 because the same six students were used for fitting and for scoring
(`train.py:119-148`). Accuracy 1.0 means the forest memorised six examples — which a 200-tree forest
with `max_depth=10` will always do.

**`cv_accuracy_mean: 1.0` is not cross-validation.** In the small-data branch that field is assigned
the training accuracy directly (`train.py:137-138`). Read it as "1.0", not "validated".

**`macro avg` of 0.75 is the honest number in the file.** It is dragged down entirely by `AVERAGE`,
which scores 0.0 because it has no support. The weighted average hides that by ignoring the empty
class.

**`num_students: 12` is a bookkeeping artefact, not a data volume.** It is computed as
`train_size + test_size` (`train.py:238`), which double-counts the same six students. The
limitations list in the same file correctly says six.

**No number here estimates performance on real students.** A genuine figure needs a held-out split
and real data; with six rows and a formula-derived label, no such estimate is obtainable.

---

## 8. Feature importance

Taken from `classifier.feature_importances_` on the final fitted forest, sorted descending. Values
are close to uniform because with six rows the trees barely differentiate the inputs.

| Rank | Feature | Importance |
|---|---|---|
| 1 | `assign_score_CS301` | 0.0394 |
| 2 | `avg_assessment_percentage` | 0.0370 |
| 3 | `assess_PROJECT_count` | 0.0356 |
| 4 | `assign_score_CS321` | 0.0345 |
| 5 | `assign_score_CS305` | 0.0333 |
| 6 | `attendance_CS321` | 0.0328 |
| 7 | `attendance_CS301` | 0.0319 |
| 8 | `assess_ASSIGNMENT_count` | 0.0317 |
| 9 | `avg_assignment_score` | 0.0298 |
| 10 | `assignment_submission_rate` | 0.0297 |
| … | … | … |
| 43 | `assess_FINAL_count` | 0.0066 |
| 44 | `total_assignments` | 0.0051 |
| 45 | `total_classes` | **0.0000** |

**Read these as noise.** The top-to-bottom spread is 0.039 → 0.006, and the single most
"important" feature holds under 4 % of total importance in a 44-feature forest. Importances from a
six-row fit are not causal and are not meaningful weights; §15 lists this again as a limitation.

---

## 9. The inference service

`ml/inference/main.py` — FastAPI, ~290 lines, one process, no database.

### `POST /predict`

Request:

```json
{ "features": { "attendance_percentage": 97.8, "total_classes": 90, "...": 0 } }
```

Response **200**:

```json
{
  "category": "EXCELLENT",
  "confidence": 0.755,
  "probabilities": { "AT_RISK": 0.11, "EXCELLENT": 0.76, "GOOD": 0.13 },
  "model_version": "v1",
  "features_used": ["attendance_percentage", "... 44 names ..."],
  "model_loaded": true,
  "feature_count": 44,
  "predicted_at": "2026-10-02T12:00:00+00:00",
  "model_trained_at": "2026-09-30T05:26:37.300007Z"
}
```

Input handling:

- **Order is irrelevant** to the caller — the service reorders using the artifact's `feature_names`.
- **Unknown extra keys** are ignored, with a server-side warning.
- **Missing keys** → `400` naming them. Never a silent zero-fill.
- **Non-numeric, `NaN`, `Infinity` or boolean values** → rejected by the Pydantic validator (`422`).
- **Empty feature map** → `422`.

Error responses:

| Status | When |
|---|---|
| 400 | required feature missing, or NaN/Infinity survived validation |
| 422 | body is not a valid feature map (empty, non-numeric, wrong shape) |
| 500 | pipeline failure — the detail is logged server-side, the client gets `"Prediction failed"` |
| 503 | no model loaded |

**No error body ever contains a stack trace, a filesystem path, or model internals.**

### `GET /health`

```json
{ "status": "healthy", "model_loaded": true, "model_version": "v1",
  "model_trained_at": "2026-09-30T05:26:37.300007Z", "feature_count": 44,
  "classes": ["AT_RISK", "EXCELLENT", "GOOD"] }
```

`status` is `degraded` when no model is loaded. This is the endpoint the container `HEALTHCHECK`
polls and the one the E2E suite reads its expected class list from.

### `GET /model/info`

Returns the whole metadata document, including metrics, the confusion matrix and the limitations
list.

### Startup behaviour

`load_model()` reads `pipeline` and `feature_names` from the joblib artifact and the metadata JSON.
If it fails, the app still starts and `/predict` answers `503` — with a loud log — rather than the
process refusing to boot. The container healthcheck makes the failure visible in `docker compose ps`.

---

## 10. Integration: who owns what

```
Browser (STUDENT session)
   │  GET /api/performance/predict
   ▼
Express  ── requireAuth ── requireRole("STUDENT")
   │  identity from the JWT subject only; a `?studentId=` in the query is ignored
   │  resolve students.id, build the 44 features from the student's OWN rows
   │  (3 aggregate queries regardless of course count — no N+1)
   ▼
FastAPI  ── POST /predict { features } ──► RandomForest pipeline
   │  reorder, predict, build probabilities from classes_
   ▼
Express  ── zod-validate the response
   │  reject model_loaded:false, or a probability map missing its own category
   │  otherwise answer 200 with prediction_source
   ▼
Browser  ── renders the band, the confidence and an explicit source badge
```

| Concern | Owner |
|---|---|
| Authentication, authorization, identity | **Express** |
| Reading the student's records, feature engineering | **Express** |
| Timeout, failure classification, response validation | **Express** |
| Loading the artifact, reordering features, predicting | **Python** |
| Deciding the label order | **Python**, from `classes_` |
| Rendering and stating the source | **Frontend** |

**The browser never contacts port 8001.** `ML_SERVICE_URL` is server-side configuration only; the
one public variable in the whole app is `NEXT_PUBLIC_API_URL`.

Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `ML_SERVICE_URL` | `http://localhost:8001` | base URL; **blank disables** inference deliberately |
| `ML_TIMEOUT_MS` | `5000` | ceiling on the backend→ML call; on timeout the prediction degrades |

---

## 11. Degradation: five ways it fails without breaking

The client `requestMlPrediction` **never throws**. It returns
`{ ok: true, prediction }` or `{ ok: false, reason }`
(`backend/src/modules/performance/performance.ml-client.ts`).

| `fallback_reason` | Trigger | Notes |
|---|---|---|
| `ML_DISABLED` | `ML_SERVICE_URL` is empty | the intentional "model off" switch |
| `ML_UNREACHABLE` | connection refused, DNS failure, or any other non-abort error | |
| `ML_TIMEOUT` | no answer within `ML_TIMEOUT_MS` | AbortController |
| `ML_BAD_STATUS` | any non-2xx | **the body is deliberately never read**, so service internals cannot leak |
| `ML_INVALID_RESPONSE` | unparseable body, schema mismatch, `model_loaded: false`, confidence outside 0–1, **or a probability map that does not contain its own reported category** | the last two catch a lying or degraded model |

> A sixth variant, `ML_UNEXPECTED_ERROR`, is declared in the `MlFailureReason` union but no code path
> currently returns it — the catch-all maps to `ML_UNREACHABLE`. Harmless, but worth knowing if you
> extend the client.

### What the caller does with a failure

The endpoint still answers **HTTP 200**, with:

```json
{
  "category": "EXCELLENT",
  "confidence": 0.62,
  "prediction_source": "RULE_BASED",
  "is_model_prediction": false,
  "model_version": "rule-based-v1",
  "fallback_reason": "ML_TIMEOUT"
}
```

The fallback is a threshold function over the same `academic_score` composite, versioned
`rule-based-v1`. **Its confidence is a band distance, never presented as model confidence.**

The UI always shows which produced the number — *"ML model · v1"* or *"Rule-based fallback"* — so a
degraded estimate is never mistaken for a model prediction. Proving the degraded path deliberately:

```bash
E2E_ML_EXPECTED_SOURCE=RULE_BASED npm run test:e2e:phase5
```

---

## 12. Security properties

| Property | How it is enforced |
|---|---|
| Only the account owner can be scored | identity comes from the JWT; `?studentId=` is ignored; the vector is built from that student's own rows |
| Roles cannot reach it | `requireAuth` + `requireRole("STUDENT")` → FACULTY and ADMIN get 403, anonymous 401 |
| The service knows nothing about users | no database access, no credentials, no identity — it scores a number vector |
| Internal paths never leak | non-2xx bodies are not read; Python logs details and returns `"Prediction failed"` |
| Artifact integrity | version, feature list and training timestamp travel with every response |
| Degraded models cannot masquerade as predictions | `model_loaded: false` and a self-inconsistent probability map are both rejected |

---

## 13. Feature-parity testing

Two implementations of the same feature engineering exist — TypeScript in Express (serving) and
Python in training (fitting). A silent divergence would poison every prediction, so parity is
asserted mechanically.

**`npm run test:feature-parity`** (from `backend/`):

1. `ml/tests/_parity_dump.py` runs the **real** `extract_features` against the live database and
   writes `ml/tests/_parity_reference.json` (with `sort_keys=True`, so the JSON diff is stable).
2. `backend/tests/feature-parity.mjs` builds each student's vector through the **SQL** path and
   compares:
   - the **exact order** of all 44 names, via `JSON.stringify` equality — not just membership;
   - each numeric value with a `1e-6` absolute plus `1e-9 × scale` relative epsilon, because the two
     sides perform the same arithmetic in a different order;
   - that each vector's length is exactly `ML_FEATURE_COUNT`, so a silently dropped column cannot
     pass by matching values.

Current result: **parity OK — 6 students × 44 features.**

Related: `ml/tests/test_inference_service.py::test_feature_order_is_stable` posts the same vector
twice and asserts the returned features and the prediction are identical, catching silent column
reordering at the service boundary.

**If you retrain with a different feature set, update `ML_FEATURE_NAMES` in the same change** or the
parity and contract tests fail loudly — by design.

---

## 14. Running, retraining and testing it

### Serve it

```bash
# with Docker (already built into docker-compose.yml)
docker compose up -d ml-service
curl http://localhost:8001/health

# or locally
cd ml
pip install -r requirements.txt -r inference/requirements.txt
cd inference && python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### Score a vector by hand

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{"features": { "attendance_percentage": 92, "total_classes": 90, ... 42 more ... }}'
```

All 44 names are required; a missing one returns 400 listing the gaps.

### Retrain

```bash
cd ml
python training/train.py     # needs the database up and seeded
```

Then, in the same change, update `ML_FEATURE_NAMES` if the feature set moved, and re-run:

```bash
cd .. && npm run test:feature-parity && npm run test:ml
```

### Test

| Command | Covers | Result |
|---|---|---|
| `cd ml && python -m pytest` | feature engineering, artifact integrity, metadata, inference contract | **33 passed** |
| `cd backend && npm run test:ml` | real ML path plus **every** degradation mode, with a stub service and a second backend process | **61 passed** |
| `cd backend && npm run test:feature-parity` | SQL vector vs Python vector | **6 × 44 OK** |
| `cd frontend && npm run test:e2e:phase5` | dashboard card, role scoping, IDOR, model metadata | **48 passed** |
| `E2E_ML_EXPECTED_SOURCE=RULE_BASED npm run test:e2e:phase5` | the degraded path, on purpose | passes |

The degradation suite is the interesting one: it stands up a stub HTTP server on a random port,
spawns a **second backend process** pointed at it, and asserts each bad-response mode yields HTTP
200 + `RULE_BASED` + the exact reason — plus that the raw body never contains `.joblib`,
`Traceback` or `/app/ml`.

---

## 15. Limitations

Stated plainly, because the model will be questioned and these are the true answers.

1. **Trained on 6 synthetic students.** No real university data was ever used.
2. **The reported metrics are training-set scores.** `evaluation_method` is
   `full_dataset_training`, with `train_size = test_size = 6`. Accuracy 1.0 is memorisation.
3. **`cv_accuracy_mean: 1.0` is not cross-validation** — the small-data branch assigns the training
   accuracy to that field.
4. **No `AVERAGE` class.** Zero support, so the band is unreachable; the service logs this at boot.
5. **The label is a deterministic function of the features** (§5). The model approximates a known
   formula, so it cannot reveal anything the formula does not already encode.
6. **Class imbalance** 3 / 1 / 0 / 2. `class_weight='balanced'` re-weights the loss; it does not
   create examples.
7. **Feature importances are noise** at this sample size, and are correlational at best — never
   causal weights.
8. **Point-in-time only.** Every prediction uses the student's whole history with no time window, so
   there is no notion of drift as terms are added.
9. **`num_students: 12` in the metadata is a double-count** of the same six rows.
10. **Not usable for any real academic decision** — no promotion, no grading, no disciplinary use.
    The same advice appears in the UI copy and in the artifact's own `limitations` list.

### What would make it real, roughly in order

1. Real historical data across multiple cohorts and semesters, with outcomes that are *not* a
   formula over the inputs (actual GPA, progression, retention).
2. A genuine held-out split — and, given class counts, a stratified or repeated-CV scheme with
   enough rows per class to mean anything.
3. Calibration: the current confidence is a raw `max(probabilities)` from an uncalibrated forest.
4. A monitoring story — track feature drift and per-band error rates once it is live.
5. Governance: a documented review path before any prediction touches a real student's record.

None of that belongs in a hackathon demo, and none of it is claimed.

---

## 16. If asked in a review

| Question | Answer that holds up |
|---|---|
| "How accurate is it?" | "It reports 100 %, but that's training accuracy on 6 synthetic students — the metadata says `full_dataset_training`, `train_size = test_size = 6`. It demonstrates the integration, not a validated model." |
| "Why is there no AVERAGE band?" | "The training set had no AVERAGE examples, so the fitted forest has three classes. Rather than fabricate a 0.0, the service reads `classes_` and logs at boot which band it can never emit." |
| "What if the ML service is down?" | "The endpoint still returns 200 with `prediction_source: RULE_BASED` and a typed `fallback_reason`, and the UI labels it 'Rule-based fallback'. There are five typed failure modes and all of them are tested." |
| "How do you stop one student seeing another's prediction?" | "The feature vector is built from the JWT subject's own rows; there's no parameter that changes the target, and the E2E suite asserts a forged `studentId` changes nothing." |
| "How do you know the two feature implementations agree?" | "A parity harness runs the real Python extraction against the live database and diffs it against the SQL path — exact 44-name order plus a 1e-6 epsilon, currently 6 students × 44 features." |
| "Could someone pass their own score to the model?" | "No. The service accepts only a feature map, produces every number itself, and the backend rejects any response whose probability map disagrees with its own reported category." |
| "Would you use this on a real student?" | "No — and the artifact, the README and the UI all say so. The engineering is production-shaped; the model is a demonstration." |

---

## 17. File map

| Path | Role |
|---|---|
| `ml/models/performance_model.joblib` | the artifact: pipeline + `feature_names` + version (165 KB, committed) |
| `ml/models/performance_model_metadata.json` | metrics, confusion matrix, importances, limitations |
| `ml/inference/main.py` | FastAPI service: `POST /predict`, `GET /health`, `GET /model/info` |
| `ml/inference/requirements.txt` | serving dependencies only |
| `ml/requirements.txt` | training stack (pandas, scikit-learn, psycopg2) |
| `ml/training/feature_engineering.py` | the Python feature computation, `academic_score`, band thresholds |
| `ml/training/train.py` | load → features → labels → fit → evaluate → save |
| `ml/Dockerfile` | `python:3.11-slim`, healthcheck against `/health`, `uvicorn main:app --app-dir inference` |
| `ml/tests/test_ml.py`, `test_inference_service.py` | the 33 pytest tests |
| `ml/tests/_parity_dump.py`, `_parity_reference.json` | the Python side of the parity harness |
| `ml/pytest.ini` | pytest configuration |
| `ml/debug_features.py` | ad-hoc feature inspection helper |
| `backend/src/modules/performance/performance.features.ts` | **`ML_FEATURE_NAMES` — the contract** and the SQL implementation |
| `backend/src/modules/performance/performance.ml-client.ts` | the never-throwing client and the five failure reasons |
| `backend/src/modules/performance/performance.service.ts` | vector assembly, prediction, rule-based fallback |
| `backend/tests/ml-integration.mjs` | 61 assertions: real path + every degradation mode |
| `backend/tests/feature-parity.mjs` | order-and-value parity against Python |
| `frontend/e2e/phase5.e2e.mjs` | 48 browser assertions, including the degraded-path variant |
| `docs/ML_ARCHITECTURE.md` | the full integration contract and limitations |
