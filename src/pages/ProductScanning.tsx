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
        // Sign URL for the AI to fetch
        const { data: signed } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(state.storage_path, 3600);
        if (!signed?.signedUrl) throw new Error("Could not sign image URL");

        const context = await buildAiContext();

        const { data, error: invErr } = await supabase.functions.invoke("product-analyse", {
          body: { image_url: signed.signedUrl, context },
        });
        if (invErr) throw invErr;

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
              Reading ingredients and matching them to your hair profile.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-lg mt-6 text-destructive">Couldn't analyse</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">{error}</p>
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
