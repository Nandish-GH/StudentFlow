# Use Python 3.13 slim image
FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create /tmp directory for database (Google Cloud Run requirement)
RUN mkdir -p /tmp && chmod 777 /tmp

# Set environment variables for Google Cloud
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV GAE_ENV=standard

# Expose port (Google Cloud Run uses $PORT environment variable)
EXPOSE 8080

# Run the application (use $PORT env variable for Cloud Run)
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}
