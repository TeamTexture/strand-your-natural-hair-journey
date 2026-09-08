# Trial cancel save flow — two save screens

## What I found before planning

**The existing cancel flow lives in one place.** `src/components/profile/ManageSubscriptionSection.tsx` — the "Cancel" row calls `startCancel()`, which today shows `RetentionOfferDialog` if the server says the member is eligible (or has already used it), otherwise the plain cancel confirmation. Actual cancellation is handed to the Stripe billing portal (`subscription_cancel` flow).

**The 50%-off-for-3-months mechanism already exists in full.** `supabase/functions/consumer-retention-offer/index.ts` applies Stripe coupon `0ajj1XVm` (50% off, repeating 3 months) to the member's subscription, and burns a one-time flag (`consumer_subscriptions.retention_offer_used` / `retention_offer_claimed_at`). Because it is a **percentage** coupon attached to the subscription, it works on STRAND and STRAND+ without change — nothing new is needed in Stripe for screen 2. Trialing members are already explicitly eligible, and the copy is already trial-aware.

**The trial-extension mechanism also already exists.** `admin-complimentary-access` extends a live subscription with `stripe.subscriptions.update(sub.id, { trial_end, proration_behavior: "none", cancel_at_period_end: false })` and mirrors `trial_end` back into `consumer_subscriptions`. Screen 1 reuses exactly this call with `trial_end = current trial_end + 7 days`. No new billing mechanism, no new coupon.

**What does NOT exist yet:** any record of a trial-specific save offer. `consumer_subscriptions` has only the single `retention_offer_used` pair. So a new permanent record is needed for screen 1 (and which personalisation fact it used).

**One mismatch to flag:** the brief describes screen 2 as a new 50%/3-month offer, but that offer already ships today as the generic "Before you cancel" dialog for *all* members including trialing ones. Building screen 2 as a second, separate one-time offer would double up. The plan therefore **reuses the existing retention offer as screen 2**, restyled with the new copy and personalisation when the member is in the trial window — same coupon, same one-time flag, no second Stripe mechanism.

**Personalisation data:** `user_hair_profile.porosity`, `density`, `curl_pattern`, `areas_of_concern` are plaintext columns (read directly, see `useHairCharacteristics`), but **`scalp_condition_enc` is encrypted** and only decrypts server-side. So the "porosity + scalp condition" combined fact must be assembled in the edge function, not the client. Activity counts come from `wash_days` and `user_products` (scans).

## Open question — my answer

**Declining screen 1 does NOT immediately show screen 2.** Screen 2 only appears on a later, separate cancel attempt (which may be the same session if she taps Cancel again, or weeks later). Declining screen 1 goes straight through to the real cancel. This matches the "still tries to cancel" language. Say the word if you want them chained back-to-back instead — it's a one-line change in the flow controller.

## What gets built

### 1. Database (one migration)
Add to `consumer_subscriptions`:
- `trial_save_offer_used boolean default false`
- `trial_save_offer_claimed_at timestamptz`
- `trial_save_offer_fact text` — which personalisation category screen 1 used (`porosity_scalp` / `areas_of_concern` / `curl_pattern`), so screen 2 can exclude it.

Permanent by design: never reset, so it can't fire again after the 7 days end or after a resubscribe.

### 2. New edge function `consumer-trial-save-offer`
Same shape and failure contract as `consumer-retention-offer` (`check` / `claim`, service-role read, member-safe messages, flag written only after Stripe confirms).

- **Eligibility (`check`)**: status `trialing`, not paused, not already cancelling, `trial_save_offer_used` false, and **never charged** — verified against Stripe (no paid invoice on the subscription), not just the local row.
- **Personalisation**: reads `user_hair_profile` (decrypting `scalp_condition_enc` via the existing decrypt path), counts wash days and product scans, then returns the chosen fact, the chosen action (`log_wash_day` / `scan_product` / none) and the ready one-sentence line. Falls back to the no-activity card when she has no wash day and no scan. Null values are skipped; "Not sure" can never be emitted.
- **`claim`**: `stripe.subscriptions.update(subId, { trial_end: existing + 7 days, proration_behavior: "none", cancel_at_period_end: false })`, mirror the new `trial_end` into `consumer_subscriptions`, then set the used flag + fact.
- Deployed and boot-verified in the same task (unauth call returns 401).

### 3. Server change to `consumer-retention-offer`
Additive only: `check` also returns the personalisation payload for screen 2, excluding the category recorded in `trial_save_offer_fact`, with the reverse-ish priority (`areas_of_concern` > `curl_pattern` > `porosity + scalp`). Existing eligibility, coupon and flag logic untouched, so the offer keeps working exactly as now for paying members.

### 4. UI
- New `src/components/profile/TrialSaveOfferDialog.tsx` — headline "Give it one more week", body "7 more days, free. No card change, ends on its own on [date]." Personalisation card (fact sentence + optional "Log a wash day" / "Scan a product" button that navigates to the relevant screen), gold primary "Get 7 more days free", plain-text secondary "No thanks, cancel my plan".
- New `src/components/profile/TrialAreYouSureDialog.tsx` — headline "Are you sure?", body "Would it help to have more time at a lower cost, so you can really get the most out of it?", its own personalisation line, gold "Get 50% off for 3 months" (claims the existing retention offer), plain-text "No thanks, cancel my plan".
- `ManageSubscriptionSection.tsx` — `startCancel()` becomes a small ordered gate: trial + not charged + screen 1 unused → screen 1; trial + not charged + screen 1 used + retention offer unused → screen 2; anything else → today's behaviour, completely unchanged.
- New hook `src/hooks/useTrialSaveOffer.ts` mirroring `useRetentionOffer` (bounded invoke, friendly errors, cache invalidation).
- Non-trial and already-charged members see no change at all.

### 5. Tests
- New unit tests for the fact-selection and activity-gating logic (priority order, null skipping, screen 2 excluding screen 1's fact, no-activity fallback).
- New test that the flow gate only opens screen 1/2 inside the trial window and never for a charged member.
- Re-run typecheck, the full vitest suite, and `content_integrity.test.ts`.

## Things I will not touch
The existing downsell/retention path for paying members, the pause/resume flow, the Stripe portal cancel flow, plan-change, and everything in the recent onboarding builds.
