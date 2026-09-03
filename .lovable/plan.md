# "Keep my discount" retention offer

Goal: when a member taps Cancel your membership, offer 50% off for 3 months once. If they've
already used it, go straight to the existing cancellation flow.

## 1. Database

Migration on `public.consumer_subscriptions`:
- add `retention_offer_used boolean not null default false`
- add `retention_offer_claimed_at timestamptz` (so we can see when, for support)

No other table changes; existing rows default to `false`, so everyone is eligible once.
Members cannot set this themselves — the column is only written by the edge function using
the service role (existing RLS on the table already limits members to reading their own row).

## 2. Edge function — `consumer-retention-offer`

One function, two actions, both authenticated as the signed-in member:

- `{ action: "check" }` → server-side eligibility. Returns
  `{ eligible, tier, price, discounted_price, reason }`. Eligible only when:
  the member has a Stripe subscription on file, status is active/past_due (not `trialing`,
  nothing is being paid yet), not paused, not already cancelling, and
  `retention_offer_used = false`. The decision is made from the service-role read of the
  subscription row, never from client state.
- `{ action: "claim" }` → re-runs the exact same eligibility check (so a stale UI can't
  double-claim), then:
  1. `stripe.subscriptions.update(id, { discounts: [{ coupon: "0ajj1XVm" }] })`
  2. on success, sets `retention_offer_used = true`, `retention_offer_claimed_at = now()`
  3. returns `{ ok: true, discounted_price, months: 3 }`

Failure handling: if the Stripe call throws, the flag is NOT set and the function returns
`{ error }` so the member can retry or cancel anyway. The flag write happens strictly after
Stripe confirms, so we never burn the offer on a failed apply. Coupon id lives in one
constant in the function.

Function will be deployed and boot-verified in the same task.

## 3. Client hook — `src/hooks/useRetentionOffer.ts`

- `useRetentionOffer()` — react-query call to `action: "check"`, keyed by user id, only
  enabled when they have a Stripe subscription and aren't impersonating (reuses
  `assertNotViewingAs` like the rest of `useAccountLifecycle`).
- `useClaimRetentionOffer()` — mutation for `action: "claim"`, invalidating
  `consumer_subscription` on success.

## 4. UI

New component `src/components/profile/RetentionOfferDialog.tsx`, rendered from
`ManageSubscriptionSection`:

- Tapping "Cancel your membership" now opens the retention dialog **if** the server check
  says eligible; otherwise it opens the existing "Cancel your membership?" confirmation
  untouched. While the check is in flight the button shows a brief pending state.
- Content, on existing tokens (`bg-background` #FDF8F2, `border-border` #DDD0B8,
  `text-primary` gold, `font-display`/`font-body`):
  - Heading (Playfair): "Before you cancel"
  - Subhead (Jost, muted): "Half price for your next 3 months on us."
  - One card for the member's actual tier only — STRAND £9.99 → £4.99/mo, or
    STRAND+ £14.99 → £9.99/mo. Old price struck through in muted, new price large in deep
    gold, then "For 3 months, then £9.99/mo" beneath. Standard price comes from the same
    `platform_settings` lookup the section already uses, so no hardcoded drift for STRAND.
  - Primary gold pill: "Claim 3 months half price" → claim mutation → success toast
    ("Your discount is on — half price for the next 3 months") and dialog closes.
  - Secondary ghost/outline: "Cancel anyway" → closes this dialog and opens the existing
    cancellation confirmation, unchanged.
- On claim error: inline error line inside the dialog plus a toast; both buttons stay usable.

## 5. What is deliberately untouched

- `consumer-portal` and its `subscription_cancel` deep link — the cancellation path itself is
  unchanged, including the access-until-period-end copy.
- Pause / resume, deletion, `AccountControls`, the Stripe webhooks and
  `cancellation-capture` (Stripe still records the cancellation reason as today).
- Pro and brand subscriptions are out of scope; this is the consumer STRAND / STRAND+ pair
  named in the brief ("strand" and "strand+" are the two consumer tiers).
