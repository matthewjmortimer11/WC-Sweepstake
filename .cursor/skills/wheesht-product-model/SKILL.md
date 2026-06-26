---
name: wheesht-product-model
description: >-
  Wheesht commercial and tier model — free vs Pro, OI grandfathering, offline
  pot tracking, and what must never be built (entry-fee collection). Use when
  discussing payments, pricing, Pro features, entry fees, commercialisation,
  monetisation, or product scope for WC-Sweepstake.
---

# Wheesht — Product model

## One sentence

Wheesht is a **sweepstake app**; revenue is **Pro software licensing per league**, not handling the pot.

## Tiers

### OI (seeded office league)
- **Full Pro forever** — server grandfathered (`seeded` + config league code)
- No upgrade UI, no Stripe required
- Shows **Pro** badge

### Free league (default for new leagues)
- Team draw, chat, match centre, group table
- Entry fee + charity split **display only** — organisers collect offline
- Phase control, results, eliminations, invite/share
- **No** predictions, custom fields, analytics, CSV export, duplicate league

### Pro league (one-off purchase per league)
- Everything in free, plus:
  - Player predictions + leaderboard
  - Organiser prediction grading + match markets
  - Custom signup fields
  - Funnel analytics
  - CSV export
  - Duplicate league

Pro is unlocked via Stripe Checkout (`pro_status=pro`) or dev grant. Existing beta leagues with prediction activity are backfilled to Pro on boot.

## What we do NOT do

| Never build | Why |
|-------------|-----|
| Collect sweepstake entry fees | Legal/ops burden; organisers handle pot offline |
| Take a cut of the pot | User explicitly rejected this |
| Charge players to join | Revenue is organiser → Wheesht for Pro |
| Payment-before-draw gates | Removed in Pro pivot |
| `collectPayments` / participant checkout | Legacy removed — do not restore |

Entry fee fields in Prize Fund are **calculators and display** only. Copy should say money is tracked offline.

## Revenue model

- **Who pays:** league organiser (admin)
- **What they buy:** Wheesht Pro for that league (one-time)
- **How:** Stripe Checkout → webhook → `league.pro_status = pro`
- **Legal framing:** software licensing, not gambling facilitation — advise professional review before live promotion

## Server enforcement

Pro-gated endpoints return `402 pro_required`:
- Prediction picks
- Pro admin meta (hidden predictions, deadline, custom fields)
- Analytics, CSV export, duplicate league

UI locks are not enough — always gate server-side.

## When planning new features

Ask:
1. Is this **free** or **Pro**?
2. Does it touch **money collection**? If yes, reject or redesign.
3. Does it affect **OI**? Must remain fully unlocked with no upsell.
4. Add tests in `tests/test_pro.py` if gating changes.

## Docs

- [docs/PRO.md](../../../docs/PRO.md) — Stripe runbook
- [docs/ROADMAP.md](../../../docs/ROADMAP.md) — item status
