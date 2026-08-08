import { allChallenges, challengeText, challengesOf } from "./challenges.ts";
import { enforceTipSetIntegrity } from "./tip-set-integrity.ts";

// Deterministic STRAND routine guardrails.
//
// Prompts tell the model what to do; this file makes the most important
// manuscript routine rules non-optional for surfaces where users read routine
// advice directly, especially Strand Summary routine tips.

type UnknownRecord = Record<string, unknown>;

const HEAT_HAT_LINK = "[TT Heat Hat](https://www.teamtexture.co.uk)";

const textOf = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const normalise = (value: unknown): string => textOf(value).toLowerCase();

const styleLabel = (context: UnknownRecord): string => {
  const cs = (context.currentStyle ?? null) as UnknownRecord | null;
  return textOf(cs?.current_hairstyle ?? cs?.default_style ?? "").trim();
};

const daysInStyle = (context: UnknownRecord): number | null => {
  const cs = (context.currentStyle ?? null) as UnknownRecord | null;
  const n = Number(cs?.days_in_style);
  return Number.isFinite(n) ? n : null;
};

const plannedStyleLabel = (context: UnknownRecord): string => {
  const cs = (context.currentStyle ?? null) as UnknownRecord | null;
  return textOf(cs?.planned_next_style ?? "").trim();
};

const hasGoalMatch = (context: UnknownRecord, re: RegExp): boolean => {
  const goals = Array.isArray(context.goals) ? (context.goals as UnknownRecord[]) : [];
  return goals.some((g) =>
    re.test(`${textOf(g.title)} ${challengesOf(g).join(" ")} ${textOf(g.target_text)}`)
  );
};

const hasHairSignal = (context: UnknownRecord, re: RegExp): boolean => {
  const hp = (context.hairProfile ?? context.hair ?? {}) as UnknownRecord;
  return re.test(normalise(hp));
};

const hasRecentWashSignal = (context: UnknownRecord, re: RegExp): boolean => {
  const history = (context.history ?? {}) as UnknownRecord;
  return re.test(normalise(history.last_3_wash_days ?? []));
};

const hasFlaggedBlood = (context: UnknownRecord): boolean => {
  const rows = Array.isArray(context.bloodResults) ? (context.bloodResults as UnknownRecord[]) : [];
  return rows.some((r) => {
    const status = textOf(r.status).toLowerCase();
    return status && !["normal", "optimal", "untested"].includes(status);
  });
};

const styleFamily = (style: string):
  | "braids"
  | "locs"
  | "cornrows"
  | "wig"
  | "weave"
  | "wash-go"
  | "twist-out"
  | "silk-press"
  | "loose"
  | "chemical"
  | "unknown" => {
  const s = style.toLowerCase();
  if (/braid|faux/.test(s)) return "braids";
  if (/\bloc/.test(s)) return "locs";
  if (/cornrow/.test(s)) return "cornrows";
  if (/wig|unit/.test(s)) return "wig";
  if (/weave|sew[- ]?in/.test(s)) return "weave";
  if (/wash[- ]?and[- ]?go|wash go|wng/.test(s)) return "wash-go";
  if (/twist[- ]?out|braid[- ]?out/.test(s)) return "twist-out";
  if (/silk press|blow[- ]?out|straight/.test(s)) return "silk-press";
  if (/relax|perm|texturi[sz]er/.test(s)) return "chemical";
  if (/loose|afro|natural/.test(s)) return "loose";
  return "unknown";
};

const containsAny = (tips: string[], re: RegExp): boolean => tips.some((tip) => re.test(tip));

const PROTECTIVE_FAMILIES = ["braids", "locs", "cornrows", "wig", "weave"];

/** The cleansing tip for a member NOT in a protective style. In a protective
 *  style the cleansing method is the in-style method returned by
 *  styleRoutineTips(), and there must only ever be ONE cleansing method in the
 *  set — so this returns null there rather than adding a second, conflicting
 *  method. */
function coreCleanseTip(context: UnknownRecord): string | null {
  const family = styleFamily(styleLabel(context));
  if (PROTECTIVE_FAMILIES.includes(family)) return null;
  return "Cleanse every 7 days with two shampoos before conditioning — a scalp-focused cleansing shampoo first, then a moisturising shampoo through the hair — so both scalp and strands are properly clean before conditioner.";
}

function consistencyTip(context: UnknownRecord): string {
  const recent = hasRecentWashSignal(context, /dry|break|scalp|fresh|soft|defined|frizz|itch|flake|build/);
  const suffix = recent
    ? "your recent wash logs need a clear pattern before the routine is judged"
    : "Afro-textured hair needs repeated evidence before a product is judged";
  return `Keep your core wash-day products steady for 3–4 wash cycles unless you log irritation, build-up, persistent dryness, stiffness or increased breakage — ${suffix}.`;
}

/** One idea per tip: each entry addresses a single target and a single task. */
function styleRoutineTips(context: UnknownRecord): string[] {
  const style = styleLabel(context);
  const planned = plannedStyleLabel(context);
  const days = daysInStyle(context);
  const family = styleFamily(style);
  const weekText = days == null ? "" : ` (you are ${Math.floor(days / 7)} weeks in)`;

  if (family === "braids") {
    return [
      `Cleanse the scalp through the parts every 7 days while your ${style || "braids"} are in, using diluted cleansing shampoo or a scalp cleanser on a cotton pad — build-up sits against the scalp between infrequent washes, and that is when itching and irritation start.`,
      `Take ${style || "braids"} down by the 4–6 week ceiling${weekText} — tension held past that point is where protective styling turns into breakage at the roots.`,
      `Deep-condition with the ${HEAT_HAT_LINK} for 20–30 minutes at takedown — hair that has been installed for weeks comes out water-depleted and snaps while it is being detangled.`,
    ];
  }
  if (family === "cornrows") {
    return [
      `Clean the exposed scalp between your cornrows with a scalp cleanser on a cotton pad or scalp cleansing pads on your 7-day rhythm${weekText} — nothing else goes on the scalp — oils, butters and heavy creams belong on the ends and length only, and between infrequent washes they sit there and build up.`,
      `Keep your ends tucked under or coated with a thick gel or emollient leave-in on the ends and length only — exposed ends in a long-worn style lose water fastest and are the first place breakage shows.`,
      `Refresh the front rather than re-tightening it around 2–3 weeks — re-tightening reloads tension on the same hairline that is already holding the style.`,
    ];
  }
  if (family === "locs") {
    return [
      `Wash your locs every 7 days by cleansing the scalp first and rinsing right through the locs — locs left months between washes hold residue and grime inside the loc itself.`,
      `Dry your locs fully after every wash before wrapping them — moisture held inside a loc is where mustiness and scalp irritation start.`,
    ];
  }
  if (family === "wig") {
    return [
      `Wash the braid-down under your wig by the 4–6 week mark${weekText} with a cleansing shampoo through the cornrows — the hair underneath is what you are actually growing.`,
      `Take the wig off at night rather than sleeping in it — a unit worn round the clock keeps friction and tension on the same hairline.`,
      `Give the natural hair a moisture-focused ${HEAT_HAT_LINK} reset for 20–30 minutes between installs — weeks flat under a unit leave the strands water-depleted.`,
    ];
  }
  if (family === "weave") {
    return [
      `Cleanse through the parts of your weave with diluted shampoo every 7 days — the base hair sits under wefts where build-up cannot rinse away on its own.`,
      `Keep the install within 6–8 weeks — the base hair is under continuous tension for the whole wear, and past that window the tension is what costs you length.`,
      `Detangle slowly with a slippery conditioner at takedown — weeks of shed hair are still woven in, and dry detangling tears through it.`,
    ];
  }
  if (family === "wash-go") {
    return [
      "Set your wash-and-go on wash day and then leave it alone until the next 7-day wash — every dry restyle adds friction the strands do not recover from.",
    ];
  }
  if (family === "twist-out") {
    return [
      "Set twist-outs on damp, freshly conditioned hair with slip — twisting dry hair drags the cuticle and roughs up the ends.",
      "Refresh only the front between sets rather than re-doing the whole head — repeating the full set on dry hair is where the friction accumulates.",
    ];
  }
  if (family === "silk-press") {
    return [
      `Use your next wash as a moisture recovery reset after a silk press, with conditioner and the ${HEAT_HAT_LINK} where dryness shows — direct heat leaves the strand short of water.`,
      "Avoid re-applying heat to stretch the style out for longer — repeated passes over the same strand are the point where heat damage becomes permanent.",
    ];
  }
  if (family === "chemical") {
    return [
      `Condition with a moisture-focused deep conditioner and the ${HEAT_HAT_LINK} on your 7-day rhythm — chemically treated hair is more porous, so it loses water faster than untreated hair.`,
      "Leave clear space between chemical services rather than overlapping them — overlapping processes on the same strand is what causes it to break mid-shaft.",
    ];
  }
  if (planned) {
    return [
      `Before you move into ${planned}, do one full recovery wash with the two-cleanse routine and moisture-focused conditioning — a new style should start on clean, hydrated hair, not on build-up.`,
    ];
  }
  return [];
}


function moistureTip(context: UnknownRecord): string | null {
  const relevant =
    hasHairSignal(context, /high.?porosity|low.?porosity|dry|coarse|dense|thick/) ||
    hasGoalMatch(context, /moisture|hydrat|length|retain|break|dry/) ||
    hasRecentWashSignal(context, /dry|straw|rough|frizz|break|snap|tangle|dull/) ||
    hasFlaggedBlood(context);
  if (!relevant) return null;
  return `Use a moisture-focused deep conditioner with the ${HEAT_HAT_LINK} for 20–30 minutes when dryness or breakage shows up — moisture and slip are the first adjustment before protein or product-hopping.`;
}

function healthTip(context: UnknownRecord): string | null {
  const rows = Array.isArray(context.bloodResults) ? (context.bloodResults as UnknownRecord[]) : [];
  const flagged = rows
    .filter((r) => {
      const status = textOf(r.status).toLowerCase();
      return status && !["normal", "optimal", "untested"].includes(status);
    })
    .map((r) => `${textOf(r.marker)} ${textOf(r.status)}`.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (flagged.length === 0) return null;
  return `Keep the routine gentle and consistent while ${flagged.join(" and ")} sits outside range — that means a clean scalp, low tension and moisture-first conditioning as your baseline, and the marker itself is one to take to your GP.`;
}

function cleanseModelTip(tip: string): string {
  return tip
    .replace(/\bheat\s+cap\b/gi, "TT Heat Hat")
    .replace(/(?<!TT\s)\bheat\s+hat\b/gi, "TT Heat Hat")
    .replace(/\bheated\s+cap\b/gi, "TT Heat Hat")
    .replace(/\bsteamer\b/gi, "TT Heat Hat")
    .replace(/\bwarm\s+towel\b/gi, "TT Heat Hat");
}

function isUnsafeRoutineTip(tip: string): boolean {
  const t = tip.toLowerCase();
  if (/plastic cap|shower cap|cling film|hooded dryer|bonnet dryer/.test(t)) return true;
  if (/pre[- ]?poo/.test(t) && /every|weekly|routine|before every|wash day|schedule|cadence/.test(t)) return true;
  if (/protein|keratin|bond[- ]?repair|strengthening/.test(t) && /weekly|bi[- ]?weekly|fortnight|monthly|every|routine|cadence|wash day/.test(t)) return true;
  if (/replace|switch|change|rotate|abandon/.test(t) && /after (one|1|two|2)|1-2|one or two/.test(t)) return true;
  if (/co[- ]?wash/.test(t) && /replace|instead of|main cleanse|primary cleanse/.test(t)) return true;
  return false;
}

function dedupeTips(tips: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tips) {
    const tip = cleanseModelTip(raw).replace(/\s+/g, " ").trim();
    if (!tip || isUnsafeRoutineTip(tip)) continue;
    const key = tip.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 72);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tip);
  }
  return out;
}

export function applyRoutineTipGuardrails(
  rawTips: string[],
  context: UnknownRecord,
  maxTips = 6,
): string[] {
  const tips = dedupeTips(rawTips);
  const required: string[] = [];

  // The deterministic manuscript tips are always offered as preferred
  // candidates. Set integrity then resolves any clash with the model's own
  // version of the same advice in favour of the stronger (manuscript) tip,
  // so a model tip that lacks a reason can never leave the set short.
  const cleanse = coreCleanseTip(context);
  if (cleanse) required.push(cleanse);
  required.push(consistencyTip(context));
  const styleTips = styleRoutineTips(context);
  // Protective-style guidance is always authoritative: it carries the in-style
  // cleansing method, so it must win any conflict against generic wash advice.
  const protective = PROTECTIVE_FAMILIES.includes(styleFamily(styleLabel(context)));
  if (
    styleTips.length > 0 &&
    (protective ||
      !containsAny(tips, /4.?6 week|6.?8 week|2.?3 week|tension|braid|loc|wig|weave|wash-and-go|twist-out|silk press|planned next|next style/i))
  ) {
    required.push(...styleTips);
  }
  const moisture = moistureTip(context);
  if (moisture && !containsAny(tips, /moisture-focused|deep condition|deep-condition|TT Heat Hat|slip|moisture first/i)) {
    required.push(moisture);
  }
  const health = healthTip(context);
  if (health && !containsAny(tips, /ferritin|vitamin d|tsh|thyroid|iron|blood|flagged|marker/i)) {
    required.push(health);
  }

  const merged = dedupeTips([...required, ...tips]);
  // Set-level floor: one idea per tip, no contradictions or duplicates across
  // the set, a reason on every tip, and the member's own recorded goal as the
  // benefit.
  const report = enforceTipSetIntegrity(merged, context, {
    max: maxTips,
    preferred: required,
  });
  if (report.dropped.length > 0) {
    console.log(
      "routine tip set integrity",
      JSON.stringify({
        split: report.split,
        dropped: report.dropped.map((d) => ({ reasons: d.reasons, tip: d.tip.slice(0, 90) })),
      }),
    );
  }
  return report.tips.length > 0 ? report.tips : merged.slice(0, maxTips);
}


export const CORE_ROUTINE_GUARDRAILS_PROMPT = `CORE ROUTINE GUARDRAILS — NON-NEGOTIABLE

Every advice surface must treat the manuscript routine system as the baseline:
- Weekly rhythm: every 7 days.
- Wash architecture: scalp-focused cleansing/all-purpose shampoo first, moisturising/conditioning shampoo through the hair second, then conditioner.
- Product consistency: 3–4 wash cycles before judging products unless the user's logs show a clear adverse reaction.
- Moisture-first: dryness, high porosity, humidity dryness, breakage or straw-like feel calls for water, slip, conditioner technique and a moisture-focused mask/deep conditioner — not scheduled protein.
- Heat: the only heat tool you may name is ${HEAT_HAT_LINK}.
- Style-specific care: adapt the baseline to current style, planned next style and days in style; protective styles still need scalp cleansing, tension management, moisture to the natural hair and takedown/recovery within the style's wear window.
- Scalp stays oil-free and product-free: the only thing that may ever go on the scalp (including the exposed scalp between cornrows/braids) is water or a lightweight water-based serum/tonic, or a scalp cleanser on a cotton pad / cleansing pads. Never oils, butters, gels, edge control, heavy creams or emollient leave-ins on the scalp — they clog follicles and cause itching, irritation and build-up, especially between infrequent washes in protective styles. Richer products are for the ends and length only.
- User data wins: personalise from profile, goals, blood/health flags, wash logs, products and tools. Never produce generic routine advice when data exists.`;