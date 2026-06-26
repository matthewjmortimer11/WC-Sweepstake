---
name: wheesht-plan-implement
description: >-
  Implement attached Wheesht plan files end-to-end — todos, roadmap items, no
  plan edits, matching codebase conventions. Use when the user says implement
  the plan, attached plan, complete todos, or references a .plan.md file for
  WC-Sweepstake / Wheesht.
---

# Wheesht — Plan implementation

## User's default workflow

1. User attaches or references a `*.plan.md` file
2. Says: "Implement the plan" / "complete all todos"
3. Expects: full implementation → tests → summary → Railway steps if needed
4. May say "push live" separately — **do not push unless asked**

## Rules

- **Do NOT edit the plan file** — implement against it only
- **Use existing todos** — mark `in_progress` → `completed`; do not recreate
- **Do not stop early** — complete every todo unless blocked; report blockers clearly
- Read [docs/ROADMAP.md](../../../docs/ROADMAP.md) and relevant `docs/` before coding

## Before coding

1. Read the plan file fully
2. Skim touched areas: `main.py`, `models.py`, `static/app/store.js`, `screens-*.jsx`
3. Check [.cursor/rules/wheesht-security.mdc](../../rules/wheesht-security.mdc) for auth/isolation invariants
4. Check [wheesht-product-model](../wheesht-product-model/SKILL.md) if payments/Pro scope involved

## Code conventions

| Layer | Location | Notes |
|-------|----------|-------|
| API + gates | `main.py` | `_require_admin`, `_require_pro`, `_rate_limit`, `_log_audit` |
| Schema | `models.py` | SQLAlchemy models |
| Client state | `static/app/store.js` | `LIVE` guard, `api()`, `adminHeaders()` |
| UI | `static/app/screens-*.jsx`, `app.jsx` | Match existing component patterns |
| Copy | `static/app/copy.js` | User-facing strings |
| Tests | `tests/test_*.py` | Add coverage for new gates/flows |

Keep diffs minimal. Match naming and style of surrounding code.

## During implementation

- Server-side gates for any Pro or organiser-only feature
- League queries **must** filter by `league_id`
- Never return password/organiser hashes
- Bump cache version if frontend ships (see [wheesht-release](../wheesht-release/SKILL.md))

## After implementation

Provide:

```markdown
## Done
- [bullets of what shipped]

## Railway / Stripe action needed?
- [None, or exact steps — link wheesht-railway-deploy / wheesht-pro-stripe]

## How to test
1. ...
2. ...

## OI / live leagues safe?
- [Yes + why]
```

## If user asks to push

Follow [wheesht-release](../wheesht-release/SKILL.md). Run relevant pytest suites first.

## Planning vs implementing

- User says **"plan"** → design approach, do not implement yet
- User says **"implement"** → execute todos, no plan file edits
