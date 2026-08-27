// Personalised guidance for a product attached to a paid ad campaign.
//
// One shared source for every ad surface: the banner drop-down, the offer page
// product rows and the full brand product page all read the same cached
// payload, so a member sees the SAME personalised reasoning wherever the
// advert appears.
//
// Caching: `ai_summaries` keyed by product + a fingerprint of the profile data
// the guidance is actually reasoned from (hair, style, goals, health flags,
// tips level). When the member's hair data changes the fingerprint changes and
// the guidance is regenerated — a cached payload is never allowed to describe
// a profile the member no longer has.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import type { BenefitRow } from "@/components/guidance/BenefitRows";

export interface BrandGuidance {
  headline: string;
  /** One-line, hair-specific hook shown on the advert itself. */
  fit_line?: string;
  intro: string;
  benefits: BenefitRow[];
  steps: string[];
  /** Factual "be aware of" notes — 0-2 items, educational not alarmist. */
  watch_outs?: string[];
  /** WASH DAY SURFACE ONLY. The whole sponsored tip body — at most two
   *  sentences and 45 words, enforced server-side. */
  wash_day_tip?: string;
}

/** Which surface the guidance is written for. `wash_day` asks for the read to
 *  be framed around the member's NEXT wash day. */
export type GuidanceSurface = "product" | "wash_day";

export interface BrandGuidanceProduct {
  id: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  kind?: string | null;
  tool_kind?: string | null;
  external_url?: string | null;
  ingredients?: string[] | null;
  key_features?: string[] | null;
  materials?: string[] | null;
}

/** buildAiContext hits several tables — share one build per page load so a
 *  list of offer products doesn't repeat the same queries per row. */
let contextPromise: Promise<Awaited<ReturnType<typeof buildAiContext>>> | null = null;
let contextPromiseUser: string | null = null;

function sharedContext(userId: string) {
  if (!contextPromise || contextPromiseUser !== userId) {
    contextPromiseUser = userId;
    contextPromise = buildAiContext();
  }
  return contextPromise;
}

function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Hash of only the context slices the guidance reasons from. */
function fingerprintContext(context: Record<string, unknown>): string {
  const pick = [
    "hairProfile",
    "currentStyle",
    "styleProfile",
    "healthProfile",
    "goals",
    "tipsLevel",
  ];
  const slice: Record<string, unknown> = {};
  for (const k of pick) if (k in context) slice[k] = context[k];
  return djb2Hex(JSON.stringify(slice));
}

// The wash day (sponsored tip) surface is PRE-GENERATED in the background when
// a campaign is approved, so its key must be computable server-side: it carries
// no client-side context fingerprint. Invalidation is a database trigger that
// drops these rows when the member's hair, style or goals change. Every other
// surface keeps the fingerprinted key.
const cacheKind = (productId: string, fingerprint: string, surface: string) =>
  surface === "wash_day"
    ? `brand_wash_tip_v1:${productId}`
    : `brand_product_guidance_v10:${surface}:${productId}:${fingerprint}`;


/** STALE-FIRST. When the member changes their hair, style or goals every
 *  fingerprinted key misses at once, and regeneration takes tens of seconds. So
 *  we read the most recent guidance previously generated for this product and
 *  surface — whatever profile it was written against — and render it straight
 *  away while the fresh one is generated in the background. Guidance the member
 *  has already seen is a far better holding state than a spinner. */
const stalePrefix = (productId: string, surface: string) =>
  surface === "wash_day"
    ? `brand_wash_tip_v1:${productId}`
    : `brand_product_guidance_v10:${surface}:${productId}:`;

async function readStaleGuidance(
  userId: string,
  productId: string,
  surface: string,
): Promise<BrandGuidance | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("payload")
    .eq("user_id", userId)
    .like("kind", `${stalePrefix(productId, surface)}%`)
    .order("updated_at", { ascending: false })
    .limit(1);
  const p = data?.[0]?.payload as unknown as BrandGuidance | null;
  if (!p) return null;
  if (surface === "wash_day") return p.wash_day_tip ? p : null;
  return Array.isArray(p.benefits) || p.wash_day_tip ? p : null;
}

/** In-memory guard so two surfaces mounting at once don't both generate. */
const inflight = new Map<string, Promise<BrandGuidance | null>>();

async function loadGuidance(
  userId: string,
  product: BrandGuidanceProduct,
  surface: GuidanceSurface,
): Promise<BrandGuidance | null> {
  // FAST PATH. The wash day key needs no context, so the pre-generated tip is a
  // single indexed read — buildAiContext (several tables) only runs on a miss.
  if (surface === "wash_day") {
    const kind = cacheKind(product.id, "", surface);
    const { data: pre } = await supabase
      .from("ai_summaries")
      .select("payload")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    const p = pre?.payload as unknown as BrandGuidance | null;
    if (p?.wash_day_tip) return p;
  }

  const context = (await sharedContext(userId)) as unknown as Record<string, unknown>;
  const kind = cacheKind(product.id, fingerprintContext(context), surface);

  const existing = inflight.get(kind);
  if (existing) return existing;

  const run = (async (): Promise<BrandGuidance | null> => {
    const { data: cached } = await supabase
      .from("ai_summaries")
      .select("payload")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    const cachedPayload = cached?.payload as unknown as BrandGuidance | null;
    // The wash day surface returns a single tip body and no benefit rows, so a
    // cached payload is valid if it carries either shape.
    if (cachedPayload && (Array.isArray(cachedPayload.benefits) || cachedPayload.wash_day_tip))
      return cachedPayload;


    const { data: res, error } = await supabase.functions.invoke("brand-product-guidance", {
      body: {
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand ?? null,
          description: product.description ?? null,
          kind: product.kind ?? null,
          tool_kind: product.tool_kind ?? null,
          external_url: product.external_url ?? null,
          ingredients: product.ingredients ?? [],
          key_features: product.key_features ?? [],
          materials: product.materials ?? [],
        },
        context,
        surface,
      },
    });
    if (error) throw error;
    if (res?.error) throw new Error(String(res.error));
    const g = res?.guidance as BrandGuidance | undefined;
    if (!g) return null;

    await supabase.from("ai_summaries").upsert(
      {
        user_id: userId,
        kind,
        payload: g as unknown as Record<string, unknown>,
      } as never,
      { onConflict: "user_id,kind" },
    );
    return g;
  })();

  inflight.set(kind, run);
  try {
    return await run;
  } finally {
    // Keep the resolved promise briefly so simultaneous mounts share it, then
    // drop it so a later profile change can regenerate.
    setTimeout(() => inflight.delete(kind), 30_000);
  }
}

/** WARM THE CACHE. Sponsored wash day tips take tens of seconds to generate on
 *  demand (manuscript retrieval + two model stages), so a member who was not
 *  covered by approval-time pre-generation used to sit watching a spinner. This
 *  starts that work in the background from an earlier screen, so opening Wash
 *  Day is a cache read. Fire and forget — errors are ignored. */
export function warmBrandProductGuidance(
  userId: string,
  product: BrandGuidanceProduct,
  surface: GuidanceSurface = "wash_day",
) {
  void loadGuidance(userId, product, surface).catch(() => null);
}

/** HARD SPINNER CEILING. Generation involves manuscript retrieval plus a
 *  reasoning model and legitimately takes tens of seconds; a rejected first
 *  attempt doubles that. An advert is not allowed to sit spinning for that
 *  long, so the spinner stops here and the surface shows the brand's own
 *  declared usage copy instead. The generation is NOT cancelled — when it
 *  lands (this render or a later visit, via the cache) the personalised line
 *  replaces the fallback. */
const GUIDANCE_SPINNER_MS = 12_000;

/** Personalised guidance for one ad product. Set `enabled` false to hold off
 *  generation until the member actually engages (e.g. expands a banner).
 *
 *  `timedOut` is true once the spinner ceiling is passed with nothing to show —
 *  the caller must render generic copy (see `adFallbackFitLine`) rather than an
 *  empty slot, because this text carries paid campaigns. */

export function useBrandProductGuidance(
  product: BrandGuidanceProduct | null | undefined,
  opts: { enabled?: boolean; surface?: GuidanceSurface } = {},
) {
  const { enabled = true, surface = "product" } = opts;
  const { user } = useAuth();
  const [guidance, setGuidance] = useState<BrandGuidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!enabled || !product?.id || !user?.id) return;
    let cancelled = false;
    let settled = false;
    setLoading(true);
    setTimedOut(false);
    // Stop the spinner even if nothing ever comes back. Deliberately a state
    // flip and not an abort: the request keeps running and populates the cache,
    // so a later view is instant.
    const timer = window.setTimeout(() => {
      if (cancelled || settled) return;
      setLoading(false);
      setTimedOut(true);
    }, GUIDANCE_SPINNER_MS);
    // Paint the previously generated guidance immediately if this profile
    // fingerprint has not been generated yet (e.g. she just changed her style).
    void readStaleGuidance(user.id, product.id, surface)
      .then((stale) => {
        if (!cancelled && !settled && stale) {
          setGuidance(stale);
          setLoading(false);
          setTimedOut(false);
        }
      })
      .catch(() => null);
    loadGuidance(user.id, product, surface)
      .then((g) => {
        settled = true;
        if (!cancelled && g) {
          setGuidance(g);
          setTimedOut(false);
        }
      })
      .catch(() => {
        /* Silent — the surface falls back to generic usage copy. */
      })
      .finally(() => {
        settled = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, product?.id, user?.id, surface]);

  // The surface has nothing personalised to show and is no longer waiting.
  const needsFallback = !guidance?.fit_line && !loading;

  return { guidance, loading, timedOut, needsFallback };

}
