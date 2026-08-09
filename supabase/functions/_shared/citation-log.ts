// Citation sanitiser + audit-log wrapper.
//
// Every AI edge function calls `sanitiseAndLog(value, functionName)` on its
// response instead of `sanitiseChapterCitationsDeep` directly. This runs the
// same strip logic, then — if any content was removed — inserts a row into
// `public.ai_citation_violations` so Paige can monitor whether the model is
// still attempting to fabricate citations after the 2026-04-27 citation ban.
//
// The DB write is best-effort. If service-role env is missing or the insert
// fails, we swallow the error and still return the sanitised value: the
// user must never see raw citations because logging broke.

import { sanitiseChapterCitationsDeep, sanitiseChapterCitations } from "./book-chapters.ts";
import { collectText, enforceFidelity, stripDeep } from "./fidelity.ts";
import { lastSourceText } from "./chapter-context.ts";
import {
  lastEvidence,
  logGenerationRejections,
  mapClaimsToEvidence,
  storeEvidenceSet,
  type EvidenceSet,
  type RejectionRow,
} from "./evidence.ts";
import { checkTerminology, loadLexicon } from "./terminology.ts";
import {
  enforceBloodSafety,
  enforceStyleVerbatimDeep,
  recordedStyles,
} from "./blood-guardrail.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

/** Walk both trees in lockstep and collect the substrings that were removed
 *  from string leaves. We only care about a coarse "did anything change and
 *  what did the model say" signal — full diff granularity is not needed. */
function collectStripped(original: unknown, cleaned: unknown, out: string[]): void {
  if (original == null) return;
  if (typeof original === "string") {
    if (typeof cleaned === "string" && cleaned !== original) {
      // Log the whole original leaf when a strip occurred — keeps the audit
      // useful (the "Read more —" line stays visible in the log).
      out.push(original);
    }
    return;
  }
  if (Array.isArray(original)) {
    const cleanedArr = Array.isArray(cleaned) ? cleaned : [];
    for (let i = 0; i < original.length; i++) {
      collectStripped(original[i], cleanedArr[i], out);
    }
    return;
  }
  if (typeof original === "object") {
    const cleanedObj = (cleaned && typeof cleaned === "object" ? cleaned : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(original as Record<string, unknown>)) {
      collectStripped(v, cleanedObj[k], out);
    }
  }
}

async function logViolation(
  functionName: string,
  strippedLeaves: string[],
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return;

    const stripped_text = strippedLeaves.join("\n\n---\n\n").slice(0, 8000);
    const original_length = strippedLeaves.reduce((a, s) => a + s.length, 0);
    const cleaned_length = strippedLeaves.reduce(
      (a, s) => a + sanitiseChapterCitations(s).length,
      0,
    );

    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_citation_violations").insert({
      function_name: functionName,
      stripped_text,
      original_length,
      cleaned_length,
    });
  } catch (e) {
    console.warn(`[citation-log] failed to log violation for ${functionName}:`, e);
  }
}

/** Sanitise the AI response deeply, and if anything was stripped, insert an
 *  audit row into `ai_citation_violations`. Always returns the cleaned value.
 *
 *  Await this if you can — the log write is fire-and-forget compatible but
 *  awaiting keeps stack traces readable when the DB is down. */
export async function sanitiseAndLog<T>(
  value: T,
  functionName: string,
  opts?: {
    context?: unknown;
    grounding?: string;
    chapters?: number[];
    /** Surface key + member id, so the evidence set is auditable per member. */
    surface?: string | null;
    userId?: string | null;
  },
): Promise<T> {
  const cleaned = sanitiseChapterCitationsDeep(value);
  const stripped: string[] = [];
  collectStripped(value, cleaned, stripped);
  if (stripped.length > 0) {
    await logViolation(functionName, stripped);
  }
  // Copy fix runs after the audit diff so it is never logged as a violation.
  let out = fixHeatHatPhrasing(cleaned);

  // Recorded-value repair: the model must never substitute a similar-sounding
  // style name for the member's stored one ("passion twists" -> "rope twists").
  if (opts?.context !== undefined) {
    const recorded = recordedStyles(opts.context);
    const fixes: string[] = [];
    out = enforceStyleVerbatimDeep(out, recorded, fixes);
    if (fixes.length > 0) {
      console.warn(`[style-verbatim] ${functionName}: repaired ${fixes.join("; ")}`);
    }
  }

  // Blood guardrail — LAST, so nothing downstream can reintroduce a fabricated
  // blood/hair causal link or an invented mechanism. `grounding` is the
  // retrieved manuscript text, so mechanism wording that IS in the manuscript
  // survives. See _shared/blood-guardrail.ts.
  out = await enforceBloodSafety(out, functionName, opts?.grounding ?? "");

  // MANUSCRIPT FIDELITY FAIL-SAFE (2026-08-09). Last gate before the user:
  // author-verified deterministic rules always run, and when the surface
  // supplied manuscript source text every claim is traced back to it. Anything
  // unsupported is logged to ai_fidelity_rejections and removed from the
  // output. See _shared/fidelity.ts.
  const recorded = lastSourceText(functionName);
  const evidenceSet = lastEvidence(functionName);
  const onEvidencePath = evidenceSet.items.length > 0;

  out = await enforceFidelity(
    out,
    functionName,
    recorded.text || (opts?.grounding ?? ""),
    opts?.chapters ?? recorded.chapters,
    // On the two-stage path the generic traceability audit is replaced by the
    // stage 3 claim-to-evidence mapping below — one verifier call, not two.
    { skipTraceability: onEvidencePath },
  );

  if (!onEvidencePath) return out;
  return await verifyStage3(out, functionName, evidenceSet, opts);
}

/**
 * STAGE 3 + STAGE 4 of the grounded pipeline.
 *
 * Stage 3 — every substantive claim must map onto an evidence item, and the
 * author's terminology lexicon is enforced deterministically. Anything that
 * fails is logged and removed. Removing a sentence can only make the answer
 * shorter and more conservative; where it removes a required field, the tip
 * contract sees a blank action or reason, treats it as a HARD failure and
 * regenerates once (and, failing twice, renders the "being prepared" state
 * rather than a bare headline).
 *
 * Stage 4 — the evidence set is persisted next to the generated copy, keyed to
 * it, so the author can audit any tip by chapter and page.
 */
async function verifyStage3<T>(
  payload: T,
  functionName: string,
  evidenceSet: EvidenceSet,
  opts?: { surface?: string | null; userId?: string | null },
): Promise<T> {
  const text = collectText(payload).join("\n");
  let out = payload;
  let violations: Array<{ claim: string; reason: string; rule: string; stage: RejectionRow["stage"] }> = [];
  let verifyTokens = 0;
  let external: ExternalClaim[] = [];

  try {
    // The terminology lexicon binds in ALL THREE coverage modes, supplement
    // included: no external claim may use a word in a way the author rejects.
    // It runs first and deterministically, so it cannot be argued around.
    const term = checkTerminology(text, await loadLexicon());
    violations = term.map((v) => ({ ...v, stage: "terminology" as const }));

    const mapping = await mapClaimsToEvidence(text, evidenceSet);
    verifyTokens = mapping.tokens;
    external = mapping.external;
    violations = violations.concat(
      mapping.unmapped.map((v) => ({ ...v, stage: "stage3_mapping" as const })),
    );
  } catch (e) {
    console.warn(`[stage3] verification error in ${functionName}:`, e);
  }

  // A sentence that trips the terminology guard is removed even when the mapper
  // admitted it as established science — the author's lexicon outranks it.
  const stripped = new Set(violations.map((v) => v.claim));
  external = external.filter((e) => !stripped.has(e.claim));

  if (violations.length > 0) {
    console.warn(
      JSON.stringify({
        event: "stage3_rejection",
        fn: functionName,
        coverage: evidenceSet.coverage,
        rules: violations.map((v) => v.rule),
      }),
    );
    out = stripDeep(payload, violations.map((v) => v.claim));
  }

  console.log(
    JSON.stringify({
      event: "coverage_classification",
      fn: functionName,
      surface: opts?.surface ?? functionName,
      coverage: evidenceSet.coverage,
      external_claims: external.length,
    }),
  );

  const evidenceSetId = await storeEvidenceSet({
    surface: opts?.surface ?? functionName,
    functionName,
    userId: opts?.userId ?? null,
    set: evidenceSet,
    tip: out,
    verified: violations.length === 0,
    verifyTokens,
    externalClaims: external,
  });

  await logGenerationRejections(
    functionName,
    violations.map((v) => ({
      stage: v.stage,
      rule: v.rule,
      detail: v.reason,
      offendingText: v.claim,
    })),
    { surface: opts?.surface ?? null, userId: opts?.userId ?? null, evidenceSetId },
  );


  return out;
}

/** Collapse the duplicated "TT" the model sometimes emits immediately before
 *  the TT Heat Hat mention ("under your TT the TT Heat Hat"). Copy fix only —
 *  never changes the meaning of the guidance. */
function fixHeatHatText(text: string): string {
  return text
    .replace(/\bTT\s+(?:the\s+)?TT\s+Heat\s+Hat\b/gi, "the TT Heat Hat")
    .replace(/\b(?:the\s+)?TT\s+Heat\s+Hat\s+(?:TT\s+Heat\s+Hat\s*)+/gi, "the TT Heat Hat")
    .replace(/\b(your|a|an|the)\s+the\s+TT\s+Heat\s+Hat\b/gi, "$1 TT Heat Hat")
    .replace(/[ \t]{2,}/g, " ");
}

/** Deep-walk any AI payload applying the heat-hat copy fix to string leaves. */
export function fixHeatHatPhrasing<T>(value: T): T {
  if (typeof value === "string") return fixHeatHatText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => fixHeatHatPhrasing(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = fixHeatHatPhrasing(v);
    }
    return out as unknown as T;
  }
  return value;
}
