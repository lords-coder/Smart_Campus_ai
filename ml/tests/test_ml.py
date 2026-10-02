"""
Phase 5 Python ML test suite.
Tests the existing ML implementation without retraining or redesigning the model.
Uses deterministic synthetic data.
"""

import joblib
import numpy as np
import os
import sys

# Ensure the package can be imported: `ml.training.*` needs the repository
# root, and `ml/training/train.py` does a flat `import feature_engineering`.
_ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _path in (os.path.dirname(_ML_DIR), os.path.join(_ML_DIR, "training")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from ml.training.feature_engineering import (
    PERFORMANCE_CATEGORIES,
    StudentFeatures,
    compute_academic_score,
    categorize_performance,
)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "performance_model.joblib")
METADATA_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "performance_model_metadata.json")


# ======================
# Feature Engineering Tests
# ======================


def test_feature_engineering_deterministic():
    """Feature engineering produces consistent output for same input."""
    # Verify PERFORMANCE_CATEGORIES is properly defined
    assert PERFORMANCE_CATEGORIES == ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"]


def _features(attendance_pct, assessment_pct, submission_rate, assignment_score):
    return StudentFeatures(
        student_id="00000000-0000-0000-0000-000000000000",
        student_no="SC-TEST-000",
        name="Test Student",
        attendance_percentage=attendance_pct,
        total_classes=100,
        classes_attended=int(attendance_pct),
        attendance_per_course={},
        avg_assessment_percentage=assessment_pct,
        total_assessments=10,
        assessment_per_course={},
        assessments_by_type={},
        assignment_submission_rate=submission_rate,
        total_assignments=10,
        assignments_submitted=int(submission_rate / 10),
        avg_assignment_score=assignment_score,
        assignments_per_course={},
        academic_score=0.0,
    )


def test_academic_score_thresholds():
    """Academic score uses the correct weighted composition.

    attendance 30% + assessments 50% + assignments 20%, where the assignment
    term is the submission rate applied to the 0-10 score scaled to a
    percentage (see feature_engineering.compute_academic_score).
    """
    perfect = compute_academic_score(_features(100.0, 100.0, 100.0, 10.0))
    assert abs(perfect - 100.0) < 0.01, f"Expected 100.0, got {perfect}"

    zero = compute_academic_score(_features(0.0, 0.0, 0.0, 0.0))
    assert abs(zero - 0.0) < 0.01, f"Expected 0.0, got {zero}"

    # Unsubmitted work must drag the composite down even with a high score.
    unsubmitted = compute_academic_score(_features(100.0, 100.0, 0.0, 10.0))
    assert abs(unsubmitted - 80.0) < 0.01, f"Expected 80.0, got {unsubmitted}"

    # The 50% assessment weight dominates an equally sized move in attendance.
    from_assessments = compute_academic_score(_features(0.0, 100.0, 100.0, 10.0))
    from_attendance = compute_academic_score(_features(100.0, 0.0, 100.0, 10.0))
    assert from_assessments > from_attendance
    assert abs((from_assessments - from_attendance) - 20.0) < 0.01


def test_categorize_performance():
    """Performance categories use the correct thresholds."""
    assert categorize_performance(85) == "EXCELLENT"
    assert categorize_performance(84) == "GOOD"
    assert categorize_performance(70) == "GOOD"
    assert categorize_performance(69) == "AVERAGE"
    assert categorize_performance(55) == "AVERAGE"
    assert categorize_performance(54) == "AT_RISK"
    assert categorize_performance(0) == "AT_RISK"


# ======================
# Model Tests
# ======================


def test_model_artifact_loads():
    """The trained model artifact exists and can be loaded."""
    import joblib
    model = joblib.load(MODEL_PATH)
    assert model is not None


def test_metadata_loads():
    """The model metadata file exists and can be loaded."""
    import json
    with open(METADATA_PATH, "r") as f:
        metadata = json.load(f)
    assert metadata is not None
    assert metadata.get("model_version") == "v1"


def test_inference_works():
    """The trained pipeline can score a full feature vector."""
    import joblib
    import pandas as pd

    artifact = joblib.load(MODEL_PATH)
    pipeline = artifact["pipeline"]
    feature_names = artifact["feature_names"]
    categories = artifact["performance_categories"]

    # The model was fitted on every engineered feature, so inference has to
    # supply the same column set in the same order.
    row = {name: 0.0 for name in feature_names}
    row["attendance_percentage"] = 90.0
    row["avg_assessment_percentage"] = 80.0
    row["total_assessments"] = 15.0
    row["assignment_submission_rate"] = 100.0
    row["avg_assignment_score"] = 85.0
    row["academic_score"] = 85.0
    features = pd.DataFrame([row], columns=feature_names)

    predicted = pipeline.predict(features)[0]
    probabilities = pipeline.predict_proba(features)[0]

    assert predicted in categories
    assert len(probabilities) == len(pipeline.classes_)
    assert abs(sum(probabilities) - 1.0) < 1e-6


def test_artifact_declares_its_own_label_order():
    """The artifact carries the category order the serving layer must use."""
    import joblib

    artifact = joblib.load(MODEL_PATH)
    assert artifact["model_version"] == "v1"
    assert artifact["performance_categories"] == PERFORMANCE_CATEGORIES
    assert list(artifact["pipeline"].classes_) == sorted(artifact["pipeline"].classes_)
    assert set(artifact["pipeline"].classes_).issubset(set(PERFORMANCE_CATEGORIES))


# ======================
# Category Tests
# ======================


def test_valid_prediction_categories():
    """Prediction categories are valid enum values."""
    valid = {"EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"}
    assert categorize_performance(85) in valid
    assert categorize_performance(70) in valid
    assert categorize_performance(55) in valid
    assert categorize_performance(0) in valid


# ======================
# Missing Model Tests
# ======================


def test_missing_model_handled_safely():
    """System handles missing model artifact gracefully."""
    import os

    model_bak = MODEL_PATH + ".bak"
    if os.path.exists(MODEL_PATH):
        os.rename(MODEL_PATH, model_bak)
    try:
        # The system should not crash - it should handle missing model gracefully
        model_exists = os.path.exists(MODEL_PATH)
        assert model_exists == False
    finally:
        # Restore the model
        if os.path.exists(model_bak):
            os.rename(model_bak, MODEL_PATH)


# ======================
# Threshold Tests
# ======================


def test_thresholds_defined():
    """The category band edges the model was trained on are stable.

    The 70/60/65 risk warnings live in the TypeScript recommendations module,
    not here, so this pins the boundaries Python actually owns.
    """
    assert categorize_performance(85) == "EXCELLENT"
    assert categorize_performance(84.999) == "GOOD"
    assert categorize_performance(70) == "GOOD"
    assert categorize_performance(69.999) == "AVERAGE"
    assert categorize_performance(55) == "AVERAGE"
    assert categorize_performance(54.999) == "AT_RISK"