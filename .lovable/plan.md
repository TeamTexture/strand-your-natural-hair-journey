# Passport Redesign — Consultation-Grade Client Dossier

The passport becomes a mirror of the member's own app for professionals: same cards, same icons, same visuals — reorganised under clean tab navigation, prioritised by what a professional needs first, and stripped of every raw database artifact.

No data is removed. This is a hierarchy, presentation, and reuse rework.

## Foundations (built first, used everywhere)

New shared helpers so nothing raw leaks into the UI:

- `src/lib/humanise.ts` — one entry point. Handles snake_case → sentence, hair-type codes (`type_4c` → "Type 4C"), porosity/density/scalp values, blood-result status vocab (`in_range` / `borderline` / `low` / `high` → "In range" / "Borderline" / "Low" / "High"), enquiry/appointment status, and boolean/nullable formatting. Central label maps mean adding a term later is a one-line change.
- `src/lib/formatPassportDate.ts` — thin wrappers: `formatDate(iso)` → "12 Mar 2026", `formatRelative(iso)` → "3 weeks ago" (built on `date-fns`; no new dep). Every passport date renders through this — no more ad-hoc `toLocaleDateString`.
- All existing passport primitives (`AllFields`, `FullRecord`, `tidyLabel`, raw JSON dumps, `Thumb` metadata dumps, ISO strings in relative fields) are retired inside the passport. `AllFields` remains only as an internal fallback for the very last "raw record" disclosure — hidden by default, opt-in per section, and rendered through the humaniser so keys and enum values read as English.

## Section order (rewritten around professional consultation psychology)

The tab bar keeps its existing sticky bubble pattern (refined spacing, active-state contrast tuned to the sand/gold palette) and reorders to:

1. **Snapshot** — new hero header (see below).
2. **Goals & concerns** — user goals + goal updates timeline + concerns from health profile + the enquiry note that opened access.
3. **Hair profile** — full detail rendered like the consumer `Profile` screen.
4. **Colour & chemistry** — colour history + chemical reactions front and centre.
5. **Blood work** — consumer bloodwork visuals + latest AI summary.
6. **Routine** — wash days + product shelf (grouped by On shelf / Favourites / Wishlist / Off shelf, retained from previous work).
7. **Journal & photos** — journal entries, milestones, before/after.
8. **Lifestyle** — nutrition plan, medications, tools.
9. **Appointments** — history + follow-up state.

The tab labels stay short; counts (goals, wash days, panels, appointments, medications, etc.) appear on the tab as subtle numeric badges — the pro sees volume before tapping in.

## Client Snapshot (new hero — the first two seconds)

A single card that opens the passport:

- Avatar (existing `SignedImage`), display name, member since, age, heritage, postcode + water hardness.
- Hair-at-a-glance strip: three elegant chips — Texture · Porosity · Density — using the same visual language as consumer `ProfileRow` (icon + humanised value, warn tone when porosity reads high). Uses the humaniser.
- **Critical flags row** — the safety-first block:
  - Chemical reaction — red-tone flag if `style.colour_reaction` is true, with the client's own words (`colour_reaction_details`) inline and the voice note (if any) playable via `AudioButton`.
  - Blood markers out of range — a single chip: "N markers flagged" (counts `blood_results.status` in `low` / `high` / `borderline`), tap scrolls to Blood work.
  - Medications — "N current medications" chip, tap scrolls to Lifestyle.
  - Medical conditions — chip if `health.medical_conditions` has content (this is where allergies live today; no separate allergies field exists, so this is our proxy — flagged as an assumption).
  - Preferred professional — small line if `d.professional` present.

Flags render only when they carry information. No empty chips.

## Consumer components lifted into the passport

Where the consumer app already renders something well, the passport uses the same component (or a passport-friendly wrapper of it) rather than re-drawing it:

- **Wash days** — `WashDayCard` (consumer) is the summary tile. Tapping expands the passport's existing detail collapsible (kept for full data: products, tools, health, photos, voice notes) so nothing captured is lost.
- **Blood work** — `BloodResultRow` + `BloodSummaryBar` (consumer) render each panel's markers with the same dot/colour language the client sees. Latest `ai_summaries` (kind `blood_summary`) renders through the consumer `BloodChangeAnalysis` presentation; older panels grouped by date behind a "Previous panels" disclosure.
- **Nutrition** — the consumer `NutritionPlan` `IconBubble` / `AiCard` tiles for supplements, diet, and (retained) avoid guidance, driven by the same `ai_summaries` payload the client sees. Meals list stays out; the guidance is what matters.
- **Journal** — cards match the consumer Journal list (photo strip, mood, title, note preview); details expand in place with full photo grid + voicenotes + products used.
- **Product shelf** — retains the four-group split; each row uses the consumer thumbnail + rating stars visual.
- **Goals** — consumer `GoalDetailSheet`'s read-only timeline is reused inline (challenge/target header + timestamped update stream with text/voice) — no bespoke goal list.
- **Appointments** — consumer `AppointmentCard` with `variant="past"` / `variant="upcoming"`; follow-up state surfaces automatically.
- **Hair profile** — the consumer `Profile` page's `ProfileRow` block is the template; the passport reuses the same icon/label/value rhythm inside a `SurfaceCard`.

Shared consumer components are exported (or lightly extracted) as needed. No visual duplication.

## Strand summary handling

Only the most recent `hair_strand_summaries` entry renders — typographically, using display font for headings and body font for prose, proper paragraph rhythm, no raw text dump. Prior summaries collapse behind a subtle "Previous summaries" disclosure showing date + first line only.

## Clean-up pass (applies to every section)

- No storage paths, URLs, UUIDs, or ids visible anywhere. Audio renders as a player only — never as text.
- No ISO timestamps — every date goes through `formatDate` / `formatRelative`.
- No `snake_case` labels or raw enum values — everything through `humanise`.
- No JSON blobs, square brackets, or braces on screen.
- Dedup rule: data appears in full in its primary section; secondary mentions link back rather than reprint.
- Every empty state is a designed line ("No wash days logged yet."), not a bare "—".

## Navigation, RLS, logging

Tab bar stays sticky; section anchors get scroll-into-view when tapped from a Snapshot chip. `passport-view-log` calls, RLS gating, consent expiry (`accessEnded`), and admin decrypt path are untouched. `usePassportData` gains no new queries — the data already needed is already fetched.

## Verification

- `npm run build` for typecheck.
- Playwright pass logged in as the founder account, opening the founder's own admin passport (admin RLS lets this through) to confirm real-data rendering, section order, no raw artifacts, and 375px integrity. Screenshots per section.

## Technical notes

- Files touched: `src/components/passport/PassportView.tsx` (major restructure into per-section modules under `src/components/passport/sections/*.tsx` — one file per tab, so future edits are surgical), `src/components/passport/usePassportData.ts` (unchanged shape; may expose small derived selectors like `criticalFlags` for the Snapshot), new `src/lib/humanise.ts`, new `src/lib/formatPassportDate.ts`.
- Consumer components made reusable where they currently live inside a page: minimal extraction only where necessary (e.g. lift a `BloodMarkerCard` presentational bit out of `BloodPanelReview` if it isn't already exported). No behavioural change to consumer screens.
- No new dependencies, no palette additions — Playfair / Jost, sand / gold / ink only.
- No schema or RLS changes.

## Open assumption to flag

There is no `allergies` column in the schema — allergies are captured today inside `user_health_profile.medical_conditions_enc`. The Snapshot surfaces "Medical conditions" as the safety chip until/unless a dedicated allergies field is added. Called out explicitly so it can be corrected before shipping.
