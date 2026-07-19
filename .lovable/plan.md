# Review-first edit pattern across the app

Right now, when you tap "Personal details", "Health & lifestyle", "Hair profile", or "Colour & styling" on the Profile page, you land straight into an onboarding-style form and have to click through every step again. This changes the pattern so you first see a read-only summary of what's already saved, then choose exactly which field to edit, edit only that field, save it, and stay on the summary.

## What changes

Four new "review" screens sit in front of the existing onboarding steps, one per profile section:

1. **Personal details review** — name, birth year/age, postcode, hard-water status, profile photos.
2. **Health & lifestyle review** — life stage, diet balance, stress, sleep, conditions, medications.
3. **Hair profile review** — texture, density, porosity, diameter, scalp, length, breakage/shedding.
4. **Colour & styling review** — natural/current colour, treatments, current style, plans.

Each review screen shows the saved values as read-only cards. Every card has a pencil "Edit" button. Tapping edit expands only that one card into an inline editor with a Save button and a Cancel button. Saving writes just that field to the database, collapses the card back to read-only with the new value, and stays on the same page. No forced march through the other steps.

An "Update personal details" tile (and the other three) continues to open from the Profile page, but now opens the review page, not the form.

Existing onboarding routes stay exactly as they are for first-time users. Nothing in the first-time flow changes.

## Screens affected

- Profile → "Personal details", "Health & lifestyle", "Hair profile", "Colour & styling" tiles now route to the new review pages instead of the raw onboarding step.
- Home page "Update postcode" (from the water hardness dialog) already edits inline and stays as-is.
- Blood results and goal editing already use per-item edit sheets — unchanged.

## Technical details

- New routes: `/profile/personal`, `/profile/health`, `/profile/hair`, `/profile/colour`.
- New pages under `src/pages/profile-review/` — each renders a stack of field cards. Each card has view mode and edit mode (local state). Save calls the appropriate Supabase upsert for just the changed field (using `profiles`, `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_medications` as they are today).
- Hydration on load: single React Query per page pulling from the relevant table(s). Optimistic update on save, invalidate on success.
- Unsaved-changes guard: if the user tries to leave a card in edit mode with a dirty value, show the existing save-first / discard / cancel prompt pattern.
- Back button returns to `/profile`, not through onboarding.
- Deep-link behaviour: `?edit=<fieldKey>` opens directly with that one card expanded (used by alerts like "Update postcode").

## Out of scope

- Redesigning the onboarding form itself.
- Restructuring blood results (already per-panel) or goals (already per-goal).
- Changing what fields exist or their validation rules.
