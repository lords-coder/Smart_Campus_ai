"""Throwaway parity harness: dump the authoritative 44-feature vector per student.

Runs the REAL ml/training/feature_engineering.extract_features against the live
database so the backend implementation can be diffed against it. Not part of
the shipped test suite.
"""
import json
import os
import sys

import pandas as pd
import psycopg2

ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(ML_DIR))
sys.path.insert(0, os.path.join(ML_DIR, "training"))

from ml.training.feature_engineering import extract_features, prepare_training_data

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "smartcampus"),
    "user": os.getenv("DB_USER", "smartcampus"),
    "password": os.getenv("DB_PASSWORD", "smartcampus_dev"),
}

conn = psycopg2.connect(**DB_CONFIG)
students_df = pd.read_sql(
    "SELECT s.id, s.student_no, u.name, s.department, s.semester, s.section "
    "FROM students s JOIN users u ON u.id = s.user_id",
    conn,
)
attendance_df = pd.read_sql("SELECT id, student_id, course_id, status FROM attendance", conn)
assessments_df = pd.read_sql(
    "SELECT id, student_id, course_id, assessment_type, marks_obtained, max_marks FROM assessments", conn
)
assignments_df = pd.read_sql(
    "SELECT id, student_id, course_id, submitted, score, max_score FROM assignments", conn
)
courses_df = pd.read_sql("SELECT id, code, name FROM courses", conn)
conn.close()

X, y, feature_names = prepare_training_data(
    students_df, attendance_df, assessments_df, assignments_df, courses_df
)

out = {
    "feature_names": list(feature_names),
    "feature_count": len(feature_names),
    "students": {},
}
for idx, row in X.iterrows():
    student_no = students_df.iloc[idx]["student_no"]
    out["students"][student_no] = {
        "label": str(y.iloc[idx]),
        "features": {k: (float(v) if pd.notna(v) else 0.0) for k, v in row.items()},
    }

dest = os.path.join(ML_DIR, "tests", "_parity_reference.json")
with open(dest, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2, sort_keys=True)

print(f"features: {out['feature_count']}")
print(f"students: {len(out['students'])}")
print(f"wrote: {dest}")
