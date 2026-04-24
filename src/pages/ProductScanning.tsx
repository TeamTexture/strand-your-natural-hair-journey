import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { toast } from "sonner";

interface NavState {
  storage_path: string;
  preview_url: string;
  /** base64 JPEG produced client-side. Sent straight to the AI so the model
   * never has to fetch a HEIC URL. */
  image_data_url?: string;
  intent?: "shelf" | "wishlist";
}

const ProductScanning = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = (location.state as NavState | null) ?? null;
  const [phase, setPhase] = useState<"analysing" | "error">("analysing");
  const [error, setError] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!state?.storage_path || !user) {
      navigate("/products", { replace: true });
      return;
    }
    void (async () => {
      try {
        // Prefer the client-prepared JPEG data URL. Fall back to a fresh
        // signed URL if (somehow) we don't have one — older flows.
        let aiImageUrl = state.image_data_url ?? "";
        if (!aiImageUrl) {
          const { data: signed } = await supabase.storage
            .from("product-photos")
            .createSignedUrl(state.storage_path, 3600);
          if (!signed?.signedUrl) throw new Error("Could not sign image URL");
          aiImageUrl = signed.signedUrl;
        }

        const context = await buildAiContext();

        const { data, error: invErr } = await supabase.functions.invoke("product-analyse", {
          body: { image_url: aiImageUrl, context },
        });
        if (invErr) throw invErr;
        if (data?.error) throw new Error(data.error);

        const product_key = `scan-${Date.now()}`;
        navigate("/products/detail-new", {
          replace: true,
          state: {
            analysis: data,
            storage_path: state.storage_path,
            preview_url: state.preview_url,
            product_key,
            intent: state.intent ?? "shelf",
          },
        });
      } catch (e) {
        const msg = (e as Error).message ?? "Could not analyse product";
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
        {state?.preview_url && (
          <img
            src={state.preview_url}
            alt="Product"
            className="w-full max-w-[280px] aspect-square object-cover rounded-[18px] border border-border"
          />
        )}
        {phase === "analysing" ? (
          <>
            <div className="mt-8 flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary animate-pulse" />
              <span className="size-3 rounded-full bg-primary animate-pulse [animation-delay:120ms]" />
              <span className="size-3 rounded-full bg-primary animate-pulse [animation-delay:240ms]" />
            </div>
            <p className="font-display text-lg mt-4">Analysing your product…</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              Reading the label, matching ingredients to your hair profile, and
              flagging anything from your avoid list.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-lg mt-6 text-destructive">Couldn't analyse</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">{error}</p>
            <div className="mt-5 max-w-xs text-left bg-card border border-border rounded-[12px] p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium">For best results</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• Hold the bottle steady, brand and title clearly visible</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• Good lighting, no glare on the label</p>
              <p className="text-[11px] text-muted-foreground leading-snug">• If you can, capture the ingredient list too</p>
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

export default ProductScanning;
