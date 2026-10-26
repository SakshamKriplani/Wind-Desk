# --- 1. build the React app ------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Python API that also serves the built app --------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./backend/app
COPY backend/scripts ./backend/scripts
COPY data ./data
COPY --from=web /web/dist ./frontend/dist
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://localhost:{os.environ[\"PORT\"]}/api/health')"
# Heroku injects $PORT; default 8000 elsewhere
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
