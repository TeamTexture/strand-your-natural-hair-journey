import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { takePendingAiContext } from "@/hooks/useProductScan";
import { resolveBrandProductLink } from "@/lib/brandProductResolve";
import { buildProductSaveFields } from "@/lib/productAnalysisSave";
import { currentProfileHash, ingredientsFingerprint } from "@/lib/profileSnapshot";
import { resolveProductKey } from "@/lib/productIdentity";
import { warmIngredientAnalysis } from "@/lib/warmIngredientAnalysis";
import {
  streamProductAnalyse,
  type PartialAnalysis,
} from "@/lib/streamProductAnalyse";
import { toast } from "sonner";


/** Nav state shape produced by useProductScan after the dual-photo upload. */
interface NavState {
  // Cover image (front, used by the detail screen).
  storage_path: string;
  preview_url: string;
  // Dual-photo payload for the edge function.
  front_storage_path?: string;
  back_storage_path?: string;
  front_preview_url?: string;
  back_preview_url?: string;
  front_image_data_url?: string;
  back_image_data_url?: string;
  intent?: "shelf" | "wishlist";
  auto_save?: boolean;
  returnTo?: string;
}

const ProductScanning = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = (location.state as NavState | null) ?? null;
  const [phase, setPhase] = useState<"analysing" | "error">("analysing");
  const [error, setError] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("Reading the front of the label…");
  const [progressPct, setProgressPct] = useState(0);
  const [partial, setPartial] = useState<PartialAnalysis>({});
  const ranRef = useRef(false);


  // HONEST TIMING (2026-09-03). Measured from ai_call_log over the last 7
  // days: product-analyse p50 55.6s, p90 68.5s (worst 162.9s). The old pacing
  // assumed a "~15–25s" analysis, so the ring hit 75% in 12s and then crawled
  // for the remaining ~45s. Stage copy and ring pacing now follow the real
  // pipeline: read the label, resolve the brand, then the guarded write-up.
  // Streamed partials still overwrite this copy with real details.
  useEffect(() => {
    if (phase !== "analysing") return;
    const sequence = [
      { at: 0, msg: "Reading the front of the label…" },
      { at: 6000, msg: "Reading the ingredient panel on the back…" },
      { at: 16000, msg: "Looking up the brand and product…" },
      { at: 28000, msg: "Cross-referencing the ingredients…" },
      { at: 40000, msg: "Matching to your hair profile…" },
      { at: 52000, msg: "Checking every claim before we show it…" },
      { at: 64000, msg: "Almost there — writing your summary…" },
    ];
    const timeouts = sequence.map(({ at, msg }) =>
      window.setTimeout(() => setLoadingMessage(msg), at),
    );
    // Two-phase pacing against the measured p50:
    //   1) linear sweep to 75% over ~40s (≈ 0.72 × p50 of 55.6s),
    //   2) slow asymptotic crawl 75% → 99% for the tail past p90,
    // so the ring is always moving and lands near full as the stream
    // completes. On success we kick it to 100.
    const start = Date.now();
    const FAST_MS = 40000; // reach 75% by here
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      let pct: number;
      if (elapsed <= FAST_MS) {
        pct = (elapsed / FAST_MS) * 75;
      } else {
        const extra = elapsed - FAST_MS;
        pct = 75 + 24 * (1 - Math.exp(-extra / 30000));
      }
      setProgressPct((prev) => Math.max(prev, Math.min(99, pct)));
    }, 200);
    return () => {
      timeouts.forEach(window.clearTimeout);
      window.clearInterval(interval);
    };
  }, [phase]);


  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!state?.storage_path || !user) {
      console.log("[scan-debug] entry", { hasState: !!state, hasUser: !!user, storage_path: state?.storage_path });
      navigate("/products", { replace: true });
      return;
    }
    void (async () => {
      try {
        // Resolve front + back image URLs. Prefer the client-prepared
        // base64 JPEG data URLs (model never has to fetch a HEIC URL);
        // fall back to fresh signed URLs for older nav-state shapes.
        const resolveSlot = async (
          dataUrl: string | undefined,
          path: string | undefined,
          slotName: "front" | "back",
        ): Promise<string> => {
          if (dataUrl) return dataUrl;
          const storagePath = path ?? state.storage_path;
          if (!storagePath) {
            throw new Error(`Missing ${slotName} photo for analysis.`);
          }
          const { data: signed } = await supabase.storage
            .from("product-photos")
            .createSignedUrl(storagePath, 3600);
          if (!signed?.signedUrl) {
            throw new Error(`Could not sign the ${slotName} image URL.`);
          }
          return signed.signedUrl;
        };

        // PERFORMANCE: both photo URLs and the member context resolve
        // concurrently, and the context is usually already built (started
        // at capture time in useProductScan) so this is normally instant.
        const pending = takePendingAiContext();
        const [front, back, resolvedContext] = await Promise.all([
          resolveSlot(state.front_image_data_url, state.front_storage_path, "front"),
          resolveSlot(state.back_image_data_url, state.back_storage_path, "back"),
          (pending ?? buildAiContext()).then((c) => c ?? buildAiContext()),
        ]);

        const context = resolvedContext as Awaited<ReturnType<typeof buildAiContext>>;
        const currentHash = currentProfileHash(context);

        // Photo scans always mint a new product_key, so there's no existing
        // row to dedupe against — log the decision so future tooling
        // (signals, replays) sees a consistent shape across both flows.
        console.log("[scan-cache] decision", {
          existing_row_id: null,
          existing_hash: null,
          current_hash: currentHash,
          decision: "fresh_scan",
        });

        console.log("[scan-debug] about to invoke product-analyse (stream)");
        // SPEED: streamed so the real product name, brand and ingredient
        // count replace the cosmetic progress copy within a few seconds.
        // The resolved payload is the guarded `complete` event — the preview
        // is never saved or scored from.
        const data = await streamProductAnalyse({
          body: { photos: { front, back }, context, force: true },
          onPartial: (p) => {
            setPartial((prev) => ({ ...prev, ...p }));
            if (p.ingredients?.length) {
              setLoadingMessage(
                `Read ${p.ingredients.length} ingredients — matching to your hair profile…`,
              );
            } else if (p.product_name) {
              setLoadingMessage("Reading the ingredients…");
            }
          },
        });
        if ((data as { error?: string })?.error) {
          throw new Error((data as { error?: string }).error!);
        }
        console.log("[scan-debug] function returned ok", { hasData: !!data, productName: data.product_name, brand: data.brand });


        // Persist the freshly-scanned product so the unified product page
        // (/products/ingredient) — which loads from user_products by
        // product_key — has a row to display. Without this insert, the
        // redirect would land on an empty product page and bounce back.
        const intent = state.intent ?? "shelf";
        const saveFields = buildProductSaveFields(data ?? {}, "Untitled product", "label_photo");
        // ONE PRODUCT, ONE ROW. The key is derived from the normalised brand +
        // name, and an existing row for the same product is reused even when
        // the scan spelled it differently — see src/lib/productIdentity.ts.
        const { product_key, reused_row_id } = await resolveProductKey(
          user.id,
          saveFields.name,
          saveFields.brand ?? null,
        );
        console.log("[scan-dedupe] key", { product_key, reused_row_id });
        // Deterministic link to an approved brand catalogue product, if one
        // matches exactly. Never a guess — see src/lib/brandProductResolve.ts.
        const brandLink = await resolveBrandProductLink({
          name: saveFields.name,
          brand: saveFields.brand ?? null,
          kind: "product",
        });
        const payload = {
          user_id: user.id,
          product_key,
          ...saveFields,
          ingredients_source: brandLink ? "brand" : "scan",
          linked_brand_product_id: brandLink?.brand_product_id ?? null,
          storage_path: state.storage_path,
          analysis_profile_snapshot_hash: currentHash,
          analysis_ingredients_hash: ingredientsFingerprint(saveFields.ingredients),
          analysis_generated_at: new Date().toISOString(),
          // Neutral state by default — the user picks the destination from
          // the 3-CTA decision block on IngredientDetail. Only auto-route
          // to shelf/wishlist when the caller explicitly opted in.
          on_shelf: state.auto_save === true && intent === "shelf",
          on_wishlist: state.auto_save === true && intent === "wishlist",
          ...(state.auto_save === true && intent === "shelf"
            ? { added_to_shelf_at: new Date().toISOString() }
            : {}),
        };
        const { error: insErr } = await supabase
          .from("user_products")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(payload as any, { onConflict: "user_id,product_key" });
        if (insErr) {
          console.error("user_products upsert after scan failed", insErr);
          throw new Error("Couldn't save the scanned product. Please try again.");
        }
        // POST-SCAN WARM-UP (2026-09-01): kick off the ingredient/how-to-use
        // pass now, in the background, so a freshly scanned product has cards
        // and personalised guidance on first view instead of only the verdict.
        // Fire-and-forget — it must never delay navigation.
        void warmIngredientAnalysis({
          productKey: product_key,
          productName: saveFields.name,
          productBrand: saveFields.brand ?? null,
          ingredients: saveFields.ingredients ?? null,
          category: (saveFields as { category?: string | null }).category ?? null,
          applicationArea:
            (saveFields as { application_area?: string | null }).application_area ?? null,
          leaveOn: (saveFields as { leave_on?: boolean | null }).leave_on ?? null,
          usageInstructions:
            (saveFields as { usage_instructions?: string | null }).usage_instructions ?? null,
          context,
        });
        console.log("[scan-debug] upsert ok, navigating to /products/ingredient", { product_key, payload_keys: Object.keys(payload) });
        // Snap the ring to a full circle on real success so the user sees
        // it complete before we navigate away. Short hold so the
        // CSS transition has time to draw the final arc.
        setProgressPct(100);
        await new Promise((r) => setTimeout(r, 180));

        const name = encodeURIComponent(saveFields.name);
        const brand = encodeURIComponent(saveFields.brand ?? "");
        // Route directly to the unified product page. Analysis is also
        // stashed in location.state for the first render (URL params are
        // for refresh / shareability fallback).
        navigate(
          `/products/ingredient?key=${encodeURIComponent(product_key)}&name=${name}&brand=${brand}`,
          {
            replace: true,
            state: {
              analysis: data,
              storage_path: state.storage_path,
              preview_url: state.preview_url,
              product_key,
              intent,
              auto_save: state.auto_save ?? false,
              returnTo: state.returnTo,
            },
          },
        );
      } catch (e) {
        const msg = (e as Error).message ?? "Could not analyse product";
        console.log("[scan-debug] CAUGHT ERROR", { name: (e as Error).name, message: (e as Error).message, stack: (e as Error).stack });
        console.error(e);
        setError(msg);
        setPhase("error");
        toast.error(msg);
      }
    })();
  }, [state, user, navigate]);

  return (
    <ScreenLayout bottomNav={false}>
      <TitleBar title="Scanning" back />
      <div className="px-5 pb-8 flex flex-col items-center text-center">
        {/* Show both photo previews side by side so the user can confirm
         *  what's being analysed. Falls back to the cover preview if only
         *  one is present (legacy nav-state). */}
        <div className="flex gap-2 w-full max-w-[280px] justify-center">
          {state?.front_preview_url && (
            <img
              src={state.front_preview_url}
              alt="Product front"
              className="flex-1 aspect-square object-cover rounded-[14px] border border-border"
            />
          )}
          {state?.back_preview_url && (
            <img
              src={state.back_preview_url}
              alt="Product back"
              className="flex-1 aspect-square object-cover rounded-[14px] border border-border"
            />
          )}
          {!state?.front_preview_url && !state?.back_preview_url && state?.preview_url && (
            <img
              src={state.preview_url}
              alt="Product"
              className="w-full aspect-square object-cover rounded-[18px] border border-border"
            />
          )}
        </div>
        {phase === "analysing" ? (
          <>
            {/* Circular progress ring — gold bar fills around the
             *  circumference, paced slightly ahead of the real
             *  analysis so the user has a clear visual of how long is
             *  left and stays patient. */}
            {(() => {
              const SIZE = 132;
              const STROKE = 8;
              const R = (SIZE - STROKE) / 2;
              const C = 2 * Math.PI * R;
              const offset = C * (1 - progressPct / 100);
              return (
                <div className="mt-8 relative" style={{ width: SIZE, height: SIZE }}>
                  <svg
                    width={SIZE}
                    height={SIZE}
                    viewBox={`0 0 ${SIZE} ${SIZE}`}
                    aria-hidden="true"
                  >
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth={STROKE}
                    />
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                      style={{ transition: "stroke-dashoffset 400ms ease-out" }}
                    />
                  </svg>
                  <div
                    className="absolute inset-0 flex items-center justify-center font-display text-primary"
                    style={{ fontSize: 22 }}
                    aria-live="polite"
                  >
                    {Math.round(progressPct)}%
                  </div>
                </div>
              );
            })()}
            <p className="font-display text-lg mt-4">{loadingMessage}</p>
            {/* Real detail from the label, streamed in as it's read. Preview
                only — the score and verdict land when the analysis finishes. */}
            {(partial.product_name || partial.brand) && (
              <div
                className="mt-3 w-full max-w-xs rounded-[12px] border border-primary/30 bg-card px-3 py-2 text-left"
                aria-live="polite"
              >
                {partial.brand && (
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {partial.brand}
                  </p>
                )}
                {partial.product_name && (
                  <p className="font-display text-sm leading-snug">
                    {partial.product_name}
                  </p>
                )}
                {partial.ingredients?.length ? (
                  <p className="mt-1 text-[11px] font-body text-muted-foreground">
                    {partial.ingredients.length} ingredients read
                  </p>
                ) : null}
              </div>
            )}

            <p className="mt-3 max-w-xs text-xs font-body text-foreground bg-card border border-primary/40 rounded-[12px] px-3 py-2">
              Stay on this page while we work. Leaving or closing it before the
              analysis finishes will interrupt it, and you'll need to start
              again.
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              Reading both sides of the label, matching ingredients to your
              hair profile, and flagging anything that already shows up in
              3 or more of your favourited shelf products.
            </p>

          </>
        ) : (
          <>
            <p className="font-display text-lg mt-6 text-destructive">Couldn't analyse</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">{error}</p>
            <div className="mt-5 max-w-xs text-left bg-card border border-border rounded-[12px] p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium">For best results</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• Hold the bottle steady, brand and title clearly visible on the front</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• Good lighting, no glare on the label</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• On the back, line up the small-print ingredient panel and keep it sharp</p>
            </div>
            <button
              onClick={() => navigate("/products")}
              className="mt-6 text-xs uppercase tracking-[0.15em] text-primary"
            >
              ← Back to Products
            </button>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

/** supabase.functions.invoke wraps non-2xx errors in a `FunctionsHttpError`
 *  whose `context.json()` (or `context.text()`) returns the parsed body.
 *  We pull out the `error` string when present so the user-facing
 *  dual-photo message reaches the toast verbatim. */
async function extractFunctionErrorMessage(err: unknown): Promise<string> {
  const fallback = err instanceof Error ? err.message : "Could not analyse product";
  const ctx = (err as { context?: unknown })?.context;
  if (ctx && typeof ctx === "object" && "json" in ctx && typeof (ctx as { json?: unknown }).json === "function") {
    try {
      const body = await (ctx as { json: () => Promise<unknown> }).json();
      if (body && typeof body === "object" && "error" in body) {
        const errStr = (body as { error?: unknown }).error;
        if (typeof errStr === "string" && errStr.length > 0) return errStr;
      }
    } catch {
      // fall through
    }
  }
  if (ctx && typeof ctx === "object" && "text" in ctx && typeof (ctx as { text?: unknown }).text === "function") {
    try {
      const txt = await (ctx as { text: () => Promise<string> }).text();
      try {
        const parsed = JSON.parse(txt);
        if (parsed && typeof parsed.error === "string") return parsed.error;
      } catch {
        if (typeof txt === "string" && txt.length > 0 && txt.length < 300) return txt;
      }
    } catch {
      // fall through
    }
  }
  return fallback;
}

export default ProductScanning;
