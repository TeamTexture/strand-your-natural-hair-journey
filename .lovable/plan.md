# Professional data visibility to members — findings and proposal

Investigation only. Nothing has been changed.

## 1. What a professional manages from their dashboard

Their dashboard (`/pro`) covers:

- **Listing/profile** — display name, discipline, bio, specialisms, qualifications, location/postcode, address, opening hours, business phone, business email, website, Instagram, booking URL, avatar, work gallery, **services (name + description + price)**, and a **STRAND discount** (code + description + on/off).
- **Listing discounts (campaigns)** — a separate `pro_offers` list: title, description, code, start/end dates, active flag. A pro can run several.
- **Salon** — salon record (name, address, opening hours, business contact) plus a stylist roster; each stylist keeps their own services and own discount.
- **Client work** — enquiries, messages, clients, client passports, treatment plans, appointments, reviews.
- **Commercial** — billing/subscription, plus `referral_fee_percent` (the commission on their listing) and booking-click/referral attribution records.

## 2. Already member-visible today

On the consumer directory card (`/directory`): name, discipline, "Specialist" badge, verified capability badges (doctor-verified, bloods), specialisms, bio, **qualifications**, work gallery, review rating + review preview, salon/clinic name, location, opening hours (summary + full week on tap), street address, **business phone**, **business email**, website, Instagram, booking action, and **one discount line** (the most recent active `pro_offers` campaign, or the profile discount for salon stylists).

On `/discounts`: active pro offers of published pros are listed to signed-in members.

## 3. Currently captured but NOT shown to members

- **Services and prices** — the pro fills in service name, description and price in their profile, and it is fetched by the directory query but **never rendered anywhere member-facing**. This is the single biggest gap against "show everything".
- **Additional discount campaigns** — only the newest active offer reaches the card; a pro running two or three live offers has the rest hidden. Offer *descriptions* and end dates are also dropped on the card (only "CODE — title" shows).
- **Offer validity dates** — members can't see when a code expires.

## 4. Deliberately restricted (recommend keeping restricted)

Flagging clearly before anything ships:

- **Discount codes are signed-in-only.** The directory query splits discount columns out so an anonymous visitor never receives a code. This was a security fix — do not widen it.
- **`referral_fee_percent`** — STRAND's commercial arrangement with the pro. Business-sensitive, must never render.
- **Private client notes** (`pro_client_notes`), **client passports**, **enquiries**, **chat threads**, **treatment plans**, **appointments** — other members' health data. Pro-only by RLS.
- **Billing/subscription state**, booking-click and referral-attribution analytics — the pro's own commercial data.
- **Internal moderation fields** — `profile_review_status`, `suspension`/`suspended_at`, review notes, unverified capability *claims* (only verified capabilities render today; keep it that way).
- **Personal (not business) contact details** — only the business phone/email the pro deliberately entered for their listing should ever show. No account email, no personal mobile.
- Unpublished or suspended profiles stay out of the directory entirely.

## 5. Proposed changes

1. **Services & pricing block on the pro listing** — new collapsible "Services" section on the directory card and pro detail view: service name, description, price as the pro typed it. Hidden entirely when the pro has entered none. Prices render verbatim (no computation, no "from" invention).
2. **All live discounts, not just one** — show every currently-active offer for the pro, each with title, description, code and "valid until" date where set. Codes stay behind sign-in exactly as now; a signed-out visitor sees "STRAND member discount available — sign in to view".
3. **Consistency for salon stylists** — same services + multi-discount treatment for roster stylists inside the salon group card.
4. **No new data exposure beyond the above.** Everything in section 4 stays where it is.

## Technical notes

- `services` is already selected in `PRO_LISTING_COLUMNS` (`src/hooks/useDirectoryProfessionals.ts`) but never mapped onto the `Professional` type — add a typed `services` field there and render in `src/pages/Directory.tsx` (+ `SalonGroupCard.tsx`).
- Discount fan-out: change `offerMap` from "first active offer" to an array per pro, carry `description` and `ends_at`, and keep the existing signed-in/signed-out column split intact.
- RLS needs no changes: `pro_profiles` already allows public read of published, non-suspended rows, and `pro_offers` already has a "signed-in users read active offers of published pros" policy.
- Display discipline: prices and dates humanised, titles never truncated, external links `target="_blank" rel="noopener noreferrer"`.
