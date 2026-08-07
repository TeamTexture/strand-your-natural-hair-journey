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
}

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

const cacheKind = (productId: string, fingerprint: string) =>
  `brand_product_guidance_v3:${productId}:${fingerprint}`;

/** In-memory guard so two surfaces mounting at once don't both generate. */
const inflight = new Map<string, Promise<BrandGuidance | null>>();

async function loadGuidance(
  userId: string,
  product: BrandGuidanceProduct,
): Promise<BrandGuidance | null> {
  const context = (await sharedContext(userId)) as unknown as Record<string, unknown>;
  const kind = cacheKind(product.id, fingerprintContext(context));

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
    if (cachedPayload && Array.isArray(cachedPayload.benefits)) return cachedPayload;

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

/** Personalised guidance for one ad product. Set `enabled` false to hold off
 *  generation until the member actually engages (e.g. expands a banner). */
export function useBrandProductGuidance(
  product: BrandGuidanceProduct | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  const { enabled = true } = opts;
  const { user } = useAuth();
  const [guidance, setGuidance] = useState<BrandGuidance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !product?.id || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    loadGuidance(user.id, product)
      .then((g) => {
        if (!cancelled && g) setGuidance(g);
      })
      .catch(() => {
        /* Silent — the advert still renders without the personalised line. */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, product?.id, user?.id]);

  return { guidance, loading };
}
