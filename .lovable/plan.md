# Treatment plan page — visual and navigation redesign

Member-facing only: `src/pages/treatment/TreatmentPlanDetail.tsx` and the components it renders. No professional or admin views touched. No migrations, no RLS, no consent or STRAND+ logic changes, no stored adherence. Nothing is removed — everything is rehomed.

## The five zones

```text
HEADER            title · Week N of M · goal · progress bar · "Log week N check-in"
HOW THIS WORKS    3 lines, dismissible per plan
THIS WEEK         steps for week N · 7 day circles per step · missed-day link · photo badge · this week's appointment
THE PLAN          one collapsed accordion: quiet goal/challenges line, week list (4 tiers), products at the foot
PLAN SETTINGS     collapsed drawer: reminder · Sharing · Progress and photos · Brands · Pause/resume
```

## Where each current section ends up

| Today | Goes to |
| --- | --- |
| Header title/dates + pencil button | Header; pencil button deleted (editing happens inside an expanded week) |
| `PlanOverviewCard` gold card | Goal + challenges become one quiet line at the top of THE PLAN. Its "treatment, in short" step list is dropped as duplication — the canonical listing is the week it applies to |
| `ReminderPicker` (always expanded) | Plan settings, one row showing `reminderSummary(...)`, opening the existing picker |
| `PlanTimeline` | Becomes THE PLAN's week list (rewritten in place with the four tiers) |
| `AdherenceRing` card | Header progress bar + one line; the numbers/skipped copy live on `/treatment/:id/progress` (unchanged page) |
| `TreatmentReadOnlyNotice` | Header, same condition (`!hasPlus`) |
| Week check-in button | Header primary pill + per-week buttons on tiers A/B |
| "See progress" button | "Progress and photos" row in Plan settings |
| Pause/Resume | Plan settings |
| "Edit the plan week by week" button | Deleted — THE PLAN accordion is the entry point |
| `MediaConsentToggle` + `WhatTheyCanSee` + `PlanSharesSection` | New merged `PlanSharingSection` in Plan settings |
| `PlanAppointmentsSection` | Appointments render on their week inside THE PLAN (already do). The section component stays on disk (unused here) rather than deleted, since it is the only place clinic name/reason/`MapPin` detail renders — its "Add an appointment" affordance already exists per week |
| `CatchUpDays` | Same component, opened from a "Log a day you missed" link in THIS WEEK inside a Dialog |
| Bottom "Week by week" list (`#treatment-weeks`) | Merged into THE PLAN's single week list |
| `PlanProductsSection` | Foot of THE PLAN, props unchanged (keeps shelf/brand/link pickers) |
| `BrandTagControl` | Plan settings, "Brands credited" |

## Files

Create
- `src/components/treatment/PlanHowItWorks.tsx` — the dismissible strip.
- `src/components/treatment/ThisWeekCard.tsx` — zone 3, including the missed-day dialog wrapper.
- `src/components/treatment/WeekDayTicks.tsx` — the seven day circles for one step in one week.
- `src/components/treatment/PlanSharingSection.tsx` — merged consent toggle + what-they-can-see + shares list + invite.
- `src/components/treatment/PlanSettings.tsx` — the collapsed drawer with its rows.

Change
- `src/pages/treatment/TreatmentPlanDetail.tsx` — rebuilt as the five zones; header, and composition only.
- `src/components/treatment/PlanTimeline.tsx` — becomes the single week list with tiers, wrapped in the collapsed "The plan" accordion, plus the quiet goal/challenges line and `PlanProductsSection` at its foot. Keeps `openWeek` defaulting to the current week, `StepEditorSheet`, appointments per week, "Add step & product", "Appointment", "Use these products for every week".
- `src/lib/alertKeys.ts` — add `TREATMENT_HOW_IT_WORKS: "treatment_how_it_works"`.

Delete
- `src/components/treatment/PlanOverviewCard.tsx` (its two surviving fields move inline).
- Nothing else. `MediaConsentToggle` and `WhatTheyCanSee` stay — `TreatmentInvitation` still uses both.

## The four week card tiers

All four are `SurfaceCard` with a full four-sided border, no side accent bars, existing tokens only.

- **A — current week.** `bg-primary border-primary text-primary-foreground`; "Week N" in `font-display` at 22px against 17px elsewhere; full-width inverted pill (`bg-background text-primary`) "Check in for week N"; summary line in `text-primary-foreground/80`; photo badge top-right on `bg-background/20`.
- **B — past, not checked in.** `bg-card border-primary border-[1.5px]`; week number in `font-display`; `variant="outline"` pill "Check in for week N". No destructive/red anywhere; supporting line keeps the "which is completely fine" register.
- **C — past, check-in saved.** `bg-card border-border`; small filled tick on `bg-good/15 text-good`; "Check-in saved · N of 7 days" from `weekBreakdown().line`. Expandable and tappable through to the saved check-in.
- **D — future.** `bg-secondary/60 border-border/60`, all text `text-muted-foreground` (no `opacity-*`), no button, still expandable.

State comes from the existing `weekBreakdown` `state` field plus the `doneWeeks` set built from `useTreatmentCheckins` — both already computed on the page today.

## Per-day ticks (no schema change)

For each step applying to the current week, render seven circles for `weekRange(startDate, currentWeek)`:
- Not due that day (`isDueOn` false), before `start_date`, or in the future → inert muted dot, not tappable.
- Due and no entry → outlined circle with the day initial.
- Due and `status === "completed"` → filled `bg-primary text-primary-foreground` tick.
- Due and `status === "skipped"` → muted ring with the initial, no failure styling.

Tapping an untapped day calls the existing `useLogTreatmentStep().log` with `{ planId, scheduleId, slot, status: "completed", date: dayKey }`; tapping a saved day calls `undo` with the entry id (skipped when the id is optimistic, matching `CatchUpDays`). Both already upsert/delete `treatment_plan_entries` on `(schedule_id, entry_date, time_of_day)` and are optimistic. A `both` step gets two rows, morning and evening — same as everywhere else. Nothing is written to any adherence column; every count still comes from `treatmentSchedule.ts` at read time. All circles carry `disabled={!hasPlus || paused}`.

## "How this works" dismissal

Reuses `alert_dismissals` via the existing `useAlertDismissals()` hook — no new table or column. `alert_key = "treatment_how_it_works"`, `trigger_signature = planId`, so the dismissal is per user per plan and survives reload and device change. Renders only once `loaded` is true, to avoid a flash.

## Things this restructure breaks, and the fix

- `scrollToTimeline()` and the ids `#plan-timeline` / `#treatment-weeks` disappear. Nothing outside this page references them (checked) — the two callers are both inside the file being rewritten.
- `PlanAppointmentsSection` becomes unused on this page; kept on disk as described.
- `useChallenges()` moves from `PlanOverviewCard` into the quiet line inside `PlanTimeline`.
- Every relocated control keeps `disabled={!hasPlus || paused}`; the Plan settings drawer itself stays readable when lapsed so nothing becomes unreachable.

## Two things I'd flag before building

1. **THIS WEEK and tier A show the current week twice.** Zones 3 and 4 both surface week N, which is exactly the kind of doubling this brief is removing. Recommendation: tier A stays as the loud marker and pill but does **not** repeat the step list or day circles — it collapses to week number, summary line, badge and button, with the steps only in its expanded body. I will build it this way unless you say otherwise.
2. **`PlanOverviewCard`'s step list is the only place the whole treatment reads as one sequence.** Removing it is right for the duplication, but a 12-week plan then has no single "everything in this plan" view. The products summary at the foot of THE PLAN partly covers it; if you want the full step list back, it belongs on `/progress`, not here.
