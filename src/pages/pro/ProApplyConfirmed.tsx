import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Stripe redirects here after checkout. We call pro-application-finalise
 * which verifies the session was paid and flips the pro_applications row's
 * payment_confirmed_at, moving it from draft into the admin queue.
 */
const ProApplyConfirmed = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "cancelled" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav("/pro/auth", { replace: true });
      return;
    }
    const status = params.get("status");
    const sessionId = params.get("session_id");
    if (status === "cancelled") {
      setState("cancelled");
      return;
    }
    if (!sessionId) {
      setState("error");
      setMessage("Missing checkout session reference.");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("pro-application-finalise", {
          body: { session_id: sessionId },
        });
        if (error) throw error;
        if (data?.ok) {
          setState("ok");
        } else {
          setState("error");
          setMessage(data?.error ?? "Couldn't finalise your application.");
        }
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
  }, [authLoading, user, nav, params]);

  if (authLoading || state === "working") return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Pro" back={false} />
      <div className="px-6 pt-6 pb-10 space-y-6">
        <div className="flex flex-col items-center text-center">
          <HairStrandIcon className="w-10 h-10 text-primary mb-3" />
          <p className="font-display italic text-[11px] uppercase tracking-[0.25em] text-foreground/70">
            The Strand Council
          </p>
        </div>

        {state === "ok" && (
          <SurfaceCard tone="gold" className="!p-5 space-y-3 text-center">
            <CheckCircle2 className="size-10 text-primary mx-auto" />
            <h2 className="font-display text-xl font-semibold">Application submitted</h2>
            <p className="font-body text-sm text-foreground/85 leading-relaxed">
              Thank you. Your application is now with the Strand Council. We'll be in
              touch once your application has been reviewed.
            </p>
          </SurfaceCard>
        )}

        {state === "cancelled" && (
          <SurfaceCard className="!p-5 space-y-3 text-center">
            <h2 className="font-display text-xl font-semibold">Payment cancelled</h2>
            <p className="font-body text-sm text-foreground/80 leading-relaxed">
              Your application is saved as a draft. You can complete it any time.
            </p>
            <Button variant="gold" size="pill" className="w-full" onClick={() => nav("/pro/apply")}>
              Resume application
            </Button>
          </SurfaceCard>
        )}

        {state === "error" && (
          <SurfaceCard className="!p-5 space-y-3 text-center">
            <XCircle className="size-8 text-warn mx-auto" />
            <h2 className="font-display text-xl font-semibold">Something went wrong</h2>
            <p className="font-body text-sm text-foreground/80 leading-relaxed">
              {message ?? "Please try again."}
            </p>
            <Button
              variant="outline"
              size="pill"
              className="w-full"
              onClick={() => {
                toast("If you were charged, contact info@teamtexture.co.uk");
                nav("/pro/apply");
              }}
            >
              Back to application
            </Button>
          </SurfaceCard>
        )}

        <Button variant="ghost" className="w-full" onClick={() => nav("/pro/landing")}>
          Back to STRAND Pro
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProApplyConfirmed;
