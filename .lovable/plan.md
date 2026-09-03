# Paywall bypass — cause found, fix plan

## What is actually happening

The auth session is not the bug. Sign-up does create a real session immediately (that is
by design — the trial funnel needs a signed-in account to stamp and to take a card), and
the route guards do check entitlement server-side, not just "is someone logged in".

The bypass is that **a brand-new account can inherit a stranger's/old Stripe
subscription by email match**, and that stale record grants grace access.

Reproduced from live data: an account created today at 10:54:59 with no onboarding and no
checkout had a membership row written 49 seconds later carrying an **old Stripe
subscription id**, status `canceled`, with `current_period_end` in the future
(25 September). Our entitlement rule honours a paid period even after cancellation, so
that row reads as "entitled" → the trial wall un-walls the account → full access, no card.

How the row gets written without a payment:

1. On `/start-trial`, tapping "Start my 3 days free" first calls
   `consumer-verify-subscription` (double-charge guard) — before any card is entered.
2. That function collects candidate Stripe customers **by email address**
   (`stripe.customers.list({ email })`), gathers every subscription on those customers,
   and if nothing is active it still adopts `all[0]` — any old, cancelled subscription.
3. It upserts that subscription onto the *new* `user_id`. Nothing verifies the
   subscription or customer actually belongs to this account.

So anyone re-registering with an email that has ever existed in Stripe — a previously
deleted account, a test account, a family member's email, a re-signup after cancelling —
lands inside the app with no payment method on file.

## The flash of the hair characteristics page (separate, real bug)

`SplashScreen.tsx` (login on `/`) resolves the destination in the wrong order compared
with `Auth.tsx`: it returns `onboardingStatus.entryPath` **before** checking the trial
wall. So login navigates to an onboarding step (hair characteristics for a
part-completed member), that screen mounts, and only then does `TrialWall`'s async read
resolve and bounce back to `/start-trial`. Hence a visible flash of member content.
`Auth.tsx` already checks the wall first — the two resolvers disagree.

## The fix

### 1. Ownership check in `consumer-verify-subscription` (the actual bypass)

A subscription may only be adopted onto a `user_id` when it is provably theirs:

- `subscription.metadata.consumer_user_id === userId`, or
- `customer.metadata.consumer_user_id === userId`, or
- the customer id is already recorded on **this member's own** row.

Email-only matches are used solely to *discover* candidates; they are never adopted
unless one of the above holds. Additionally, refuse any customer/subscription already
linked to a different `user_id` in `consumer_subscriptions`. When nothing qualifies, the
function returns `active: false` and writes no membership row — the member goes to
checkout, which is the correct outcome.

### 2. Never let a stale record be more generous than a real one

The membership row is only written from a subscription that passed the ownership check,
so grace access (`canceled` with a future period end) can no longer be inherited. The
entitlement rule itself is left unchanged — genuinely cancelled paying members keep the
period they paid for.

### 3. Fix the login destination order in `SplashScreen.tsx`

Move the trial-wall check above the onboarding `entryPath` return, mirroring `Auth.tsx`,
so a walled account is sent to the paywall (or its pre-paywall step) and never briefly
renders a members-only onboarding screen.

### 4. Repair the affected live row

Clear the wrongly inherited subscription record on the affected account
(`8171b821-…`, status `canceled`, `sub_1U8HJnIu…`) back to `status: none` with no Stripe
subscription id, and sweep for any other row whose Stripe subscription is shared across
more than one `user_id`. This is a direct mutation of live member data and will be
reported explicitly.

### 5. Regression test

Add a test asserting that a subscription discovered only by email, with no matching
`consumer_user_id` metadata and no prior link on the member's own row, is not adopted.

## What this touches

- `supabase/functions/consumer-verify-subscription/index.ts` (redeployed and boot-verified)
- `src/components/SplashScreen.tsx` (destination order only)
- One data repair query on `public.consumer_subscriptions`
- New test file

Not touched: Stripe pricing, the webhook, checkout session creation, `lib/entitlement.ts`,
`TrialWall`, `PaidGate`, or the retention/cancellation flow.
