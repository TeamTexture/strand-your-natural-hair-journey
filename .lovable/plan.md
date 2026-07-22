# Plan — four workstream rollout

Each phase is a self-contained shippable turn. I'll do them in this order, one per turn, so migrations/edge functions can be deployed and verified before layering the next.

## Phase 1 — Pro Welcome ad placement (workstream 1)

Backend
- Add `pro_welcome` value to `brand_placement_slot` enum.
- Add `brand_rate_pro_welcome_pence` (5000) to `platform_settings` and extend `brand_placement_rates` JSON.
- No table changes: `brand_offer_placements`, `brand_offers`, revisions, stats and `brand_placement_no_overlap` trigger already key off `slot` so the new value plugs in.

Frontend
- Extend the slot picker in `BrandCreateOffer.tsx` / campaign designer with two subheaders ("For consumers" / "For professionals") and add the new Welcome tile (£50/day placeholder, admin-editable).
- Extend the shared calendar (`PlacementCalendarPicker`, admin `AdminBrandCalendar`) with a fourth lane; reuse existing exclusivity logic.
- Render `BrandBanner slot="pro_welcome"` at the top of `ProDashboard.tsx` (same Sponsored/minimise/click behaviour, no dismiss-forever).
- `AdminSettings.tsx` — expose the new rate field alongside existing ones.
- Update pricing helpers (`useOwnerMode`, any place that switches on slot) to know the new slot.

## Phase 2 — Yvonne account unification (workstream 2)

- Locate the auth account by name match (`profiles.display_name ilike '%yvonne%abimbola%'`). Report the exact match before mutating.
- Grant `professional` role (keep consumer). Ensure `pro_applications` row = approved (or insert one) so gates pass. Grant complimentary pro access analogous to founder bypass (either flag or founder subscription row).
- Find her static `professionals_directory` seed row; copy discipline, bio, location, photos, Instagram, services, contact info into her `pro_profiles` (upsert, `is_published = true`).
- Delete or hide the static seed row from `professionals_directory` so `useDirectoryProfessionals` shows exactly one Yvonne, backed by her account. Confirm the Directory query already merges account-backed listings first (if not, ensure the seed row is removed).
- Enquire button on her card already routes through `EnquiryDialog` (account-backed listings). Verify.

## Phase 3 — Client ↔ Pro chat + Book-from-chat (workstream 3, biggest)

Schema
- `chat_threads(id, enquiry_id unique, pro_user_id, consumer_id, created_at)`.
- `chat_messages(id, thread_id, sender_id, kind text default 'user', body, created_at, read_at)` — `kind='system'` for booking system messages.
- GRANTs to `authenticated` + `service_role`; RLS: participants only (via `auth.uid() in (pro_user_id, consumer_id)`). Admins do NOT read message bodies (no admin policy on `chat_messages`; admins may see `chat_threads` metadata).
- Extend `accept_enquiry` RPC to `INSERT ... ON CONFLICT DO NOTHING` a `chat_threads` row.

Frontend
- Hooks `useChatThreads`, `useChatThread(id)`, `useSendMessage`, using Supabase realtime channel on `chat_messages` filtered by `thread_id`. Static-page rule preserved — realtime only on chat surfaces.
- New pages: `/pro/messages` (list), `/messages` (consumer list), `/messages/:threadId` shared component.
- Bubble UI (right = me, left = other), friendly timestamps, date separators, system messages as centered pill.
- Entry points: enquiry detail button, `ProClients.tsx` card action, unread badges in pro nav and consumer profile menu.

Book-from-chat
- "Book appointment" action in thread (pro only): date/time/location/notes → insert `appointments` (linked_pro_user_id = pro, user_id = consumer, status = 'scheduled'), and system message referencing the appointment id.
- Reschedule/cancel updates same appointment + new system message.
- Appointment appears in client's `Appointments.tsx` and pro's `ProAppointments.tsx` (existing hooks already read those rows).

## Phase 4 — Rio + Revlon Professional brand role (workstream 4)

- Match `rio.agorwatts@revlon.com` via `admin_list_member_emails` (admin RPC) — no direct auth query needed in code.
- Add `brand` role via `user_roles` upsert (keep professional + consumer). No admin role.
- Upsert `brand_profiles`: brand_name "Revlon Professional", contact_name "Rio Agor-Watts".
- Verify triple-role switcher: audit `Index.tsx` chooser and `GlobalMenu.tsx` for a Brand entry when `isBrand`. Add if missing.

## Verification per phase

- Typecheck via build (harness).
- For phase 1: sign in as brand, submit a `pro_welcome` slot, confirm calendar shows the lane; render pro dashboard and see the banner slot at top when a live offer exists.
- For phase 3: send message consumer↔pro, verify realtime; book appointment from chat, verify it shows in both appointment lists and as system message.
- Post-mutation phases (2, 4): read back the rows and report exact IDs / display_names touched.

Confirm and I'll start with Phase 1.
