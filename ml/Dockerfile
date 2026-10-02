# SmartCampus ML inference service.
#
# Serves the trained performance model. Build context is ./ml so that both the
# inference app and the model artifact ship in one image:
#   docker compose up -d --build ml-service
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app/ml

# Install the serving dependencies. requirements.txt carries the training
# stack (pandas, scikit-learn, joblib); inference additionally needs FastAPI.
COPY requirements.txt ./requirements.txt
COPY inference/requirements.txt ./inference/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r inference/requirements.txt

# Application code and the trained artifact.
COPY inference/ ./inference/
COPY models/ ./models/

ENV PORT=8001
EXPOSE 8001

# Fail fast if the model cannot load, so a broken artifact is visible at boot
# rather than as a silent 503 on the first prediction.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "main:app", "--app-dir", "inference", "--host", "0.0.0.0", "--port", "8001"]
