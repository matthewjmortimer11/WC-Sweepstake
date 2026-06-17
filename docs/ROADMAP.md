# Wheesht product roadmap (items 1–12)

Living checklist for the WC Sweepstake app. Technical phases 0–5 live in [AUDIT_AND_ARCHITECTURE.md](AUDIT_AND_ARCHITECTURE.md).

| # | Title | Status |
|---|--------|--------|
| 1 | Core sweepstake loop | Done |
| 2 | Predictions | Done |
| 3 | Chat | Done |
| 4 | Match centre | Done |
| 5 | Multi-league | Done |
| 6 | Security and permissions | Done |
| 7 | Pro (Stripe) | Shipped — organiser upgrade, not entry fees |
| 8 | Make it shareable | Done |
| 9 | Admin UX | Done |
| 10 | Brand polish | Done |
| 11 | Growth funnel | Done |
| 12 | Growth iteration + matchday hygiene | Done |

---

## Item 12 — Growth iteration + matchday hygiene

- [x] 12.1 Hub `DashTeam` uses real next fixture from `FIXTURES`
- [x] 12.2 Server-authoritative `predScore` via `standings.apply_pred_scores`
- [x] 12.3 Side-bets screen uses prediction catalog (no fake goal counts)
- [x] 12.4 Funnel telemetry — `POST /api/events`, organiser analytics (Pro)
- [x] 12.5 UTM passthrough on `/join/{code}` app links
- [x] 12.6 Join password nudge + organiser launch checklist
- [x] 12.7 Tests + cache bump

## Item 7 — Wheesht Pro (Stripe)

- [x] 7.0 [PRO.md](PRO.md) runbook — software licensing, not pot collection
- [x] 7.1 `leagues.pro_status` + `league_purchases` table
- [x] 7.2 `POST /api/leagues/{code}/pro/checkout` (one-off organiser purchase)
- [x] 7.3 Webhook handler + dev grant endpoint
- [x] 7.4 Pro gates: predictions, fields, analytics, CSV, duplicate
- [x] 7.5 OI grandfathered; entry fee display-only (offline collection)
- [x] 7.6 Pro tests + backfill for active prediction leagues

---

Deploy model: small commits to `main` → Railway auto-deploy. Bump `?v=` in `templates/index.html` and `static/sw.js` per release.

**Production verify (matchday):** ensure `FOOTBALL_DATA_API_KEY` is set on Railway. See [SECURITY.md](SECURITY.md).

**Pro checkout:** Stripe test keys + `STRIPE_PRO_PRICE_ID` until legal sign-off. See [PRO.md](PRO.md). Wheesht never collects sweepstake entry fees.
