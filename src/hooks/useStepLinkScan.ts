import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { resolveBrandProductLink } from "@/lib/brandProductResolve";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import { currentProfileHash } from "@/lib/profileSnapshot";
import { uuid } from "@/lib/uuid";
import {
  addPendingStepProduct,
  markPendingStepProductFailed,
  removePendingStepProduct,
} from "@/lib/pendingStepProducts";
import { toast } from "sonner";

/**
 * Adds a product to a style record step from a pasted link, in the background.
 *
 * Unlike the shelf link flow this never navigates away: the member stays in the
 * style record, a placeholder tile shows the analysis progressing, and the
 * finished product attaches itself to the step. Leaving the screen is safe —
 * the work continues and the step is updated when it lands.
 */
export function useStepLinkScan() {
  const { user } = useAuth();

  const startStepLinkScan = useCallback(
    async (
      rawUrl: string,
      opts: {
        entryId: string;
        stepId: string;
        stepNumber: number;
        onAttached?: () => void;
      },
    ) => {
      if (!user) { toast.error("Please sign in"); return; }
      let normalised = rawUrl.trim();
      if (!normalised) { toast.error("Paste a product link first"); return; }
      if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
      try { new URL(normalised); } catch {
        toast.error("That doesn't look like a valid web link.");
        return;
      }

      let label = normalised;
      try { label = new URL(normalised).hostname.replace(/^www\./, ""); } catch { /* keep url */ }

      const pendingId = uuid();
      addPendingStepProduct({
        id: pendingId,
        entryId: opts.entryId,
        stepId: opts.stepId,
        stepNumber: opts.stepNumber,
        url: normalised,
        label,
        startedAt: Date.now(),
      });
      toast.success("Analysing that product — you can carry on or come back later.");

      try {
        const context = await buildAiContext();
        const currentHash = currentProfileHash(context);

        const { data: existingRow } = await supabase
          .from("user_products")
          .select("*")
          .eq("user_id", user.id)
          .eq("source_url", normalised)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = existingRow as any;

        let productId: string | null = row?.id ?? null;

        if (!row || row.analysis_profile_snapshot_hash !== currentHash) {
          const { data, error } = await supabase.functions.invoke("product-analyse-url", {
            body: { url: normalised, context },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          const remoteImage =
            (data?._source_image_url as string | undefined) ??
            (data?.image_url as string | undefined) ??
            null;
          const safeImage = remoteImage && remoteImage.startsWith("http://")
            ? "https://" + remoteImage.slice("http://".length)
            : remoteImage;
          const saveFields = buildProductSaveFields(data ?? {});

          if (row) {
            const { error: updErr } = await supabase
              .from("user_products")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({
                ...saveFields,
                image_url: safeImage,
                source_url: normalised,
                ingredients_source: row.linked_brand_product_id ? "brand" : "link",
                analysis_profile_snapshot_hash: currentHash,
                analysis_generated_at: new Date().toISOString(),
              } as any)
              .eq("id", row.id);
            if (updErr) throw updErr;
            productId = row.id;
          } else {
            const brandLink = await resolveBrandProductLink({
              name: saveFields.name,
              brand: saveFields.brand ?? null,
              kind: "product",
            });
            const { data: inserted, error: insErr } = await supabase
              .from("user_products")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .upsert({
                user_id: user.id,
                product_key: `link-${Date.now()}`,
                ...saveFields,
                ingredients_source: brandLink ? "brand" : "link",
                linked_brand_product_id: brandLink?.brand_product_id ?? null,
                image_url: safeImage,
                source_url: normalised,
                analysis_profile_snapshot_hash: currentHash,
                analysis_generated_at: new Date().toISOString(),
                on_shelf: true,
                added_to_shelf_at: new Date().toISOString(),
              } as any, { onConflict: "user_id,product_key" })
              .select("id")
              .single();
            if (insErr) throw insErr;
            productId = inserted?.id ?? null;
          }
        }

        if (!productId) throw new Error("Couldn't save that product");

        const { data: already } = await supabase
          .from("journal_step_products")
          .select("id")
          .eq("step_id", opts.stepId)
          .eq("user_product_id", productId)
          .maybeSingle();
        if (!already) {
          const { error: linkErr } = await supabase
            .from("journal_step_products")
            .insert({ step_id: opts.stepId, user_product_id: productId });
          if (linkErr) throw linkErr;
        }

        removePendingStepProduct(pendingId);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("user-products-updated"));
        }
        opts.onAttached?.();
        toast.success("Product analysed and added to this step");
      } catch (e) {
        console.error("step link scan failed", e);
        markPendingStepProductFailed(pendingId);
        toast.error("Couldn't analyse that link. Tap the tile to try again.");
      }
    },
    [user],
  );

  return { startStepLinkScan };
}
