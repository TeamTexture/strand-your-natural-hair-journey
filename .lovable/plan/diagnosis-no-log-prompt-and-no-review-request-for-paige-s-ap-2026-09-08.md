# Diagnosis: no log prompt and no review request for Paige's appointment with Lauralyn

## Step 1 — what the data actually says

Accounts found (all named "Paige Lewin"):
- paige.lewin@gmail.com — `dd8a515a…` (created 28 Jun 2026) — this is the account with all real activity
- info@teamtexture.co.uk — `032c7186…` (no appointments)
- paigeln@gmail.com — `8ccfd33d…` (no appointments)

The pro: **"Hair By Lauralyn London"**, Stylist, London, published — pro profile `c4eb8ca6…`, pro user `e4f6681b…`.

**There is no appointment row linking any Paige account to Lauralyn.** Every appointment on `dd8a515a…` is:

| date | professional_name | status | linked pro | reminder_sent_at | created_by |
|---|---|---|---|---|---|
| 2026-08-17 10:00 | Morells Salon | no_show | 8a6ecf84… | 2026-08-16 10:07 | Paige |
| 2026-07-23 10:00 | "Professional" (Dr Eve Skin) | upcoming | dd8a515a… (self) | null | null |
| 2026-07-28 | Dr. Yvonne Abimbola | no_show | null | null | null |
| 2026-07-28 | Dr. Yvonne Abimbola | no_show | null | null | null |
| 2026-07-20 | Dr. Yvonne Abimbola | completed | null | null | null |

There is also **no enquiry** (`pro_enquiries`) between Paige and Lauralyn — her accepted enquiries are with five other pros. Her only appointment notifications are two `appointment_reminder` rows (Morells 16 Aug, "Erica Liburd" 5 Aug — the latter has no surviving appointment row).

So: the appointment with Lauralyn exists in real life and **nowhere in the database**.

## Step 2 — how the lifecycle actually works

1. **Creation.** Three writers, one table (`public.appointments`), same row shape: the member self-logs (`LogAppointment.tsx` insert), a consented pro logs into her diary (`pro_log_appointment`, sets `created_by`), or one is booked in a chat thread (`chat_book_appointment`). Directory/booking links (`bookingUrl.ts`, `pro_booking_clicks`) send her to the pro's own external booking page and **create no appointment row** — a click is logged, nothing more.
2. **Prompt to log an appointment: does not exist.** There is no nudge, notification or cron anywhere that says "you clicked through to a pro — did you book?" or "add your appointment". Logging is entirely manual, initiated by her. Home alerts only fire off appointments that already exist (rebook after 170 days, upcoming within 3 days).
3. **Post-appointment confirmation.** `AppointmentFollowUpDialog` ("Did this appointment happen?") is client-side only: it queries her own rows with `status = 'upcoming'` and a past date, fires 1 hour after the time, lapses silently after 30 days, and needs her to open Home. No push, no email.
4. **Review request.** `AppointmentReviewPrompt` renders inside a past appointment card on `/appointments` and returns null unless `status === 'completed'` **and** `linked_pro_user_id` is set. There is no cron, edge function or notification that ever asks for a review — nothing in `supabase/functions/` or the scheduled jobs touches reviews. `LeaveReview.tsx` writes to `reviews` keyed on `appointment_id` + `professional_id`, so a review is structurally impossible without an appointment row linked to a STRAND pro.

## Step 3 — full run for this case

| # | Step | Seen? | Evidence |
|---|---|---|---|
| 1 | Paige finds Lauralyn in Directory | unseen | no `pro_booking_clicks` / enquiry row for `e4f6681b…` |
| 2 | Appointment created (any of the three paths) | **unseen — FAULT** | no `appointments` row for the pairing |
| 3 | 24h reminder (`queue_appointment_reminders`) | unseen | correctly, nothing to remind about |
| 4 | "Did this happen?" dialog | unseen | requires a row at `upcoming` |
| 5 | Status set to `completed` | unseen | — |
| 6 | Review prompt on the past card | unseen | requires step 5 + a linked pro |
| 7 | Review written | unseen | no `reviews` row |

Fault is at step 2, and steps 4–6 could never have run.

## Which of the three it is

**Both a data gap and a design gap — not a broken trigger.**

- **Data gap (why nothing fired):** the appointment was never recorded, so every downstream mechanism was correctly silent. Nothing malfunctioned.
- **Design gap (why the data gap happened, and why it will keep happening):** there is no prompt anywhere that asks a member to log an appointment. Booking happens off-platform on the pro's own site and STRAND never follows up on that click. And even when a row does exist, the review ask is a passive button she has to walk into on `/appointments` — no notification, no email, and it stays invisible unless she first answers "it happened" (her Morells appointment sits at `no_show`, which permanently hides its review prompt).

Two separate builds, if you want them: (a) a post-click / post-enquiry "did you book?" prompt that creates the row, and (b) a real post-appointment review request (notification + email) driven off a scheduled job rather than a passive card. Say which and I'll plan it properly.
