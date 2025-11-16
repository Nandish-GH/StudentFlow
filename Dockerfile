# Minimal Dockerfile for StudentFlow FastAPI service
FROM python:3.13-slim

# Prevent Python from writing .pyc and ensure stdout/stderr unbuffered
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# System deps (build-essential for some optional libs); remove cache afterwards
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create /data directory for database persistence
RUN mkdir -p /data && chmod 777 /data

# Expose the default port (Cloud Run/GAE will set $PORT dynamically)
EXPOSE 8080

# Use sh -c so $PORT env resolves; fall back to 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
