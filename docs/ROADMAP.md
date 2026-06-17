# Wheesht product roadmap (items 1–10)

Living checklist for the WC Sweepstake app. Technical phases 0–5 live in [AUDIT_AND_ARCHITECTURE.md](AUDIT_AND_ARCHITECTURE.md).

| # | Title | Status |
|---|--------|--------|
| 1 | Core sweepstake loop | Done |
| 2 | Predictions | Done |
| 3 | Chat | Done |
| 4 | Match centre | Done |
| 5 | Multi-league | Done |
| 6 | Security and permissions | Done |
| 7 | Payments (Stripe) | Skipped |
| 8 | Make it shareable | In progress |
| 9 | Admin UX | In progress |
| 10 | Brand polish | In progress |

---

## Item 9 — Admin UX

- [x] 9.1 Tab restructure (League, Players, Predictions, Prize Fund, Fields, Security)
- [x] 9.2 Save status indicator on organiser writes
- [x] 9.3 Players tab: inline name / dept / location edit
- [x] 9.4 CSV export (entrants + predictions)
- [x] 9.5 Invite link panel on League tab
- [x] 9.6 Duplicate league / template
- [x] 9.7 Analytics API + stat cards
- [x] 9.8 Admin tests + deploy cache bump

## Item 8 — Make it shareable

- [x] 8.1 Invite deep links (`?join=CODE`)
- [x] 8.2 Share helpers module (`share.js`)
- [x] 8.3 Leaderboard share image (canvas)
- [x] 8.4 “I overtook X” share card
- [x] 8.5 Workplace / charity landing (`/welcome`)
- [x] 8.6 Demo league click-through (`?demo=1`)
- [x] 8.7 Tests + deploy

## Item 10 — Brand polish

- [x] 10.1 Design tokens (`wheesht.css`)
- [x] 10.2 Microcopy module (`copy.js`)
- [x] 10.3 Matchday moments + quiet mode
- [x] 10.4 PWA icons + splash meta
- [x] 10.5 Visual QA checklist (manual)

---

Deploy model: small commits to `main` → Railway auto-deploy. Bump `?v=` in `templates/index.html` and `static/sw.js` per release.
