# Security & Backups

How Wheesht protects league data, what the organiser can do to stay safe, and
the risks we have consciously accepted. This is the companion to the work in
item 6 (Security and Permissions).

## Auth model at a glance

Wheesht layers a few independent credentials, each with a narrow job:

| Credential | Issued when | Proves | Lifetime |
|------------|-------------|--------|----------|
| League password | Joining a league | You may see this league | n/a (checked on join) |
| Organiser code | Set at league creation / configured PIN for the seeded league | You are the organiser | verified per use |
| Admin token (`v1.`) | After the organiser code is verified | Organiser writes (results, settings, moderation) | 12 hours |
| Account token (`a1.`) | Password or Google sign-in | You own this entry | 30 days |
| Session token (`s1.`) | Claiming / signing in to an entry | This device controls this entry | 90 days |

Key properties:

- **No plaintext secrets are stored.** League passwords, account passwords and
  organiser codes are all kept as PBKDF2 hashes. The seeded league's organiser
  hash is re-derived from the configured PIN on every startup, so the PIN can be
  rotated without a migration.
- **Hashes never leave the server.** No API response includes a password or
  organiser hash; entries only expose a `hasPassword` boolean.
- **Chat is impersonation-proof.** Posting as an entry requires a session,
  account, or admin token bound to that entry id — knowing someone else's id is
  not enough.
- **Organiser writes are server-enforced.** Every mutating organiser endpoint
  checks the admin token, regardless of what the UI shows.

## Environment variables that must stay secret

Set these in Railway (never commit them):

| Variable | Purpose | Notes |
|----------|---------|-------|
| `WC_ADMIN_SECRET` | HMAC signing key for all tokens | **Set this in production.** If unset, the server generates a random key at boot, which invalidates every admin/account/session token on each restart (everyone is silently signed out). |
| `WC_ADMIN_PIN` | Organiser PIN for the seeded league | Rotating this re-hashes the organiser secret on next deploy. Falls back to the value in `tournaments/world-cup-2026.toml` if unset — so do not rely on the committed default for a real deployment. |
| `WC_DEV_KEY` | Master key for the hidden cross-league dev console | No committed fallback. With it unset, the dev console is disabled. |
| `DATABASE_URL` | Postgres connection string | Contains credentials. |
| `WC_GOOGLE_CLIENT_ID` / `WC_GOOGLE_CLIENT_SECRET` | Google Sign-In | The client id is public; the secret must never ship to the browser. |
| `FOOTBALL_DATA_API_KEY` | Live fixture provider | Without it, the app uses the mock adapter. Verify Railway logs show `Using FootballDataOrgAdapter`, not `MockAdapter`. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Wheesht Pro checkout | Optional. Organiser one-off league upgrade only — not sweepstake entry fees. See [PRO.md](PRO.md). |
| `STRIPE_PRO_PRICE_ID` / `STRIPE_PRO_AMOUNT_PENCE` | Pro product price | Price ID preferred; amount pence fallback if unset. |

## Backups

### Railway Postgres

The database is the source of truth. Use Railway's Postgres backups:

- Take a **manual snapshot** before any large change (schema work, bulk edits,
  a deploy you are unsure about).
- Confirm the project's automated backup / point-in-time-recovery settings in
  the Railway dashboard and keep them enabled.

### Per-league export (in-app)

Any organiser can download a full snapshot of their league:

1. Open **Organiser tools → Security**.
2. Under **Backups**, choose **Download backup (JSON)**.

The export bundles league metadata, participants, profiles, chat, organiser
overrides and the audit trail. It is also available directly:

```
GET /api/leagues/{code}/export
X-Wheesht-Admin-Token: <organiser token>
```

The export contains **no secrets**: no password or organiser hashes, and Google
identities are reduced to a `hasGoogleLink` boolean. Run an export before any
risky organiser action (bulk removals, deleting a league).

## Audit trail

Every organiser mutation is recorded in the durable `audit_events` table and
shown in **Organiser tools → Security → Recent organiser activity**: settings
saves, Wheesht messages, opening/removing predictions, deleting chat, removing
entrants, organiser password resets, failed and successful organiser sign-ins,
and league deletion (also written to the application log, since the league's own
audit rows are removed with it).

## Deleting a league

Organisers can permanently delete their own league from **Security → Danger
zone**, confirming with the exact league code and name. This cascades to all
league-scoped rows and cannot be undone — take an export first. The seeded
flagship league cannot be deleted from the organiser tools; that remains a
dev-only operation.

## Accepted risks (current)

- **Open entries are editable by anyone on the device.** Until an entry is
  claimed with a password or Google, the "tap who you are" model lets whoever
  holds the device edit that entry and obtain a session token for it. This is
  intentional for frictionless office play; claiming locks the entry down.
- **In-memory rate limiting.** Join, sign-in, admin-auth and dev endpoints are
  rate limited per process. Limits reset on redeploy and are not shared across
  replicas. This is fine while Railway runs a single instance; revisit with a
  Postgres- or Redis-backed limiter before scaling out.
- **Legacy organiser fallback.** Leagues created before separate organiser codes
  shipped have no `organiser_hash` and fall back to verifying the member
  password as the organiser code (logged once per process). New leagues always
  store a distinct organiser hash.

## Running the security tests

The security regression suite lives in `tests/`. It needs a throwaway database:

```bash
pip install -r requirements-dev.txt
export TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/wheesht_test
pytest tests/test_security.py
```

Use a dedicated test database (a local Postgres or a separate Railway database) —
never point `TEST_DATABASE_URL` at production. Run the suite before any push that
touches auth, chat, organiser actions, or cross-league isolation.
