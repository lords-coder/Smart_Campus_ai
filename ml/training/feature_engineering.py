"""
Feature engineering for student performance prediction.
Transforms raw database records into model-ready feature vectors.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass


# Performance categories - keep centralized
PERFORMANCE_CATEGORIES = ["EXCELLENT", "GOOD", "AVERAGE", "AT_RISK"]
PERFORMANCE_TO_LABEL = {cat: i for i, cat in enumerate(PERFORMANCE_CATEGORIES)}
LABEL_TO_PERFORMANCE = {i: cat for i, cat in enumerate(PERFORMANCE_CATEGORIES)}


@dataclass
class StudentFeatures:
    """Feature vector for a single student."""
    student_id: str
    student_no: str
    name: str
    
    # Attendance features
    attendance_percentage: float
    total_classes: int
    classes_attended: int
    attendance_per_course: Dict[str, float]
    
    # Assessment features
    avg_assessment_percentage: float
    total_assessments: int
    assessment_per_course: Dict[str, float]
    assessments_by_type: Dict[str, Dict[str, float]]  # type -> {avg, count}
    
    # Assignment features
    assignment_submission_rate: float
    total_assignments: int
    assignments_submitted: int
    avg_assignment_score: float
    assignments_per_course: Dict[str, Dict[str, float]]  # course -> {submission_rate, avg_score}
    
    # Combined academic score (used as target basis)
    academic_score: float


def compute_academic_score(features: StudentFeatures) -> float:
    """
    Compute a composite academic score from features.
    Weighted combination of attendance (30%), assessments (50%), assignments (20%).
    All components normalized to 0-100 scale.
    """
    attendance_weight = 0.30
    assessment_weight = 0.50
    assignment_weight = 0.20
    
    # Attendance is already 0-100
    attendance_score = features.attendance_percentage
    
    # Assessment percentage is already 0-100
    assessment_score = features.avg_assessment_percentage
    
    # Assignment: submission_rate (0-100) * normalized avg_score (0-100)
    # avg_assignment_score is out of 10, convert to percentage
    assignment_score_pct = features.avg_assignment_score * 10.0  # 10 -> 100%
    assignment_score = (features.assignment_submission_rate / 100.0) * assignment_score_pct
    
    score = (
        attendance_score * attendance_weight +
        assessment_score * assessment_weight +
        assignment_score * assignment_weight
    )
    
    return min(100.0, max(0.0, score))


def categorize_performance(score: float) -> str:
    """
    Categorize academic score into performance bands.
    Thresholds chosen to create meaningful distribution.
    """
    if score >= 85:
        return "EXCELLENT"
    elif score >= 70:
        return "GOOD"
    elif score >= 55:
        return "AVERAGE"
    else:
        return "AT_RISK"


def extract_features(
    students_df: pd.DataFrame,
    attendance_df: pd.DataFrame,
    assessments_df: pd.DataFrame,
    assignments_df: pd.DataFrame,
    courses_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Extract features for all students and return feature matrix and labels.
    
    Returns:
        X: DataFrame with features
        y: Series with performance category labels
    """
    features_list = []
    
    for _, student in students_df.iterrows():
        student_id = student['id']
        student_no = student['student_no']
        name = student['name']
        
        # --- Attendance features ---
        student_attendance = attendance_df[attendance_df['student_id'] == student_id]
        total_classes = len(student_attendance)
        classes_attended = len(student_attendance[student_attendance['status'].isin(['PRESENT', 'LATE'])])
        attendance_pct = (classes_attended / total_classes * 100) if total_classes > 0 else 0.0
        
        # Per-course attendance
        attendance_per_course = {}
        for _, course in courses_df.iterrows():
            course_att = student_attendance[student_attendance['course_id'] == course['id']]
            if len(course_att) > 0:
                attended = len(course_att[course_att['status'].isin(['PRESENT', 'LATE'])])
                attendance_per_course[course['code']] = attended / len(course_att) * 100
            else:
                attendance_per_course[course['code']] = 0.0
        
        # --- Assessment features ---
        student_assessments = assessments_df[assessments_df['student_id'] == student_id]
        total_assessments = len(student_assessments)
        
        if total_assessments > 0:
            student_assessments = student_assessments.copy()
            student_assessments['percentage'] = (student_assessments['marks_obtained'] / student_assessments['max_marks']) * 100
            avg_assessment_pct = student_assessments['percentage'].mean()
        else:
            avg_assessment_pct = 0.0
        
        # Per-course assessments
        assessment_per_course = {}
        assessments_by_type = {}
        for _, course in courses_df.iterrows():
            course_ass = student_assessments[student_assessments['course_id'] == course['id']]
            if len(course_ass) > 0:
                assessment_per_course[course['code']] = course_ass['percentage'].mean()
            else:
                assessment_per_course[course['code']] = 0.0
        
        for a_type in ['QUIZ', 'MIDTERM', 'FINAL', 'PROJECT', 'LAB', 'ASSIGNMENT']:
            type_ass = student_assessments[student_assessments['assessment_type'] == a_type]
            if len(type_ass) > 0:
                assessments_by_type[a_type] = {
                    'avg': type_ass['percentage'].mean(),
                    'count': len(type_ass)
                }
            else:
                assessments_by_type[a_type] = {'avg': 0.0, 'count': 0}
        
        # --- Assignment features ---
        student_assignments = assignments_df[assignments_df['student_id'] == student_id]
        total_assignments = len(student_assignments)
        assignments_submitted = student_assignments['submitted'].sum() if total_assignments > 0 else 0
        submission_rate = (assignments_submitted / total_assignments * 100) if total_assignments > 0 else 0.0
        
        submitted_assignments = student_assignments[student_assignments['submitted'] == True]
        avg_assignment_score = submitted_assignments['score'].mean() if len(submitted_assignments) > 0 else 0.0
        
        assignments_per_course = {}
        for _, course in courses_df.iterrows():
            course_assign = student_assignments[student_assignments['course_id'] == course['id']]
            if len(course_assign) > 0:
                sub_rate = course_assign['submitted'].mean() * 100
                sub_assign = course_assign[course_assign['submitted'] == True]
                avg_score = sub_assign['score'].mean() if len(sub_assign) > 0 else 0.0
                assignments_per_course[course['code']] = {
                    'submission_rate': sub_rate,
                    'avg_score': avg_score
                }
            else:
                assignments_per_course[course['code']] = {'submission_rate': 0.0, 'avg_score': 0.0}
        
        # --- Create feature object ---
        features = StudentFeatures(
            student_id=student_id,
            student_no=student_no,
            name=name,
            attendance_percentage=attendance_pct,
            total_classes=total_classes,
            classes_attended=classes_attended,
            attendance_per_course=attendance_per_course,
            avg_assessment_percentage=avg_assessment_pct,
            total_assessments=total_assessments,
            assessment_per_course=assessment_per_course,
            assessments_by_type=assessments_by_type,
            assignment_submission_rate=submission_rate,
            total_assignments=total_assignments,
            assignments_submitted=int(assignments_submitted),
            avg_assignment_score=avg_assignment_score,
            assignments_per_course=assignments_per_course,
            academic_score=0.0,  # Will compute below
        )
        
        features.academic_score = compute_academic_score(features)
        features_list.append(features)
    
    # Convert to DataFrame for model training
    rows = []
    labels = []
    for f in features_list:
        row = {
            'student_id': f.student_id,
            'student_no': f.student_no,
            'name': f.name,
            'attendance_percentage': f.attendance_percentage,
            'total_classes': f.total_classes,
            'avg_assessment_percentage': f.avg_assessment_percentage,
            'total_assessments': f.total_assessments,
            'assignment_submission_rate': f.assignment_submission_rate,
            'total_assignments': f.total_assignments,
            'avg_assignment_score': f.avg_assignment_score,
            'academic_score': f.academic_score,
        }
        # Add per-course attendance
        for code, pct in f.attendance_per_course.items():
            row[f'attendance_{code}'] = pct
        # Add per-course assessments
        for code, pct in f.assessment_per_course.items():
            row[f'assessment_{code}'] = pct
        # Add per-course assignments
        for code, data in f.assignments_per_course.items():
            row[f'assign_sub_{code}'] = data['submission_rate']
            row[f'assign_score_{code}'] = data['avg_score']
        # Assessment type features
        for a_type, data in f.assessments_by_type.items():
            row[f'assess_{a_type}_avg'] = data['avg']
            row[f'assess_{a_type}_count'] = data['count']
        
        rows.append(row)
        labels.append(categorize_performance(f.academic_score))
    
    X = pd.DataFrame(rows)
    y = pd.Series(labels, name='performance_category')
    
    return X, y


def prepare_training_data(
    students_df: pd.DataFrame,
    attendance_df: pd.DataFrame,
    assessments_df: pd.DataFrame,
    assignments_df: pd.DataFrame,
    courses_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    """
    Prepare feature matrix and labels for training.
    
    Returns:
        X: Feature matrix (numeric features only)
        y: Labels
        feature_names: List of feature column names
    """
    X_raw, y = extract_features(students_df, attendance_df, assessments_df, assignments_df, courses_df)
    
    # Select only numeric features for training (exclude identifiers)
    exclude_cols = ['student_id', 'student_no', 'name']
    feature_cols = [c for c in X_raw.columns if c not in exclude_cols]
    
    X = X_raw[feature_cols].copy()
    
    # Handle any NaN values (shouldn't happen with our defaults but safe)
    X = X.fillna(0.0)
    
    return X, y, feature_cols


def validate_features(X: pd.DataFrame, feature_names: List[str]) -> None:
    """Validate feature matrix for training."""
    assert len(X) > 0, "Empty feature matrix"
    assert X.shape[1] == len(feature_names), "Feature count mismatch"
    assert not X.isnull().any().any(), "NaN values in features"
    assert np.all(np.isfinite(X.values)), "Non-finite values in features"
    print(f"Feature matrix shape: {X.shape}")
    print(f"Features: {feature_names}")
    print(f"Label distribution:\n{y.value_counts().sort_index()}")