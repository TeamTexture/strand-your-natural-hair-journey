# Admin broadcast → email with state-aware deep link

## 1. Where the broadcast system lives today

- Admin UI: `src/pages/admin/AdminBroadcast.tsx` (audience = Everyone / Members / Professionals / Brands, text + optional photo + optional voice note).
- Send path: the SQL function `public.admin_broadcast_message(...)` (security definer). It records one row in `public.admin_broadcasts`, then for **every account it finds** it finds-or-creates that person's private `admin_support` thread and inserts one `chat_messages` row carrying `meta.broadcast_id`.
- Audience selection reads `public.user_roles` and excludes only the sending admin and restricted accounts. **It does not look at subscription, trial or onboarding status at all** — so a registered member who never paid and never finished onboarding already receives the chat message.
- Emails already fire: the `chat_messages` insert trigger `notify_message_recipient_email()` calls the `notify-message-recipient` edge function, which sends the `strand-message-received` template ("STRAND has sent you a message", no message body reproduced, CTA → `/messages/<threadId>`). So a broadcast already produces one email per recipient today.

Gap vs the request: the email exists but (a) its CTA is a plain in-app path that goes through the normal auth gate and can dead-end or land people on Home, and (b) it fires as one HTTP call per inserted row, which for a full broadcast is thousands of individual trigger calls — fine at current volume, worth watching.

**Assumption to confirm:** "people who never registered" have no account and no email address in STRAND, so nothing can be sent to them from this system. This plan covers *registered but never paid / never finished onboarding*. Emailing true cold leads would mean a Klaviyo campaign, which is marketing, not app email — out of scope here.

## 2. Email infrastructure that already exists

Everything needed is in place; nothing new to add.

- Single send path: `supabase/functions/_shared/app-email/core.ts` (`dispatchEmail`) + the shell renderer `render.ts` (STRAND sand/gold/serif card) + the template registry `templates.ts`.
- Client entry point `src/lib/sendAppEmail.ts` → `send-app-email` function; server-side callers use `dispatchEmail` directly.
- Logging, idempotency keys, retry sweep (`email-retry-sweep`), transactional vs marketing split all already handled.
- Only change: one new/edited template variant and a different CTA URL.

## 3. State-based redirect, without touching SplashScreen

New **public** landing route `/open` (page `src/pages/OpenMessage.tsx`), used only by these emails:
`/open?t=<threadId>&b=<broadcastId>`

It owns the whole decision and is the only new routing surface:

1. No session → remember the intent (see below), then send to the trial/registration entry (`/start-trial` for a cold/unpaid arrival, `/?next=/open?...` when they already have an account and just need to sign in).
2. Session + entitled + onboarding complete → `navigate('/messages/<threadId>')`.
3. Session + not entitled → the existing trial wall destination (unchanged logic, reused from `src/lib/trialOffer.ts` / `src/lib/trialWall.ts`).
4. Session + entitled but onboarding unfinished → the existing resume entry path from `getConsumerOnboardingStatus()`.
5. Thread id missing/not theirs → fall back to `/messages`.

**Intent hand-off:** a small new module `src/lib/pendingMessageLink.ts` writes `{ threadId, ts }` into user-scoped storage (via the existing `strandLocalStorage` helper) with a 7-day expiry. It is consumed in exactly two places: the end of the first-run tour (`FirstRunSequence` / `TOUR_DONE_EVENT` handler) so a finishing member lands in the chat instead of Home, and `/open` itself on a later visit.

**Why this cannot collide with today's SplashScreen work:** `SplashScreen.tsx`, `Index.tsx`, `consumer-verify-subscription`, `TrialWall` and `PaidGate` are all left byte-identical. `/open` is additive, reads the same helper functions those files read (`getTrialOfferState`, `walledDestination`, `getConsumerOnboardingStatus`) rather than reimplementing or modifying them, and when a signed-out person needs to sign in it hands off with the existing `?next=` convention that SplashScreen already honours. If the SplashScreen fixes change again, `/open` needs no edit.

## 4. Plan and what it touches

| Step | File | Change |
|---|---|---|
| 1 | `src/pages/OpenMessage.tsx` (new) | public state-resolving landing screen (STRAND splash mark + `LoadingDot` while it decides) |
| 2 | `src/App.tsx` | one new public route `/open`, plus `/open` added to `chromeFreeRoutes` so no admin bell/nav renders on it |
| 3 | `src/lib/pendingMessageLink.ts` (new) | store/consume the pending thread intent, user-scoped, 7-day expiry |
| 4 | `src/components/firstrun/…` (tour completion handler) | on tour done, consume a pending intent → `/messages/<threadId>` instead of Home |
| 5 | `supabase/functions/_shared/app-email/templates.ts` | new `admin-broadcast-received` template: subject "STRAND Admin has sent you a message", CTA → absolute `/open?t=…&b=…`. The existing `strand-message-received` template stays as-is for one-to-one admin replies |
| 6 | `supabase/functions/notify-message-recipient/index.ts` | when the message carries `meta.broadcast_id`, use the new template + `/open` CTA; everything else unchanged. Deploy + boot-verify |

Not touched: retention offer, cancellation, `consumer-verify-subscription`, `SplashScreen.tsx`, `Index.tsx`, `TrialWall`, `PaidGate`, the broadcast SQL function, Stripe.

Verification: unit test for `/open`'s destination table (all five states) and for the pending-intent expiry; template render check; boot-verify `notify-message-recipient`; one real broadcast to the three audit accounts (Basic/Plus/Pro) to confirm one email each and correct landing.

Open question before I build: do you also want the unpaid recipients' email to say something slightly different (e.g. "start your 3 days free to read it"), or the same copy for everyone?
