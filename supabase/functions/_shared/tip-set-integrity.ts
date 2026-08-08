// tip-set-integrity — set-level quality floor for a LIST of tips (routine tips,
// action plans, any surface that renders several tips together).
//
// tip-method.ts and tip-action.ts validate ONE tip. This module validates the
// SET, plus the two per-tip failures that only make sense in a set context:
//
//  1. CONTRADICTION / DUPLICATION. Two tips may not prescribe different
//     methods for the same task on the same target. Every tip is classified
//     into { target, task } facets — target: scalp | ends | lengths | hairline
//     | edges | whole; task: cleanse | condition | moisturise | protect | seal
//     | detangle | style | trim | rest | rhythm | consistency | health. Two
//     tips sharing a (target, task) facet are a conflict; the stronger one is
//     kept and the weaker dropped.
//
//  2. COMPOUND TIPS. One idea per tip. A tip that instructs on two different
//     targets (scalp AND ends) or two different purposes (cleansing AND
//     protecting) is split into its separate ideas; each part is then judged on
//     its own, and a part that cannot stand alone (no method, no reason) is
//     dropped rather than padded.
//
//  3. REASON + GOAL-LINKED BENEFIT. Every tip must carry an explanatory clause
//     AND connect to a goal the member actually recorded. The benefit clause is
//     built from the member's own recorded goal text — no hair-care mechanism
//     is invented here; mechanisms come from the manuscript via the prompt.
//
// Pure string logic. No Deno APIs, no network — unit-testable from Vitest.

import { hasInstructingVerb } from "./tip-action.ts";

type UnknownRecord = Record<string, unknown>;

export type TipTarget =
  | "scalp"
  | "ends"
  | "lengths"
  | "hairline"
  | "roots"
  | "whole";

export type TipTask =
  | "cleanse"
  | "condition"
  | "moisturise"
  | "protect"
  | "seal"
  | "detangle"
  | "style"
  | "trim"
  | "rest"
  | "rhythm"
  | "consistency"
  | "health";

const TARGET_PATTERNS: Array<{ target: TipTarget; re: RegExp }> = [
  { target: "scalp", re: /\b(scalp|parts?|partings?|between (?:the |your )?(?:rows|cornrows|braids)|exposed scalp|follicles?)\b/i },
  { target: "ends", re: /\b(ends|tips of|split ends|hemline)\b/i },
  { target: "hairline", re: /\b(hairline|edges|temples|front (?:of your )?(?:hair|line))\b/i },
  { target: "roots", re: /\b(roots|new growth|regrowth|base of (?:the|your) (?:braid|loc))\b/i },
  { target: "lengths", re: /\b(lengths?|mid[- ]lengths?|strands?|shaft|natural hair|the hair underneath)\b/i },
];

const TASK_PATTERNS: Array<{ task: TipTask; re: RegExp }> = [
  { task: "cleanse", re: /\b(cleanse|cleansing|wash(?:ing)?|shampoo(?:ing)?|clarif(?:y|ying|ier)|clean(?:ing)?|co[- ]?wash|cleanser)\b/i },
  { task: "condition", re: /\b(condition(?:er|ing)?|deep[- ]condition(?:er|ing)?|mask|treatment)\b/i },
  { task: "moisturise", re: /\b(moisturis|moisturiz|hydrat|water[- ]based|spritz|mist|dampen|leave[- ]in)\b/i },
  { task: "seal", re: /\b(seal(?:ing)?|coat(?:ed|ing)?|butter|thick gel|emollient)\b/i },
  { task: "protect", re: /\b(protect(?:ing|ive)?|tuck(?:ed)?|wrap|bonnet|satin|silk|scarf|low manipulation|tension|re[- ]?tighten|takedown|take[- ]?down)\b/i },
  { task: "detangle", re: /\b(detangl|comb|finger[- ]?comb|section(?:ing|ed)?|clip)\b/i },
  { task: "trim", re: /\b(trim|cut|dust(?:ing)?)\b/i },
  { task: "rest", re: /\b(rest(?:ing)?|break from|leave it alone|between installs)\b/i },
  { task: "rhythm", re: /\b(every 7 days|weekly rhythm|once a week|wash cadence|wash rhythm)\b/i },
  { task: "consistency", re: /\b(3.?4 wash cycles|three.?four wash cycles|products steady|product consistency|before judging)\b/i },
  { task: "health", re: /\b(ferritin|vitamin d|tsh|thyroid|iron|b12|folate|blood|flagged marker|gp\b)\b/i },
];

export interface TipFacets {
  targets: TipTarget[];
  tasks: TipTask[];
}

/** The { target, task } facets a tip touches. */
export function classifyTip(text: string): TipFacets {
  const t = text ?? "";
  const targets = TARGET_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.target);
  const tasks = TASK_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.task);
  // A tip with no explicit target is about the hair as a whole.
  return {
    targets: targets.length ? targets : ["whole"],
    tasks,
  };
}

/** The facet keys used for conflict detection: target × task. */
export function facetKeys(text: string): string[] {
  const { targets, tasks } = classifyTip(text);
  const out: string[] = [];
  for (const target of targets) {
    for (const task of tasks) {
      // Rhythm / consistency / health are set-level facets, not target-bound.
      if (task === "rhythm" || task === "consistency" || task === "health") {
        out.push(`*:${task}`);
      } else {
        out.push(`${target}:${task}`);
      }
    }
  }
  return Array.from(new Set(out));
}

/** The primary facet — the (target, task) a tip is really about. Used for
 *  conflict resolution when a tip legitimately mentions more than one. */
export function primaryFacet(text: string): string | null {
  const keys = facetKeys(text);
  return keys[0] ?? null;
}

// ---------------------------------------------------------------------------
// COMPOUND DETECTION
// ---------------------------------------------------------------------------

/** Clause connectors that join two instructions in one sentence. */
const IDEA_SPLIT =
  /(?:,\s*(?:and|then|also|plus)\s+|;\s*|\s+and then\s+)(?=(?:keep|apply|use|clean|cleanse|seal|tuck|coat|wrap|refresh|deep[- ]condition|condition|detangle|moisturis|moisturiz|mist|spritz|trim|rest|leave|cover|wash|shampoo|rinse|section|band|stretch|book|swap)\b)/i;

/** Split a sentence into its separate instruction clauses (reason clause,
 *  introduced with an em dash, stays attached to the clause it follows). */
export function splitIntoIdeas(tip: string): string[] {
  const text = (tip ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const parts = text.split(IDEA_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [text];
  return parts.map((p, i) => {
    let s = p.replace(/^(?:and|then|also|plus)\s+/i, "").trim();
    if (i > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s.replace(/[,;]\s*$/, "").replace(/\.?$/, ".");
  });
}

export interface CompoundResult {
  compound: boolean;
  reasons: string[];
  ideas: string[];
}

/**
 * A tip is compound when its clauses instruct on two DIFFERENT targets
 * (scalp vs ends) or two DIFFERENT purposes (cleansing vs protecting).
 */
export function detectCompoundTip(tip: string): CompoundResult {
  const ideas = splitIntoIdeas(tip);
  if (ideas.length < 2) return { compound: false, reasons: [], ideas };

  const reasons: string[] = [];
  const facets = ideas.map(classifyTip);
  const targetSets = facets.map((f) => f.targets.filter((t) => t !== "whole").join("+"));
  const primaryTasks = facets.map((f) => f.tasks[0] ?? "");

  const distinctTargets = new Set(targetSets.filter(Boolean));
  const distinctTasks = new Set(primaryTasks.filter(Boolean));

  if (distinctTargets.size > 1) reasons.push("two_targets_in_one_tip");
  if (distinctTasks.size > 1) reasons.push("two_purposes_in_one_tip");

  return { compound: reasons.length > 0, reasons, ideas };
}

// ---------------------------------------------------------------------------
// REASON + GOAL-LINKED BENEFIT
// ---------------------------------------------------------------------------

const REASON_CONNECTOR =
  /(\u2014|--|\s-\s|\bbecause\b|\bso that\b|\bso\b|\bsince\b|\bwhich\b|\bwhile\b|\bto (?:slow|stop|reduce|limit|keep|hold|avoid|prevent)\b|\bthat is why\b|\bmeans\b)/i;

/** Does the tip explain WHY, not only WHAT? */
export function hasReasonClause(tip: string): boolean {
  const m = (tip ?? "").match(REASON_CONNECTOR);
  if (!m || m.index == null) return false;
  const after = tip.slice(m.index + m[0].length).trim();
  return after.split(/\s+/).filter(Boolean).length >= 4;
}

export interface GoalLink {
  /** The member's own recorded goal wording, trimmed for display. */
  label: string;
  /** Words that count as "this tip touches that goal". */
  tokens: string[];
}

const GOAL_SYNONYMS: Array<{ re: RegExp; tokens: string[] }> = [
  { re: /length|retain|grow|growth/i, tokens: ["length", "retention", "breakage", "snap", "grow"] },
  { re: /thick|densit|fuller|volume/i, tokens: ["density", "thick", "fuller", "shedding"] },
  { re: /moist|hydrat|dry/i, tokens: ["moisture", "hydration", "dry", "water"] },
  { re: /scalp|itch|flake|dandruff/i, tokens: ["scalp", "itch", "flake", "build-up", "clean"] },
  { re: /damage|breakage|split|strength/i, tokens: ["breakage", "damage", "split", "strength"] },
  { re: /definition|curl pattern|frizz/i, tokens: ["definition", "curl", "frizz"] },
  { re: /edges|hairline|thinning/i, tokens: ["edges", "hairline", "tension"] },
  { re: /shed/i, tokens: ["shedding", "shed"] },
];

/** Goal links drawn from the member's recorded goals — never invented. */
export function goalLinks(context: UnknownRecord): GoalLink[] {
  const goals = Array.isArray(context.goals) ? (context.goals as UnknownRecord[]) : [];
  const out: GoalLink[] = [];
  for (const g of goals) {
    const label = String(g.title ?? g.category ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const tokens = new Set<string>();
    for (const word of label.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 4) tokens.add(word);
    }
    for (const syn of GOAL_SYNONYMS) {
      if (syn.re.test(label)) for (const t of syn.tokens) tokens.add(t);
    }
    out.push({ label, tokens: Array.from(tokens) });
  }
  return out;
}

/** Does the tip already connect to one of the member's recorded goals? */
export function matchedGoal(tip: string, links: GoalLink[]): GoalLink | null {
  const t = (tip ?? "").toLowerCase();
  for (const link of links) {
    if (link.tokens.some((tok) => t.includes(tok))) return link;
  }
  return null;
}

/** Attach the goal the tip serves, using the member's own recorded wording. */
const BENEFIT_FRAMES = [
  (label: string) => `which is exactly what your goal of ${label} depends on`,
  (label: string) => `and that is what your goal of ${label} is built on`,
  (label: string) => `this is the part that moves your goal of ${label}`,
];

export function attachGoalBenefit(tip: string, links: GoalLink[], variant = 0): string {
  if (links.length === 0) return tip;
  if (matchedGoal(tip, links)) return tip;
  const label = lowerFirst(links[0].label.replace(/\.$/, ""));
  const body = tip.replace(/\s*[.]$/, "");
  const frame = BENEFIT_FRAMES[variant % BENEFIT_FRAMES.length];
  return `${body} — ${frame(label)}.`;
}

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------
// SET ENFORCEMENT
// ---------------------------------------------------------------------------

const METHOD_SIGNAL =
  /\b(shampoo|cleanser|conditioner|leave[- ]in|serum|gel|butter|oil|mask|treatment|cotton pad|cleansing pads?|comb|clips?|bonnet|satin|silk|heat hat|spray bottle|trim|section|apply|rinse|cleanse|wash|condition|detangle|tuck|wrap|coat|seal|mist|spritz|refresh|band|stretch|swap|keep|space)\b/i;

export interface TipSetOptions {
  max?: number;
  /** Tips that win a conflict (deterministic, style-aware guardrail tips). */
  preferred?: string[];
}

export interface TipSetReport {
  tips: string[];
  dropped: Array<{ tip: string; reasons: string[] }>;
  split: number;
}

/** Score used to pick the survivor of a facet conflict. */
function strength(tip: string, preferred: Set<string>, styleTerms: string[]): number {
  let score = 0;
  if (preferred.has(tip)) score += 6;
  if (styleTerms.some((s) => s && tip.toLowerCase().includes(s))) score += 3;
  if (hasReasonClause(tip)) score += 2;
  if (METHOD_SIGNAL.test(tip)) score += 2;
  const words = tip.split(/\s+/).length;
  if (words >= 12 && words <= 42) score += 1;
  return score;
}

function styleTermsOf(context: UnknownRecord): string[] {
  const cs = (context.currentStyle ?? {}) as UnknownRecord;
  return [String(cs.current_hairstyle ?? ""), String(cs.planned_next_style ?? "")]
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
}

/**
 * The set-level floor: split compound tips, drop conflicts and duplicates,
 * require a reason, attach the member's recorded goal as the benefit.
 */
export function enforceTipSetIntegrity(
  rawTips: string[],
  context: UnknownRecord,
  options: TipSetOptions = {},
): TipSetReport {
  const max = options.max ?? 6;
  const preferred = new Set(options.preferred ?? []);
  const styleTerms = styleTermsOf(context);
  const links = goalLinks(context);
  const dropped: TipSetReport["dropped"] = [];
  let split = 0;

  // 1. One idea per tip.
  const candidates: string[] = [];
  for (const raw of rawTips) {
    const tip = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!tip) continue;
    const compound = detectCompoundTip(tip);
    if (!compound.compound) {
      candidates.push(tip);
      continue;
    }
    split++;
    for (const idea of compound.ideas) {
      // A split part only survives if it stands alone as a tip.
      if (!METHOD_SIGNAL.test(idea)) {
        dropped.push({ tip: idea, reasons: [...compound.reasons, "split_part_no_method"] });
        continue;
      }
      if (preferred.has(tip)) preferred.add(idea);
      candidates.push(idea);
    }
  }

  // 2. Reason floor FIRST, so a tip with no reason can never displace a
  //     deterministic manuscript tip that has one.
  const withReason: string[] = [];
  for (const tip of candidates) {
    // ACTION FLOOR — the same rule the single-tip surfaces use. A tip that
    // never instructs the member to do anything is an observation, not a tip.
    if (!hasInstructingVerb(tip)) {
      dropped.push({ tip, reasons: ["no_action_verb"] });
      continue;
    }
    if (!hasReasonClause(tip)) {
      dropped.push({ tip, reasons: ["no_reason_clause"] });
      continue;
    }
    withReason.push(tip);
  }

  // 3. Conflict / duplicate resolution on (target, task) facets.
  const byFacet = new Map<string, string>();
  const order: string[] = [];
  for (const tip of withReason) {
    const keys = facetKeys(tip);
    const claimKeys = keys.length ? keys : ["*:unclassified"];
    const clash = claimKeys.find((k) => byFacet.has(k));
    if (clash) {
      const incumbent = byFacet.get(clash)!;
      if (strength(tip, preferred, styleTerms) > strength(incumbent, preferred, styleTerms)) {
        for (const [k, v] of byFacet) if (v === incumbent) byFacet.delete(k);
        const idx = order.indexOf(incumbent);
        if (idx >= 0) order.splice(idx, 1);
        dropped.push({ tip: incumbent, reasons: [`conflict_same_facet:${clash}`] });
        for (const k of claimKeys) byFacet.set(k, tip);
        order.push(tip);
      } else {
        dropped.push({ tip, reasons: [`conflict_same_facet:${clash}`] });
      }
      continue;
    }
    for (const k of claimKeys) byFacet.set(k, tip);
    order.push(tip);
  }

  // 4. Goal-linked benefit.
  const out: string[] = [];
  let benefitVariant = 0;
  for (const tip of order) {
    const withBenefit = attachGoalBenefit(tip, links, benefitVariant);
    if (withBenefit !== tip) benefitVariant++;
    out.push(withBenefit);
    if (out.length >= max) break;
  }

  return { tips: out, dropped, split };
}

/** Prompt block stating the set-level rules to the model. */
export const TIP_SET_INTEGRITY_PROMPT = `TIP SET INTEGRITY — NON-NEGOTIABLE (applies to the whole list, not each tip alone)

1. ONE IDEA PER TIP. Never join two instructions with different targets (scalp vs ends) or different purposes (cleansing vs protecting) into one tip. If both are worth saying, they are two tips.
2. NO CONTRADICTIONS ACROSS THE SET. Two tips may not prescribe different methods for the same task on the same target. If the member is in a protective style, there is exactly ONE cleansing method in the set — the protective-style method from the manuscript — never that plus general loose-hair shampooing.
3. NO DUPLICATES. Do not restate the same instruction in different words.
4. EVERY TIP CARRIES THREE THINGS: the action (specific, with a method and a timing or frequency), the reason it matters (a mechanism or consequence from the manuscript — never a restatement of the action), and the benefit tied to a goal the member has actually recorded. Name that goal. A generic benefit is a failure.
5. STYLE-AWARE. When the member is in a protective style, cleansing, moisture and tension guidance must be the in-style method, not loose-hair wash technique.
6. Generic product types and tools only — never a brand name or a branded product.`;
