
# STRAND+ Premium Tier (£14.99/mo)

This is a large, multi-surface build. Presenting the plan so you can adjust before I ship the code. Given size, I'll ship it in one continuous implementation pass, then run typecheck and report deploy status for every function.

## 1. Tier + payments

**Manual step for you (unavoidable):**
- Create a new £14.99/mo recurring **Product/Price** in Stripe (matching the existing consumer product's currency/interval).
- Copy the new `price_...` id into a new secret **`STRIPE_PLUS_PRICE_ID`** (Project Settings → Secrets). Once added, upgrades will start working.

**DB / webhook:**
- `consumer_subscriptions` gains a `tier text` column (`'standard' | 'plus'`, default `'standard'`).
- `stripe-consumer-webhook` (existing) inspects the subscription's price id: matches `STRIPE_CONSUMER_PRICE_ID` → `standard`; matches `STRIPE_PLUS_PRICE_ID` → `plus`. Written on every `customer.subscription.*` event.
- New helper `public.has_active_plus_subscription(_user)` = `is_access_restricted=false` AND (`complimentary_access=true` OR `has_role(admin)` OR active `plus` row). Complimentary users pass ✅.
- New `create-consumer-checkout` argument: `tier: 'standard' | 'plus'` — routes to the right price id. Existing checkout continues to default to standard.
- New `create-consumer-upgrade` edge fn: opens a Stripe Checkout (or portal update) that swaps the customer's active standard sub onto the plus price. Success returns to `/plus/welcome`.

**Subscribe screen (`Subscribe.tsx`):**
- Tier toggle at top (STRAND / STRAND+), same visual language.
- STRAND+ state lists community forum, member chat, courses & ebooks library, members-only events below the standard features.
- Selection drives which price id is checked out. Promo codes stay enabled; no default free month.

**Upgrade path:**
- Top-bar `+` button (visible only to authenticated consumers on the **standard** tier — hidden for plus, complimentary, admins, pros, brands).
- `/plus/upgrade` — what STRAND+ adds, single "Upgrade — £14.99/mo" CTA → `create-consumer-upgrade`.
- `/plus/welcome` — celebratory splash after success, then continues into the app.
- Profile/billing shows "STRAND+ member" pill for plus users.

## 2. Forum (Reddit-style, + members only)

**Schema (all RLS, all GRANTs, timestamps + trigger):**
- `forum_categories` (name, slug, sort_order) — admin CRUD; read: any signed-in `+` member.
- `forum_threads` (category_id, author_id, title, body, image_path?, is_pinned, is_locked, vote_count, reply_count).
- `forum_replies` (thread_id, parent_reply_id?, author_id, body, vote_count) — one nesting level: parent_reply_id refers to a top-level reply only; UI flattens replies to replies beyond depth 1.
- `forum_votes` (user_id, target_kind: 'thread'|'reply', target_id) — one per user per target; upvote-only.
- `forum_reports` (reporter_id, target_kind, target_id, reason, status: 'open'|'dismissed'|'actioned').
- Vote-count triggers keep `vote_count`/`reply_count` in sync (cheaper than recomputing on read).

**UI (consumer, + gated):**
- `/forum` — category chips, sort New/Top, thread list cards (title, author first name + photo, category, votes, replies, friendly time). Compose button.
- `/forum/new` — title, body, category, optional image (uses existing `moodboard-images` bucket path? — no: creates `forum-images` private bucket, signed URLs).
- `/forum/thread/:id` — thread body, upvote, reply composer, one-level nested replies (deeper replies rendered flat, quoting the parent). Report menu on each item. Author can delete/edit within 24h; admin can pin/lock/delete inline.
- Identity everywhere = first name + profile photo (existing avatar helpers).

**Moderation (`/admin/forum-reports`):**
- Report queue: content preview, reporter, reason. Actions: dismiss, delete content, lock thread, pin thread.

## 3. Member ↔ Member chat (+ members only)

- Add `member_dm` to `chat_threads.thread_type` CHECK. New nullable columns already cover DM participants via `consumer_id`/`pro_user_id` — for member DMs I'll add `member_a_id`, `member_b_id` (or reuse `consumer_id` + `subject_user_id` — schema check will pick simplest).
- `start_member_dm(_other_user)` RPC: verifies both are + members and not blocked, returns thread id (idempotent). Called from tapping a forum author.
- Extend `useChat` role scoping so `member_dm` threads only surface in the **consumer** view.
- `forum_blocks (blocker_id, blocked_id)` — prevents new DMs/messages both directions (silently — sender gets a generic "message failed" toast, no signal to the blocker).
- Report a conversation → drops into the same `forum_reports` queue with `target_kind='thread'` on the chat thread id (or dedicated `chat_reports` — I'll use the shared `moderation_reports` table for cleanliness).

## 4. Library (+ members only)

**Schema:**
- `content_collections` (kind: 'course'|'ebook'|'video'|'article'; title, description, cover_path, sort_order, is_published).
- `content_items` (collection_id, kind: 'video'|'pdf'|'text'; title, body_md?, storage_path?, url?, duration_seconds?, sort_order).
- `content_progress` (user_id, item_id, completed_at) — for course resume/mark-complete.
- New private storage bucket `strand-plus-library`; signed URLs on read; only + members can generate.

**Admin (`/admin/library`):** create/edit collections, upload files (drag/drop, showing signed thumb previews), reorder via up/down buttons (mobile-safe).

**Consumer (`/plus/library`):**
- Type filters (Course / Ebook / Video / Article).
- Collection page: courses show ordered modules with per-item ✓ progress and "Resume" CTA; ebooks show cover + open/download; videos play inline (HTML5 `<video>` from signed URL); articles render markdown.

## 5. Events (+ members only)

**Schema:**
- `events` (title, description, starts_at, ends_at, kind: 'in_person'|'digital', venue, address, join_url, cover_path, capacity nullable, created_by, cancelled_at).
- `event_rsvps` (event_id, user_id, created_at, cancelled_at). Capacity enforced by trigger.

**Admin (`/admin/events`):** create/edit/cancel, view RSVP list per event.

**Consumer (`/plus/events`):**
- Upcoming/Past tabs, calendar-style month grid + list.
- Event detail: RSVP / Cancel RSVP; capacity remaining; digital `join_url` shown ONLY to RSVP'd users; day-of reminder via existing `MessageNotifications` mechanism (lightweight — toast + badge on next foreground).

## 6. Gating + navigation

- `usePlusAccess()` hook wrapping `has_active_plus_subscription` (RPC, react-query, `static: true` on Home). Complimentary + admin pass automatically.
- `<PlusGate>` component: if not +, renders the upgrade gate screen (feature list + CTA to `/plus/upgrade`).
- Consumer hamburger (`GlobalMenu`) gains a "STRAND+" section with Forum · Chat · Library · Events (consumer view only).
- Profile page: "STRAND+ Member" pill for plus; "Upgrade to STRAND+" card for standard.
- All `/plus/*` and `/forum/*` routes wrap in `<Paid><PlusGate>...</PlusGate></Paid>`.

## Edge functions to deploy

1. `stripe-consumer-webhook` (edit — tier detection)
2. `create-consumer-checkout` (edit — accept `tier`)
3. `create-consumer-upgrade` (new — price swap for existing customers)
4. `library-signed-url` (new — issue signed url for a `content_items.storage_path` after verifying + access)
5. `forum-image-signed-url` (new — signed upload/read for `forum-images` bucket)

Every function boot-tested (unauth call → 401 / expected shape, not `Failed to send a request`). Deploy status listed at end of turn.

## Verification

- `tsgo` typecheck clean.
- One migration file covering all new tables, GRANTs, RLS, triggers, RPCs.
- New Stripe manual step surfaced clearly at the end so you can add `STRIPE_PLUS_PRICE_ID` and it's live.

## Not doing (out of scope of this spec)

- No PWA push scheduling for event day-of (uses existing in-app notification pattern).
- No rich-text editor in forum composer — plain text + optional single image (matches app's current density).
- No cross-tier community features for standard members (forum/DMs/library/events are strictly +).

Approve and I'll build it end-to-end.
