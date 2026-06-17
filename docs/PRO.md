# Wheesht Pro (Stripe)

Wheesht **does not collect sweepstake entry fees**. The pot is tracked in the app for display; organisers collect money offline (cash, bank transfer, Venmo, etc.).

**Revenue model:** organisers buy **Wheesht Pro** once per league — predictions, custom fields, analytics, CSV export, and duplicate league.

## OI (grandfathered)

The seeded office league (`OI`) has **full Pro access forever** with no upsell. This is hardcoded server-side.

## Free tier (new leagues)

- Team draw, chat, match centre, group table
- Entry fee + charity split **display** (offline collection)
- Phase control, results, eliminations, invite/share

## Pro tier (one-off per league)

- Player predictions + prediction leaderboard
- Organiser prediction grading + match markets
- Custom signup fields
- Funnel analytics
- CSV export
- Duplicate league

## Railway environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_…` until launch |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for one-off Pro (preferred) |
| `STRIPE_PRO_AMOUNT_PENCE` | Fallback amount if no Price ID (e.g. `1999` for £19.99) |

Enable **Apple Pay** and **Google Pay** in the [Stripe Dashboard](https://dashboard.stripe.com/settings/payment_methods).

## Checkout flow

1. Organiser opens admin → **Upgrade this league**
2. `POST /api/leagues/{code}/pro/checkout` creates Stripe Checkout (organiser token required)
3. Webhook `checkout.session.completed` with `metadata.purchase_type=pro` sets `league.pro_status = pro`
4. App refreshes — predictions and Pro admin unlock

Success URL: `/?pro=success`

## Webhook setup

1. Stripe Dashboard → Webhooks → Add endpoint
2. URL: `https://<your-domain>/stripe/webhook`
3. Events: `checkout.session.completed`, `charge.refunded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Refunds

Refund from Stripe Dashboard using the Payment Intent ID stored in `league_purchases`. A refund sets `pro_status` back to `free` (except OI).

## Dev grant

`POST /api/leagues/{code}/pro/grant` with `X-Wheesht-Dev-Key` grants Pro without payment (sandbox only).

## Backfill

On boot, leagues that already have prediction picks or custom fields are auto-granted `pro_status=pro` so existing beta users are not cut off. OI is always Pro via grandfathering logic.

## Legal note

Pro is **software licensing**, not gambling facilitation. Still get proper advice before going live with paid checkout.
