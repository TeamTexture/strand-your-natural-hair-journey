// Brand-side "paste a product link" — a thin wrapper around the SAME edge
// function the member link flow uses (`product-analyse-url`, invoked from
// src/hooks/useProductUrlScan.ts). There is deliberately no brand-specific
// scraper, image picker or URL parser: one implementation, one behaviour.
//
// The old `brand-product-scrape` function has been deleted. Do not reintroduce it.

import { supabase } from "@/integrations/supabase/client";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";

export interface BrandLinkScanResult {
  name: string;
  description: string;
  ingredients: string[];
  /** Hero image only — exactly what the member flow saves as `image_url`. */
  image_urls: string[];
  external_url: string;
}

/** Normalises a pasted link the same way the member flow does. */
export function normaliseProductUrl(raw: string): string | null {
  let normalised = raw.trim();
  if (!normalised) return null;
  if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
  try {
    new URL(normalised);
  } catch {
    return null;
  }
  return normalised;
}

/** The member flow's hero-image resolution, verbatim. */
export function heroImageFromAnalysis(data: unknown): string | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  const remote =
    (typeof raw._source_image_url === "string" ? raw._source_image_url : null) ??
    (typeof raw.image_url === "string" ? raw.image_url : null);
  if (!remote || !/^https?:\/\//i.test(remote)) return null;
  return remote.startsWith("http://") ? "https://" + remote.slice("http://".length) : remote;
}

export async function scanProductLink(url: string): Promise<BrandLinkScanResult> {
  const { data, error } = await supabase.functions.invoke("product-analyse-url", {
    body: { url },
  });
  if (error) throw error;
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }
  const fields = buildProductSaveFields(data ?? {}, "Untitled product", "brand_page");
  const hero = heroImageFromAnalysis(data);
  return {
    name: fields.name,
    description: fields.ai_summary ?? "",
    ingredients: fields.ingredients ?? [],
    image_urls: hero ? [hero] : [],
    external_url: url,
  };
}
