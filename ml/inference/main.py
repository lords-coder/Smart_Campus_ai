"""
FastAPI inference service for student performance prediction.

This service loads the trained ML model and serves predictions from a fully
engineered feature vector.

It is a standalone artifact server. It does NOT:
- Access the database directly
- Handle authentication
- Know about student identities
- Trust caller-supplied labels or confidences — every number it returns is
  produced by the fitted pipeline

Integration contract (implemented):

    GET /api/performance/predict   (Express, STUDENT-only)
      -> backend builds the 44-feature vector from the student's own records
      -> POST here with {"features": {...}}
      -> this service scores it with ml/models/performance_model.joblib
      -> returns category/confidence/probabilities/model_version
      -> Express validates the response and, if this service is unavailable,
         falls back to a rule-based estimate tagged RULE_BASED

Callers must send every feature name in the model's `feature_names`, in any
order (the service reorders internally). Unknown extra keys are ignored;
missing ones are rejected with 400.
"""

import os
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model paths - relative to this file
SCRIPT_DIR = Path(__file__).parent.absolute()
MODEL_PATH = SCRIPT_DIR.parent / "models" / "performance_model.joblib"
METADATA_PATH = SCRIPT_DIR.parent / "models" / "performance_model_metadata.json"

# Performance categories (must match training)
PERFORMANCE_CATEGORIES = ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"]


class PredictionRequest(BaseModel):
    """Request schema for prediction endpoint."""

    model_config = ConfigDict(protected_namespaces=())

    features: Dict[str, float] = Field(..., description="Feature vector for prediction")

    @field_validator("features")
    @classmethod
    def check_features(cls, v):
        if not v:
            raise ValueError("Features cannot be empty")
        for key, val in v.items():
            if not isinstance(val, (int, float)) or isinstance(val, bool):
                raise ValueError(f"Feature '{key}' must be numeric")
            if np.isnan(val) or np.isinf(val):
                raise ValueError(f"Feature '{key}' cannot be NaN or Infinity")
        return v


class PredictionResponse(BaseModel):
    """Response schema for the prediction endpoint.

    `probabilities` carries exactly the classes the fitted model declares in
    `classes_` — no more, no fewer. A band the model never learned is omitted
    rather than reported as 0.0, so a consumer can tell "the model says 0"
    apart from "the model cannot say".
    """
    category: str = Field(..., description="Predicted performance category label")
    confidence: float = Field(..., description="Model confidence (0-1), the max class probability")
    probabilities: Dict[str, float] = Field(..., description="Class probabilities keyed by the model's own classes")
    model_version: str = Field(..., description="Version of the loaded artifact")
    features_used: List[str] = Field(..., description="Ordered feature names the model consumed")
    model_loaded: bool = Field(..., description="Whether a model is loaded and served")
    feature_count: int = Field(..., description="Number of features the model expects")
    predicted_at: str = Field(..., description="ISO-8601 UTC timestamp of this inference")
    model_trained_at: Optional[str] = Field(None, description="Training timestamp recorded in the model metadata")

    # `model_version` / `model_loaded` / `model_trained_at` collide with pydantic's
    # protected `model_` namespace; these are response field names, not overrides.
    model_config = ConfigDict(protected_namespaces=())


class HealthResponse(BaseModel):
    """Health check response."""

    model_config = ConfigDict(protected_namespaces=())

    status: str
    model_loaded: bool
    model_version: Optional[str] = None
    model_trained_at: Optional[str] = None
    feature_count: Optional[int] = None
    classes: List[str] = Field(default_factory=list, description="Class labels the model can predict")


# Global model state
model_pipeline = None
model_metadata = None
feature_names = None


def model_class_labels() -> List[str]:
    """Class labels the fitted model can actually predict.

    Taken from `classes_` rather than assumed to be the four
    PERFORMANCE_CATEGORIES: the training set contained no AVERAGE examples, so
    the fitted model has three classes and can never emit that label.
    """
    if model_pipeline is None:
        return []
    return [str(label) for label in model_pipeline.classes_]


def load_model() -> bool:
    """Load the trained model and metadata."""
    global model_pipeline, model_metadata, feature_names
    
    try:
        if not MODEL_PATH.exists():
            logger.error(f"Model file not found: {MODEL_PATH}")
            return False
        
        if not METADATA_PATH.exists():
            logger.error(f"Metadata file not found: {METADATA_PATH}")
            return False
        
        # Load model artifact
        model_artifact = joblib.load(MODEL_PATH)
        model_pipeline = model_artifact['pipeline']
        feature_names = model_artifact['feature_names']
        
        # Load metadata
        with open(METADATA_PATH, 'r') as f:
            model_metadata = json.load(f)
        
        logger.info(f"Model loaded successfully: version={model_metadata.get('model_version')}, trained_at={model_metadata.get('trained_at')}")
        logger.info(f"Feature count: {len(feature_names)}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False


def validate_features(features: Dict[str, float]) -> np.ndarray:
    """Validate and convert features to model input array."""
    if model_pipeline is None or feature_names is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Check for missing features
    missing = set(feature_names) - set(features.keys())
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required features: {sorted(missing)}"
        )
    
    # Check for extra features (warn but don't fail)
    extra = set(features.keys()) - set(feature_names)
    if extra:
        logger.warning(f"Extra features provided (will be ignored): {sorted(extra)}")
    
    # Build feature array in correct order
    feature_array = np.array([[features.get(name, 0.0) for name in feature_names]], dtype=np.float32)
    
    # Validate no NaN/Inf
    if np.any(np.isnan(feature_array)) or np.any(np.isinf(feature_array)):
        raise HTTPException(status_code=400, detail="Features contain NaN or Infinity values")
    
    return feature_array


# FastAPI app
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load the model before serving, and report what it cannot predict."""
    if not load_model():
        logger.error("Failed to load model on startup. /predict will return 503.")
        yield
        return

    learned = set(model_class_labels())
    unseen = [c for c in PERFORMANCE_CATEGORIES if c not in learned]
    if unseen:
        # A band absent from `classes_` can never be produced. Saying so at boot
        # keeps the limitation visible instead of implying four-way support.
        logger.warning("Model cannot predict these categories: %s", unseen)
    logger.info("Serving predictions for classes: %s", model_class_labels())
    yield


app = FastAPI(
    title="SmartCampus Performance Prediction API",
    description="ML inference service for student performance prediction",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy" if model_pipeline is not None else "degraded",
        model_loaded=model_pipeline is not None,
        model_version=model_metadata.get('model_version') if model_metadata else None,
        model_trained_at=model_metadata.get('trained_at') if model_metadata else None,
        feature_count=len(feature_names) if feature_names else None,
        classes=model_class_labels(),
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Predict student performance category from a full engineered feature vector.

    The caller is responsible for authentication, authorization and building
    the feature vector; this service only scores it. See the module docstring
    for the integration contract.
    """
    if model_pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Validate and convert features
    feature_array = validate_features(request.features)

    try:
        # The classifier is fitted on category labels, so `classes_` is the
        # authoritative label order for both the prediction and the
        # probability vector. Indexing PERFORMANCE_CATEGORIES instead would
        # both crash and mislabel: the training set never contained every band.
        class_labels = model_class_labels()
        prediction = str(model_pipeline.predict(feature_array)[0])
        probabilities = model_pipeline.predict_proba(feature_array)[0]

        if prediction not in class_labels:
            raise ValueError(f"model returned unknown label {prediction!r}")

        prob_dict = {class_labels[i]: float(probabilities[i]) for i in range(len(class_labels))}

        return PredictionResponse(
            category=prediction,
            confidence=float(np.max(probabilities)),
            probabilities=prob_dict,
            model_version=model_metadata.get('model_version', 'unknown'),
            features_used=feature_names,
            model_loaded=True,
            feature_count=len(feature_names),
            predicted_at=datetime.now(timezone.utc).isoformat(),
            model_trained_at=model_metadata.get('trained_at') if model_metadata else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Log the detail server-side, return a generic message: internal paths
        # and stack traces must not reach the caller.
        logger.error("Prediction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.get("/model/info")
async def model_info():
    """Get model metadata."""
    if model_metadata is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return model_metadata


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)