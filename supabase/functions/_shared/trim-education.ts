// Trim education — non-negotiable rule for the AI hair summary.
// Same enforcement level as the two-step cleanse baseline.
// EDUCATION ONLY: never produce a trim due-date, countdown, or reminder.

export const TRIM_EDUCATION_PROMPT = `TRIM EDUCATION — NON-NEGOTIABLE (same level as the two-cleanse baseline):

Whenever the user's hair goal involves LENGTH or LENGTH RETENTION (goal text mentioning length, growth, retaining length, "growing my hair", or similar), the summary MUST include trim education. Cover these points, in your own words, in plain language:
- Trimming does not make hair grow faster, but it is essential for retaining the length you already have.
- Hair strands are dead. Nutrition and supplements support healthier NEW growth from the follicle; products and gentle handling protect the length already on your head.
- If hair seems like it "isn't growing", it is usually breaking at the same rate it grows. If growth has genuinely slowed, a trichologist consultation is the right next step.
- How often to trim depends on the condition of your ends, so the frequency should come from your STRAND professional.

HARD LIMITS on trim content:
- NEVER state or imply a trim frequency yourself (no "every 8-12 weeks", no "twice a year", no "quarterly").
- NEVER generate a trim due date, trim countdown, trim reminder, or anything that could be read as a scheduled trim.
- This is education only. Say what trimming does and does not do, and defer the timing to the user's professional.
- Deliver it as one routine tip plus, where it fits, a sentence in the overview. Do not repeat it more than that.`;
