---
name: wheesht-pro-stripe
description: >-
  Set up, test, and debug Wheesht Pro Stripe checkout on Railway. Covers test vs
  live mode, exact env var names, webhook URL, Price ID vs Product ID, OI
  grandfathering, and troubleshooting silent checkout failures. Use when the user
  mentions Stripe, Pro checkout, upgrade league, webhooks, sk_test, sk_live,
  price_, Railway Stripe vars, or Apple Pay/Google Pay for Wheesht.
---

# Wheesht Pro — Stripe

Full runbook: [docs/PRO.md](../../../docs/PRO.md)

## Product truth (never violate)

- Wheesht **never collects sweepstake entry fees**. Pot is display-only; organisers collect offline.
- Revenue = **one-off Wheesht Pro per league** (predictions, custom fields, analytics, CSV, duplicate).
- **OI** (seeded office league) is **full Pro forever** — no upsell, no Stripe required.

## Railway env vars (exact names)

| Variable | Value | Required for checkout |
|----------|-------|----------------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` | Yes |
| `STRIPE_PRO_PRICE_ID` | `price_...` (NOT `prod_...`) | Yes (or fallback below) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Yes (to unlock Pro after payment) |
| `STRIPE_PRO_AMOUNT_PENCE` | e.g. `1999` | Optional fallback if no Price ID |

**Common mistakes:**
- Using `STRIPE_PRODUCT_ID` or `STRIPE_PRICE_ID` — app only reads `STRIPE_PRO_PRICE_ID`
- Putting `prod_...` instead of `price_...`
- Mixing test secret key with live price ID (or vice versa)

`STRIPE_PUBLISHABLE_KEY` is read by the server but **not used** for Pro checkout (Stripe Checkout redirect).

## Test vs live — all three must match

| Mode | Stripe Dashboard | Secret key | Price ID | Webhook secret |
|------|------------------|------------|----------|----------------|
| Test | Test mode ON | `sk_test_...` | test `price_...` | test `whsec_...` |
| Live | Test mode OFF | `sk_live_...` | live `price_...` | live `whsec_...` |

Test card: `4242 4242 4242 4242` (any future expiry, any CVC). Live card = real money.

Changing Railway vars **does not require git**. Redeploy after saving vars.

## Stripe Dashboard setup

### 1. Product + price
- Product catalogue → **Wheesht Pro**
- **One time** price in GBP
- Copy **Price ID** (`price_...`)

### 2. Webhook
- URL: `https://<railway-public-domain>/stripe/webhook` (no `/api` prefix)
- Events: `checkout.session.completed`, `charge.refunded`
- Copy signing secret → `STRIPE_WEBHOOK_SECRET` on Railway

### 3. Payment methods (optional)
- Settings → Payment methods → enable Apple Pay and Google Pay

## Checkout flow (code paths)

1. Organiser → Admin → **Upgrade this league**
2. `POST /api/leagues/{code}/pro/checkout` (requires `X-Wheesht-Admin-Token`)
3. Redirect to Stripe Checkout `url`
4. Webhook `checkout.session.completed` with `metadata.purchase_type=pro` → `league.pro_status = pro`
5. Success redirect: `/?pro=success`

Pro gates return `402 pro_required` on: picks, prediction admin, custom fields, analytics, CSV export, duplicate league.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Button missing; "not configured" text | No price ID / amount on server | Set `STRIPE_PRO_PRICE_ID` or `STRIPE_PRO_AMOUNT_PENCE`; redeploy |
| Click upgrade, nothing happens | API error with no toast (older deploy) or 503/403 | Check var names; re-sign in as admin; verify deploy has error toasts in `store.js` |
| 503 on checkout | Missing `STRIPE_PRO_PRICE_ID` / amount | Add price config |
| Paid but still free | Webhook wrong URL, wrong `whsec_`, or test/live mismatch | Stripe → Webhooks → delivery log; fix secret; redeploy |
| Stripe API error on checkout | Invalid `price_` for current mode | Recreate price in matching test/live mode |

**Verify webhook:** Stripe Dashboard → Webhooks → endpoint → Recent deliveries → `checkout.session.completed` should be **200**.

## Test procedure

1. Create a **new league** (not OI)
2. Admin → Upgrade → pay with test card (or real card in live mode)
3. Confirm Pro badge, Predict tab unlocks
4. Confirm OI unchanged — still Pro, no upgrade button

## Dev grant (no payment)

`POST /api/leagues/{code}/pro/grant` with header `X-Wheesht-Dev-Key` when `WC_DEV_KEY` is set. Sandbox only.

## Refunds

Refund in Stripe Dashboard → `pro_status` returns to `free` (OI exempt). Payment Intent ID stored in `league_purchases`.

## Legal

Pro is **software licensing**, not gambling facilitation. Advise user to get proper advice before promoting live paid checkout.
