# Superchat audit, then paid / non-paid list routing

## Part 1 — what fires today (audit, no changes made yet)

**One trigger only, and it is not registration.**
- A database trigger on the member profile table (`sync_superchat_contact_trigger`) calls the `sync-superchat-contact` function, and only when one of three things changes: the WhatsApp opt-in switch, the phone number, or the display name.
- It exits immediately when opt-in is false and no Superchat contact id is stored. So **registration alone does not push anyone to Superchat.** Neither does email verification, onboarding completion, trial start or payment success — none of those paths touch Superchat.
- Confirmed against live data: 455 member profiles, **0** with WhatsApp opt-in, **0** with a Superchat contact id. Nobody has ever been pushed. Nobody is in Superchat without consent, so there is no consent breach to remediate.

**What is sent:** first/last name split from the display name, phone number as the messaging handle, email as a second handle. Nothing about subscription, tier or trial state is sent today.

**List on arrival:** a single list, `WhatsApp opt-in`, based purely on the opt-in switch. Opt-out removes the list membership but keeps the contact. There are no PAID / NON-PAID lists in the integration at all.

**Sync on subscription change:** none. Superchat is never touched by the Stripe webhook.

**Klaviyo, by contrast, is fully state-driven** and the two integrations do not contradict each other — they simply cover different things. Klaviyo has a paid-members list (pushed on active *and* trialing), a "started checkout, not paying" list, and an abandoned-checkout list, all driven from the consumer Stripe webhook plus backfill/daily jobs. One disagreement worth naming: **Klaviyo treats a free trial as paid** (trialing members go on the paid list). Your rule for Superchat is the opposite — trial is not paid. I will implement your rule for Superchat and leave Klaviyo as it is unless you want it changed too.

**Tier vocabulary:** the app holds `standard` and `plus` for members, and professionals are a separate subscription. There is no "Basic / Plus / Pro" set in the data. I will send `basic` for standard, `plus` for plus, and `pro` for a professional subscription.

## Part 2 — what I will change

**New shared module** `supabase/functions/_shared/superchat-lists.ts`
- Resolves the two workspace lists by name (`PAID`, `NON-PAID`), cached per isolate.
- `syncSuperchatLists(admin, userId, reason)`: reads current subscription state from the database, decides PAID vs NON-PAID, adds to the right list and **removes from the other in the same call**, so nobody is ever on both.
- PAID = subscription `active` and not paused, or a complimentary/professional active subscription. NON-PAID = everything else, explicitly including `trialing`, `past_due`, `canceled`, `incomplete`, `none` and no row at all.
- Sends tier as a contact field/tag (`basic` / `plus` / `pro`) plus the raw status, so the paid list can be segmented later.
- **Consent gate stays absolute:** a member is only created or listed in Superchat when WhatsApp opt-in is true and a phone number is on file. No opt-in → no contact; if a contact already exists and opt-in is withdrawn, they are removed from both lists.

**Wired into the events**
- Registration and opt-in changes: the existing profile trigger already fires here; the function will run the list sync as well as the contact sync.
- Trial start, trial converts, payment succeeds, cancelled, lapsed, payment failed: one call added to the consumer Stripe webhook after the subscription row is written, using the true Stripe status. Same defensive style as the Klaviyo calls — wrapped so a Superchat outage can never cause a Stripe retry.
- Professional subscription webhook gets the same one-line call.
- Account deletion: removed from both lists on the existing erasure path.

**Reconciliation, for the webhook-outage case**
- New function `superchat-reconcile` (admin or service only, plus a daily scheduled run) that walks every opted-in member, recomputes PAID/NON-PAID from current subscription state, and corrects list membership. Idempotent, so it is safe to run repeatedly, and it is the path that repairs anyone stranded by a missed Stripe event.
- Outcomes logged so you can see what it corrected.

**One thing I need from you:** the Superchat public API cannot create contact lists. The two lists must exist in the Superchat workspace named exactly `PAID` and `NON-PAID`. If they are named something else, tell me the names and I will match them. Until they exist, the sync logs the missing list and keeps the contact — it never errors.

**Existing contacts:** there are none, so nothing needs migrating. The first reconciliation run will place every opted-in member correctly from the moment the lists exist.

## Locks respected
Product scan flow, daily log, wash day step work and forum UI untouched. No hair typing terminology.
