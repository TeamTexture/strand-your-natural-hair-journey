// PHASE B STARTER (2026-09-04).
//
// Phase A (`product-label-read`) returns the identified product and its printed
// ingredient panel in a few seconds. This endpoint starts the real analysis and
// returns immediately, so the member's request is NEVER the thing holding the
// analysis open: if she closes the app, changes screen or loses signal, the work
// carries on in its own invocation and the result is written for her to find.
//
// It does not analyse anything itself. It:
//   1. records a job row so the product page can say honestly what is happening,
//   2. fires `ingredient-analysis` server-to-server (service-role + backfillUserId
//      — the same trusted path the repair job already uses), keeping every lock
//      in place: manuscript grounding, sanitiser, citation log, closed
//      vocabulary, relationship checks, caution bar, scoring,
//   3. writes the job outcome so a failure surfaces as a retry instead of a
//      silent blank.
//
// The job row lives in `ai_summaries` under kind `analysis_job:<productKey>`,
// which already has per-member RLS — no schema change.

import { json, preflight } from "../_shared/cors.ts";
import { requireEntitledUser } from "../_shared/entitlement.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

/** A single analysis invocation gets a generous ceiling; it runs alone. */
const ANALYSIS_TIMEOUT_MS = 300_000;
/** A job left "running" longer than this is treated as dead and restartable. */
const STALE_AFTER_MS = 6 * 60_000;

export const jobKind = (productKey: string) => `analysis_job:${productKey}`;

interface Body {
  productKey?: string;
  /** Set by an explicit member tap on Retry. */
  force?: boolean;
}

interface JobPayload {
  status: "running" | "complete" | "failed";
  started_at: string;
  finished_at?: string | null;
  ingredient_count?: number;
  attempts?: number;
  error?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const auth = await requireEntitledUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { message: "Invalid request body", code: "bad_request" });
  }
  const productKey = (body.productKey ?? "").trim();
  if (!productKey) return json(400, { message: "Missing product", code: "missing_product_key" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const kind = jobKind(productKey);

  // Never start a second worker for work already in flight — that is how a
  // member ends up paying twice for one scan and how results race each other.
  const { data: existing } = await admin
    .from("ai_summaries")
    .select("payload, updated_at, created_at")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  const prev = (existing?.payload ?? null) as JobPayload | null;
  const prevAt = Date.parse(
    (existing as { updated_at?: string; created_at?: string } | null)?.updated_at ??
      (existing as { created_at?: string } | null)?.created_at ??
      prev?.started_at ??
      "",
  );
  const prevIsFresh = Number.isFinite(prevAt) && Date.now() - prevAt < STALE_AFTER_MS;
  if (!body.force && prev?.status === "running" && prevIsFresh) {
    return json(202, { status: "running", already_running: true });
  }

  // The analysis reads everything it needs from her saved row, so the product
  // must be persisted before Phase B starts.
  const { data: prodRow } = await admin
    .from("user_products")
    .select("id, product_key, name, brand, category, ingredients, application_area, leave_on, usage_instructions")
    .eq("user_id", user.id)
    .eq("product_key", productKey)
    .maybeSingle();
  const product = prodRow as {
    id: string;
    product_key: string | null;
    name: string | null;
    brand: string | null;
    category: string | null;
    ingredients: unknown;
    application_area: string | null;
    leave_on: boolean | null;
    usage_instructions: string | null;
  } | null;

  if (!product) return json(404, { message: "That product isn't saved yet.", code: "product_not_found" });
  const ingredients = Array.isArray(product.ingredients)
    ? (product.ingredients as unknown[]).filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    : [];
  if (ingredients.length < 2) {
    return json(422, {
      message: "We couldn't read enough of the ingredient panel to analyse this one.",
      code: "no_ingredients",
    });
  }

  const attempts = (prev?.attempts ?? 0) + 1;
  const writeJob = async (payload: JobPayload) => {
    await admin
      .from("ai_summaries")
      .upsert(
        { user_id: user.id, kind, payload: payload as unknown as Record<string, unknown> },
        { onConflict: "user_id,kind" },
      );
  };

  await writeJob({
    status: "running",
    started_at: new Date().toISOString(),
    ingredient_count: ingredients.length,
    attempts,
    error: null,
  });

  const [{ data: hair }, { data: goals }, { data: style }, { data: profile }] = await Promise.all([
    admin.from("user_hair_profile").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("user_goals").select("kind, title, challenges, target_text, status").eq("user_id", user.id).limit(6),
    admin.from("user_style_profile").select("default_style, planned_next_style").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("tips_level").eq("user_id", user.id).maybeSingle(),
  ]);

  const tipsLevel = (profile as { tips_level?: number | null } | null)?.tips_level ?? 2;
  const payload = {
    backfillUserId: user.id,
    force: !!body.force,
    productKey,
    productName: product.name ?? "Saved product",
    productBrand: product.brand ?? "",
    ingredients,
    category: product.category,
    applicationArea: product.application_area,
    leaveOn: product.leave_on,
    usageInstructions: product.usage_instructions,
    hairProfile: (hair ?? {}) as Record<string, unknown>,
    goals: (goals ?? []) as Array<Record<string, unknown>>,
    currentStyle: (style ?? null) as Record<string, unknown> | null,
    context: {
      hairProfile: (hair ?? {}) as Record<string, unknown>,
      goals: (goals ?? []) as Array<Record<string, unknown>>,
      currentStyle: (style ?? null) as Record<string, unknown> | null,
      tipsLevel,
    },
    tipsLevel,
  };

  const run = async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${url}/functions/v1/ingredient-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      });
      const ok = res.ok;
      const detail = ok ? "" : (await res.text()).slice(0, 400);
      console.log(JSON.stringify({
        function: "product-analysis-start",
        event: "phase_b_finished",
        product_key: productKey,
        status: res.status,
        elapsed_ms: Date.now() - t0,
      }));
      await writeJob({
        status: ok ? "complete" : "failed",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        ingredient_count: ingredients.length,
        attempts,
        error: ok ? null : `analysis_${res.status}: ${detail}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[product-analysis-start] phase B threw", msg);
      await writeJob({
        status: "failed",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        ingredient_count: ingredients.length,
        attempts,
        error: msg.slice(0, 400),
      });
    }
  };

  // Keep the worker alive for the background call after the response is sent.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(run());
  else void run();

  return json(202, { status: "running", ingredient_count: ingredients.length });
});
