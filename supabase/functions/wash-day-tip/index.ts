// wash-day-tip — generates a personalised wash-day tip for the user based on
// their hair profile, health/blood signals, goals and current style.
//
// Cached per user in ai_summaries with a stable fingerprint so the tip stays
// the same until the underlying data actually changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { STRAND_PERSONA_WITH_RULES } from "../_shared/strand-persona.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MODEL_VERSION = "wash-tip@v1";

interface TipPayload {
  headline: string;
  why: string;
  technique: string;
  fingerprint: string;
  _model_version: string;
}

interface Body {
  fingerprint: string;
  hairProfile?: Record<string, unknown> | null;
  healthProfile?: Record<string, unknown> | null;
  goals?: Array<{ title?: string; category?: string }>;
  currentStyle?: Record<string, unknown> | null;
  bloodFlags?: Array<{ marker: string; status?: string; value?: number | null }>;
  hasWashHistory?: boolean;
}

const SYSTEM = `${STRAND_PERSONA_WITH_RULES}

TASK — Produce ONE personalised wash-day tip for this specific user, grounded in the STRAND manuscript teachings and the user's live data (hair profile, health signals, blood flags, goals, current style). This is the tip that will show on their Wash Day screen until their data changes.

OUTPUT — JSON object only, no prose outside it:
{
  "headline": string,   // 3-7 words, Title Case, no trailing punctuation. Names the WHOLE tip.
  "why": string,        // 2-3 sentences. Ties the tip to THIS user's data (name a specific trait, marker, or goal). No filler.
  "technique": string   // 1-2 sentences. The concrete "how" — sequence, product type, tool, timing.
}

RULES:
- Do NOT invent user data. If a slice is missing, ground the tip in what IS present.
- If bloodFlags include ferritin/iron/vitD-low, connect wash-day scalp care to the regrowth environment.
- If hair porosity is high, lead with sealing/moisture-lock; if low, lead with clarifying/heat-assisted penetration.
- Never prescribe pre-poo as a scheduled ritual. Never say "use protein weekly". Never recommend shower caps, plastic caps, warm towels, or steamers — the only heat tool referenced is the TT Heat Hat (teamtexture.co.uk).
- Never contradict the Chapter 13 wash-day protocol (cleanse scalp → cleanse hair → condition).
- No book/chapter citations. No emojis. No pleasantries.
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY missing" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { error: "unauthenticated" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  if (!body?.fingerprint) return json(400, { error: "fingerprint required" });

  const kind = "wash_day_tip";

  // Cache check — same fingerprint = same tip.
  const { data: cached } = await admin
    .from("ai_summaries")
    .select("payload")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  const cachedPayload = cached?.payload as TipPayload | null;
  if (
    cachedPayload &&
    cachedPayload.fingerprint === body.fingerprint &&
    cachedPayload._model_version === MODEL_VERSION
  ) {
    return json(200, { tip: cachedPayload, cached: true });
  }

  // Build a compact context blob for the model.
  const contextBlock = {
    hairProfile: body.hairProfile ?? null,
    healthProfile: body.healthProfile ?? null,
    currentStyle: body.currentStyle ?? null,
    goals: (body.goals ?? []).slice(0, 5),
    bloodFlags: (body.bloodFlags ?? []).slice(0, 8),
    hasWashHistory: body.hasWashHistory ?? false,
  };

  let aiResp: Response;
  try {
    aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `User data (JSON):\n${JSON.stringify(contextBlock)}\n\nReturn the tip JSON now.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    console.error("[wash-day-tip] gateway fetch failed:", err);
    return json(502, { error: "ai gateway unreachable" });
  }
  if (!aiResp.ok) {
    const text = await aiResp.text().catch(() => "");
    console.error("[wash-day-tip] gateway error:", aiResp.status, text);
    if (aiResp.status === 429) return json(429, { error: "rate_limited" });
    if (aiResp.status === 402) return json(402, { error: "credits_exhausted" });
    return json(502, { error: "ai gateway error" });
  }

  const j = await aiResp.json();
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { headline?: string; why?: string; technique?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(502, { error: "invalid model output" });
  }
  if (!parsed?.headline || !parsed?.why) {
    return json(502, { error: "invalid model output" });
  }

  const payload: TipPayload = {
    headline: String(parsed.headline).trim(),
    why: String(parsed.why).trim(),
    technique: String(parsed.technique ?? "").trim(),
    fingerprint: body.fingerprint,
    _model_version: MODEL_VERSION,
  };

  await admin
    .from("ai_summaries")
    .upsert(
      { user_id: user.id, kind, payload },
      { onConflict: "user_id,kind" },
    );

  return json(200, { tip: payload, cached: false });
});
