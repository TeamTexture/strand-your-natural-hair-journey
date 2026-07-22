import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerMode, ownerHomeRoute } from "@/hooks/useOwnerMode";

const BrandCheckoutSuccess = () => {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const ownerMode = useOwnerMode();
  const home = ownerHomeRoute(ownerMode);
  const [status, setStatus] = useState<"verifying" | "paid" | "pending" | "error">("verifying");
  const sessionId = params.get("session_id");

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("brand-verify-session", {
          body: { session_id: sessionId },
        });
        if (error) throw error;
        setStatus(data?.paid ? "paid" : "pending");
      } catch {
        setStatus("error");
      }
    })();
  }, [sessionId]);

  return (
    <ScreenLayout>
      <TitleBar title="Payment" onBack={smartBack(nav, home)} />
      <div className="px-5 pt-8 flex flex-col items-center text-center">
        {status === "verifying" && <Loader2 className="size-10 animate-spin text-primary" />}
        {status === "paid" && <CheckCircle2 className="size-12 text-good" />}
        <SurfaceCard className="mt-6 w-full">
          <p className="font-display text-xl">
            {status === "verifying" && "Verifying payment…"}
            {status === "paid" && "Payment received"}
            {status === "pending" && "Payment processing"}
            {status === "error" && "We couldn't verify this payment"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-2 leading-snug">
            {status === "paid" && "We'll let you know when your offer goes live."}
            {status === "pending" && "It's on its way — refresh in a moment."}
            {status === "error" && "Please contact us if this persists."}
          </p>
          <Button variant="gold" size="pill" onClick={() => nav(home)} className="mt-4 w-full">
            Back to dashboard
          </Button>
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default BrandCheckoutSuccess;
