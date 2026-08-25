import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import ScreenLayout from "@/components/ScreenLayout";
import StatusBar from "@/components/StatusBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import LoadingDot from "@/components/LoadingDot";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useConsumerPricing, formatGbp } from "@/hooks/useConsumerPricing";
import { verifyConsumerMembership } from "@/lib/membershipVerify";
import { formatTrialEnd, TRIAL_DAYS } from "@/lib/trialOffer";
import { isSafeInternalPath } from "@/lib/consumerOnboarding";

const AFTER_TRIAL_PATH = "/onboarding/goal";

const WHAT_YOU_GET = [
  "Your hair read properly — porosity, density, scalp and colour history.",
  "Scan any product and hear what is in it.",
  "Wash day guidance built for your hair.",
  "Vetted professionals, bookable in the app.",
];

type Tier = "standard" | "plus";

/**
 * The 3-day free trial paywall — the first screen after registration.
 *
 * The charge terms and the CTA share a fixed footer, so they are on screen
 * together at 375px no matter how far the content above has scrolled. A member
 * can never start a trial without the terms in view.
 */
const TrialPaywall = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const { hasAccess, isLoading } = useConsumerSubscription();
  const { standard, plus } = useConsumerPricing();

  const [tier, setTier] = useState<Tier>("plus");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(() => params.get("checkout") === "success");

  const nextPath = isSafeInternalPath(params.get("next")) ? params.get("next")! : AFTER_TRIAL_PATH;
  const price = tier === "plus" ? plus : standard;
  const trialEnd = formatTrialEnd();

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "cancelled") {
      toast("No card taken. You can start your free trial whenever you like.");
      params.delete("checkout");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe returns before the webhook lands, so ask Stripe directly and hold
  // here until the trial is confirmed — never drop her back on the paywall.
  useEffect(() => {
    if (hasAccess) {
      nav(nextPath, { replace: true });
      return;
    }
    if (!confirming) return;
    void verifyConsumerMembership(qc, user?.id);
    const poll = window.setInterval(() => void verifyConsumerMembership(qc, user?.id), 2500);
    const giveUp = window.setTimeout(() => {
      setConfirming(false);
      nav(nextPath, { replace: true });
    }, 12000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, hasAccess]);

  const startTrial = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("consumer-checkout", {
        body: { next: AFTER_TRIAL_PATH, tier, trial: true, returnTo: "/start-trial" },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not start your free trial");
      setBusy(false);
    }
  };

  if (confirming && !hasAccess) {
    return (
      <ScreenLayout>
        <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="font-body text-sm text-muted-foreground">
            Setting up your free trial…
          </p>
        </div>
      </ScreenLayout>
    );
  }
  if (isLoading && !hasAccess) return <LoadingDot />;

  const PlanCard = ({ value, name, amount, chosen }: {
    value: Tier; name: string; amount: number; chosen?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => setTier(value)}
      aria-pressed={tier === value}
      className={cn(
        "relative flex-1 min-w-0 rounded-[14px] border bg-card px-3 py-3 text-left transition-colors",
        tier === value ? "border-primary border-2 bg-primary/[0.07]" : "border-border",
      )}
    >
      {chosen && (
        <span className="absolute -top-2 right-2 rounded-pill bg-primary px-2 py-[2px] text-[9px] font-body font-semibold uppercase tracking-[0.12em] text-primary-foreground">
          Most chosen
        </span>
      )}
      <p className="font-display text-[17px] leading-tight text-foreground">{name}</p>
      <p className="mt-1 font-body text-[13px] font-semibold text-foreground">
        {formatGbp(amount)}
      </p>
      <p className="font-body text-[11px] text-muted-foreground">a month</p>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-5 pt-3 pb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-body font-medium">
          Welcome to STRAND
        </p>
        <h1 className="mt-2 font-display text-[28px] leading-[1.15] text-foreground">
          Three days free, then decide.
        </h1>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-muted-foreground">
          Set up your hair profile and use everything. Cancel before day three and you pay nothing.
        </p>

        <div className="mt-4 flex items-stretch gap-2.5">
          <PlanCard value="standard" name="STRAND" amount={standard} />
          <PlanCard value="plus" name="STRAND+" amount={plus} chosen />
        </div>

        <SurfaceCard className="mt-4 p-4">
          <p className="flex items-center gap-1.5 font-body text-[11px] uppercase tracking-[0.16em] text-primary">
            <Sparkles className="size-3.5" aria-hidden /> What you get
          </p>
          <ul className="mt-2.5 space-y-2">
            {WHAT_YOU_GET.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="mt-[3px] size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="font-body text-[12.5px] leading-snug text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </SurfaceCard>

        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => nav(AFTER_TRIAL_PATH, { replace: true })}
            className="font-body text-[12.5px] underline text-muted-foreground"
          >
            Set up my profile first
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-body text-[12px] text-muted-foreground/80"
          >
            Sign out
          </button>
        </div>
      </main>

      {/* Charge terms and CTA are pinned together — always both in view. */}
      <div className="shrink-0 border-t border-border bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        <SurfaceCard tone="gold" className="p-3">
          <p className="font-body text-[12px] leading-snug text-foreground">
            <span className="font-semibold">Free until {trialEnd}</span>. After that it&apos;s{" "}
            {formatGbp(price)} a month, charged automatically, until you cancel. Cancel any time
            from your profile in two taps.
          </p>
        </SurfaceCard>
        <Button
          variant="gold"
          size="pill"
          className="mt-2.5 w-full"
          onClick={startTrial}
          disabled={busy}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : `Start my ${TRIAL_DAYS} days free`}
        </Button>
        <p className="mt-1.5 text-center font-body text-[11px] text-muted-foreground">
          Card details taken now. Nothing charged today.
        </p>
      </div>
    </div>
  );
};

export default TrialPaywall;
