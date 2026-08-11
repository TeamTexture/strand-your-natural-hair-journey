// PRE-GENERATED SPONSORED WASH DAY TIPS
// =====================================
// 2026-08-09, at the author's instruction. Sponsored tips are keyed to
// (member × product), and that set is knowable the moment a campaign is
// approved: the matched audience is already resolved by `ad_match_users`.
//
// So we generate them here, in the background, at approval — and serving becomes
// a single indexed read of `ai_summaries` (see src/hooks/useBrandProductGuidance
// fast path). On-demand generation still exists for a member who becomes
// eligible later (for instance by granting personalised-offers consent after
// approval), but it is now the exception rather than the normal path.
//
// Called by the admin approval / make-live flow with the offer id. Returns
// immediately; the generation loop runs in the background.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAdminOrService } from "../_shared/auth.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const CACHE_KIND = (productId: string) => `brand_wash_tip_v1:${productId}`;

/** Hard ceiling per run so one broad campaign cannot exhaust AI credits. */
const MAX_MEMBERS = 400;
/** Small concurrency: the gateway is the bottleneck, not us. */
const CONCURRENCY = 4;

interface Product {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  kind: string | null;
  tool_kind: string | null;
  external_url: string | null;
  ingredients: string[] | null;
  key_features: string[] | null;
  materials: string[] | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Up to 400 AI generations per run: admin approval flow or trusted
  // server-to-server callers (the Stripe webhook) only.
  const caller = await requireAdminOrService(req);
  if (caller instanceof Response) return caller;



  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) {
    return new Response(JSON.stringify({ error: "supabase env missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let offerId = "";
  try {
    offerId = String(((await req.json()) as { offer_id?: string })?.offer_id ?? "").trim();
  } catch {
    /* handled below */
  }
  if (!offerId) {
    return new Response(JSON.stringify({ error: "offer_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // @ts-ignore Deno-native URL import
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  const admin = createClient(url, svc, { auth: { persistSession: false } });

  // The advert's products (1-2 per campaign).
  const { data: links } = await admin
    .from("brand_offer_products")
    .select("brand_product_id")
    .eq("offer_id", offerId);
  const productIds = (links ?? [])
    .map((l: { brand_product_id: string | null }) => l.brand_product_id)
    .filter(Boolean) as string[];
  if (!productIds.length) {
    return new Response(JSON.stringify({ scheduled: 0, reason: "no products attached" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: productRows } = await admin
    .from("brand_products")
    .select(
      "id, name, description, kind, tool_kind, external_url, ingredients, key_features, materials, brand_user_id",
    )
    .in("id", productIds);
  // Brand display name lives on brand_profiles, not on the product row.
  const brandUserIds = [
    ...new Set(
      (productRows ?? [])
        .map((p: Record<string, unknown>) => String(p.brand_user_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const brandNames = new Map<string, string>();
  if (brandUserIds.length) {
    const { data: bp } = await admin
      .from("brand_profiles")
      .select("user_id, brand_name")
      .in("user_id", brandUserIds);
    for (const b of (bp ?? []) as Array<{ user_id: string; brand_name: string | null }>) {
      if (b.brand_name) brandNames.set(b.user_id, b.brand_name);
    }
  }

  const products: Product[] = (productRows ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id),
    name: String(p.name ?? ""),
    brand: brandNames.get(String(p.brand_user_id ?? "")) ?? null,
    description: (p.description as string) ?? null,
    kind: (p.kind as string) ?? null,
    tool_kind: (p.tool_kind as string) ?? null,
    external_url: (p.external_url as string) ?? null,
    ingredients: (p.ingredients as string[]) ?? null,
    key_features: (p.key_features as string[]) ?? null,
    materials: (p.materials as string[]) ?? null,
  }));

  // THE AUDIENCE. A targeted campaign resolves through `ad_match_users`; an
  // untargeted (broad) campaign reaches every consenting member, so we
  // pre-generate for the consenting members who have hair data to personalise
  // against, newest first, bounded by MAX_MEMBERS.
  const { data: rules } = await admin.rpc("ad_offer_rules", { _offer_id: offerId });
  let memberIds: string[] = [];
  const hasTargeting = rules && Object.keys(rules as Record<string, unknown>).length > 0;
  if (hasTargeting) {
    const { data: matched } = await admin.rpc("ad_match_users", { _rules: rules });
    memberIds = (matched ?? [])
      .map((m: { user_id: string }) => m.user_id)
      .slice(0, MAX_MEMBERS);
  } else {
    const { data: broad } = await admin
      .from("profiles")
      .select("user_id")
      .eq("personalised_offers_consent", true)
      .neq("access_restricted", true)
      .limit(MAX_MEMBERS);
    memberIds = (broad ?? []).map((p: { user_id: string }) => p.user_id);
  }

  const jobs: Array<{ userId: string; product: Product }> = [];
  for (const userId of memberIds) for (const product of products) jobs.push({ userId, product });

  const started = Date.now();

  /** Server-side member context — the same slices the client sends. */
  async function contextFor(userId: string): Promise<Record<string, unknown>> {
    const [hair, style, goals, blood, prof] = await Promise.all([
      admin.from("user_hair_profile").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("user_style_profile").select("*").eq("user_id", userId).maybeSingle(),
      admin
        .from("user_goals")
        .select("title, kind, challenges, status")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(5),
      admin.from("blood_results").select("marker, status").eq("user_id", userId),
      admin.from("profiles").select("tips_level").eq("user_id", userId).maybeSingle(),
    ]);
    const goalRows = (goals.data ?? []) as Array<Record<string, unknown>>;
    return {
      hairProfile: hair.data ?? null,
      currentStyle: style.data ?? null,
      goals: goalRows.map((g) => ({ title: g.title, kind: g.kind })),
      challenges: goalRows.flatMap((g) => (Array.isArray(g.challenges) ? g.challenges : [])),
      bloodFlags: (blood.data ?? [])
        .filter((b: { status: string | null }) => b.status && b.status.toLowerCase() !== "normal")
        .map((b: { marker: string; status: string | null }) => ({
          marker: b.marker,
          status: b.status,
        })),
      tipsLevel: (prof.data as { tips_level?: number } | null)?.tips_level ?? 2,
    };
  }

  async function generate(job: { userId: string; product: Product }): Promise<boolean> {
    const kind = CACHE_KIND(job.product.id);
    const { data: existing } = await admin
      .from("ai_summaries")
      .select("id")
      .eq("user_id", job.userId)
      .eq("kind", kind)
      .maybeSingle();
    if (existing) return false; // already pre-generated and still valid

    const context = await contextFor(job.userId);
    const res = await fetch(`${url}/functions/v1/brand-product-guidance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}` },
      body: JSON.stringify({
        product: job.product,
        context,
        surface: "wash_day",
        pregen_user_id: job.userId,
      }),
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as { guidance?: { wash_day_tip?: string } | null };
    const tip = payload?.guidance?.wash_day_tip;
    if (!tip) return false;
    await admin
      .from("ai_summaries")
      .upsert(
        { user_id: job.userId, kind, payload: payload.guidance },
        { onConflict: "user_id,kind" },
      );
    return true;
  }

  // Fire and forget: the admin flow must not wait on hundreds of generations.
  const work = (async () => {
    let written = 0;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const done = await Promise.all(
        batch.map((j) => generate(j).catch(() => false)),
      );
      written += done.filter(Boolean).length;
    }
    console.log(
      JSON.stringify({
        event: "sponsored_tips_pregenerated",
        offer_id: offerId,
        members: memberIds.length,
        products: products.length,
        jobs: jobs.length,
        written,
        ms: Date.now() - started,
      }),
    );
  })();
  // @ts-ignore Deno Deploy keeps the isolate alive for this promise.
  if (typeof (globalThis as { addEventListener?: unknown }).addEventListener === "function") {
    try {
      // deno-lint-ignore no-explicit-any
      (Deno as any).unrefTimer?.(0);
    } catch { /* noop */ }
  }
  // EdgeRuntime.waitUntil keeps the background loop running after the response.
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  } catch { /* noop */ }

  return new Response(
    JSON.stringify({ scheduled: jobs.length, members: memberIds.length, products: products.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
