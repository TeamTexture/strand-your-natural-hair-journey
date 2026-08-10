import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { resolveBrandProductLink } from "@/lib/brandProductResolve";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import { currentProfileHash } from "@/lib/profileSnapshot";
import { toast } from "sonner";

export interface ResolvedPlanProduct {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
}

/**
 * Adds a product to a treatment plan from a pasted product link.
 *
 * The link is analysed with the same pipeline the shelf uses, the product lands
 * on the member's shelf, and the resolved row is handed back so the plan can
 * reference it. Nothing navigates away — the member stays in the plan builder.
 */
export function usePlanProductLink() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const resolveLink = useCallback(
    async (rawUrl: string): Promise<ResolvedPlanProduct | null> => {
      if (!user) {
        toast.error("Please sign in");
        return null;
      }
      let url = rawUrl.trim();
      if (!url) {
        toast.error("Paste a product link first");
        return null;
      }
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        new URL(url);
      } catch {
        toast.error("That doesn't look like a valid web link.");
        return null;
      }

      setBusy(true);
      try {
        const context = await buildAiContext();
        const currentHash = currentProfileHash(context);

        const { data: existingRow } = await supabase
          .from("user_products")
          .select("*")
          .eq("user_id", user.id)
          .eq("source_url", url)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = existingRow as any;

        if (row && row.analysis_profile_snapshot_hash === currentHash) {
          return {
            id: row.id,
            name: row.name,
            brand: row.brand ?? null,
            image_url: row.image_url ?? null,
          };
        }

        const { data, error } = await supabase.functions.invoke("product-analyse-url", {
          body: { url, context },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const remoteImage =
          (data?._source_image_url as string | undefined) ??
          (data?.image_url as string | undefined) ??
          null;
        const safeImage =
          remoteImage && remoteImage.startsWith("http://")
            ? "https://" + remoteImage.slice("http://".length)
            : remoteImage;
        const saveFields = buildProductSaveFields(data ?? {});

        if (row) {
          const { error: updErr } = await supabase
            .from("user_products")
            .update({
              ...saveFields,
              image_url: safeImage,
              source_url: url,
              ingredients_source: row.linked_brand_product_id ? "brand" : "link",
              analysis_profile_snapshot_hash: currentHash,
              analysis_generated_at: new Date().toISOString(),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
            .eq("id", row.id);
          if (updErr) throw updErr;
          return {
            id: row.id,
            name: saveFields.name,
            brand: saveFields.brand ?? null,
            image_url: safeImage ?? null,
          };
        }

        const brandLink = await resolveBrandProductLink({
          name: saveFields.name,
          brand: saveFields.brand ?? null,
          kind: "product",
        });
        const { data: inserted, error: insErr } = await supabase
          .from("user_products")
          .upsert(
            {
              user_id: user.id,
              product_key: `link-${Date.now()}`,
              ...saveFields,
              ingredients_source: brandLink ? "brand" : "link",
              linked_brand_product_id: brandLink?.brand_product_id ?? null,
              image_url: safeImage,
              source_url: url,
              analysis_profile_snapshot_hash: currentHash,
              analysis_generated_at: new Date().toISOString(),
              on_shelf: true,
              added_to_shelf_at: new Date().toISOString(),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            { onConflict: "user_id,product_key" },
          )
          .select("id")
          .single();
        if (insErr) throw insErr;
        if (!inserted?.id) throw new Error("Couldn't save that product");

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("user-products-updated"));
        }
        return {
          id: inserted.id,
          name: saveFields.name,
          brand: saveFields.brand ?? null,
          image_url: safeImage ?? null,
        };
      } catch (e) {
        console.error("plan product link failed", e);
        toast.error("Couldn't read that link. Try again, or type the product in.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [user],
  );

  return { resolveLink, busy };
}
