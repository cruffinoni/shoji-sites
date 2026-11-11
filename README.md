# shoji site workspaces

Each top-level directory is a shoji workspace identified by its slug. The
workspace's `dist/` directory is public; `metadata.json` and `README.md` stay
private.

The SQLite lifecycle database is not stored here. It lives at `../shoji.db`,
with its `-wal` and `-shm` sidecars, and is ignored by this repository.

After cloning or adding a workspace, reconcile the local database:

```sh
shoji sync --data ..
```

When a workspace has `metadata.json`, shoji renders `dist/index.html` and
inserts a comment marking the managed page head. Edit `metadata.json` for
presentation changes.
