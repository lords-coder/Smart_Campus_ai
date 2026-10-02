"""
Inference service contract tests (Phase 5).

Exercises the real FastAPI app against the real trained artifact. Nothing here
stubs the pipeline: every prediction goes through
`ml/models/performance_model.joblib`.
"""

import os
import sys

import joblib
import pytest
from fastapi.testclient import TestClient

_ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _path in (os.path.dirname(_ML_DIR), os.path.join(_ML_DIR, "inference")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import main as inference  # noqa: E402  (path set up above)
from main import PredictionRequest  # noqa: E402

MODEL_PATH = os.path.join(_ML_DIR, "models", "performance_model.joblib")
METADATA_PATH = os.path.join(_ML_DIR, "models", "performance_model_metadata.json")

EXPECTED_FEATURE_COUNT = 44


@pytest.fixture(scope="module")
def artifact():
    return joblib.load(MODEL_PATH)


@pytest.fixture(scope="module")
def client():
    """A TestClient with the real model loaded, mirroring service startup."""
    assert inference.load_model(), "model failed to load"
    with TestClient(inference.app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def full_vector(artifact):
    """A complete, finite feature vector in the model's own column order."""
    return {name: 0.0 for name in artifact["feature_names"]}


def strong_vector(artifact):
    """A feature vector describing a strong student."""
    row = {name: 0.0 for name in artifact["feature_names"]}
    row.update(
        {
            "attendance_percentage": 95.0,
            "avg_assessment_percentage": 88.0,
            "total_assessments": 18.0,
            "assignment_submission_rate": 100.0,
            "total_assignments": 16.0,
            "avg_assignment_score": 9.0,
            "academic_score": 91.0,
        }
    )
    for code in ("CS301", "CS305", "CS311", "CS315", "CS321", "MA201"):
        row[f"attendance_{code}"] = 95.0
        row[f"assessment_{code}"] = 88.0
        row[f"assign_sub_{code}"] = 100.0
        row[f"assign_score_{code}"] = 9.0
    return row


# ======================
# 1-2. Artifact and metadata
# ======================


def test_model_artifact_loads(artifact):
    """The real artifact exposes the keys the service relies on."""
    assert artifact is not None
    for key in ("pipeline", "feature_names", "performance_categories"):
        assert key in artifact, f"artifact missing {key!r}"
    assert hasattr(artifact["pipeline"], "predict")
    assert hasattr(artifact["pipeline"], "predict_proba")


def test_metadata_loads():
    """Metadata records the version the service reports."""
    import json

    with open(METADATA_PATH, "r", encoding="utf-8") as fh:
        metadata = json.load(fh)
    assert metadata["model_version"] == "v1"
    assert metadata["trained_at"]


# ======================
# 3-4. Feature contract
# ======================


def test_exact_feature_count(artifact):
    """The contract is exactly 44 columns, not 6 aggregates."""
    assert len(artifact["feature_names"]) == EXPECTED_FEATURE_COUNT


def test_feature_names_are_unique(artifact):
    names = artifact["feature_names"]
    assert len(set(names)) == len(names)


def test_feature_order_is_stable(client, artifact, full_vector):
    """Reordering the payload must not change the result: the service owns order."""
    import numpy as np

    forward = strong_vector(artifact)
    reversed_payload = dict(reversed(list(forward.items())))

    # The service reads by name and reorders into the model's column order, so
    # both payloads must produce the same array and the same prediction.
    assert np.array_equal(
        inference.validate_features(forward), inference.validate_features(reversed_payload)
    )

    first = client.post("/predict", json={"features": forward}).json()
    second = client.post("/predict", json={"features": reversed_payload}).json()
    assert first["category"] == second["category"]
    assert first["confidence"] == second["confidence"]


def test_aggregate_features_are_present(artifact):
    """The 8 aggregate features the backend also reports are in the contract."""
    names = set(artifact["feature_names"])
    for expected in (
        "attendance_percentage",
        "total_classes",
        "avg_assessment_percentage",
        "total_assessments",
        "assignment_submission_rate",
        "total_assignments",
        "avg_assignment_score",
        "academic_score",
    ):
        assert expected in names, f"missing aggregate feature {expected}"


def test_per_course_and_per_type_features_are_present(artifact):
    names = artifact["feature_names"]
    for code in ("CS301", "CS305", "CS311", "CS315", "CS321", "MA201"):
        assert f"attendance_{code}" in names
        assert f"assessment_{code}" in names
        assert f"assign_sub_{code}" in names
        assert f"assign_score_{code}" in names
    for assessment_type in ("QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB", "ASSIGNMENT"):
        assert f"assess_{assessment_type}_avg" in names
        assert f"assess_{assessment_type}_count" in names


# ======================
# 5-8. Prediction correctness
# ======================


def test_inference_succeeds(client, artifact, full_vector):
    """A full vector produces a real prediction through the real pipeline."""
    response = client.post("/predict", json={"features": full_vector})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["model_loaded"] is True
    assert body["category"] in artifact["performance_categories"]


def test_class_labels_come_from_model(artifact):
    """Labels are the model's own classes, not the full category list."""
    labels = inference.model_class_labels()
    assert labels == sorted(str(c) for c in artifact["pipeline"].classes_)
    assert "AVERAGE" not in labels, "model must not claim a class it never learned"
    assert len(labels) == 3


def test_probabilities_match_returned_classes(client, artifact):
    body = client.post("/predict", json={"features": strong_vector(artifact)}).json()
    labels = set(inference.model_class_labels())
    assert set(body["probabilities"]) == labels
    assert "AVERAGE" not in body["probabilities"]
    assert set(body["probabilities"]) != set(PERFORMANCE_ALL)


def test_confidence_equals_max_probability(client, artifact):
    body = client.post("/predict", json={"features": strong_vector(artifact)}).json()
    assert body["confidence"] == pytest.approx(max(body["probabilities"].values()))
    assert 0.0 <= body["confidence"] <= 1.0
    assert sum(body["probabilities"].values()) == pytest.approx(1.0)


def test_response_reports_model_version_and_features(client, artifact):
    body = client.post("/predict", json={"features": strong_vector(artifact)}).json()
    assert body["model_version"] == "v1"
    assert body["feature_count"] == EXPECTED_FEATURE_COUNT
    assert body["features_used"] == artifact["feature_names"]
    assert body["predicted_at"]
    assert body["model_trained_at"]


# ======================
# 9-10. Input validation
# ======================


def test_missing_features_are_rejected(client, full_vector):
    partial = dict(full_vector)
    partial.pop("attendance_percentage")
    response = client.post("/predict", json={"features": partial})
    assert response.status_code == 400
    assert "Missing required features" in response.json()["detail"]


def test_empty_features_are_rejected(client):
    response = client.post("/predict", json={"features": {}})
    assert response.status_code in (400, 422)


def test_non_numeric_feature_is_rejected(client, full_vector):
    bad = dict(full_vector)
    bad["attendance_percentage"] = "ninety"
    assert client.post("/predict", json={"features": bad}).status_code == 422


def test_null_feature_is_rejected(client, full_vector):
    """A JSON null (what a NaN/Infinity serialises to) is a client error, not a 500."""
    bad = dict(full_vector)
    bad["attendance_percentage"] = None
    response = client.post("/predict", json={"features": bad})
    assert response.status_code == 422


def test_non_finite_values_are_rejected_by_the_validator(full_vector):
    """The guard itself rejects NaN/Inf, checked outside JSON.

    NaN and Infinity cannot be encoded in JSON, so a caller can never deliver
    them over the wire; the backend client rejects them before the request is
    made. The validator is still verified directly so the guarantee holds.
    """
    from pydantic import ValidationError

    for bad_value in (float("nan"), float("inf"), float("-inf")):
        payload = dict(full_vector)
        payload["attendance_percentage"] = bad_value
        with pytest.raises(ValidationError):
            PredictionRequest(features=payload)


def test_malformed_body_is_rejected(client):
    assert client.post("/predict", json={}).status_code == 422
    assert client.post("/predict", content="not json", headers={"content-type": "application/json"}).status_code == 422


def test_extra_features_are_ignored(client, artifact, full_vector):
    extra = dict(full_vector)
    extra["not_a_model_feature"] = 1.0
    assert client.post("/predict", json={"features": extra}).status_code == 200


# ======================
# 11-13. Service endpoints
# ======================


def test_health(client, artifact):
    body = client.get("/health").json()
    assert body["status"] == "healthy"
    assert body["model_loaded"] is True
    assert body["model_version"] == "v1"
    assert body["feature_count"] == EXPECTED_FEATURE_COUNT
    assert set(body["classes"]) == set(inference.model_class_labels())


def test_model_info(client):
    body = client.get("/model/info").json()
    assert body["model_version"] == "v1"
    assert len(body["feature_names"]) == EXPECTED_FEATURE_COUNT


def test_predict_endpoint_round_trip(client, artifact, full_vector):
    response = client.post("/predict", json={"features": full_vector})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "category",
        "confidence",
        "probabilities",
        "model_version",
        "features_used",
        "model_loaded",
        "feature_count",
        "predicted_at",
        "model_trained_at",
    }


def test_prediction_errors_do_not_leak_internals(client, full_vector, monkeypatch):
    """A pipeline failure must not expose a stack trace or filesystem paths."""
    import numpy as np

    real_pipeline = inference.model_pipeline

    class ExplodingModel:
        classes_ = np.array(["AT_RISK"])

        def predict(self, _x):
            raise RuntimeError("boom at /secret/path/model.pkl")

        def predict_proba(self, _x):
            raise RuntimeError("boom")

    monkeypatch.setattr(inference, "model_pipeline", ExplodingModel())
    try:
        response = client.post("/predict", json={"features": full_vector})
    finally:
        # Restore explicitly; the finally block runs before monkeypatch undoes.
        inference.model_pipeline = real_pipeline

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "Prediction failed"
    assert "/secret/path" not in detail
    assert "Traceback" not in detail
    assert "RuntimeError" not in detail


# Full set of training categories, for asserting the model does NOT claim them.
PERFORMANCE_ALL = ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"]
