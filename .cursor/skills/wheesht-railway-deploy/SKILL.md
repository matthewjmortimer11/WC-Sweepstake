---
name: wheesht-railway-deploy
description: >-
  Deploy and configure Wheesht on Railway — env vars, git vs Railway config,
  post-deploy verification, OI safety, and what breaks if vars are missing. Use
  when the user asks about Railway, deploy, push live, production, env vars,
  DATABASE_URL, or whether something needs git.
---

# Wheesht — Railway deploy

Repo: `matthewjmortimer11/WC-Sweepstake` · Deploy: **push to `main`** → Railway auto-deploys (`railway.json` → `uvicorn main:app`).

## Git vs Railway (answer this clearly)

| Change type | Where | Git push needed? |
|-------------|-------|------------------|
| App code, UI, API | GitHub `main` | **Yes** |
| Stripe keys, API keys, secrets | Railway Variables | **No** |
| Database | Railway Postgres (`DATABASE_URL`) | **No** |

**Stripe going live** = update Railway vars only (unless code changes too).

## Required Railway variables

| Variable | Purpose | If missing |
|----------|---------|------------|
| `DATABASE_URL` | Postgres | App won't start |
| `WC_ADMIN_SECRET` | Admin/session signing | Auth breaks |
| `FOOTBALL_DATA_API_KEY` | Live scores & fixtures | MockAdapter — no real match data |

## Optional variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Pro checkout |
| `STRIPE_PRO_PRICE_ID` | Pro price (`price_...`) |
| `STRIPE_WEBHOOK_SECRET` | Unlock Pro after payment |
| `STRIPE_PRO_AMOUNT_PENCE` | Fallback price (e.g. `1999`) |
| `WC_ADMIN_PIN` | Seeded league organiser PIN override |
| `WC_DEV_KEY` | Dev grant endpoint, dev UI |
| `WC_GOOGLE_CLIENT_ID` | Google sign-in |

See [wheesht-pro-stripe](../wheesht-pro-stripe/SKILL.md) for Stripe setup.

**Removed — do not set:** `WC_PAYMENTS_TEST_LEAGUE_CODE` (entry-fee collection removed).

## Deploy checklist

```
- [ ] Railway → Deployments → latest = Success
- [ ] Required env vars present
- [ ] If frontend changed: cache bump landed (see wheesht-release)
- [ ] Hard refresh or new Safari tab on production URL
- [ ] Smoke test: join league, hub loads, chat works
```

## OI / production safety

- **OI** is grandfathered Pro server-side — Stripe vars optional; never breaks OI access.
- Deploying **without any Stripe vars** is safe: free leagues work; upgrade shows "not configured."
- Boot **backfill** auto-grants Pro to leagues that already have prediction picks or custom fields.
- Do **not** reintroduce entry-fee collection or payment gates on the draw.

## Finding the public URL

Railway → service → **Settings → Networking → Public domain**

Use for: Stripe webhook `https://<domain>/stripe/webhook`, share links, smoke tests.

## Post-deploy verify by feature

| Feature | Verify |
|---------|--------|
| Core app | Create/join league, draw, chat |
| Match centre | Scores update (needs `FOOTBALL_DATA_API_KEY`) |
| Pro checkout | New league → Admin → Upgrade (needs Stripe vars) |
| OI | Full access, Pro badge, no upsell |

## Rollback

If a bad deploy ships:
1. Railway → Deployments → redeploy previous successful build, **or**
2. `git revert` on `main` and push (user must confirm)

Warn before force-push to `main`.

## User communication template

After code deploy, tell the user:

1. **Railway action needed?** (new env vars only — list exact names)
2. **Smoke test steps** (2–3 clicks)
3. **What won't break** (especially OI)
4. **Cache bump** — remind to hard refresh on mobile/PWA
