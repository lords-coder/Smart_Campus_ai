import psycopg2
import pandas as pd
import sys
sys.path.insert(0, 'ml/training')

from feature_engineering import extract_features, categorize_performance

DB_CONFIG = {
    'host': 'localhost', 'port': 5432, 'database': 'smartcampus',
    'user': 'smartcampus', 'password': 'smartcampus_dev',
}

conn = psycopg2.connect(**DB_CONFIG)
students_df = pd.read_sql("""
    SELECT s.id, s.student_no, u.name, s.department, s.semester, s.section
    FROM students s
    JOIN users u ON u.id = s.user_id
""", conn)
attendance_df = pd.read_sql('SELECT id, student_id, course_id, status FROM attendance', conn)
assessments_df = pd.read_sql('SELECT id, student_id, course_id, assessment_type, marks_obtained, max_marks FROM assessments', conn)
assignments_df = pd.read_sql('SELECT id, student_id, course_id, submitted, score, max_score FROM assignments', conn)
courses_df = pd.read_sql('SELECT id, code, name FROM courses', conn)

X, y = extract_features(students_df, attendance_df, assessments_df, assignments_df, courses_df)

for _, row in X.iterrows():
    print(f"{row['name']} (No: {row['student_no']}):")
    print(f"  attendance: {row['attendance_percentage']:.1f}%")
    print(f"  avg assessment: {row['avg_assessment_percentage']:.1f}%")
    print(f"  assignment submission: {row['assignment_submission_rate']:.1f}%")
    print(f"  avg assignment score: {row['avg_assignment_score']:.1f}")
    print(f"  academic_score: {row['academic_score']:.1f}")
    print(f"  category: {categorize_performance(row['academic_score'])}")
    print()