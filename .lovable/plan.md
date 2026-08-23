# Wash Day steps & tip: stop returning 502 to members

## What I verified

- Both functions are deployed and boot (unauthenticated POST returns `401 {"error":"unauthenticated"}`).
- The AI gateway is **healthy**, so the finding's suggested cause (bad credentials / unavailable model) is wrong: every gateway request in the 04:00–09:12Z window returned HTTP 200 (9/9 success, `google/gemini-3.6-flash`).
- The real cause of the tip failure is our own guardrail path, not the model: `ai_call_log` shows `wash-day-tip` at 08:14:14Z with `outcome = rejected`, `rejection_rule = hollow_after_guardrail` — the model answered fine, the guardrails stripped it to nothing, and the function returns `502 {"error":"tip_hollow_after_guardrail"}` (index.ts ~line 795).
- `wash-day-steps` has **no** `ai_call_log` row ever and no gateway request in the window, so its 502s happened before/around the writer call rather than because of a model error. Its four 502 branches (lines 295, 302, 311, 315) all dead-end the member with an error card and no guidance.

So the member-facing symptom in the finding is real; the diagnosis in it is not.

## Why I'm not editing straight away

The obvious fix ("serve a fallback") collides with two standing project rules:

1. There is deliberately no static wash-day copy anywhere — untested hair-care instruction must never be shown.
2. Guidance must never describe a profile the member no longer has, which is exactly the risk of serving a cached payload whose fingerprint no longer matches.

That makes the choice a product decision, so it needs your sign-off before code changes.

## Proposed change

**1. Serve the last good generation instead of a 502 (both functions).**
On every failure branch (gateway unreachable/non-2xx, unparsable output, zero steps after normalisation, `hollow_after_guardrail`), fall back to the member's existing `ai_summaries` row for that surface when it has substance and the same `_model_version`, returning it as `200 { …, stale: true }`. No invented copy — this is content the model already produced for her and the guardrails already passed.

**2. One silent regeneration retry before giving up.**
When output is unparsable, empty after normalisation, or hollow after guardrails, retry the writer call once (same prompt) before falling back. This is the cheap fix for the transient-shape failures the logs show, and it keeps spend bounded to one extra call.

**3. Honest state when there is no cache at all (a brand-new member).**
Keep returning an error, but as a distinguishable `503 { error: "guidance_unavailable" }` rather than 502, and have the UI say the guidance couldn't be prepared with a retry — which `WashDaySteps.tsx` already does.

**4. Freshness marker in the UI.**
When `stale: true`, the card renders normally plus a quiet line ("Updating for your latest profile…") and the client refetches once in the background, so rule 2 above stays honoured rather than silently broken.

## Technical notes

- Files: `supabase/functions/wash-day-steps/index.ts`, `supabase/functions/wash-day-tip/index.ts`, plus `src/components/WashDaySteps.tsx` and the wash-day tip hook for the stale marker.
- Both functions already read the `ai_summaries` cache at the top, so the fallback reuses that fetched row — no extra query.
- Both functions get redeployed and verified booting in the same task, per the deployment rule.
- Contract tests (`src/test/wash_day_steps_contract.test.ts`) get a case for the fallback path.

## Alternative if you'd rather not show stale guidance

Drop item 1 and ship items 2 and 3 only: members then still see an error when generation genuinely fails, but the transient shape failures (which the logs suggest are the bulk of them) disappear behind the single retry.
