# Operations

## Runtime and data

- The API runs in the `momentum-api` Compose service, built from this directory.
- It binds `0.0.0.0:8766` only inside the private `shoji-backends` network. No host port is published.
- SQLite data lives in the named `momentum-state` volume, normally `momentum_momentum-state`. It is outside the site workspace and must be backed up independently.
- The static shell is served by shoji from `dist/`; shoji also proxies `/s/momentum/api/` to `http://momentum-api:8766/day-reset-api/`.
- The previous systemd unit and Tailscale `/day-reset` and `/day-reset-api` routes are replaced by this stack. Keep them only as a rollback path until the sidecar is verified.

## Network and start order

- The shoji Compose project owns the `shoji-backends` network. It is declared normally in `docker-compose.yml`, so `docker compose up` creates it. Do not run `docker network create`.
- This project references `shoji-backends` as an external network.
- Start shoji first, then this sidecar:

```sh
docker compose up -d
docker compose -f data/sites/momentum/compose.yaml up -d --build
```

- Stop this sidecar before tearing down shoji, if the shared network is being removed:

```sh
docker compose -f data/sites/momentum/compose.yaml down
docker compose down
```

## Deploy or update

```sh
docker compose -f data/sites/momentum/compose.yaml up -d --build
docker compose -f data/sites/momentum/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:8082/s/momentum/api/healthz
```

The sidecar is built locally, so Watchtower does not update it. Re-run the build command after changing `server/` or the Dockerfile.

Inside the network, the direct health check is:

```sh
docker compose -f data/sites/momentum/compose.yaml exec momentum-api \
  python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8766/day-reset-api/healthz')"
```

## Migrate from the old systemd deployment

1. Stop and disable the old `day-reset.service`.
2. Start the shoji stack and the sidecar once so the volume is created.
3. Copy the old database into the volume with the sidecar stopped, or use `docker compose cp` while it is stopped.
4. Start the sidecar and verify task counts and CRUD.
5. Remove the old Tailscale routes only after verification.

## Backup

Back up the named volume separately from shoji's `data` directory:

```sh
docker run --rm \
  -v momentum_momentum-state:/state \
  -v "$PWD":/backup \
  alpine tar -czf /backup/momentum-state.tgz -C /state .
```

## Verify

```sh
curl --fail --silent --show-error http://127.0.0.1:8082/s/momentum/api/healthz
curl --fail --silent --show-error "http://127.0.0.1:8082/s/momentum/api/tasks?date=2026-11-25"
```

Open `/shoji/s/momentum/` and verify task creation, editing, completion, deletion, reorder, Today/Focus switching, timer controls/settings, and refresh. Stop the sidecar and verify the page still loads and API calls return a JSON 502; start it again and verify recovery.

## Rollback

Stop the sidecar, then restore the old systemd unit and Tailscale routes if needed. The `momentum-state` volume remains untouched. The previous shoji release ignores `runtime.json` and still serves the static page, but the API is unavailable until the old service is restored.

## Test

```sh
python3 -m unittest discover -s tests -v
python3 -m compileall -q server tests
node --check web/app.js
node --check web/timer.js
node tests/test_reset_frontend.js
node tests/test_timer.js
```
