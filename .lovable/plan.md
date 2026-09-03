# Calendly 1:1 link in the welcome chat moment

## What I found

**1. Where the welcome voicenote lives**
- Content: one admin-recorded row in `public.welcome_voicenote` (`audio_path`, `transcript`, `duration_ms`, `updated_by`), managed at `/admin/welcome-voicenote`.
- Send logic: `supabase/functions/_shared/welcome-dm.ts` → `sendWelcomeVoicenote(admin, userId)`.
- Sender account: the admin who recorded the note (`welcome_voicenote.updated_by`), posting into the member's `admin_support` thread in `chat_threads` (created on first send, with a `system` "Chat opened by STRAND Team." message).
- Trigger: the Stripe consumer webhook, the first time the member reaches `trialing`/`active`. One-per-account forever, guarded by `consumer_subscriptions.welcome_dm_sent_at`. The helper never throws, so a failure can't retry the webhook.

**2. What chat messages support today**
`chat_messages.kind` is constrained to exactly `text | system | booking_request | image | voice`. There is no link/card kind, but every row already has a `meta` jsonb column, and `booking_request` proves the pattern: a normal row whose renderer draws a tappable card from `meta`.

**Smallest addition:** send a second `text` row in the same send, carrying `meta.link = { url, label }`, and teach the two text-bubble renderers to draw a small tappable card when that meta is present (plain body text remains the fallback everywhere else, e.g. notification previews). No migration, no enum/constraint change, no new trigger.

## Implementation

1. `supabase/functions/_shared/welcome-dm.ts` — after the voice row, insert one more `text` row in the same call, same thread, same admin sender:
   - `body`: "Book your free 1:1 with Paige — a quick walkthrough of STRAND, one to one, no charge. https://calendly.com/paigelewinconsulting/1-1-strand-walkthrough-with-paige"
   - `meta`: `{ link: { url: "<calendly url>", label: "Book your free 1:1 with Paige" }, welcome_calendly: true }`
   Both inserts happen before `welcome_dm_sent_at` is stamped, so the moment stays atomic and still one-per-account.
2. New `src/components/chat/ChatLinkCard.tsx` — sand/cream card with a gold pill CTA using existing tokens (Playfair heading, Jost body, `rounded-pill`), opening in a new tab with `target="_blank" rel="noopener noreferrer"`.
3. Render it from the text branch of `src/pages/ChatThreadPage.tsx` and `src/components/chat/InlineThreadChat.tsx` when `meta.link.url` is present; unchanged behaviour otherwise.
4. Existing members who already received the voicenote are not re-messaged — the dashboard card added last turn covers them.

## Out of scope
Retention offer, cancellation flow, and the paywall investigation are untouched.
