# Pro Promoted Campaigns — Shared Inventory Plan

## The one architectural choice

`brand_offers` already owns the inventory (`brand_offer_placements`) and its overlap trigger already blocks double-booking across offers. Rather than creating parallel `pro_campaigns` tables (which would require a synthetic union view + a cross-table lock), I'll **extend the existing tables to become owner-agnostic "promotions"**. This is the ONLY way "one bookings structure" is truly guaranteed at the database level.

Rename is presentation-only — existing brand code keeps working via a thin compatibility layer.

## 1. Migration (shared inventory foundation)

Add to `brand_offers`:
- `owner_type text not null default 'brand'` — `'brand' | 'pro'`
- `owner_user_id uuid` — populated from `brand_user_id` for existing rows; new rows set both (`brand_user_id` becomes an alias column for backward compat)
- `attached_pro_offer_id uuid` — optional link to a `pro_offers` row
- `attached_booking_url text` — optional external booking link

Update `brand_placement_no_overlap` trigger: it already covers all offers regardless of owner — no change needed, just verify.

Update `brand_taken_placements()` RPC to expose `owner_type` and owner display name so both designers and the admin calendar can label bookings as **Brand: X** or **Pro: Y**.

Loosen RLS: brand and admin policies stay; add "Pros manage own promotions" scoped to `owner_type='pro' AND owner_user_id=auth.uid()`. Same for placements/revisions/stats/products (pros won't use `brand_products`, but the policy generalises cleanly).

Eligibility check: new `has_active_promotion_eligibility(_user, _owner_type)` security definer function — admin bypass, brand needs `has_active_brand_subscription`, pro needs `has_active_pro_subscription`.

## 2. Pro campaign UI (mirrors brand pages)

New files under `src/pages/pro/campaigns/`:
- `ProCampaigns.tsx` — dashboard section with Live / Upcoming / Past groupings, reuses `LiveOfferCard`.
- `ProCreateCampaign.tsx` — 95% clone of `BrandCreateOffer.tsx`. Same banner spec (1500×320, crop, WebP, safe-area guides, drag & drop), title/body/discount, live preview.
  - **Attachments panel** replaces the brand products picker with:
    - Pro profile card preview (auto — pulled from `pro_profiles`).
    - Dropdown: attach one of their `pro_offers` (optional).
    - Optional external booking URL.
  - Same `PlacementCalendarPicker` reading the shared `brand_taken_placements` RPC.
- `ProCampaignDetail.tsx` — clone of `BrandOfferDetail.tsx` with pro attachments rendered.
- `ProExtendCampaign.tsx` — clone of `BrandExtendOffer.tsx`.
- `ProCampaignCheckoutSuccess.tsx` — clone of `BrandCheckoutSuccess.tsx`.

Add "Promote" entry point on `ProDashboard.tsx` and context menu.

## 3. Hooks

Extend `useBrandOffers.ts` → export a generic `usePromotions({ ownerType })`. Existing `useBrandOffers` becomes a thin wrapper (`ownerType: 'brand'`). New `useProCampaigns` = `usePromotions({ ownerType: 'pro' })`. `useTakenPlacements` already covers everything.

## 4. Edge functions

Generalise `brand-checkout` → accept `owner_type` and route the fee to `pro_promotion_daily_rate_pence` (added to `platform_settings`) when `owner_type='pro'`. **NO £99 access fee for pros** — their pro subscription is their platform access.

Generalise `brand-stripe-webhook` → same, or add `pro-promotion-webhook` alias sharing the handler. Reuse `STRIPE_BRAND_WEBHOOK_SECRET` metadata; sessions carry `owner_type` in metadata.

`brand-verify-session` becomes owner-agnostic.

All modified/new functions deployed and boot-verified per the DEPLOYMENT RULE.

## 5. Consumer rendering

`BrandBanner` already renders any `brand_offers` row. Extend it to:
- If `owner_type='pro'`: expanded-state right card = pro profile card linking to `/directory/:proUserId` (which already runs the enquiry flow). Optional attached `pro_offer` shown as a chip.
- Tap-through logs a new stat kind `enquiry_clicks` (added to allowed list in `increment_brand_offer_stat`).

## 6. Admin

`AdminBrandOffers.tsx` → rename presentation to "Campaigns"; add Brand/Pro type badges and a filter chip. Same review flow, same revision approval — the RPC already only checks admin role. `AdminBrandCalendar.tsx` labels each booked day with owner_type + name.

`AdminHub.tsx` badge counts sum both types.

## 7. Verification (called out in the brief)

Shared-inventory proof:
1. Create a brand offer holding Home/2026-01-15 → paid_scheduled.
2. Attempt to submit a pro campaign for Home/2026-01-15 as a different user.
3. `brand_placement_no_overlap` raises `Placement slot ... on ... is already booked`.
4. Reverse test: swap owner order — same block.

I'll run this end-to-end with `psql` inserts against real fixture users and paste the two RAISE outputs in the completion report.

## Out of scope

- `/pro/offers` free directory offers stay exactly as-is.
- No AI product analysis on pro campaigns (spec says explicitly no AI product pages).
- Existing brand code paths keep behaving identically — I'm additive on the schema/RLS side.

## Rollout order (single PR)

1. Migration (schema + RPC + eligibility fn + platform_settings default for pro rate).
2. Hook + shared components (owner-agnostic).
3. Edge function generalisation + deploy.
4. Pro campaign pages + dashboard entry.
5. BrandBanner pro-attachment branch + stat kind.
6. Admin rename/filter/calendar labels.
7. Typecheck + shared-inventory verification report.
