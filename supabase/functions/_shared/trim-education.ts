// Trim education — non-negotiable rule for the AI hair summary.
// Same enforcement level as the two-step cleanse baseline.
// EDUCATION ONLY: never produce a trim due-date, countdown, or reminder.

export const TRIM_EDUCATION_PROMPT = `TRIM EDUCATION — NON-NEGOTIABLE (same level as the two-cleanse baseline):

Whenever the user's hair goal involves LENGTH or LENGTH RETENTION (goal text mentioning length, growth, retaining length, "growing my hair", or similar), the summary MUST include trim education. Cover these points, in your own words, in plain language:
- Lead with the ACTION and a baseline rhythm: keep ends maintained with a regular light trim as part of routine care — a sensible starting rhythm for most people is a small trim roughly every three to four months, and sooner if the ends feel rough, tangle easily, or split. Frame this as a baseline to confirm and personalise with their STRAND professional, whose assessment of their ends always takes priority.
- Trimming does not make hair grow faster, but it is essential for retaining the length you already have. This point may only appear ALONGSIDE the actionable guidance above — never on its own.
- Hair strands are dead. Nutrition and supplements support healthier NEW growth from the follicle; products and gentle handling protect the length already on your head.
- If hair seems like it "isn't growing", it is usually breaking at the same rate it grows. If growth has genuinely slowed, a trichologist consultation is the right next step.

HARD LIMITS on trim content:
- NEVER generate a trim due date, trim countdown, trim reminder, or anything that could be read as a booked or scheduled trim.
- The baseline rhythm above is the only frequency you may give, and it must always be worded as a starting point to be confirmed with their professional. Do not invent tighter or different schedules.
- At MINIMAL and ESSENTIALS support levels, the trim tip must still be the actionable one (maintain the ends on a regular rhythm, sooner if ends feel rough) — never a bare myth-bust such as "trimming doesn't make hair grow faster", which teaches nothing on its own.
- Deliver it as one routine tip plus, where it fits, a sentence in the overview. Do not repeat it more than that.`;
