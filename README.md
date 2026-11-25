# shoji site workspaces

Each top-level directory is a shoji workspace identified by its slug. The
workspace's `dist/` directory is public; `metadata.json`, `runtime.json`,
`README.md`, Compose files, and source copies stay private.

The SQLite lifecycle database is not stored here. It lives at `../shoji.db`,
with its `-wal` and `-shm` sidecars, and is ignored by this repository.

After cloning or adding a workspace, reconcile the local database:

```sh
shoji sync --data ..
```

When a workspace has `metadata.json`, shoji renders `dist/index.html` and
inserts a comment marking the managed page head. Edit `metadata.json` for
presentation changes.

When a workspace has `runtime.json`, shoji can proxy private HTTP routes to a
site backend. The file is never published. A Compose-backed site should keep its
sidecar on the shared `shoji-backends` network and expose no host port; its
`runtime.json` target uses the sidecar service name, for example:

```json
{
  "routes": [
    { "prefix": "/api/", "target": "http://momentum-api:8766/day-reset-api/" }
  ]
}
```

The shared network is created by the shoji Compose project. Start shoji before
the site sidecar. Do not run `docker network create`.
