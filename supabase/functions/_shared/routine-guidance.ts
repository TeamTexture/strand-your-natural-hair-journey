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
  return goals.some((g) => re.test(`${textOf(g.title)} ${textOf(g.challenge)} ${textOf(g.target_text)}`));
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

function coreCleanseTip(context: UnknownRecord): string {
  const style = styleLabel(context);
  const family = styleFamily(style);
  if (["braids", "locs", "cornrows", "wig", "weave"].includes(family)) {
    const label = style || "your current style";
    return `Cleanse your scalp every 7 days while wearing ${label} with diluted cleansing shampoo through the parts, then use a moisturising shampoo where your natural hair can be reached before conditioning — protective styling still needs clean scalp and hair.`;
  }
  return "Cleanse every 7 days with two shampoos before conditioning — a scalp-focused cleansing shampoo first, then a moisturising shampoo through the hair — so both scalp and strands are properly clean before conditioner.";
}

function consistencyTip(context: UnknownRecord): string {
  const recent = hasRecentWashSignal(context, /dry|break|scalp|fresh|soft|defined|frizz|itch|flake|build/);
  const suffix = recent
    ? "your recent wash logs need a clear pattern before the routine is judged"
    : "Afro-textured hair needs repeated evidence before a product is judged";
  return `Keep your core wash-day products steady for 3–4 wash cycles unless you log irritation, build-up, persistent dryness, stiffness or increased breakage — ${suffix}.`;
}

function styleRoutineTip(context: UnknownRecord): string | null {
  const style = styleLabel(context);
  const planned = plannedStyleLabel(context);
  const days = daysInStyle(context);
  const family = styleFamily(style);
  const weekText = days == null ? "" : ` at ${Math.floor(days / 7)} weeks in`;

  if (family === "braids") {
    return `Plan ${style || "braids"} around a 4–6 week ceiling${weekText}, keep the scalp cleansed during the install, and deep-condition with the ${HEAT_HAT_LINK} after takedown — tension and trapped build-up turn protection into breakage.`;
  }
  if (family === "cornrows") {
    return `Refresh or redo cornrows around 2–3 weeks${weekText} instead of tightening the front, and cleanse along each part every 7 days — the hairline and partings are the pressure points.`;
  }
  if (family === "locs") {
    return `Wash locs every 7 days by cleansing the scalp first and rinsing through the locs thoroughly before drying fully — locs should not go months without cleansing.`;
  }
  if (family === "wig") {
    return `Take your wig off at night and wash the braid-down underneath by 4–6 weeks, with a moisture-focused ${HEAT_HAT_LINK} reset between installs — the natural hair underneath is the priority.`;
  }
  if (family === "weave") {
    return `Keep weave installs within 6–8 weeks, cleanse through the parts with diluted shampoo, and detangle slowly with slippery conditioner at takedown — the base hair is under tension the whole time.`;
  }
  if (family === "wash-go") {
    return "Set your wash-and-go on wash day, then leave it alone as much as possible until the next 7-day wash — low manipulation and product consistency protect length better than daily restyling.";
  }
  if (family === "twist-out") {
    return "Set twist-outs on damp, freshly conditioned hair with slip, then refresh only the front if needed — repeating the whole set dry adds friction to your ends.";
  }
  if (family === "silk-press") {
    return `Use your next wash as a moisture recovery reset after a silk press, with conditioner and the ${HEAT_HAT_LINK} where dryness shows — repeating heat to stretch the style is the risk point.`;
  }
  if (family === "chemical") {
    return `Use moisture-focused conditioning with the ${HEAT_HAT_LINK} on your wash rhythm and avoid overlapping chemical services — chemically treated hair is more porous and breaks faster when it dries out.`;
  }
  if (planned) {
    return `Before moving into ${planned}, do one full recovery wash with the two-cleanse routine, slippery detangling and moisture-focused conditioning — the next style should start on clean, hydrated hair.`;
  }
  return null;
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
  return `Keep the routine gentle and consistent while ${flagged.join(" and ")} is flagged — follicles recover better with clean scalp, low tension, moisture-first conditioning and professional follow-up where needed.`;
}

function cleanseModelTip(tip: string): string {
  return tip
    .replace(/\bheat\s+cap\b/gi, "TT Heat Hat")
    .replace(/\bheat\s+hat\b/gi, "TT Heat Hat")
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

  if (!containsAny(tips, /two shampoos|two cleanses|scalp-focused|scalp focused|cleansing shampoo.*moisturi[sz]ing shampoo/i)) {
    required.push(coreCleanseTip(context));
  }
  if (!containsAny(tips, /3.?4 wash cycles|three.?four wash cycles|product consistency|keep.*products steady/i)) {
    required.push(consistencyTip(context));
  }
  const styleTip = styleRoutineTip(context);
  if (styleTip && !containsAny(tips, /4.?6 week|6.?8 week|2.?3 week|tension|braid|loc|wig|weave|wash-and-go|twist-out|silk press|planned next|next style/i)) {
    required.push(styleTip);
  }
  const moisture = moistureTip(context);
  if (moisture && !containsAny(tips, /moisture-focused|deep condition|deep-condition|TT Heat Hat|slip|moisture first/i)) {
    required.push(moisture);
  }
  const health = healthTip(context);
  if (health && !containsAny(tips, /ferritin|vitamin d|tsh|thyroid|iron|blood|flagged|marker/i)) {
    required.push(health);
  }

  return dedupeTips([...required, ...tips]).slice(0, maxTips);
}

export const CORE_ROUTINE_GUARDRAILS_PROMPT = `CORE ROUTINE GUARDRAILS — NON-NEGOTIABLE

Every advice surface must treat the manuscript routine system as the baseline:
- Weekly rhythm: every 7 days.
- Wash architecture: scalp-focused cleansing/all-purpose shampoo first, moisturising/conditioning shampoo through the hair second, then conditioner.
- Product consistency: 3–4 wash cycles before judging products unless the user's logs show a clear adverse reaction.
- Moisture-first: dryness, high porosity, humidity dryness, breakage or straw-like feel calls for water, slip, conditioner technique and a moisture-focused mask/deep conditioner — not scheduled protein.
- Heat: the only heat tool you may name is ${HEAT_HAT_LINK}.
- Style-specific care: adapt the baseline to current style, planned next style and days in style; protective styles still need scalp cleansing, tension management, moisture to the natural hair and takedown/recovery within the style's wear window.
- User data wins: personalise from profile, goals, blood/health flags, wash logs, products and tools. Never produce generic routine advice when data exists.`;