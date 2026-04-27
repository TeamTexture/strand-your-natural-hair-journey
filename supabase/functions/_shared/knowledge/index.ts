// Knowledge-base registry + selector. Audit PHASE_2_AUDIT.md §2.
//
// Each topic file under topics/ exports a single const of type `Topic`.
// This module imports them all, exposes them via a registry, and offers
// `selectTopicsForContext()` that picks at most 4 relevant topics for a
// given AI call based on the user's clinical signals + the function
// kind + any explicit "force" picks.

import type {
  AppliesTo,
  FunctionKind,
  Topic,
  TopicId,
} from "./types.ts";

import { POROSITY } from "./topics/porosity.ts";
import { HAIR_ARCHITECTURE } from "./topics/hair-architecture.ts";
import { SCALP_CONDITIONS } from "./topics/scalp-conditions.ts";
import { DIAGNOSED_CONDITIONS } from "./topics/diagnosed-conditions.ts";
import { IRON_AND_SHEDDING } from "./topics/iron-and-shedding.ts";
import { VITS_AND_MINERALS } from "./topics/vits-and-minerals.ts";
import { THYROID } from "./topics/thyroid.ts";
import { HORMONES_AND_LIFE_STAGE } from "./topics/hormones-and-life-stage.ts";
import { HARD_WATER } from "./topics/hard-water.ts";
import { WASH_DAY_MECHANICS } from "./topics/wash-day-mechanics.ts";
import { HEAT_AND_MOISTURE } from "./topics/heat-and-moisture.ts";
import { PROTECTIVE_STYLING } from "./topics/protective-styling.ts";

const REGISTRY: Record<TopicId, Topic> = {
  "porosity": POROSITY,
  "hair-architecture": HAIR_ARCHITECTURE,
  "scalp-conditions": SCALP_CONDITIONS,
  "diagnosed-conditions": DIAGNOSED_CONDITIONS,
  "iron-and-shedding": IRON_AND_SHEDDING,
  "vits-and-minerals": VITS_AND_MINERALS,
  "thyroid": THYROID,
  "hormones-and-life-stage": HORMONES_AND_LIFE_STAGE,
  "hard-water": HARD_WATER,
  "wash-day-mechanics": WASH_DAY_MECHANICS,
  "heat-and-moisture": HEAT_AND_MOISTURE,
  "protective-styling": PROTECTIVE_STYLING,
};

/** Subset of AiContext fields the selector uses. Intentionally narrow so
 *  the knowledge module has no transitive dep on src/lib/aiContext.ts. */
export interface SelectorContext {
  hair?: {
    porosity?: string[];
    density?: string[];
    scalp?: string[];
    diagnosed?: string[];
  } | null;
  health?: {
    lifeStage?: string[];
    contraception?: string[];
    conditions?: string[];
  } | null;
  bloodResults?: Array<{ marker?: string; status?: string | null }>;
  location?: { is_hard_water_area?: boolean | null };
}

export interface SelectorIntent {
  function_kind: FunctionKind;
  /** Explicit topic picks the caller wants regardless of context match.
   *  Useful for functions like wash-day-observation that always want
   *  scalp + porosity even if the user's signals don't strictly trigger them. */
  force?: TopicId[];
}

const lowerSet = (xs?: string[] | null): Set<string> =>
  new Set((xs ?? []).map((x) => x.toLowerCase()));

const intersects = (a: string[] | undefined, b: Set<string>): boolean => {
  if (!a) return false;
  for (const x of a) if (b.has(x.toLowerCase())) return true;
  return false;
};

/** True iff the topic's `applies_to` matches the user context. The match
 *  is permissive — any single applies_to field that intersects the user's
 *  data is enough. function_kinds is a strict gate: if a topic declares
 *  function_kinds, it only applies to those functions. */
function topicMatches(
  topic: Topic,
  ctx: SelectorContext,
  intent: SelectorIntent,
): boolean {
  const a: AppliesTo = topic.applies_to;

  // Strict gate: if function_kinds is set, the function must be in it.
  if (a.function_kinds && a.function_kinds.length > 0) {
    if (!a.function_kinds.includes(intent.function_kind)) return false;
  }

  // Permissive content match — any of these is enough.
  if (a.hair?.porosity && intersects(ctx.hair?.porosity, lowerSet(a.hair.porosity))) {
    return true;
  }
  if (a.hair?.density && intersects(ctx.hair?.density, lowerSet(a.hair.density))) {
    return true;
  }
  if (a.hair?.scalp && intersects(ctx.hair?.scalp, lowerSet(a.hair.scalp))) {
    return true;
  }
  if (a.health?.life_stage && intersects(ctx.health?.lifeStage, lowerSet(a.health.life_stage))) {
    return true;
  }
  if (a.health?.conditions) {
    const target = lowerSet(a.health.conditions);
    if (intersects(ctx.health?.conditions, target)) return true;
    if (intersects(ctx.health?.contraception, target)) return true;
    if (intersects(ctx.hair?.diagnosed, target)) return true;
  }
  if (a.blood_markers) {
    const target = lowerSet(a.blood_markers);
    const flagged = (ctx.bloodResults ?? [])
      .filter((b) => b.status && b.status.toLowerCase() !== "normal" && b.status.toLowerCase() !== "untested")
      .map((b) => (b.marker ?? "").toLowerCase());
    for (const m of flagged) if (target.has(m)) return true;
  }
  if (a.location?.hard_water === true && ctx.location?.is_hard_water_area === true) {
    return true;
  }

  // No match on any axis. If function_kinds gated us in but no content
  // matched, return false (the function-kind alone is not enough — we
  // want topical relevance). EXCEPTION: if a topic ONLY has function_kinds
  // declared (no clinical filters), then the function-kind match is
  // sufficient (e.g. wash-day-mechanics applies to every wash-day call).
  if (a.function_kinds && a.function_kinds.includes(intent.function_kind)) {
    const hasClinicalFilters =
      !!(a.hair?.porosity || a.hair?.density || a.hair?.scalp ||
         a.health?.life_stage || a.health?.conditions ||
         a.blood_markers || a.location);
    if (!hasClinicalFilters) return true;
  }

  return false;
}

const TOPIC_CAP = 4;

/** Return at most 4 topics the AI should include for this call. Order:
 *  forced topics first (in declared order), then context-matched topics. */
export function selectTopicsForContext(
  ctx: SelectorContext,
  intent: SelectorIntent,
): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<TopicId>();

  // Forced topics first.
  for (const id of intent.force ?? []) {
    const t = REGISTRY[id];
    if (t && !seen.has(t.id)) {
      out.push(t);
      seen.add(t.id);
      if (out.length >= TOPIC_CAP) return out;
    }
  }

  // Context-matched topics, deterministic order (registry insertion).
  for (const id of Object.keys(REGISTRY) as TopicId[]) {
    if (seen.has(id)) continue;
    const t = REGISTRY[id];
    if (topicMatches(t, ctx, intent)) {
      out.push(t);
      seen.add(t.id);
      if (out.length >= TOPIC_CAP) return out;
    }
  }

  return out;
}

/**
 * Render a topic as a system-prompt block.
 *
 * NB: book/chapter refs are intentionally NOT included (Paige, 2026-04-27).
 * The model is forbidden from naming the source manuscript in user-facing
 * output, so we keep the topic body only. The chapter/page metadata stays
 * internal — still on `topic.book_refs` for logging/debugging.
 */
export function renderTopicBlock(topic: Topic): string {
  return `## ${topic.title}\n\n${topic.body}`;
}

/** Direct-access registry, for tests. */
export const KNOWLEDGE_REGISTRY = REGISTRY;
