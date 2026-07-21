import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import HairStrandIcon from "@/components/HairStrandIcon";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Acceptance + first-payment screen. Shown to approved professionals who
 * have not yet started a Stripe subscription. Combines the celebratory
 * "You've been accepted to the Strand Council" moment with the Subscribe
 * CTA. Full pro area unlocks after successful checkout.
 */
const ProWelcome = () => {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const { isActive, isLoading: subLoading } = useProSubscription();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) nav("/pro/auth", { replace: true });
  }, [authLoading, user, nav]);

  // Anyone who's already subscribed or is an admin heads straight to the
  // dashboard — this screen is only for accepted-but-unpaid pros.
  useEffect(() => {
    if (rolesLoading || subLoading) return;
    if (!isProfessional && !isAdmin) {
      nav("/pro/landing", { replace: true });
      return;
    }
    if (isActive || isAdmin) nav("/pro", { replace: true });
  }, [rolesLoading, subLoading, isProfessional, isAdmin, isActive, nav]);

  const startCheckout = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pro-checkout", {
        body: {},
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  };

  if (authLoading || rolesLoading || subLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Pro" back={false} />
      <div className="px-6 pt-4 pb-10 space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <HairStrandIcon className="w-12 h-12 text-primary" />
            <Sparkles className="absolute -top-1 -right-2 size-4 text-primary" />
          </div>
          <p className="font-display italic text-[11px] uppercase tracking-[0.28em] text-foreground/70">
            The Strand Council
          </p>
          <h2 className="font-display text-[26px] font-semibold text-foreground mt-2 leading-tight">
            You've been accepted
          </h2>
          <p className="font-body text-sm text-foreground/75 max-w-[280px] mt-3 leading-relaxed">
            Welcome to the STRAND Pro Council. Your practice has been reviewed and
            approved — we're thrilled to have you.
          </p>
        </div>

        <SurfaceCard tone="gold" className="!p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-lg font-semibold text-foreground">
              STRAND Pro Membership
            </p>
            <p className="text-[11px] font-body uppercase tracking-[0.15em] text-foreground/60">
              Monthly
            </p>
          </div>
          <ul className="text-[13px] font-body text-foreground/80 space-y-1.5">
            <li>· Featured in the STRAND directory</li>
            <li>· Client enquiries with pre-populated context</li>
            <li>· Access to consented client passports</li>
            <li>· Profile, offers and photos</li>
            <li>· Cancel any time from the billing portal</li>
          </ul>
        </SurfaceCard>

        <Button
          variant="gold"
          size="pill"
          className="w-full"
          onClick={startCheckout}
          disabled={busy}
        >
          {busy ? "Redirecting to Stripe…" : "Subscribe & unlock your dashboard →"}
        </Button>

        <p className="text-[11px] text-foreground/60 font-body text-center leading-relaxed">
          Secure payment via Stripe. Your dashboard, profile, offers and enquiries
          unlock once payment succeeds.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default ProWelcome;
