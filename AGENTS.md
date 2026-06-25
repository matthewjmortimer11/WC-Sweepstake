# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Python 3.11+ **FastAPI monolith** (`main.py` → `app`) that serves
the "Wheesht" World Cup 2026 sweepstake plus several real-time party games (Cipher/
Codenames, Dial, Imposter, Charades, Who Am I) and a qualification tracker — all mounted
as sub-routers on the one app. There is **no frontend build step**: JSX in `static/` is
compiled in-browser via CDN React/Babel, and templates in `templates/` are plain HTML.

Dependencies are managed with pip + `requirements*.txt` (no lockfile). The update script
installs them into a `.venv`, so use `.venv/bin/...` (or activate it) to run things.

### Run the app (dev)
The whole product (sweepstake + all games) is one process. A database is required, but
**SQLite works for local dev** — no Postgres needed:

```
DATABASE_URL="sqlite+aiosqlite:///./dev.db" .venv/bin/uvicorn main:app --reload --port 8000
```

Then visit `/` (sweepstake), `/games` (hub), `/play` (Cipher), `/qualification`.

- **Non-obvious caveat:** On startup with SQLite you'll see a logged, non-fatal
  `Schema ensure failed: ... near "EXISTS": syntax error`. This is expected — the
  idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration is Postgres-only and is
  caught/ignored. The app starts and works fine on SQLite. Use Postgres
  (`DATABASE_URL=postgresql+asyncpg://...`) only if you need exact prod migration parity.
- With no external credentials set, the app runs with mock football data
  (`FOOTBALL_DATA_API_KEY` unset → `MockAdapter`), and Stripe / Google sign-in are simply
  disabled. The full sweepstake + games are still fully usable. Optional env vars:
  `FOOTBALL_DATA_API_KEY`, `STRIPE_*`, `WC_GOOGLE_CLIENT_ID/SECRET`, `CIPHER_DATABASE_URL`.

### Tests
```
.venv/bin/pytest tests/ -q
```
This is exactly what CI runs (`.github/workflows/test.yml`). The suite auto-uses a
throwaway SQLite DB (`tests/conftest.py`); no Postgres needed. Set `TEST_DATABASE_URL` to
exercise the real Postgres driver. Per the workspace security rule, run
`.venv/bin/pytest tests/test_security.py` before pushing changes that touch auth, chat,
organiser actions, isolation, or headers.

### Lint / build
There is **no linter/formatter** configured and **no app build step**. The scripts in
`scripts/` (`build_snapshot.py`, `build_standalone.py`, `generate_pwa_icons.py`) only
produce optional static-snapshot/PWA artifacts and need vendored files in
`scripts/vendor/` (gitignored); they are not required to run the server or tests.
