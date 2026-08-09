// AUTHOR CLARIFICATIONS — the top of the authority stack.
// ======================================================
// 2026-08-09. The manuscript is a published snapshot. A clarification is the
// author's CURRENT position, so where the two differ the clarification governs.
//
// Clarifications live in `public.author_clarifications` (admin-editable, no code
// change needed). They are retrieved into EVERY hair care generation alongside
// the chapter/evidence context, and they are treated as source text by the
// verification stages: a claim that rests on a clarification is grounded, not
// unmapped.
//
// Where a clarification is PRESCRIPTIVE it is also enforced deterministically
// here, after generation, so "non-negotiable" means enforced and not merely
// available.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface Clarification {
  id: string;
  topic: string;
  position: string;
  applies_to: string[];
  sort_order: number;
}

let cache: { rows: Clarification[]; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Load the active clarifications. Never throws — an outage degrades to none. */
export async function loadClarifications(): Promise<Clarification[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return [];
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db
      .from("author_clarifications")
      .select("id, topic, position, applies_to, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Clarification[];
    cache = { rows, at: Date.now() };
    return rows;
  } catch (e) {
    console.warn("[clarifications] unavailable:", e);
    return [];
  }
}

/** The clarifications that apply to a surface (empty `applies_to` = all). */
export function forSurface(rows: Clarification[], surface?: string | null): Clarification[] {
  if (!surface) return rows;
  return rows.filter((r) => r.applies_to.length === 0 || r.applies_to.includes(surface));
}

/**
 * The binding prompt block. Placed in the same region as the manuscript
 * context, and explicitly senior to it.
 */
export function clarificationsBlock(rows: Clarification[]): string {
  if (!rows.length) return "";
  const lines = rows.map((r) => `- ${r.position}`).join("\n");
  return `THE AUTHOR'S CLARIFICATIONS — BINDING, AND SENIOR TO EVERYTHING ELSE.
These are her current positions, stated directly by her. Where any of them differs from the book material above, HER CLARIFICATION GOVERNS and the book material is set aside. They are not optional context: where one of them covers what you are writing about, you must follow it, in her framing and her wording.
${lines}`;
}

/** Clarification text as source material for the verification stages. */
export function clarificationSourceText(rows: Clarification[]): string {
  return rows.map((r) => r.position).join("\n\n");
}

// ---------------------------------------------------------------------------
// PRESCRIPTIVE ENFORCEMENT — hard rules
// ---------------------------------------------------------------------------

export interface ClarificationViolation {
  claim: string;
  reason: string;
  rule: string;
}

const sentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const PROTECTIVE = /\b(cornrow|corn row|braid|plait|twist|weave|wig|canerow|protective style)\w*\b/i;

/** Is this member recorded as being in (or moving into) a protective style? */
export function inProtectiveStyle(context: unknown): boolean {
  try {
    const json = JSON.stringify(context ?? "");
    return PROTECTIVE.test(json);
  } catch {
    return false;
  }
}

/**
 * Cleansing sequence (clarification: two cleanses — first on the SCALP with a
 * cleansing/all-purpose shampoo, second on the HAIR with a conditioning or
 * moisturising shampoo). Reversing the area focus fails.
 */
function cleanseAreaFocus(text: string): ClarificationViolation[] {
  const out: ClarificationViolation[] = [];
  for (const s of sentences(text)) {
    const l = s.toLowerCase();
    if (!/\b(cleanse|cleansing|shampoo|wash)\b/.test(l)) continue;
    const firstOnHair =
      /\b(first|1st|initial|start(?:ing)?|begin(?:ning)?)\b[^.]{0,60}\b(cleanse|shampoo|wash)\b[^.]{0,40}\b(lengths?|the hair|mid-?lengths?|ends)\b/
        .test(l) ||
      /\b(first|1st)\s+(cleanse|shampoo|wash)\b[^.]{0,40}\bfocus\w*\s+on\s+(?:your\s+)?(?:the\s+)?(lengths?|hair|ends)\b/
        .test(l);
    const secondOnScalp =
      /\b(second|2nd|follow(?:\s*-?\s*up)?|then)\b[^.]{0,70}\b(conditioning|moisturis(?:ing|er))\b[^.]{0,40}\b(shampoo|cleanse|wash)\b[^.]{0,50}\bscalp\b/
        .test(l) ||
      /\b(conditioning|moisturis(?:ing|er))\s+shampoo\b[^.]{0,50}\bon\s+(?:your\s+)?scalp\b/.test(l);
    if (firstOnHair || secondOnScalp) {
      out.push({
        claim: s,
        reason:
          "Reverses the author's cleansing sequence: the first cleanse focuses on the scalp with a cleansing or all-purpose shampoo, and the second uses a conditioning or moisturising shampoo on the hair.",
        rule: "clarification-cleanse-area-focus",
      });
    }
  }
  return out;
}

/**
 * Washing in a protective style (clarification: scalp cleanser — a solution on
 * cotton pads, or preformulated scalp cleansing pads). General shampooing of
 * the braids is not the method.
 */
function protectiveStyleWashing(text: string): ClarificationViolation[] {
  const out: ClarificationViolation[] = [];
  for (const s of sentences(text)) {
    const l = s.toLowerCase();
    if (!PROTECTIVE.test(l) && !/\bin\s+(?:this|your)\s+style\b/.test(l)) continue;
    if (!/\b(shampoo|lather|wash(?:ing)?|cleanse|cleansing)\b/.test(l)) continue;
    const usesCleanserMethod =
      /\bscalp cleanser\b|\bcleansing pads?\b|\bcotton pads?\b|\bscalp cleansing\b|\bapplicator\b|\bnozzle\b/
        .test(l);
    const generalShampooing =
      /\b(shampoo|lather)\w*\b[^.]{0,40}\b(braids?|cornrows?|twists?|plaits?|style)\b/.test(l) ||
      /\b(braids?|cornrows?|twists?|plaits?)\b[^.]{0,40}\b(shampoo|lather)\w*\b/.test(l);
    if (generalShampooing && !usesCleanserMethod) {
      out.push({
        claim: s,
        reason:
          "Washing in a protective style uses a scalp cleanser — a solution on cotton pads or preformulated scalp cleansing pads — to break down oil while preserving the quality of the braids, not general shampooing.",
        rule: "clarification-protective-style-washing",
      });
    }
  }
  return out;
}

/**
 * Ends protection must stand as its OWN tip. A sentence that instructs on the
 * scalp and the ends together merges the two, so the ends instruction is not a
 * separate piece of guidance.
 */
function endsNotMergedWithScalp(text: string): ClarificationViolation[] {
  const out: ClarificationViolation[] = [];
  for (const s of sentences(text)) {
    const l = s.toLowerCase();
    const scalpInstruction = /\bscalp\b/.test(l) && /\b(apply|cleanse|cleanser|massage|use)\b/.test(l);
    const endsInstruction = /\bends\b/.test(l) && /\b(seal|tuck|apply|protect|coat)\w*\b/.test(l);
    if (scalpInstruction && endsInstruction) {
      out.push({
        claim: s,
        reason:
          "Ends protection must stand as its own separate tip, with its own reason — it may not be merged into scalp guidance.",
        rule: "clarification-ends-own-tip",
      });
    }
  }
  return out;
}

/**
 * Protective style guidance must explain WHY scalp cleanliness matters, tied to
 * the member's goal. Absence cannot be stripped, so it is logged as a rejection
 * for the author's review rather than removed.
 */
function scalpCleanlinessWhy(
  text: string,
  goalLabel: string | null,
): ClarificationViolation[] {
  const l = text.toLowerCase();
  if (!PROTECTIVE.test(l)) return [];
  if (!/\bscalp\b/.test(l) || !/\b(clean|cleanse|cleanser|cleansing|oil|build-?up)\b/.test(l)) {
    return [];
  }
  const goalWords = (goalLabel ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const namesGoal =
    /\blength retention\b|\bretain\w*\s+length\b|\bgrowth\b|\byour goal\b/.test(l) ||
    goalWords.some((w) => l.includes(w));
  const hasWhy = /\bbecause\b|\bso that\b|\bwhich\b|\bkeeps?\b|\ballows?\b|\bhelps?\b/.test(l);
  if (namesGoal && hasWhy) return [];
  return [
    {
      claim: text.slice(0, 400),
      reason:
        "Protective style guidance must explain why keeping the scalp clean matters, tied to this member's own goal.",
      rule: "clarification-scalp-cleanliness-why",
    },
  ];
}

export interface ClarificationCheck {
  /** Violations whose sentence is removed from the output. */
  strip: ClarificationViolation[];
  /** Violations logged for author review but not removed (missing content). */
  log: ClarificationViolation[];
  /** Which clarification topics governed the served copy. */
  governed: string[];
}

const TOPIC_TRIGGERS: Record<string, RegExp> = {
  cleansing: /\b(cleanse|cleansing|shampoo)\b/i,
  loc_lco: /\b(loc|lco)\b/i,
  leave_in_conditioners: /\bleave-?in\b/i,
  protective_style_washing: /\b(cornrow|braid|plait|twist|scalp cleanser|cleansing pads?)\w*\b/i,
  protective_style_scalp_cleanliness: /\bscalp\b/i,
  protecting_ends: /\bends\b/i,
  tension: /\btension\b|\btight\w*\b/i,
  heat_treatments_protective_styles: /\bheat treatment\b|\bheat hat\b/i,
};

/** Run every prescriptive clarification over generated output. */
export function checkClarifications(
  text: string,
  rows: Clarification[],
  ctx: { context?: unknown; goalLabel?: string | null } = {},
): ClarificationCheck {
  const active = new Set(rows.map((r) => r.topic));
  const strip: ClarificationViolation[] = [];
  const log: ClarificationViolation[] = [];

  if (active.has("cleansing")) strip.push(...cleanseAreaFocus(text));
  if (active.has("protective_style_washing")) strip.push(...protectiveStyleWashing(text));
  if (active.has("protecting_ends")) strip.push(...endsNotMergedWithScalp(text));
  if (active.has("protective_style_scalp_cleanliness") && inProtectiveStyle(ctx.context)) {
    log.push(...scalpCleanlinessWhy(text, ctx.goalLabel ?? null));
  }

  const governed = rows
    .filter((r) => TOPIC_TRIGGERS[r.topic]?.test(text))
    .map((r) => r.topic);

  return { strip, log, governed };
}
