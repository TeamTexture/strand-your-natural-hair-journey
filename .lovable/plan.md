# Admin-created deals on "Discounts & offers" — findings and two options

## 1. Is there a real admin role?

Yes. It is a proper in-app role, not preview chrome:

- `app_role` enum includes `admin`; roles live in `public.user_roles` and are checked by `has_role(auth.uid(),'admin')`.
- `src/App.tsx` has ~35 `/admin/*` routes behind `<RoleGate allow={["admin"]}>` (hub, members, professionals, brands, brand offers, brand calendar, offer review, shelf review, messages, broadcast, treatment, library, events, salons, capabilities, audit, view-as, settings…).
- Separately, the Lovable preview toolbar has its own "view as" switcher — that is editor chrome, not app UI. The in-app equivalent is `/admin/view-as` (`AdminViewAs.tsx`).

What admin can already do to brand offers today (`AdminBrandOffers.tsx`, `AdminBrandOfferReview.tsx`, `AdminBrandCalendar.tsx`): approve, reject with a reason, hide/unhide (`hidden_at`), approve/reject creative and targeting revisions, waive payment, free relaunch, and override audience/slots/dates via the `admin_override_brand_offer()` function. RLS backs this — `brand_offers` has an "Admins manage brand offers" policy for ALL commands.

What admin **cannot** do today: create an offer from scratch. There is no admin create screen; the only creation path is the brand's own `BrandCreateOffer.tsx` → submit → admin approve → Stripe checkout → `paid_scheduled`/`live`.

## 2. Is the brand offer system entirely brand self-serve?

Creation, yes — every row in `brand_offers` originates from a brand (or campaign-owner pro) account, and `brand_user_id` is `NOT NULL` with no null-owner path. But the system is not purely paid: admin can already waive payment and force dates/slots, so a non-paying partner offer is technically expressible today — it just needs a brand account to hang off, and there is no UI to create the offer row.

How the member page actually reads them: `Discounts.tsx` → `useAllLiveBrandOffers()` selects `brand_offers` where `hidden_at is null`, `status in ('live','paid_scheduled')`, and today is inside `starts_on…ends_on`. It does **not** require a placement, a slot, or a payment. `SponsoredOfferCard` then looks up `brand_profiles` for the brand name/logo and logs view/click/code-copy `ad_events`.

Current data: 2 brand profiles, 4 offers total (1 live, 2 ended, 1 cancelled). So the live blast radius is small but real — Team Texture's live campaign is one of these rows.

## Option A — admin creates directly into `brand_offers`

Add an admin "create offer" screen that inserts a `brand_offers` row (plus optional placements/targeting) on behalf of a chosen brand, marked as internal/unpaid.

Pros: renders identically everywhere (Discounts page, home/products/wash-day banners, brand page), full per-click/code-copy tracking, reuses the existing card, revision and hide machinery.

Cons / risks:
- Needs a brand account to own it (`brand_user_id NOT NULL`) — internal deals mean creating placeholder `brand_profiles`, which then leak into the brands directory, admin brand counts, "live brands" metrics, and the brand-facing dashboards.
- `total_price_pence = 0` rows enter the same revenue/metrics surfaces brands and you both read (`brand_offer_metrics`, billing, calendar), so the ad-revenue numbers stop meaning "paid".
- Touches the exact tables the in-flight work sits on: revision charging + `checkout_started_at` race guard, Stripe webhook status transitions, the brand calendar's slot-overlap constraint, and the realtime `brand_offers` sync channel. Any bug here can affect a paying brand's live campaign.
- Ad metrics audit rules (frozen archive, source-of-truth) would need the internal rows explicitly excluded or labelled.

## Option B — separate "curated offers" table (recommended)

New `public.curated_offers` table, admin CRUD only, rendered as its own section on the same page. No brand account, no slot, no booking, no Stripe, no `ad_events`.

Fields: `title`, `brand_name`, `description`, `discount_code`, `external_url`, `image_path`, `starts_on`, `ends_on`, `sort_order`, `is_active`, `hidden_at`, timestamps.

Pros: zero contact with `brand_offers`, placements, revisions, checkout, ad metrics, or the paywall/nurture work — nothing in the live paid system can regress. Simple admin form (create/edit/delete/reorder/expire). Reuses `DiscountCodeChip`, `OfferCard`, `ScreenLayout`/`SectionLabel`, and the existing `brand-assets` storage bucket pattern for the image.
Cons: a second concept to maintain; no per-click/code-copy analytics unless added later (can be added cheaply as a lightweight counter, deliberately kept out of `ad_events` so brand reporting stays clean); does not appear in the paid banner slots.

## Recommendation

**Option B is less work and far lower risk.** Roughly one migration + one admin page + one section on `Discounts.tsx`, all additive. Option A means an admin creation path through the most financially sensitive table in the app while brand revision-charging and the Klaviyo nurture work are still settling.

A sensible middle path if you later want an internal deal in the paid banner slots: keep Option B for the Discounts page, and separately add an `is_internal` flag to `brand_offers` (excluded from revenue metrics) only when that need is concrete.

## Things either option could affect

- The Discounts page also renders pro offers (`pro_offers`) and the blood-testing card — a new section must not reorder or displace those.
- `Discounts.tsx` is member-facing under the entitlement gate; admin impersonation must show curated offers read-only (no writes during view-as).
- Option A only: brand realtime sync channel, slot-overlap constraint, revision payment race guard, brand billing/metrics, brands directory counts, admin dashboard "live brands".
- Option B only: no effect on brand campaign flow, email sending, or the nurture lists.

## Technical notes

- Live-offer read: `useAllLiveBrandOffers()` in `src/hooks/useBrandOffers.ts` (status + date window + `hidden_at`), no placement required.
- `brand_offers` RLS: admin ALL policy already exists; public SELECT is restricted to live/paid-in-window and ended, both with `hidden_at is null`.
- Option B table follows the existing `curated_content` precedent (admin-read-all + members-read-published policies) and needs `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`, RLS on, admin-manage + member-read-active policies.
