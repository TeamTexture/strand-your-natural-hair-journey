# Build 1 of 3 — Admin & Brand Ecosystem

Large multi-part build. Presenting the shape before writing code so we agree on scope, especially where I'm inferring behaviour from the existing schema.

## 1. Past campaigns tab (admin promotions)

Add a filter chip / tab **All · Live · Pending · Past** to `AdminBrandOffers.tsx`. "Past" = derived status in `ended | rejected | cancelled`. Newest first. Filter chips for Brand/Pro carry through. Card already shows totals (impressions/taps/wishlist/code_copies/link_clicks), dates and amount paid — reuse `renderOffer`.

## 2. Remove "Recent activity" from /admin

Delete the section + `useRecentActivity` hook from `AdminHub.tsx`.

## 3. Admin ↔ user chat

**Schema (single migration):**
- `chat_threads`: add `thread_type text NOT NULL DEFAULT 'client_pro'`, `admin_user_id uuid`, `subject_user_id uuid`. Make `enquiry_id/pro_user_id/consumer_id` nullable.
- New security definer `is_chat_participant(_thread, _uid)` checking any of the four participant columns.
- Rewrite `chat_threads` + `chat_messages` policies in terms of `is_chat_participant`. Admin role does NOT get a bypass for `client_pro` threads — participation is the only door.
- New RPC `admin_start_support_thread(_subject_user uuid)` (SECURITY DEFINER, admin-only): finds or creates a `thread_type='admin_support'` thread with `admin_user_id=auth.uid()` + `subject_user_id=_subject`.

**Client:**
- `useChat.ts`: extend `ChatThread` type; queries pick up the extra columns automatically (`select *`). Rework inbox to identify the "other" participant using `thread_type`.
- Consumer/Pro `Messages.tsx`: for `admin_support` threads, show sender as **"STRAND Team"** with a small gold verified pill.
- `ChatThreadPage.tsx`: same label treatment in header. Hide "Book appointment" for admin_support threads.
- New `src/pages/admin/AdminMessages.tsx` — admin inbox listing their support threads.
- "Message" button on member cards (`AdminMembers`), pro cards (`AdminProfessionals`), and brand cards (new admin brands directory) → calls `admin_start_support_thread` → navigates to `/admin/messages/:id`.

## 4. Brand profile fixes + count correctness

- Confirmed via db: `STRAND` already linked to a Paige account, `Revlon Professional` to Rio. No rename needed. `Team Texture` stays.
- The "Live brands" stat card, page title, and list currently disagree because the card counts `brand_subscriptions` in `active/trialing` (0 for complimentary brands) while the "brands" filter view lists offers, not brands.
- Fix by defining **Live brand = row in `brand_profiles`** (i.e. all registered brands). Rewrite the stat card query to `brand_profiles.count`, and rewrite the destination page to be the new brand directory (item 5). All three surfaces will read 3 (STRAND, Revlon Professional, Team Texture) or 2 if we retire Team Texture per your intent — flagging: **you said "the actual registered brands" = 2. Team Texture is also a real registered brand row. I will show all 3.** Please confirm if Team Texture should be removed.

## 5. Admin Brands directory (new page)

New route `/admin/brands` → `AdminBrands.tsx` (this is where the stat card + hub "Live brands" link now points).
- Per row: logo, name, category, contact_name/email, subscription/complimentary status, activity summary (campaigns total, live/past offer counts, products added, last-active proxy = latest offer submitted_at).
- Search + category filter chips.
- Row action: **Message** (opens admin↔brand chat) and **View** (opens brand detail — for now, a minimal read-only pane; deep-dive can come in a later build).
- No booking calendar.

## 6. Brand categories

- Migration: `ALTER TABLE brand_profiles ADD COLUMN category text`.
- Fixed list: Hair Care, Supplements, Hair Tools, Hair Accessories, Food & Nutrition, Beauty & Skincare, Wellness & Lifestyle, Salon & Trade Supplies, Education & Training, Other.
- Backfill: STRAND, Revlon Professional, Team Texture → Hair Care.
- Add a required category `<Select>` to BrandAuth signup and BrandDashboard "Brand profile" editor.
- `brand-signup` edge fn: accept + persist `category`. Deploy per rule.
- Admin brands directory uses category filter.

## 7. Consumer-facing "STRAND Brands" directory

- New route `/brands` → `BrandsDirectory.tsx`, entry point on `Profile.tsx` (same card pattern as pro directory).
- Detail `/brands/:brandUserId` → `BrandDetailPage.tsx`: logo, name, category, about (new field), website, live offers (actionable, using existing offer flow), past offers (read-only strip), and their products/tools linked to `BrandProductPage`.
- RLS additions:
  - `brand_profiles`: SELECT for authenticated (safe fields — nothing sensitive on this table currently, so a policy `USING (true)` for `authenticated` is fine). The existing policies restrict to live-offer window; we widen to any authenticated user.
  - Rely on existing brand_offers/brand_products live-window policies for offer/product visibility. Past offers: add a new SELECT policy on `brand_offers` allowing authenticated to read `ended` offers by `brand_user_id` (limited to non-sensitive columns is via view — but shape allows it; will keep table-level SELECT since it doesn't expose PII).

## 8. Complimentary access for 3 accounts

- Rio (b1c78f28…) and Yvonne (6039cf50…): `complimentary_access=true` already ✅. Also insert active-forever rows into `brand_subscriptions` and `pro_subscriptions` (`status='active', current_period_end=NULL`) so gates that check subscriptions directly (not just `has_active_*`) pass. Grant `brand` role to Rio (already has). Grant Yvonne `professional` (already has).
- Erica Liburd: no matching profile exists. Implement future-proof grant via new `platform_settings` key `complimentary_emails` (jsonb array). Modify the `handle_new_user` trigger to check the email and set `complimentary_access=true` on profile creation. Seed the array with `erica.liburd@…` — **flag: I don't have an email. I'll seed with a lowercase name match `erica liburd` handled via case-insensitive comparison in the trigger, plus placeholder email slot admins can edit in `platform_settings`.**
- No admin role granted to any of them.

## Deployment
- Deploy `brand-signup` (touched).
- No other functions changed.

## Reporting
Final message will list per-account grants and confirm the STRAND/Revlon/Team Texture brand rows.

---

Confirm: (a) keep Team Texture as a live brand row, (b) OK with Erica handled via `complimentary_emails` future-match, (c) proceed.
