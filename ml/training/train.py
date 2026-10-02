#!/usr/bin/env python3
"""
Training script for student performance prediction model.

Usage:
    python train.py

This script:
1. Connects to the PostgreSQL database
2. Extracts student features from attendance, assessments, assignments
3. Creates performance labels based on composite academic score
4. Trains a RandomForestClassifier
5. Evaluates the model
6. Saves the model artifact with metadata
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Tuple, Dict, Any

import psycopg2
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)

from feature_engineering import (
    PERFORMANCE_CATEGORIES,
    extract_features,
    prepare_training_data,
)


# Database connection - use environment variables
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'database': os.getenv('DB_NAME', 'smartcampus'),
    'user': os.getenv('DB_USER', 'smartcampus'),
    'password': os.getenv('DB_PASSWORD', 'smartcampus_dev'),
}

# Resolve paths relative to this script's directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.getenv('MODEL_PATH', os.path.join(SCRIPT_DIR, '..', 'models', 'performance_model.joblib'))
METADATA_PATH = os.getenv('METADATA_PATH', os.path.join(SCRIPT_DIR, '..', 'models', 'performance_model_metadata.json'))
RANDOM_STATE = 42


def load_data_from_db() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load all required tables from PostgreSQL.
    
    Note: Do not use RealDictCursor with pandas read_sql - it causes column names
    to be returned as values instead of actual data.
    """
    conn = psycopg2.connect(**DB_CONFIG)
    
    try:
        # Join students with users to get name
        students_df = pd.read_sql("""
            SELECT s.id, s.student_no, u.name, s.department, s.semester, s.section
            FROM students s
            JOIN users u ON u.id = s.user_id
        """, conn)
        attendance_df = pd.read_sql("SELECT id, student_id, course_id, status FROM attendance", conn)
        assessments_df = pd.read_sql("SELECT id, student_id, course_id, assessment_type, marks_obtained, max_marks FROM assessments", conn)
        assignments_df = pd.read_sql("SELECT id, student_id, course_id, submitted, score, max_score FROM assignments", conn)
        courses_df = pd.read_sql("SELECT id, code, name FROM courses", conn)
        
        print(f"Loaded: {len(students_df)} students, {len(attendance_df)} attendance records, "
              f"{len(assessments_df)} assessments, {len(assignments_df)} assignments, {len(courses_df)} courses")
        
        return students_df, attendance_df, assessments_df, assignments_df, courses_df
    finally:
        conn.close()


def train_model(X: pd.DataFrame, y: pd.Series) -> Pipeline:
    """Train a RandomForest classifier with preprocessing pipeline."""
    
    # Create pipeline with scaling and classifier
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_split=2,
            min_samples_leaf=1,
            class_weight='balanced',  # Handle class imbalance
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )),
    ])
    
    pipeline.fit(X, y)
    return pipeline


def evaluate_model(pipeline: Pipeline, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
    """Evaluate model performance.
    
    For very small datasets (few samples per class), uses a simple
    train-on-full-data approach with leave-one-out or just reports
    training accuracy, since proper CV is not feasible.
    """
    
    class_counts = y.value_counts()
    min_class_count = class_counts.min()
    n_samples = len(y)
    
    if min_class_count < 2 or n_samples < 10:
        # Too few samples for any meaningful CV - train on all data
        print(f"\nDataset too small for CV (n={n_samples}, min class count: {min_class_count}). Training on full dataset.")
        
        # Train on full dataset
        pipeline.fit(X, y)
        y_pred = pipeline.predict(X)
        
        accuracy = accuracy_score(y, y_pred)
        precision = precision_score(y, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y, y_pred, average='weighted', zero_division=0)
        
        report = classification_report(y, y_pred, labels=PERFORMANCE_CATEGORIES, target_names=PERFORMANCE_CATEGORIES, output_dict=True, zero_division=0)
        cm = confusion_matrix(y, y_pred, labels=PERFORMANCE_CATEGORIES)
        
        metrics = {
            'accuracy': float(accuracy),
            'precision_weighted': float(precision),
            'recall_weighted': float(recall),
            'f1_weighted': float(f1),
            'cv_accuracy_mean': float(accuracy),
            'cv_accuracy_std': 0.0,
            'classification_report': report,
            'confusion_matrix': cm.tolist(),
            'feature_importance': {},
            'test_size': n_samples,
            'train_size': n_samples,
            'evaluation_method': 'full_dataset_training',
        }
    else:
        # Normal train/test split with stratification
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
        )
        
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        y_proba = pipeline.predict_proba(X_test)
        
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
        cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring='accuracy')
        
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        
        report = classification_report(y_test, y_pred, target_names=PERFORMANCE_CATEGORIES, output_dict=True, zero_division=0)
        cm = confusion_matrix(y_test, y_pred, labels=PERFORMANCE_CATEGORIES)
        
        classifier = pipeline.named_steps['classifier']
        feature_importance = dict(zip(X.columns, classifier.feature_importances_))
        feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
        
        metrics = {
            'accuracy': float(accuracy),
            'precision_weighted': float(precision),
            'recall_weighted': float(recall),
            'f1_weighted': float(f1),
            'cv_accuracy_mean': float(cv_scores.mean()),
            'cv_accuracy_std': float(cv_scores.std()),
            'classification_report': report,
            'confusion_matrix': cm.tolist(),
            'feature_importance': feature_importance,
            'test_size': len(X_test),
            'train_size': len(X_train),
            'evaluation_method': 'train_test_split',
        }
    
    print(f"\n=== Model Evaluation ===")
    print(f"Accuracy: {metrics['accuracy']:.4f}")
    print(f"Precision (weighted): {metrics['precision_weighted']:.4f}")
    print(f"Recall (weighted): {metrics['recall_weighted']:.4f}")
    print(f"F1 (weighted): {metrics['f1_weighted']:.4f}")
    print(f"Evaluation method: {metrics['evaluation_method']}")
    print(f"\nClassification Report:")
    print(classification_report(y, pipeline.predict(X), labels=PERFORMANCE_CATEGORIES, target_names=PERFORMANCE_CATEGORIES, zero_division=0))
    print(f"\nConfusion Matrix:")
    print(metrics['confusion_matrix'])
    
    # Feature importance from final trained model
    classifier = pipeline.named_steps['classifier']
    feature_importance = dict(zip(X.columns, classifier.feature_importances_))
    feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
    metrics['feature_importance'] = feature_importance
    
    print(f"\nTop 10 Feature Importances:")
    for feat, imp in list(feature_importance.items())[:10]:
        print(f"  {feat}: {imp:.4f}")
    
    return metrics


def save_model(pipeline: Pipeline, feature_names: list, metrics: Dict[str, Any]) -> None:
    """Save model artifact and metadata."""
    
    # Save model
    model_artifact = {
        'pipeline': pipeline,
        'feature_names': feature_names,
        'performance_categories': PERFORMANCE_CATEGORIES,
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'model_version': 'v1',
    }
    joblib.dump(model_artifact, MODEL_PATH)
    print(f"\nModel saved to {MODEL_PATH}")
    
    # Save metadata
    metadata = {
        'model_version': 'v1',
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'model_type': 'RandomForestClassifier',
        'n_estimators': 200,
        'max_depth': 10,
        'feature_names': feature_names,
        'performance_categories': PERFORMANCE_CATEGORIES,
        'metrics': metrics,
        'data_source': 'SmartCampus demo seed data (synthetic)',
        'num_students': int(metrics.get('train_size', 0)) + int(metrics.get('test_size', 0)),
        'features': {
            'attendance': ['attendance_percentage', 'total_classes'] + 
                         [c for c in feature_names if c.startswith('attendance_') and not c.startswith('attendance_')],
            'assessments': ['avg_assessment_percentage', 'total_assessments'] +
                          [c for c in feature_names if c.startswith('assessment_') or c.startswith('assess_')],
            'assignments': ['assignment_submission_rate', 'total_assignments', 'avg_assignment_score'] +
                          [c for c in feature_names if c.startswith('assign_')],
        },
        'limitations': [
            'Trained on synthetic demo data (6 students only)',
            'No historical multi-semester data',
            'Class distribution may be imbalanced',
            'Not validated on real university data',
            'Model should not be used for real academic decisions',
        ],
    }
    
    with open(METADATA_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to {METADATA_PATH}")


def main():
    print("=== SmartCampus Performance Prediction - Model Training ===\n")
    
    # Load data
    print("Loading data from database...")
    students_df, attendance_df, assessments_df, assignments_df, courses_df = load_data_from_db()
    
    # Prepare features
    print("\nPreparing features...")
    X, y, feature_names = prepare_training_data(
        students_df, attendance_df, assessments_df, assignments_df, courses_df
    )
    
    print(f"\nFeature matrix: {X.shape}")
    print(f"Label distribution:\n{y.value_counts().sort_index()}")
    
    # Train model
    print("\nTraining model...")
    pipeline = train_model(X, y)
    
    # Evaluate
    print("\nEvaluating model...")
    metrics = evaluate_model(pipeline, X, y)
    
    # Save
    print("\nSaving model...")
    save_model(pipeline, feature_names, metrics)
    
    print("\n=== Training Complete ===")


if __name__ == '__main__':
    main()