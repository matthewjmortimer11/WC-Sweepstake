---
name: wheesht-release
description: >-
  Ship a Wheesht release — cache bump, test selection, push to main, and
  post-deploy verification. Use when the user says push live, deploy, release,
  cache bump, or asks if changes are ready for production.
---

# Wheesht — Release

Deploy model: small commits to `main` → Railway auto-deploy. See [docs/ROADMAP.md](../../../docs/ROADMAP.md).

## Pre-push checklist

```
- [ ] Changes scoped to the requested feature/fix
- [ ] Security invariants preserved (see .cursor/rules/wheesht-security.mdc)
- [ ] Tests run for touched areas
- [ ] Cache version bumped if static/frontend changed
- [ ] User explicitly asked to push (main may be protected)
```

## Cache bump (required when frontend changes)

Bump the `?v=` query string in **both**:

1. `templates/index.html` — all script/style/icon `?v=` params
2. `static/sw.js` — `CACHE_VERSION` constant

Use a dated slug, e.g. `20260616-feature-name`.

Without this, users (especially PWA/mobile) may run stale JS after deploy.

## Tests to run

| Area touched | Command |
|--------------|---------|
| Auth, chat, organiser, isolation | `pytest tests/test_security.py` |
| Pro / Stripe gates | `pytest tests/test_pro.py` |
| Funnel / growth | `pytest tests/test_funnel.py` |
| Admin flows | `pytest tests/test_admin.py` |
| Broad change | `pytest` (CI uses Python 3.11+) |

Local Python 3.9 may fail on `tomllib` — trust CI if local pytest fails on import only.

## Push workflow

1. `git status` + `git diff` — no secrets in diff (`.env`, keys)
2. Commit with concise message (why, not just what)
3. Push to `main` only when user confirms
4. If push blocked (protected branch), offer branch + PR via `gh pr create`

## Post-push: tell the user

Use this structure:

```markdown
## What changed
[1–3 bullets in plain English]

## Railway action needed?
[None / list exact new env vars]

## How to verify
1. Hard refresh production URL
2. [2–3 specific clicks]

## Safe for OI / live leagues?
[Yes + why, or caveats]
```

## Rollback

- **Railway:** redeploy previous successful deployment
- **Git:** `git revert <commit>` + push (user confirms)
- Never force-push `main` unless user explicitly requests

## Do not

- Commit `.env` or Stripe keys
- Push without user confirmation
- Skip cache bump after `static/` or `templates/` changes
- Amend commits that were pushed or failed hooks

## Related skills

- Railway config: [wheesht-railway-deploy](../wheesht-railway-deploy/SKILL.md)
- Stripe: [wheesht-pro-stripe](../wheesht-pro-stripe/SKILL.md)
