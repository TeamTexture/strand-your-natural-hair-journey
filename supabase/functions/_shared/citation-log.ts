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
import { getBufferedUsage, recordAiOutcome } from "./ai-meter.ts";
import { collectText, enforceFidelity, pruneEmptyProseRows, stripDeep } from "./fidelity.ts";
import { lastSourceText } from "./chapter-context.ts";
import {
  lastEvidence,
  logGenerationRejections,
  mapClaimsToEvidence,
  storeEvidenceSet,
  surfaceClarifications,
  type EvidenceSet,
  type ExternalClaim,
  type RejectionRow,
} from "./evidence.ts";
import {
  checkClarifications,
  type ClarificationViolation,
} from "./clarifications.ts";


import { explainTerminology, loadLexicon, type TerminologyNote } from "./terminology.ts";
import {
  classifyClaims,
  detectManuscriptConflicts,
  inspectBrandClaims,
  logConflicts,
  type ClaimNuance,
  type ClaimSource,
  type ConflictHit,
  type CoveredIngredient,
} from "./policy-b.ts";


/** POLICY B input: the product facts the sponsored gates and audit trail need. */
export interface PolicyBProduct {
  name: string;
  brand?: string | null;
  /** The declared ingredient list, in the order the brand declared it. */
  declared?: string[];
  /** The ingredients the manuscript covers, matched against that list. */
  covered?: CoveredIngredient[];
  /** The brand's own marketing copy — used ONLY to detect reproduction of it. */
  brandCopy?: string | null;
  /** The writer's own per-claim source labels, honoured where they match. */
  claimLabels?: Array<{ text?: unknown; source?: unknown }>;
}

import {
  enforceBloodSafety,
  enforceStyleVerbatimDeep,
  recordedStyles,
} from "./blood-guardrail.ts";
import { enforceContentIntegrity } from "./content-integrity.ts";
import type { UsageDirections } from "./usage-grounding.ts";


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
    /**
     * GROUNDING POLICY. "A" (default) = editorial surfaces, manuscript-first,
     * unchanged. "B" = sponsored product surfaces: established cosmetic science
     * is permitted, under the four constraints in _shared/policy-b.ts.
     */
    policy?: "A" | "B";
    /** Policy B only: the product facts the sponsored gates need. */
    product?: PolicyBProduct;
    /** Cost-meter retry grouping for bounded guardrail-rejection retries. */
    generationId?: string | null;
    attemptNumber?: number | null;
    maxAttempts?: number | null;
    retryReason?: string | null;
    /** Dry-run generation for admin impersonation: enforce, meter, but persist nothing except ai_call_log. */
    dryRun?: boolean;
    /** Called when this pass removed/rejected output, so callers can retry. */
    onRejected?: (rules: string[]) => void;
    /**
     * CONTENT INTEGRITY source lockdown (see _shared/content-integrity.ts).
     * `allowedIngredients` = the verified ingredient list held for this
     * product; an EMPTY array forbids naming any ingredient, `undefined`
     * disables the check on surfaces with no product. `directions` = the real
     * manufacturer directions, enabling the technique-grounding check.
     */
    allowedIngredients?: string[] | null;
    ingredientVocabulary?: string[] | null;
    directions?: UsageDirections | null;
    /** What the copy is about (product key, marker) for the rejection log. */
    subject?: string | null;
  },
): Promise<T> {

  const cleaned = sanitiseChapterCitationsDeep(value);
  const stripped: string[] = [];
  collectStripped(value, cleaned, stripped);
  if (stripped.length > 0 && !opts?.dryRun) {
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
  out = await enforceBloodSafety(out, functionName, opts?.grounding ?? "", { dryRun: opts?.dryRun });

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
    opts?.dryRun ?? false,
  );

  // AUTHOR CLARIFICATIONS — prescriptive positions enforced as HARD rules, on
  // every surface (grounded or legacy). A breach is removed from the output and
  // logged; where the breach is an OMISSION it cannot be removed, so it is
  // logged for the author's review instead.
  const clarifications = await surfaceClarifications(opts?.surface ?? null);
  const clarCheck = checkClarifications(collectText(out).join("\n"), clarifications, {
    context: opts?.context,
    goalLabel: goalLabelFrom(opts?.context),
  });
  if (clarCheck.strip.length > 0) {
    console.warn(
      JSON.stringify({
        event: "clarification_rejection",
        fn: functionName,
        rules: clarCheck.strip.map((v) => v.rule),
      }),
    );
    out = stripDeep(out, clarCheck.strip.map((v) => v.claim));
  }
  const clarRejections = [...clarCheck.strip, ...clarCheck.log];

  if (!onEvidencePath) {
    // COST METER (Phase 2) — observation only. Attaches the guardrail outcome
    // to the buffered writer row, or logs a `model_called = false` row when
    // this path ran without any model call (a cached read).
    const rejectionRules = [
      ...clarRejections.map((v) => v.rule),
      ...(stripped.length > 0 ? ["citation_strip"] : []),
    ];
    if (rejectionRules.length > 0) opts?.onRejected?.(rejectionRules);
    recordAiOutcome({
      function_name: functionName,
      surface: opts?.surface ?? null,
      user_id: opts?.userId ?? null,
      outcome: rejectionRules.length > 0 ? "rejected" : "completed",
      rejection_rule:
        clarRejections[0]?.rule ?? (stripped.length > 0 ? "citation_strip" : null),
      generation_id: opts?.generationId ?? null,
      attempt_number: opts?.attemptNumber ?? null,
      max_attempts: opts?.maxAttempts ?? null,
      retry_reason: opts?.retryReason ?? null,
    });
    if (clarRejections.length > 0 && !opts?.dryRun) {
      await logGenerationRejections(
        functionName,
        clarRejections.map((v) => ({
          stage: "deterministic" as const,
          rule: v.rule,
          detail: v.reason,
          offendingText: v.claim,
        })),
        { surface: opts?.surface ?? null, userId: opts?.userId ?? null },
      );
    }
    return pruneEmptyProseRows(await applyContentIntegrity(out, functionName, opts));
  }
  return pruneEmptyProseRows(
    await applyContentIntegrity(
      await verifyStage3(out, functionName, evidenceSet, opts, {
        rejections: clarRejections,
        governed: clarCheck.governed,
      }),
      functionName,
      opts,
    ),
  );
}

/**
 * CONTENT INTEGRITY — the shared guardrail, applied on the single path every
 * generation already goes through. Closed vocabulary runs on every surface;
 * the ingredient-name and manufacturer-directions lockdowns run wherever the
 * caller supplied that source data. Offending fields are nulled (never an
 * error — "not established" is a valid answer) and every rejection is logged
 * to `public.ai_content_rejections`. See _shared/content-integrity.ts.
 */
async function applyContentIntegrity<T>(
  value: T,
  functionName: string,
  opts?: {
    surface?: string | null;
    userId?: string | null;
    subject?: string | null;
    dryRun?: boolean;
    allowedIngredients?: string[] | null;
    ingredientVocabulary?: string[] | null;
    directions?: UsageDirections | null;
    attemptNumber?: number | null;
    onRejected?: (rules: string[]) => void;
  },
): Promise<T> {
  if (!value || typeof value !== "object") return value;
  try {
    const payload = value as unknown as Record<string, unknown>;
    const result = await enforceContentIntegrity(payload, {
      functionName,
      surface: opts?.surface ?? null,
      userId: opts?.userId ?? null,
      subject: opts?.subject ?? null,
      allowedIngredients: opts?.allowedIngredients ?? undefined,
      ingredientVocabulary: opts?.ingredientVocabulary ?? undefined,
      directions: opts?.directions ?? null,
      attempt: opts?.attemptNumber ?? undefined,
    });
    if (!result.ok) opts?.onRejected?.(result.problems);
    return payload as unknown as T;
  } catch (e) {
    // The guardrail must never be the reason a member sees nothing.
    console.warn("[content-integrity] skipped:", e instanceof Error ? e.message : e);
    return value;
  }
}

/** The member's own goal label, where the surface passed one in its context. */
function goalLabelFrom(context: unknown): string | null {
  try {
    const json = JSON.stringify(context ?? {});
    const m = json.match(/"(?:goal_label|goal_title|goal)"\s*:\s*"([^"]{3,120})"/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
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
  opts?: {
    surface?: string | null;
    userId?: string | null;
    policy?: "A" | "B";
    product?: PolicyBProduct;
    generationId?: string | null;
    attemptNumber?: number | null;
    maxAttempts?: number | null;
    retryReason?: string | null;
    dryRun?: boolean;
    onRejected?: (rules: string[]) => void;
  },
  clar: { rejections: ClarificationViolation[]; governed: string[] } = {
    rejections: [],
    governed: [],
  },
): Promise<T> {
  const policy = opts?.policy === "B" ? "B" : "A";
  const text = collectText(payload).join("\n");
  let out = payload;
  let violations: Array<{ claim: string; reason: string; rule: string; stage: RejectionRow["stage"] }> = [];

  let verifyTokens = 0;
  let external: ExternalClaim[] = [];
  let conflicts: ConflictHit[] = [];
  let termNotes: TerminologyNote[] = [];
  let claimNotes: ClaimNuance[] = [];

  try {
    // THE TERMINOLOGY LEXICON EXPLAINS, IT DOES NOT REJECT (2026-08-09).
    // Loose usage of one of her words raises a NOTE carrying the accurate
    // explanation in her framing. The copy is served as written and the
    // explanation is rendered briefly alongside it.
    termNotes = explainTerminology(text, await loadLexicon());

    if (policy === "B") {
      // CONSTRAINT 4 — brand claims may be referenced with the nuance
      // explained. Only claims built on unverifiable numbers are removed.
      const brandClaims = inspectBrandClaims(text, opts?.product?.brandCopy ?? null);
      claimNotes = brandClaims.notes;
      violations = violations.concat(
        brandClaims.violations.map((v) => ({ ...v, stage: "deterministic" as const })),
      );
      // CONSTRAINT 3 — where industry diverges from her, she governs. The
      // industry-side sentence is removed and the divergence is registered.
      conflicts = detectManuscriptConflicts(text);
      violations = violations.concat(
        conflicts.map((v) => ({ ...v, stage: "deterministic" as const })),
      );
    }

    const mapping = await mapClaimsToEvidence(text, evidenceSet, { policy });
    verifyTokens = mapping.tokens;
    external = mapping.external;
    violations = violations.concat(
      mapping.unmapped.map((v) => ({ ...v, stage: "stage3_mapping" as const })),
    );
  } catch (e) {
    console.warn(`[stage3] verification error in ${functionName}:`, e);
  }

  const stripped = new Set(violations.map((v) => v.claim));
  external = external.filter((e) => !stripped.has(e.claim));

  // COST METER (Phase 2) — observation only; does not alter the payload.
  // Read the buffered writer usage BEFORE recordAiOutcome flushes and clears it,
  // so the evidence-set audit row can carry the real stage-2 token cost instead
  // of the hardcoded 0 that hid 78% of spend.
  const stage2Usage = getBufferedUsage(functionName);
  const rejectionRules = [
    ...violations.map((v) => v.rule),
    ...clar.rejections.map((v) => v.rule),
  ];
  if (rejectionRules.length > 0) opts?.onRejected?.(rejectionRules);
  recordAiOutcome({

    function_name: functionName,
    surface: opts?.surface ?? null,
    user_id: opts?.userId ?? null,
    outcome: rejectionRules.length > 0 ? "rejected" : "completed",
    rejection_rule: violations[0]?.rule ?? clar.rejections[0]?.rule ?? null,
    generation_id: opts?.generationId ?? null,
    attempt_number: opts?.attemptNumber ?? null,
    max_attempts: opts?.maxAttempts ?? null,
    retry_reason: opts?.retryReason ?? null,
  });

  if (violations.length > 0) {
    console.warn(
      JSON.stringify({
        event: "stage3_rejection",
        fn: functionName,
        policy,
        coverage: evidenceSet.coverage,
        rules: violations.map((v) => v.rule),
      }),
    );
    out = stripDeep(payload, violations.map((v) => v.claim));
  }

  // NUANCE — the explanation the member sees alongside a loosely used term or
  // a brand claim. Attached to the payload, never used to remove copy.
  out = attachNuance(out, [
    ...termNotes.map((n) => n.explanation),
    ...claimNotes.map((n) => n.explanation),
  ]);
  if (termNotes.length || claimNotes.length) {
    console.log(
      JSON.stringify({
        event: "nuance_explained",
        fn: functionName,
        terms: termNotes.map((n) => n.term),
        brand_claims: claimNotes.length,
      }),
    );
  }


  // AUDIT TRAIL — on sponsored surfaces every served claim carries its source
  // class, so the author can filter to the `industry` ones she needs to review.
  let claimSources: ClaimSource[] = [];
  if (policy === "B") {
    claimSources = classifyClaims({
      text: collectText(out).join("\n"),
      modelLabels: opts?.product?.claimLabels,
      evidencePassages: evidenceSet.items.map((i) => i.passage),
      covered: opts?.product?.covered ?? [],
      declared: opts?.product?.declared ?? [],
      productName: opts?.product?.name ?? "",
      brandName: opts?.product?.brand ?? null,
    });
  }

  console.log(
    JSON.stringify({
      event: "coverage_classification",
      fn: functionName,
      surface: opts?.surface ?? functionName,
      policy,
      coverage: evidenceSet.coverage,
      external_claims: external.length,
      industry_claims: claimSources.filter((c) => c.source === "industry").length,
    }),
  );

  if (opts?.dryRun) return out;

  const evidenceSetId = await storeEvidenceSet({
    surface: opts?.surface ?? functionName,
    functionName,
    userId: opts?.userId ?? null,
    set: evidenceSet,
    tip: out,
    verified: violations.length === 0 && clar.rejections.length === 0,
    stage2Tokens: stage2Usage?.total ?? 0,
    verifyTokens,
    externalClaims: external,
    policy,
    claimSources,
    // AUDIT — which of her clarifications governed this copy rather than the
    // book material.
    clarifications: clar.governed,
    clarificationGoverned: clar.governed.length > 0,
  });

  await logGenerationRejections(
    functionName,
    [
      ...violations.map((v) => ({
        stage: v.stage,
        rule: v.rule,
        detail: v.reason,
        offendingText: v.claim,
      })),
      ...clar.rejections.map((v) => ({
        stage: "deterministic" as const,
        rule: v.rule,
        detail: v.reason,
        offendingText: v.claim,
      })),
    ],
    { surface: opts?.surface ?? null, userId: opts?.userId ?? null, evidenceSetId },
  );


  if (conflicts.length > 0) {
    await logConflicts(conflicts, {
      surface: opts?.surface ?? null,
      functionName,
      userId: opts?.userId ?? null,
      evidenceSetId,
    });
  }



  return out;
}

/** Collapse the duplicated "TT" the model sometimes emits immediately before
 *  the TT Heat Hat mention ("under your TT the TT Heat Hat"). Copy fix only —
 *  never changes the meaning of the guidance. */
/**
 * Attach the nuance explanations to the payload so the surface can render them
 * briefly alongside the copy. Additive only — no existing field is altered, and
 * a payload that already carries its own `nuance` is left alone.
 */
function attachNuance<T>(payload: T, explanations: string[]): T {
  const notes = Array.from(new Set(explanations.map((e) => e.trim()).filter(Boolean))).slice(0, 2);
  if (!notes.length) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.nuance === "string" && obj.nuance.trim()) return payload;
  return { ...obj, nuance: notes[0], nuance_notes: notes } as unknown as T;
}

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
