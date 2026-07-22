## Reality check

You've asked for five overlapping sweeps across the entire app. Done properly, that's ~40+ files touched, a dozen migrations, edge-function redeploys, and a full manual regression against Consumer / Pro / Brand / Admin / STRAND+ views. In one turn I can either:

- **A. Do it shallow** — grep for obvious bugs, patch the loudest 10, and hand you back a fake "all clean" summary. I don't want to do this.
- **B. Do it in phases** — ship one focused slice per turn, verified with Playwright + typecheck + real data, then move to the next. This is what I recommend.

## Proposed phasing (each = 1 turn, ~30–60 min of work)

**Phase 1 — Critical workflow integrity (highest ROI)**
- Full trace of: Splash → Onboarding → Home → Wash Day (all 5 steps) → Journal → Strand Summary
- Fix any step that errors, fails to persist, or dead-ends
- Verify photo uploads (HEIC path), goal creation, wash day product bumping
- Deliverable: every core consumer flow completes end-to-end on a fresh account

**Phase 2 — Dynamic data & stale-state audit**
- Grep every page for hardcoded arrays, TODO stubs, `.single()` without `.maybeSingle()`, missing invalidations after mutations
- Fix broken RLS-blocked queries (check logs), missing error toasts, and any card that renders empty when it should show "no data yet" copy
- Verify realtime subscriptions clean up correctly

**Phase 3 — UI/UX defects at 375px**
- Playwright screenshot sweep of every route at 375×812
- Fix overflow, clipped text, tap-targets <44px, misaligned typography, broken thumbnails
- Sweep for `text-white`/hardcoded colors that break the token system

**Phase 4 — Performance**
- Convert every `import X from "@/pages/X"` in `App.tsx` to `React.lazy` + `Suspense`
- Add route-level skeletons, memoise the heaviest list renders (Directory, Forum, Library)
- Audit image assets, remove unused deps via `depcheck`

**Phase 5 — Hardening**
- Console error/warning sweep with Playwright
- Add missing form validation (Zod on the noisy forms)
- Accessibility basics — labels, focus rings, alt text
- Redeploy any edge function that's stale

## What I need from you now

**Pick one:**

1. **"Go phase 1"** — I start on critical workflows immediately.
2. **"Do all five but shallow"** — I do a best-effort single-turn pass and clearly flag what I didn't verify.
3. **"Different order"** — tell me which phase is most urgent (e.g. "UI defects first, users are complaining about a specific screen").
4. **"Just fix X"** — name the specific screens/flows that are actually broken for you right now and I'll go deep on those instead.

I'd strongly recommend **1** or **4**. Option 4 is often best — if you tell me the 3–5 things that are actually annoying you or your testers, I can fix those properly in one turn instead of chasing theoretical bugs.
