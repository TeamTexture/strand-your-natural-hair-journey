// LAYER 2 OF THE DAILY LOG GUIDANCE — "YOUR WEEK", ONE CALL PER WEEK.
//
// The client sends a FINISHED, deterministic summary of her week (counts, days,
// streaks, products, applications since her last wash). The model does no
// arithmetic and invents no history: it reads the numbers and writes a short,
// mechanism-first card about the pattern.
//
// SPEND CONTRACT (mem: AI regeneration triggers). The cache signature is built
// HERE from `daily_hair_entries` in the database, never from the client blob,
// and only an explicit `force` from a control she tapped can bypass a hit. So
// opening the daily log — or opening it ten times — cannot spend a token; a new
// week's worth of entries can.
//
// GROUNDING. Build-up, layering and between-wash moisture guidance is grounded
// in retrieved manuscript passages via the named surface `daily-pattern-tip`
// (chapters 14, 13, 12), and every field goes through the shared
// content-integrity guardrail (`sanitiseAndLog`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { json, preflight } from "../_shared/cors.ts";
import { checkKillSwitch } from "../_shared/kill-switch.ts";
import { checkDailyCap, checkGlobalCeiling } from "../_shared/usage-cap.ts";
import { requireEntitledUser } from "../_shared/entitlement.ts";
import { gatewayFetch, setAiCallUser } from "../_shared/ai-meter.ts";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";
import { buildGroundingBlock } from "../_shared/grounding.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import { readSurfaceCache, writeSurfaceCache, sha } from "../_shared/surface-cache.ts";
import type { SelectorContext } from "../_shared/knowledge/index.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const AI_METER_META = { function_name: "daily-pattern-tip", stage: 2 } as const;
const CACHE_KIND = "daily-pattern-tip";
const MODEL_VERSION = "v1-2026-09-daily-pattern";
const DAILY_CAP = 6;

interface WeekProductUse {
  name?: string;
  brand?: string | null;
  category?: string | null;
  times?: number;
  days?: number;
}

interface WeekSummary {
  from?: string;
  to?: string;
  entries?: number;
  daysLogged?: number;
  longestStreak?: number;
  daysSinceLastEntry?: number | null;
  applicationsSinceWash?: number;
  daysSinceWash?: number | null;
  products?: WeekProductUse[];
  categories?: string[];
}

interface Body {
  week?: WeekSummary;
  context?: Record<string, unknown> | null;
  force?: boolean;
}

interface WeekPayload {
  /** Short tracked-caps header, 3-6 words. */
  headline: string;
  /** What the week actually shows, in her own numbers. 2-3 sentences. */
  pattern: string;
  /** The one thing to carry into next week. 1-2 sentences. */
  next_step: string;
}

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Write the member's "YOUR WEEK" card from her between-wash daily log. This is a weekly read of a real pattern, not a pep talk and not a verdict on any single product.

OUTPUT — JSON only:
{
  "headline": string,     // 3-6 words, Title Case, no trailing punctuation. Names the pattern, not the mood.
  "pattern": string,      // 2-3 short sentences. What her week shows, using the SUPPLIED numbers only.
  "next_step": string     // 1-2 short sentences. ONE concrete thing for next week, with the mechanism.
}

THE NUMBERS ARE GIVEN TO YOU — NEVER COMPUTE OR GUESS:
- The week summary block holds the counts, the days logged, the streak, the products with how many times each was used, the applications since her last wash and the days since that wash. Use those figures verbatim.
- NEVER state a number, date, product or frequency that is not in the supplied summary. If a figure is absent, write around it — do not estimate.
- NEVER refer to a wash day, appointment, blood marker or goal that is not in the supplied data.

WHAT TO REASON ABOUT:
- LAYERING AND BUILD-UP: when the summary shows many applications since her last wash, or the same leave-in/oil/butter used on consecutive days, explain the mechanism of product accumulating on the strand and the scalp — grounded in the manuscript passages supplied below. Never scaremonger, never imply damage that the numbers do not support.
- SCALP RULE (absolute): never advise any product onto the scalp or partings except water, a lightweight water-based serum, or a cleanser on a cotton pad. Gels, oils, butters, heavy creams and emollient leave-ins are ends and length only.
- CONSISTENCY: a steady rhythm is worth naming plainly when the numbers show one. A gap is an observation, never a telling-off — no guilt, no "you should have".
- Heat: if heat is relevant, write exactly "TT Heat Hat" and nothing else.

VOICE:
- Speak to her as "you". Mechanism first: what physically happens, then what to do.
- No flattery, no exclamation marks, no emojis, no questions, no "great job".
- Every technical term stays plain enough to follow, and every claim traces to the supplied numbers or the manuscript passages below.

Manuscript passages relevant to between-wash product use, build-up and moisture retention:
`;

const buildSelectorContext = (ctx: Record<string, unknown>): SelectorContext => {
  const hp = (ctx.hairProfile ?? {}) as Record<string, unknown>;
  const hl = (ctx.healthProfile ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
  return {
    hair: {
      porosity: arr(hp.porosity),
      density: arr(hp.density),
      scalp: arr(hp.scalp ?? hp.scalp_condition),
      diagnosed: arr(hp.diagnosed ?? hp.diagnosed_conditions),
    },
    health: {
      lifeStage: arr(hl.life_stage),
      conditions: arr(hl.medical_conditions),
    },
    bloodResults: Array.isArray(ctx.bloodResults) ? (ctx.bloodResults as unknown[]) : [],
    location: (ctx.location as Record<string, unknown>) ?? {},
  } as SelectorContext;
};

/**
 * SERVER-AUTHORITATIVE weekly fingerprint. Read from the database, so nothing
 * the client sends can move it: the same week with the same entries always hits
 * the cache.
 */
async function weekFingerprint(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("daily_hair_entries")
    .select("id, entry_date, product_ids")
    .eq("user_id", userId)
    .gte("entry_date", since)
    .order("entry_date", { ascending: true });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const part = rows
    .map(
      (r) =>
        `${r.entry_date ?? ""}:${(Array.isArray(r.product_ids) ? (r.product_ids as string[]) : [])
          .slice()
          .sort()
          .join(",")}`,
    )
    .join("|");
  // The ISO week is part of the key: a new week is a new card even when the
  // entries themselves have not changed.
  const d = new Date();
  const week = `${d.getUTCFullYear()}-${Math.floor(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(d.getUTCFullYear(), 0, 1)) /
      (7 * 86_400_000),
  )}`;
  return await sha(`${MODEL_VERSION}#${week}#${part}`);
}

const complete = (p: Partial<WeekPayload>): boolean =>
  !!(p.headline ?? "").trim() && !!(p.pattern ?? "").trim() && !!(p.next_step ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const killed = checkKillSwitch();
  if (killed) return killed;

  try {
    const auth = await requireEntitledUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;
    setAiCallUser(user.id);

    const body = (await req.json().catch(() => ({}))) as Body;
    const week = body.week ?? {};
    const context = (body.context ?? {}) as Record<string, unknown>;

    // Fewer than two entries is not a pattern — never worth a call.
    if ((week.entries ?? 0) < 2) return json(200, { tip: null, reason: "not_enough_entries" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { error: "Server misconfigured" });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sig = await weekFingerprint(admin, user.id);
    if (!body.force) {
      const cached = await readSurfaceCache(admin, user.id, CACHE_KIND, sig);
      if (cached && complete(cached as Partial<WeekPayload>)) {
        return json(200, { tip: cached, _cached: true });
      }
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const capped = (await checkGlobalCeiling("daily-pattern-tip")) ??
      (await checkDailyCap(user.id, "daily-pattern-tip", DAILY_CAP));
    if (capped) return capped;

    // Build-up and layering are the dominant topics of this card, so the
    // retrieval query names them explicitly alongside her own signals.
    const hair = (context.hairProfile ?? {}) as Record<string, unknown>;
    const grounding = await buildGroundingBlock({
      surface: "daily-pattern-tip",
      fn: "daily-pattern-tip",
      functionKind: "wash-day-observation",
      selectorContext: buildSelectorContext(context),
      forceTopics: ["wash-day-mechanics"],
      ragQuery: `product build-up between wash days, layering leave-in and oil on the strand, scalp cleanliness, moisture retention, refreshing between washes, porosity ${
        hair.porosity ?? ""
      } density ${hair.density ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      ragK: 6,
    });

    const aiRes = await gatewayFetch(
      AI_METER_META,
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            {
              role: "system",
              content: `${SYSTEM}${grounding.block}\n\n${buildTipsLevelBlock(
                (context as Record<string, unknown>).tipsLevel,
              )}`,
            },
            {
              role: "user",
              content: `HER WEEK — these figures are final, use them verbatim:\n${JSON.stringify(
                week,
              )}\n\nHer profile (characteristics, current style, goal, challenges, areas of concern):\n${JSON.stringify(
                {
                  hairProfile: context.hairProfile ?? null,
                  currentStyle: context.currentStyle ?? null,
                  currentGoal: context.currentGoal ?? null,
                  challenges: context.challenges ?? [],
                  sensitivities: context.sensitivities ?? null,
                },
              )}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (aiRes.status === 429) return json(429, { error: "Rate limited, please retry" });
    if (aiRes.status === 402) return json(402, { error: "AI credits exhausted" });
    if (!aiRes.ok) {
      console.error("daily-pattern-tip gateway failed", aiRes.status, (await aiRes.text()).slice(0, 200));
      return json(502, { error: "AI request failed" });
    }

    const aiJson = await aiRes.json();
    let parsed: Partial<WeekPayload> = {};
    try {
      parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const payload = (await sanitiseAndLog(
      {
        headline: (parsed.headline ?? "").toString().trim(),
        pattern: (parsed.pattern ?? "").toString().trim(),
        next_step: (parsed.next_step ?? "").toString().trim(),
      },
      "daily-pattern-tip",
      { context },
    )) as WeekPayload;

    // Only a complete card is ever cached or served.
    if (!complete(payload)) return json(502, { error: "AI returned an incomplete card" });

    const stored = await writeSurfaceCache(admin, user.id, CACHE_KIND, sig, payload, {
      _manuscript_grounded: grounding.grounded,
    });

    return json(200, { tip: stored, _cached: false });
  } catch (e) {
    console.error("daily-pattern-tip error", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
