FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-backend.txt /app/requirements-backend.txt
RUN pip install --no-cache-dir -r /app/requirements-backend.txt

COPY . /app

EXPOSE 8122

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8122"]
