import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
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
  const ranRef = useRef(false);

  // Rotate the headline through a sequence of progress signals so the
  // ~60s wait feels like activity rather than a frozen state. These
  // delays are NOT tied to real backend events — purely cosmetic UX.
  useEffect(() => {
    if (phase !== "analysing") return;
    const sequence = [
      { at: 0, msg: "Reading the front of the label…" },
      { at: 8000, msg: "Reading the back of the label…" },
      { at: 18000, msg: "Looking up the brand…" },
      { at: 30000, msg: "Cross-referencing the ingredients…" },
      { at: 42000, msg: "Matching to your hair profile…" },
      { at: 54000, msg: "Almost there — writing your summary…" },
    ];
    const timeouts = sequence.map(({ at, msg }) =>
      window.setTimeout(() => setLoadingMessage(msg), at),
    );
    // Drive the circular progress ring. Fast fill to ~90% over ~22s
    // (matches the perceived bulk of the analysis work), then ease
    // asymptotically toward 99% so it never visually "completes"
    // before the backend does. We snap to 100% on real success.
    const start = performance.now();
    const FAST_MS = 22000; // reach 90% by here
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      let pct: number;
      if (elapsed <= FAST_MS) {
        pct = (elapsed / FAST_MS) * 90;
      } else {
        // Ease from 90 → 99 over the next ~30s, asymptotic.
        const extra = elapsed - FAST_MS;
        pct = 90 + 9 * (1 - Math.exp(-extra / 12000));
      }
      setProgressPct(Math.min(99, pct));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      timeouts.forEach(window.clearTimeout);
      cancelAnimationFrame(raf);
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

        const front = await resolveSlot(
          state.front_image_data_url,
          state.front_storage_path,
          "front",
        );
        const back = await resolveSlot(
          state.back_image_data_url,
          state.back_storage_path,
          "back",
        );

        const context = await buildAiContext();

        console.log("[scan-debug] about to invoke product-analyse");
        const { data, error: invErr } = await supabase.functions.invoke(
          "product-analyse",
          {
            body: {
              photos: { front, back },
              context,
              force: true,
            },
          },
        );

        // The dual-photo Claude path returns 400 with a user-facing error
        // message when both photos aren't supplied (audit §5 Step 3 strict
        // contract). `supabase.functions.invoke` surfaces non-2xx as
        // `invErr.context.json.error` — surface that string to the user
        // verbatim because Paige wrote it for them.
        if (invErr) {
          const userFacing = await extractFunctionErrorMessage(invErr);
          throw new Error(userFacing);
        }
        if (data?.error) throw new Error(data.error);
        console.log("[scan-debug] function returned ok", { hasData: !!data, productName: data?.product_name, brand: data?.brand });

        // Persist the freshly-scanned product so the unified product page
        // (/products/ingredient) — which loads from user_products by
        // product_key — has a row to display. Without this insert, the
        // redirect would land on an empty product page and bounce back.
        const product_key = `scan-${Date.now()}`;
        const intent = state.intent ?? "shelf";
        const payload = {
          user_id: user.id,
          product_key,
          name: typeof data?.product_name === "string" && data.product_name.trim()
            ? data.product_name.trim()
            : "Untitled product",
          brand: typeof data?.brand === "string" ? data.brand.trim() : null,
          category: typeof data?.category === "string" ? data.category : null,
          ingredients: Array.isArray(data?.ingredients) ? data.ingredients : [],
          key_ingredients: Array.isArray(data?.key_ingredients) ? data.key_ingredients : [],
          ai_summary: typeof data?.ai_summary === "string" ? data.ai_summary : null,
          match_score: typeof data?.match_score === "number" ? data.match_score : null,
          storage_path: state.storage_path,
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
        console.log("[scan-debug] upsert ok, navigating to /products/ingredient", { product_key, payload_keys: Object.keys(payload) });

        const name = encodeURIComponent(payload.name);
        const brand = encodeURIComponent(payload.brand ?? "");
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
            {/* Circular progress ring — purely cosmetic, fills over ~60s */}
            {(() => {
              const SIZE = 80;
              const STROKE = 5;
              const R = (SIZE - STROKE) / 2;
              const C = 2 * Math.PI * R;
              const offset = C * (1 - progressPct / 100);
              return (
                <svg
                  width={SIZE}
                  height={SIZE}
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  className="mt-8"
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
                    style={{ transition: "stroke-dashoffset 200ms linear" }}
                  />
                </svg>
              );
            })()}
            <div className="mt-4 flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary animate-pulse" />
              <span className="size-3 rounded-full bg-primary animate-pulse [animation-delay:120ms]" />
              <span className="size-3 rounded-full bg-primary animate-pulse [animation-delay:240ms]" />
            </div>
            <p className="font-display text-lg mt-4">{loadingMessage}</p>
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
