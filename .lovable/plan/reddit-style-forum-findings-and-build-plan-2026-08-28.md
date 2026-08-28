# Reddit-style forum: findings and build plan

## What I found (verified)

**1. Threading already half-exists in the database.**
`public.forum_replies` already has a nullable `parent_reply_id` (self-FK, `ON DELETE CASCADE`). It is never written or read: all 6 existing replies have `parent_reply_id = NULL`, and `ForumThread.tsx` inserts replies without it and renders them in one flat `.map()`. So nesting is a **UI + insert-path job, not a schema migration**.

**2. Voting is upvote-only and is a raw counter — but it is reconcilable.**
- `forum_votes(user_id, target_kind, target_id)` with a UNIQUE on those three columns. There is no `value` column, so a row simply means "one upvote".
- Trigger `forum_bump_vote_count()` does `vote_count + 1` on insert, `-1` on delete, floored at 0 — so `forum_threads.vote_count` / `forum_replies.vote_count` are non-negative raw counters, not net scores.
- The UI (`upvote()`) inserts or deletes the row to toggle. One vote per user per target already holds, so adding a signed value is a clean additive change with an exact backfill (every existing row = +1).

**3. Why @mention shows "No matches" — partly confirmed, partly not.**
- `mention_search_all(_query, _limit)` exists, is `SECURITY DEFINER` (so profile RLS is not the blocker), has EXECUTE granted to `authenticated`, and the REST endpoint resolves (no schema-cache miss). Searching profiles directly for a real recent poster returns 7 hits, so the data is there. **I have not reproduced the failure end-to-end as a signed-in member, so I am not going to name a single root cause.**
- What *is* confirmed as broken in the client (`MentionTextarea.tsx`):
  - `const { data } = await supabase.rpc(...)` — the `error` is discarded. **Any** failure renders the exact "No matches" copy the screenshot shows, with nothing in the console. That alone makes this undiagnosable in production and must be fixed first.
  - The trigger closes the menu as soon as the typed fragment contains a space (`if (/\s/.test(between))`). Display names are full names ("Denise Acheampong"), so typing "@Denise " kills the dropdown mid-search.
  - Scope has no notion of "people in this thread" — it searches all profiles/pros/brands alphabetically with a 12-row cap, so a recent poster can be pushed out by unrelated names.
  - Mentions are stored as **plain text**, and `resolve_mention_user_ids()` only notifies on an **exact full display-name match**. So a hand-typed "@Denise" (which is what members are doing today as a reply workaround) never notifies anyone.

**4. What else reads these tables (integrity check).**
- `Forum.tsx` — list sorts by `vote_count` ("Top") and shows `reply_count`.
- `forum_bump_reply_count()` keeps `forum_threads.reply_count`; nested replies will count toward it (acceptable — Reddit counts total comments — but worth confirming as intended).
- `usePlusAlerts.ts` — realtime INSERT subscription on `forum_replies` plus a "new replies" count; nested replies flow into it automatically.
- `AdminModeration.tsx` — reads `forum_reports` (`target_kind = 'reply'`), deletes replies, and posts admin replies. **Deleting a parent reply currently cascades and silently removes its children**; with real nesting that becomes visible data loss.
- Notification triggers `notify_mentions_forum_thread/_reply` write `notifications` (`kind = 'mention'`, url `/forum/<thread>`); email preference key `forum_replies` exists in `EmailPreferences.tsx` and the email template registry.
- `mention_search_all` is also used by `ChatThreadPage`, `ForumNewThread`, `AdminLibrary` — the search fix is shared and must not regress those.
- `mention_search_all` and `forum_author_meta` are on the impersonation read-only allowlist; keep any new RPC read-only or add it there.

## Proposed build

### Schema (additive, one migration)
1. `forum_votes`: add `value smallint NOT NULL DEFAULT 1 CHECK (value IN (-1, 1))`; backfill existing rows to `1`.
2. Rewrite `forum_bump_vote_count()` to handle INSERT/UPDATE/DELETE and apply the signed delta, removing the `GREATEST(...,0)` floor so scores can go negative; then recompute all `vote_count` values as `SUM(value)` once.
3. `forum_replies`: add `depth smallint NOT NULL DEFAULT 0` (0 = top level, 1 = nested) — denormalised so the UI never has to walk the tree, and enforce the cap in a `BEFORE INSERT` trigger: if the chosen parent already has `depth = 1`, keep `depth = 1` and re-point `parent_reply_id` to that parent (a reply-to-a-reply attaches at level 2, exactly as specified).
4. Change `forum_replies_parent_reply_id_fkey` to `ON DELETE SET NULL` so deleting a parent promotes its children instead of destroying them, and set `depth = 0` on promotion.
5. Add `forum_reply_mentions(reply_id, user_id)` (and the thread equivalent) only if we go for structured mentions — see below.

### Reply-scoped composers and nesting (`ForumThread.tsx`)
- Extract the current inline reply markup into a `<ReplyCard>` component taking `reply`, `depth`, `onReply`.
- Build the flat query result into two levels client-side: top-level replies in `created_at` order, each with its children sorted underneath.
- Nested cards render at `pl-6` with a left hairline rule, slightly smaller avatar/type scale — no third level ever renders.
- Each card gets a "Reply" button that sets `replyingTo = reply.id`. That mounts a compact inline `MentionTextarea` + send button directly beneath that card; posting inserts with `parent_reply_id`.
- The sticky bottom composer keeps creating top-level comments only (`parent_reply_id = null`), and gets a clearer placeholder ("Add a comment").
- Vote control becomes a small vertical/horizontal up-down pair with the net score between them, reading the member's own current vote so the active arrow is highlighted; tapping the active arrow clears the vote, the other flips it.

### Mention fix
- Stop swallowing the RPC error; surface a real "Couldn't load members" state and log it, so the live failure is finally visible.
- New RPC `forum_mention_search(_thread_id, _query, _limit)` that unions **recent participants in this thread first** (thread author + reply authors), then all members, dedupes, and ranks prefix matches above substring matches. Keep `mention_search_all` untouched for chat/library, then add it to the impersonation allowlist.
- Allow spaces in the typed fragment: match against the last up-to-4-word run after `@` rather than closing on the first space.
- On selection, insert the canonical display name and record the resolved `user_id` in component state so notification is by id, not by string matching.

### Notification
- Preferred: persist selected mentions to a `forum_reply_mentions` join table and notify from that, keeping the existing text-matching trigger as a fallback for hand-typed names. This is the only way "@Denise" typed by hand stops silently dropping.
- Also add a **reply notification** — the parent author currently gets nothing when someone replies to them, which is the single biggest gap once per-comment replies exist.

## Bigger than it looks — flag before deciding
- **Structured mentions are the real work.** Everything else here is a day. Storing mentions as ids means changing the composer to track offsets, adding the join table, adjusting `renderMentions` to link by id, and reconciling with the four other surfaces that already use plain-text mentions (chat, library, threads). A cheaper interim: keep text mentions and just make search/insert reliable, accepting that hand-typed partial names still don't notify.
- **Negative scores are a product decision, not just a schema one.** Removing the zero floor means a comment can publicly show `-3` in a small, supportive community. Worth deciding whether to display negatives or clamp the *display* at 0 while storing the true net.
- **Reply-count semantics change.** `reply_count` will include nested replies, so the "Top"/list numbers shift. Cheap, but visible to members.
- **Parent deletion behaviour is a genuine behaviour change** (cascade → promote). It touches admin moderation, so it needs a re-check of `AdminModeration.tsx` after the migration.
- **Not touched by this plan:** thread voting stays as-is apart from the signed value; the report flow, block flow, and Plus gating are unchanged.
