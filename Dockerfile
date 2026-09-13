# Vinylize as one container: the Python engine serves the built web app.
# Used by the Hugging Face Space (Docker SDK, port 7860); runs anywhere.

# --- 1. build the web app ---------------------------------------------------
FROM node:20-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. the engine ----------------------------------------------------------
FROM python:3.12-slim

# Hugging Face runs containers as uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user backend/pyproject.toml ./backend/
COPY --chown=user backend/app ./backend/app
RUN pip install --no-cache-dir --user ./backend

# Example record audio when present in the build context (never in git);
# the extra small file keeps this COPY valid when there are no examples.
COPY --chown=user backend/pyproject.toml backend/example[s] ./examples/
COPY --from=web --chown=user /src/frontend/dist ./web

ENV VINYLIZE_STATIC_DIR=/home/user/app/web \
    VINYLIZE_EXAMPLES_DIR=/home/user/app/examples

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
