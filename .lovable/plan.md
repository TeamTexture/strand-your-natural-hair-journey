# Live-app audit sweep — 27 Aug 2026 (report only, nothing changed)

Docs reviewed first: `AUDIT.md` (26 Apr, largely superseded), `docs/AUDIT_FLOW_INVENTORY.md`,
`docs/CURRENT_STATE.md` (the live tracker, 21 Aug), `docs/KNOWN_ISSUES.md` (redirects to CURRENT_STATE),
`docs/PHASE_1_PLAN.md`, `docs/PHASE_2_AUDIT.md`. Findings below are marked **NEW** or **TRACKED**.
Live evidence: `email_log`, `ai_call_log`, `ad_events`, `klaviyo_sync_log`, policy/function definitions,
edge-function logs, and last 10 days of commits. Build is currently clean ("build OK").

Population context: 323 profiles, 26 subscription rows (5 active, 8 trialing, 2 cancelled, 11 none).

---

## P0 — silent failures with real member/brand impact

1. **NEW — 31 real emails were permanently lost to a Resend daily quota, with no retry queue.**
   `email_log` (24 Aug): 21 `admin-signup-received`, 8 `onboarding-next-steps`, 3 `international-waitlist`
   failed with `429 daily_quota_exceeded`. `supabase/functions/_shared/app-email/core.ts:103-136` retries
   only 3 times inside the same request (~2s of backoff) and then gives up; nothing re-drives a `failed` row.
   Worse, the idempotency check (`core.ts:169-178`) returns "deduped" for an existing row of **any** status,
   so a failed send can never be re-sent under the same key. Affected: 8 real members got no onboarding
   email, plus admin signup alerts for that day. Will recur at every quota ceiling or Resend outage.

2. **NEW — the two Klaviyo nurture lists never receive anyone: the secrets don't exist.**
   Secret store has `KLAVIYO_PAID_LIST_ID` only; `KLAVIYO_PAYWALL_LIST_ID` (XcgcdA) and
   `KLAVIYO_ABANDONED_LIST_ID` (WzQpDj) are unset, and the live edge log confirms the silent skip:
   `[klaviyo-nurture] paywall list id not configured — skipping pushes`. `klaviyo_sync_log` for the last
   7 days shows only `paid_list_webhook`, `paid_backfill`, `consent_sync` — zero paywall/abandoned pushes.
   Affected: every member who reaches the paywall and doesn't convert (the majority of the 11 `none` +
   drop-offs) gets no nurture at all. Fails silently by design, so it looks "built" but isn't running.

3. **NEW — a brand can be charged for a targeting revision that is then discarded with no effect and no refund.**
   `submit_brand_offer_revision` supersedes any revision in `approved_pending_payment` with no check for an
   in-flight Stripe session; `confirm_brand_offer_revision_payment` then returns `false` and
   `supabase/functions/brand-stripe-webhook/index.ts:121-134` treats the no-op as success — money captured,
   uplift never applied, no admin alert. Affected: any brand who edits a pending revision with a checkout tab
   open. Low frequency, money-touching, so P0 by severity not volume.

4. **NEW — Wash Day logging has no server-side draft; four screens hold the entry in `localStorage` only.**
   `WashStep1.tsx:396-422`, `WashStep2.tsx:89-93`, `WashStep3.tsx:151`, `WashStepStyling.tsx:243`; only
   `WashStep4.save()` writes to `wash_days`. Cleared/evicted storage (Safari private mode, storage pressure)
   or starting on phone and finishing on desktop loses everything typed — scalp/breakage answers, hair-feel
   voicenote, styling choices — with no toast and no warning. The blood flow already solves exactly this via
   `onboarding_drafts`; Wash Day does not. Affected: anyone who doesn't finish the logger in one sitting on
   one device.

## P1 — wrong data shown, or wrong gate decision

5. **NEW — brand `interactors` silently under-counts once raw events are archived.**
   `brand_offer_metrics` sums archived `ad_stats_daily` into reach/clicks/expands but **not** interactors
   (no per-day distinct figure is stored), so after the monthly `purge_ad_events()` rollup an offer can show
   more `link_clicks` than `interactors` — an obviously wrong number in front of a paying brand.
   Related, lower: `reach` counts `session_id` for signed-out impressions, so repeat anonymous visits inflate it.

6. **NEW — chat send gate disagrees with itself on cancelled appointments.**
   Verified live: the `chat_messages` INSERT policy *does* call `can_send_chat_message` (a subagent claim that
   it was orphaned SQL is **wrong** — do not act on that). But the server function keys off
   `appointments.cancelled_at is null`, while member self-cancel (`src/pages/LogAppointment.tsx:200-208`)
   writes only `status='cancelled'` and never `cancelled_at`. So a member who cancels her own first appointment
   is still treated server-side as having had it, and the STRAND+ chat wall can close on her while the UI
   (`useCanSendChatMessage.ts:42-49`, which filters on `status`) says she may write. Latent today — 0 cancelled
   appointments in the table — but it will bite the first self-cancellation.

7. **NEW — no email at all for member↔pro chat replies.**
   `supabase/functions/notify-message-recipient/index.ts:38-39` returns early unless
   `thread_type = 'admin_support'`. Members and pros only get in-app/push, and 16 `chat_message`
   notifications are currently unread. Affects every client↔pro conversation.

8. **NEW — the notifications feed is hard-capped at 30 rows.**
   `src/hooks/useNotifications.ts:37-45,70-101`: unread count and "mark all read" only ever see the newest 30,
   so anything older can never be cleared and the OS badge (`useAppBadge`) drifts. Affects heavy accounts
   (active pros, admins) first.

9. **NEW — `past_due` members are told "Cancelled" on their own billing screen.**
   `ManageSubscriptionSection.tsx:130-140` falls through to a "Cancelled" pill for every status outside
   active/trialing/paused/cancelling, while `entitlement.ts:20-38` still grants them access. Display-only,
   but alarming for a member whose card just bounced once.

10. **NEW — `ai_call_log` has 185 rows in 7 days with `outcome='unflushed'`** (nutrition-plan 73,
    wash-day-steps 59, ingredient-explainer 29). Duration and tokens are present, so these are completed
    calls whose finaliser never stamped the outcome — cost/rejection reporting under-counts. Telemetry only,
    no member impact.

## P2 — cosmetic / hygiene

11. **NEW — signup skips `/onboarding/goal`.** `src/pages/Auth.tsx:219` navigates straight to
    `profile-step-1`, and `ProfileStep1.tsx:404` hardcodes `goalCaptured: true`, so the goal/challenge capture
    and its whole `trialWall` plumbing is unreachable on the primary route. Affects 100% of new signups
    (data-capture gap, not a blocker).
12. **NEW — storage leaks:** wash-day delete (`WashDayDetail.tsx:326-344`) never removes voicenotes or
    styling photos; `WashStepStyling.tsx:171-199` uploads photos before the entry exists, orphaning them if
    she backs out; journal step media isn't cleaned on entry delete.
13. **NEW — `expand` ad events have no dedupe** while `view` is hour-deduped server-side, so remount/back-nav
    inflates the expand count brands see (47 expands vs 38 views in the last 7 days is consistent with this).
14. **NEW — every product open does a pointless round trip** through `ProductProfileRedirect` (uuid →
    `product_key`) from Shelf, Wishlist, Favourites and Repository — wider than tracked item 2.
15. **NEW — `OnboardingGate` capture-path bounce omits `/onboarding/photos` and `/onboarding/success`**, so a
    finished member can replay both; `SuccessScreen` re-stamps `onboarding_completed_at` on each visit.
16. **NEW — `wash_days.steps` is typed non-nullable but can be null on legacy rows** (`useWashDays.ts:10,47`);
    current consumers guard with `?.`, so it's one unguarded future call from a crash.

## Already tracked in docs/CURRENT_STATE.md — re-confirmed, not new

Two-scorer product match split and the dead `ProductProfile.tsx` on the live route (items 3/3b), verdict-vs-stars
(4), length goal not on Home (1), wishlist detail parity (2), onboarding step counters disagreeing,
consent-accept landing on `/`, `journal-encouragement` ignoring its provider flag (12), provider-flag
case-sensitivity (14), nutrition-plan model label (15), `useHomeAlerts` serial decrypt (8), regex rebuild per
shelf card (9). Guardrail rejections are working as designed (`tip_generation_rejections`: 11
`clarification-cleanse-area-focus` on ingredient-analysis, 6 `unmapped_claim`) — retries absorb them.

## Checked and found sound

`ad_delivery_for_slot` (status + `hidden_at` + date window + dismissals all filtered — no live offer past
`ends_on`; the single live offer ends 31 Aug), `BrandPaywallGate`/`useBrandLockout`, `PaidGate`/`PlusGate`/
`TrialWall` (fail closed, trialing/complimentary/admin honoured), impersonation dry-run and `aiInvoke` dedup
keys, `ai_summaries` per-user scoping, `parseRecipe`/homemade safety degradation on malformed rows,
booking-click single insert, blood-extract marker validation, `useOnboardingDraft` race guard, onboarding save
paths (all surface errors and stop).

## Suggested fix order if you want a build pass next

1 and 2 first (silent, ongoing, affects real members), then 3 (money), 4 (data loss), then 5-9.
