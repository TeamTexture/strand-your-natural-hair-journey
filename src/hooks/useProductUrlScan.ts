import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import { currentProfileHash } from "@/lib/profileSnapshot";
import { toast } from "sonner";

/** Adds a product from a pasted product-page URL. The edge function fetches
 * the page, extracts text, and asks the AI to return the same structured
 * analysis the photo flow returns — so we can route straight to the existing
 * detail screen.
 *
 * Re-scan caching: if the user already has a `user_products` row whose
 * `source_url` matches and whose `analysis_profile_snapshot_hash` matches
 * the current profile, we open the existing analysis without invoking the
 * edge function. If the profile has moved on, we re-analyse and overwrite
 * the row in place — preserving on_shelf / on_wishlist state.
 */
export function useProductUrlScan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const startUrlScan = async (
    rawUrl: string,
    intent: "shelf" | "wishlist" = "shelf",
    extras?: { auto_save?: boolean; returnTo?: string },
  ) => {
    if (!user) { toast.error("Please sign in"); return; }
    const url = rawUrl.trim();
    if (!url) { toast.error("Paste a product link first"); return; }
    let normalised = url;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try { new URL(normalised); } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    setBusy(true);
    try {
      const context = await buildAiContext();
      const currentHash = currentProfileHash(context);

      // Look for an existing row keyed by source_url for this user.
      const { data: existingRow } = await supabase
        .from("user_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*")
        .eq("user_id", user.id)
        .eq("source_url", normalised)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = existingRow as any;
      const decision = row
        ? (row.analysis_profile_snapshot_hash === currentHash ? "use_existing" : "re_analyse")
        : "fresh_scan";
      console.log("[scan-cache] decision", {
        existing_row_id: row?.id ?? null,
        existing_hash: row?.analysis_profile_snapshot_hash ?? null,
        current_hash: currentHash,
        decision,
      });

      // ── use_existing: skip the edge function, open what we have ───
      if (decision === "use_existing") {
        navigate(
          `/products/ingredient?key=${encodeURIComponent(row.product_key)}&name=${encodeURIComponent(row.name)}&brand=${encodeURIComponent(row.brand ?? "")}`,
          {
            replace: true,
            state: {
              storage_path: row.storage_path ?? null,
              preview_url: row.image_url ?? null,
              product_key: row.product_key,
              intent,
              source_url: normalised,
              auto_save: extras?.auto_save ?? false,
              returnTo: extras?.returnTo,
            },
          },
        );
        return;
      }

      // ── fresh_scan or re_analyse: invoke edge function ────────────
      const tStart = Date.now();
      console.log("[url-debug] client invoke start", { url: normalised });
      const { data, error } = await supabase.functions.invoke("product-analyse-url", {
        body: { url: normalised, context },
      });
      console.log("[url-debug] client invoke done", { ms: Date.now() - tStart });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const remoteImage =
        (data?._source_image_url as string | undefined) ??
        (data?.image_url as string | undefined) ??
        null;
      // Belt-and-braces http→https rewrite at the save site too. iOS
      // Safari blocks mixed-content images on https pages.
      const safeImage = remoteImage && remoteImage.startsWith("http://")
        ? "https://" + remoteImage.slice("http://".length)
        : remoteImage;

      const autoSave = extras?.auto_save === true;
      const saveFields = buildProductSaveFields(data ?? {});

      if (decision === "re_analyse" && row) {
        // Overwrite the existing row in place — preserve on_shelf /
        // on_wishlist / favourite / rating / off-shelf state.
        const updates = {
          ...saveFields,
          image_url: safeImage,
          source_url: normalised,
          analysis_profile_snapshot_hash: currentHash,
          analysis_generated_at: new Date().toISOString(),
        };
        const { error: updErr } = await supabase
          .from("user_products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(updates as any)
          .eq("id", row.id);
        if (updErr) {
          console.error("user_products update on re-analyse failed", updErr);
          throw new Error("Couldn't refresh that product. Please try again.");
        }
        navigate(
          `/products/ingredient?key=${encodeURIComponent(row.product_key)}&name=${encodeURIComponent(saveFields.name)}&brand=${encodeURIComponent(saveFields.brand ?? "")}`,
          {
            replace: true,
            state: {
              analysis: data,
              storage_path: row.storage_path ?? null,
              preview_url: safeImage ?? row.image_url ?? null,
              product_key: row.product_key,
              intent,
              source_url: normalised,
              auto_save: extras?.auto_save ?? false,
              returnTo: extras?.returnTo,
            },
          },
        );
        return;
      }

      // fresh_scan — neutral state
      const product_key = `link-${Date.now()}`;
      const payload = {
        user_id: user.id,
        product_key,
        ...saveFields,
        image_url: safeImage,
        source_url: normalised,
        analysis_profile_snapshot_hash: currentHash,
        analysis_generated_at: new Date().toISOString(),
        on_shelf: autoSave && intent === "shelf",
        on_wishlist: autoSave && intent === "wishlist",
        ...(autoSave && intent === "shelf"
          ? { added_to_shelf_at: new Date().toISOString() }
          : {}),
      };
      const { error: insErr } = await supabase
        .from("user_products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any, { onConflict: "user_id,product_key" });
      if (insErr) {
        console.error("user_products upsert after URL scan failed", insErr);
        throw new Error("Couldn't save that product. Please try again.");
      }

      navigate(
        `/products/ingredient?key=${encodeURIComponent(product_key)}&name=${encodeURIComponent(saveFields.name)}&brand=${encodeURIComponent(saveFields.brand ?? "")}`,
        {
          replace: true,
          state: {
            analysis: data,
            storage_path: null,
            preview_url: safeImage,
            product_key,
            intent,
            source_url: normalised,
            auto_save: extras?.auto_save ?? false,
            returnTo: extras?.returnTo,
          },
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't analyse that page";
      console.error("URL scan failed", e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return { startUrlScan, busy };
}
