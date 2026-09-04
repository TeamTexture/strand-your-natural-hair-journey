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
import { startProductAnalysis } from "@/lib/analysisJob";
import { memberSafeMessage } from "@/lib/invokeError";
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
  const [partial, setPartial] = useState<{
    brand?: string;
    product_name?: string;
    ingredients?: string[];
  }>({});
  const ranRef = useRef(false);


  // TWO-PHASE SCAN (2026-09-04). This screen now only covers PHASE A — reading
  // the label. Measured Phase A cost is a single vision call, so the pacing is
  // seconds, not the old ~60s single-invocation pipeline. The verdict is written
  // in PHASE B, in the background, and the member watches that on the product
  // page instead of waiting here.
  useEffect(() => {
    if (phase !== "analysing") return;
    const sequence = [
      { at: 0, msg: "Reading the front of the label…" },
      { at: 2200, msg: "Reading the ingredient panel on the back…" },
      { at: 5000, msg: "Almost there — checking the panel…" },
    ];
    const timeouts = sequence.map(({ at, msg }) =>
      window.setTimeout(() => setLoadingMessage(msg), at),
    );
    const start = Date.now();
    const FAST_MS = 6000;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = elapsed <= FAST_MS
        ? (elapsed / FAST_MS) * 85
        : 85 + 14 * (1 - Math.exp(-(elapsed - FAST_MS) / 8000));
      setProgressPct((prev) => Math.max(prev, Math.min(99, pct)));
    }, 120);
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

        // PHASE A — label read only. One fast vision call: brand, product name,
        // the printed ingredient panel, category, application area and the
        // directions. No verdict, no scoring, no guidance here.
        const { data: label, error: labelErr } = await supabase.functions.invoke(
          "product-label-read",
          { body: { photos: { front, back } } },
        );
        if (labelErr) {
          throw new Error(
            memberSafeMessage(labelErr, "We couldn't read that label. Try both photos again."),
          );
        }
        const data = (label ?? {}) as {
          brand?: string | null;
          product_name?: string | null;
          ingredients?: string[];
          category?: string | null;
          application_area?: string | null;
          leave_on?: boolean | null;
          usage_instructions?: string | null;
          label_readable?: boolean;
        };
        if (!data.product_name && !(data.ingredients?.length)) {
          throw new Error(
            "We couldn't read the brand, the name or the ingredient panel on those photos. Try again in better light.",
          );
        }
        setPartial({
          brand: data.brand ?? undefined,
          product_name: data.product_name ?? undefined,
          ingredients: data.ingredients ?? undefined,
        });
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
        // PHASE B — the real analysis. Started server-side and kept alive
        // there: her request is never what holds it open, so leaving this
        // screen, changing app or losing signal cannot interrupt it. The
        // product page reports its progress and picks up the finished result.
        const started = await startProductAnalysis(product_key);
        if (!started.started) {
          console.warn("[scan] phase B did not start", started.message);
        }
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
              // No verdict yet — Phase B is running. The product page shows the
              // identified product and her ingredient list immediately, and the
              // analysis lands underneath it when it's written.
              pending_analysis: true,
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
              This part is quick — we’re just reading the label. Your full
              analysis then carries on in the background, so you can keep using
              the app and come back to it whenever you like.
            </p>

          </>
        ) : (
          <>
            <p className="font-display text-lg mt-6 text-destructive">Couldn't analyse</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs whitespace-pre-line break-words">
              {error}
            </p>
            <div className="mt-5 max-w-xs text-left bg-card border border-border rounded-[12px] p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium">For best results</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• It’s usually just the back photo — if the front looked clear, you only need to retake the back</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• The ingredient panel curves around the bottle, so turn it slowly and take the shot where the small print sits flattest</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• Good lighting, no glare, and hold steady until it’s sharp</p>
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
