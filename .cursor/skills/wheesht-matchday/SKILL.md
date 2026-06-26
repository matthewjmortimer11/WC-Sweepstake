---
name: wheesht-matchday
description: >-
  Matchday readiness for Wheesht — live fixtures, scores, prediction standings,
  FOOTBALL_DATA_API_KEY, and safe deploy checks before kickoff. Use when the
  user mentions matchday, live scores, fixtures, tournament day, or whether
  the app is ready during active matches.
---

# Wheesht — Matchday

## Before kickoff — Railway check

| Variable | Required | If missing |
|----------|----------|------------|
| `FOOTBALL_DATA_API_KEY` | **Yes** for real data | `MockAdapter` — no live scores/fixtures |

Verify in Railway logs: `Using FootballDataOrgAdapter`, not `MockAdapter`.

Other required vars (`DATABASE_URL`, `WC_ADMIN_SECRET`) must already be set — see [wheesht-railway-deploy](../wheesht-railway-deploy/SKILL.md).

## Matchday smoke test (5 min)

```
- [ ] OI (or live league) loads hub without errors
- [ ] Next fixture shows real opponent/date (from FIXTURES, not hardcoded mock)
- [ ] Match centre shows current/recent results
- [ ] Standings / eliminations update after organiser enters or syncs results
- [ ] Chat works
- [ ] Pro leagues: prediction picks and leaderboard score (`predScore` server-side)
```

Test on **Safari** if validating mobile/PWA behaviour.

## Item 12 hygiene (already shipped — verify not regressed)

- Hub `DashTeam` uses real next fixture from server `FIXTURES`
- `predScore` is server-authoritative via `standings.apply_pred_scores`
- Side-bets screen uses prediction catalog (no fake goal counts)
- Funnel events: `POST /api/events` (Pro analytics)

## Safe to deploy on matchday

| Usually safe | Higher risk |
|--------------|-------------|
| Copy/UI polish | Auth/token changes |
| Bug fix in isolated screen | Database migrations |
| Stripe vars (Railway only) | Standings/scoring logic changes |
| Cache bump + static fix | Fixture ingestion changes |

For risky changes: run full `pytest`, verify on a **test league** first, deploy during a quiet window.

## OI during tournament

- OI is grandfathered Pro — predictions and admin always work
- Do not require Stripe for OI
- Avoid upsell or payment UI on seeded league

## If live scores stop updating

1. Check `FOOTBALL_DATA_API_KEY` on Railway (not expired/revoked)
2. Check provider rate limits / API status
3. Check Railway logs for adapter errors
4. Organiser can still enter results manually in admin as fallback

## Related

- Security: [docs/SECURITY.md](../../../docs/SECURITY.md)
- Architecture/data: [docs/AUDIT_AND_ARCHITECTURE.md](../../../docs/AUDIT_AND_ARCHITECTURE.md)
