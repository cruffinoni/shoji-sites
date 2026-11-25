# Momentum

Momentum is a personal task board with a static web interface and a small SQLite-backed JSON API. The Focus view also includes a browser-local Pomodoro timer; timer settings and in-progress state are stored separately in local storage and do not modify shared tasks.

Momentum is published as a shoji site. The static shell lives in `dist/`, presentation in `metadata.json`, and the private API route in `runtime.json`. The API runs as a private Compose sidecar on the shared `shoji-backends` network.

## Requirements

- Python 3.10 or newer.
- Node.js for the frontend reset regression test.
- Docker with the Compose plugin for deployment.
- No third-party Python dependencies for the API or tests.

## Local API

```sh
python server/app.py
```

The API listens on `127.0.0.1:8766` by default and stores data at `~/.local/state/task-board/tasks.sqlite3` (created automatically; outside the repository). To choose another database path:

```sh
python server/app.py --host 127.0.0.1 --port 8766 --db-file /path/to/tasks.sqlite3
```

The API endpoints are:

- `GET /day-reset-api/healthz`
- `GET /day-reset-api/tasks?date=YYYY-MM-DD`
- `POST /day-reset-api/tasks` with `title`, `planned_date`, and optional `group`, `estimate`
- `PATCH /day-reset-api/tasks/{id}` with one or more of `title`, `group`, `estimate`, `planned_date`, `completed`
- `DELETE /day-reset-api/tasks/{id}`
- `PUT /day-reset-api/tasks/reorder?date=YYYY-MM-DD` with `{ "task_ids": [...] }`

Successful responses use JSON objects: health returns `{ "ok": true }`; list returns `{ "tasks": [...] }`; create and update return `{ "task": {...} }`; reorder returns `{ "ok": true }`. A task contains `id`, `title`, `group`, `estimate`, `planned_date`, `completed`, `sort_order`, `created_at`, and `updated_at`. Create responds `201`; reads, updates, and reorders respond `200`; delete responds `204` with no body. Invalid dates, bodies, fields, or reorder ID sets respond `400` with `{ "error": "..." }`; unknown routes/tasks respond `404` with the same error shape; database failures respond `500` with `{ "error": "task database unavailable" }`.

The API prefix remains `/day-reset-api` inside the container. Shoji exposes it publicly at `/s/momentum/api/` through the route in `runtime.json`.

## Deployment

Shoji must already be running so the shared `shoji-backends` network exists. Then, from the shoji deployment or repository root:

```sh
docker compose -f data/sites/momentum/compose.yaml up -d --build
```

The sidecar:

- builds from this directory;
- joins `shoji-backends` as an external network;
- publishes no host port;
- stores SQLite in the named `momentum-state` volume;
- reports healthy through `/day-reset-api/healthz`.

The public routes are:

- page: `/shoji/s/momentum/`
- API: `/shoji/s/momentum/api/...`

The `/shoji` prefix is the deployment base path; when shoji is served at the root, the routes are `/s/momentum/` and `/s/momentum/api/...`.

Do not add a `ports:` entry. The API is private to `shoji-backends` and is reached only through shoji.

### Database migration

To move an existing database into the Compose volume, stop the old systemd service first, then copy the database into the volume before starting the sidecar. Do not run the old service and the sidecar at the same time.

### Publish the static shell

```sh
python tools/publish.py
```

This rebuilds `dist/` from `web/` and refuses a tree with anything other than one root `index.html`. Commit `dist/` with the source changes.

## CLI

With the API reachable through shoji, add a task from the repository root:

```sh
./tools/task_board.py add "Buy groceries"
./tools/task_board.py add "Call dentist" --date 2026-10-25 --group Personal --estimate S
```

The CLI defaults to `http://127.0.0.1:8082/s/momentum/api` (the local shoji port). Override it with `MOMENTUM_API_URL` or `--api-url`. For a direct API run, use `http://127.0.0.1:8766/day-reset-api`.

## Tests

From this directory:

```sh
python3 -m unittest discover -s tests -v
python3 -m compileall -q server tests
node --check web/app.js
node --check web/timer.js
node tests/test_reset_frontend.js
node tests/test_timer.js
```

API tests use temporary SQLite databases; no existing browser or runtime state is imported.
