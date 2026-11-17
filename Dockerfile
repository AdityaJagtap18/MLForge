FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api ./api
COPY ml_core ./ml_core
COPY alembic ./alembic
COPY alembic.ini .
COPY MLForge_files/csv_configurations ./MLForge_files/csv_configurations

ENV MLFORGE_FILES_DIR=/data
VOLUME ["/data"]

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
