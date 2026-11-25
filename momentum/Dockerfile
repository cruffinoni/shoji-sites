FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY server/ ./server/

RUN useradd --create-home --uid 10001 momentum \
    && mkdir -p /state \
    && chown -R momentum:momentum /state

USER momentum

EXPOSE 8766

CMD ["python", "-B", "server/app.py", "--host", "127.0.0.1", "--port", "8766", "--db-file", "/state/tasks.sqlite3"]
