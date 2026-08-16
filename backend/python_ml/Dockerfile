# Apex ML microservice — Python FastAPI (injury risk, decision EV, momentum Cox, timeout)
FROM python:3.12-slim

WORKDIR /app

# Build deps for scikit-learn / lifelines wheels (slim images lack gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8001
ENV ENVIRONMENT=development
ENV ALLOWED_ORIGINS="http://localhost:8000,http://localhost:8081"
ENV WP_TRAINING_DATA="app/data/training/wp_training.json"
ENV TIMEOUT_TRAINING_DATA="app/data/training/timeout_training.json"

# Warm up / train the models at build time so the image ships ready to serve.
# Trained artifacts land in models/ (persisted via a volume at runtime).
RUN python -c "from app.main import _warm_up_models; _warm_up_models()"

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
