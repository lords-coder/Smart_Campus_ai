import os
import sys

ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(ML_DIR)

# Two import styles coexist in this tree and both have to resolve:
#   - tests use `ml.training.*`, which needs the repository root on sys.path;
#   - `ml/training/train.py` does a flat `import feature_engineering`,
#     which needs `ml/training` itself on sys.path.
for _path in (REPO_ROOT, os.path.join(ML_DIR, "training")):
    if _path not in sys.path:
        sys.path.insert(0, _path)
