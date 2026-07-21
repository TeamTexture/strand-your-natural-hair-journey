# STRAND Professional Portal — Implementation Plan

Same app, three roles: `consumer` (existing, untouched), `professional` (new), `admin` (new). Role determines which shell renders after login. Consumer routes and data model are not modified — the professional side is layered on top with new tables, new RLS, and a role-aware router.

Assumption: the pro portal ships inside the existing app (a `/pro/*` route tree) rather than a separate deployment. Confirm if you'd prefer a subdomain instead.

## 1. Roles & auth

No `user_roles` table exists yet. Introduce the standard pattern:

- `app_role` enum: `consumer | professional | admin`
- `user_roles(user_id, role)` table (unique per pair), RLS: user reads own rows; only `service_role` writes
- `has_role(_user_id uuid, _role app_role)` — SECURITY DEFINER, used in every new RLS policy
- On signup, trigger assigns `consumer` by default (does not touch existing users; a one-off backfill inserts `consumer` for everyone currently in `profiles`)
- `admin` is granted manually via SQL for the founder/team — no self-serve path
- `professional` is granted only when an admin approves a pro application (edge function using service role)

Route guard: a new `<RoleGate allow={...}>` wrapper reads roles once at session hydrate. `/pro/*` requires `professional`, `/admin/*` requires `admin`. Consumer routes stay behind the existing `<Protected>`.

## 2. Data model (new tables)

All in `public`, all with the four-step pattern (CREATE → GRANT → ENABLE RLS → POLICIES) and `updated_at` triggers.

**`pro_applications`** — vetting queue
- `user_id` (nullable — applicants may not have accounts yet; link on approval), `email`, `full_name`, `business_name`, `discipline` (enum matching `pro_type` + `Colourist`, `Stylist`), `qualifications`, `insurance_provider`, `insurance_policy_no`, `insurance_expiry`, `location`, `postcode`, `website_url`, `instagram_handle`, `why_strand` (text), `status` (`pending|approved|rejected|suspended`), `admin_notes`, `reviewed_by`, `reviewed_at`
- RLS: applicant reads/inserts own row (matched by email while unauthenticated is not possible — so applications are gated behind a lightweight "create account to apply" step); admins read/update all

**`pro_profiles`** — the pro's editable directory listing (replaces the static seed for approved pros; the existing `professionals_directory` stays as the read-only public catalogue and gets a nullable `pro_profile_id` FK so seeded entries can be migrated later)
- `user_id` (FK to auth.users, unique), `display_name`, `discipline`, `bio`, `services` (jsonb: name/description/price), `location`, `postcode`, `contact_email`, `booking_url`, `website_url`, `instagram_handle`, `avatar_path`, `cover_path`, `photos` (text[] of storage paths), `is_published` (bool, admin-controlled), `suspended_at`
- RLS: pro reads/updates own row; anyone reads rows where `is_published = true`; admin full access

**`pro_offers`** — one-off promotions on a pro's profile
- `pro_user_id`, `title`, `description`, `code` (nullable), `starts_at`, `ends_at`, `is_active`
- RLS: pro manages own; public reads active offers of published pros

**`pro_enquiries`** — replaces booking
- `consumer_id`, `pro_user_id`, `note`, `share_passport_consent` (bool, must be true to insert), `status` (`pending|accepted|declined|withdrawn`), `responded_at`, `decline_reason`
- RLS: consumer reads/inserts/withdraws own; pro reads enquiries addressed to them and updates status; admin read-only

**`pro_client_access`** — the consent record; the one table that gates passport RLS
- `pro_user_id`, `consumer_id`, `enquiry_id`, `granted_at`, `revoked_at` (nullable), unique on (pro_user_id, consumer_id) where revoked_at is null
- Row is inserted by a SECURITY DEFINER function `accept_enquiry(enquiry_id)` when the pro accepts; consumer revocation sets `revoked_at = now()`
- Helper: `has_active_client_access(_pro uuid, _consumer uuid) returns boolean` — SECURITY DEFINER, used by every passport RLS policy

**`pro_passport_views`** — audit log
- `pro_user_id`, `consumer_id`, `viewed_at`, `section` (text), `ip` (optional)
- RLS: pro inserts own; consumer reads own; admin reads all
- Written by an edge function `passport-view-log` called on the pro's passport screen (client can't be trusted to log itself, but a service-role edge function called on view is enough for v1)

**`pro_subscriptions`** — Stripe state
- `pro_user_id` (unique), `stripe_customer_id`, `stripe_subscription_id`, `status` (`active|past_due|canceled|incomplete|trialing`), `current_period_end`, `price_id`, `cancel_at_period_end`
- RLS: pro reads own; only service role writes (webhook)
- Helper: `has_active_pro_subscription(_pro uuid) returns boolean` used to gate enquiry inbox and passport RLS

**`platform_settings`** — admin-configurable
- Single-row `key/value` (jsonb) for `pro_monthly_price_gbp`, Stripe price id, etc.
- RLS: admin write, everyone reads

## 3. RLS design for the passport (the critical bit)

The passport is read-only for pros and includes rows from many existing consumer tables: `blood_results`, `blood_panels`, `ai_summaries`, `user_hair_profile`, `user_health_profile`, `user_style_profile` (incl. colour history), `wash_days`, `journal_entries`, `user_goals`, `goal_updates`, `user_products`, `user_medications`, `appointments`, `hair_strand_summaries`.

For each of those tables, **add** (do not modify existing consumer policies) one new SELECT policy:

```sql
create policy "Pros with active consent can read"
on public.<table> for select
to authenticated
using (
  public.has_role(auth.uid(), 'professional')
  and public.has_active_pro_subscription(auth.uid())
  and public.has_active_client_access(auth.uid(), user_id)
);
```

Two guarantees this gives us:
- A pro cannot query a consumer's data without an active `pro_client_access` row → revocation cuts access instantly.
- A lapsed subscription flips `has_active_pro_subscription` to false → passport queries return zero rows even if consent exists. Profile editing keeps working because `pro_profiles` policies don't check subscription.

Admin gets a separate `has_role(auth.uid(), 'admin')` SELECT policy on the same tables — used only in the admin panel, and only for moderation/support flows we scope later. Not part of v1 UI.

Existing consumer policies (`auth.uid() = user_id`) remain untouched, so the consumer app behaves identically.

## 4. Screens

**Consumer side (minimal changes)**
- Directory card: `Book` → `Enquire` button (already partly renamed to "Enquire Now" — extend to route into the enquiry sheet instead of an external link when the pro has a `pro_profiles` row)
- Enquiry sheet: optional note + mandatory consent checkbox → creates `pro_enquiries` row
- New "My Enquiries" section under Profile: pending/accepted/declined list, per-pro "Revoke access" button
- New "Data access" settings row: list of pros with active access, revoke individually

**Pro portal (`/pro/*`)**
- `/pro/onboarding` — post-approval welcome + subscribe CTA
- `/pro/profile` — edit `pro_profiles`, upload photos, manage services, manage offers
- `/pro/enquiries` — inbox: pending / accepted / declined tabs; each row shows consumer name + passport preview (hair discipline, latest blood flags count, goals) + accept/decline; gated behind active subscription
- `/pro/clients/:consumerId` — full passport viewer (sections mirror the consumer's own home + PDF export); logs a view on mount; gated behind active subscription AND active consent
- `/pro/billing` — subscription status, manage via Stripe customer portal

**Admin portal (`/admin/*`)**
- `/admin/applications` — pending queue, approve/reject with notes
- `/admin/pros` — list all pros, suspend/reinstate, unpublish
- `/admin/settings` — set monthly price, Stripe price id
- `/admin/audit` — recent passport views, recent enquiries (read-only)

**Public entry point**
- Directory gets an "Apply as a professional" CTA → `/pro/apply` (public form, requires creating an account to submit)

## 5. Stripe subscription

Use Lovable's built-in Stripe payments (seamless, no BYOK).

- Single recurring product "STRAND Pro Membership" at £12.99/month (price id stored in `platform_settings` so admin can swap it)
- On approval, admin panel creates the pro's Stripe customer via edge function; the pro subscribes from `/pro/billing` via a hosted checkout session
- Webhook edge function `stripe-pro-webhook` handles `customer.subscription.{created,updated,deleted}` and `invoice.payment_failed` → upserts `pro_subscriptions.status` and `current_period_end`
- `has_active_pro_subscription` returns true when `status in ('active','trialing')` and `current_period_end > now()` — so lapse is automatic
- No proration UI, no plan switching in v1

## 6. Build order

**Phase A — Foundations (no user-visible change)**
1. `user_roles` + `has_role` + backfill `consumer` for existing users
2. `RoleGate` route wrapper; consumer app continues to work with role = consumer

**Phase B — Application + admin**
3. `pro_applications` table + public `/pro/apply` form
4. `/admin/applications` panel; admin approval edge function that grants `professional` role and creates `pro_profiles` row

**Phase C — Pro profile editing (no gating)**
5. `pro_profiles`, `pro_offers`, storage buckets for pro photos
6. `/pro/profile` screens
7. Consumer directory reads published `pro_profiles` alongside the existing static seed

**Phase D — Stripe subscription**
8. `pro_subscriptions`, `platform_settings`, checkout + webhook
9. `/pro/billing`

**Phase E — Enquiries + consent**
10. `pro_enquiries`, `pro_client_access`, helper functions
11. Consumer Enquire sheet + "My Enquiries" + revoke UI
12. `/pro/enquiries` inbox (gated by subscription)

**Phase F — Passport**
13. Add pro-read RLS policies to every consumer data table (single migration, additive only)
14. `pro_passport_views` + logging edge function
15. `/pro/clients/:consumerId` viewer
16. `/admin/audit`

Each phase is independently shippable and leaves the consumer app functional.

## 7. Risks & mitigations

- **Breaking consumer RLS.** Only additive policies on consumer tables; never touch existing `auth.uid() = user_id` policies. Verify with a smoke test signed in as a consumer after each Phase F migration.
- **Passport leakage via `select *` in client code.** Client-side queries can still ask for extra fields; RLS is the actual guard. All new pro screens go through a small `passport.ts` helper that names the exact columns and filters by `consumerId`, so a bug in one screen doesn't leak more than intended.
- **Consent race conditions.** Revocation must be instant. `has_active_client_access` reads a single row with `revoked_at is null`; there's no cache. Consumer revocation is a simple UPDATE.
- **Subscription lapse UX.** `/pro/enquiries` and `/pro/clients/*` render a "subscription required" state when `pro_subscriptions.status` isn't active — no half-broken screens. Profile stays fully editable.
- **Stripe webhook reliability.** Idempotent upserts keyed on `stripe_subscription_id`; retries safe.
- **Static directory vs `pro_profiles`.** The seeded `professionals_directory` rows aren't linked to real accounts. Keep both sources for now — the directory reads a union. When an existing seeded pro joins, admin merges by setting `professionals_directory.pro_profile_id` and hiding the seed row.
- **Existing "Enquire Now" button already opens an external booking URL.** Route it into the in-app enquiry sheet only when the pro row has a `pro_profiles` id; otherwise fall back to the existing external link so seeded pros aren't broken.
- **Data-access audit correctness.** View logging happens server-side (edge function called from the passport screen) so a pro can't disable it by editing the client. Every section fetch also passes through RLS regardless.

## 8. Explicitly out of scope (per your brief)

Messaging, analytics, calendars, POS, consumer subscriptions, per-search credits, permanent platform-wide discounts. None of these appear in the schema or screens above.
