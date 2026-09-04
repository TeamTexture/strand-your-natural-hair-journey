import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { verifyConsumerMembership } from "@/lib/membershipVerify";
import { friendlyInvokeError } from "@/lib/invokeError";
import ActivatingMembership from "@/components/ActivatingMembership";

import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import HairStrandIcon from "@/components/HairStrandIcon";
import MembershipMarketing, {
  AdvisoryNotes,
  PaymentsNote,
  PlusExtrasList,
  PriceCard,
} from "@/components/subscribe/MembershipMarketing";
import { supabase } from "@/integrations/supabase/client";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { toast } from "sonner";
import { isSafeInternalPath } from "@/lib/consumerOnboarding";
import { useUpgradeEligibility } from "@/hooks/useUpgradeEligibility";
import { useConsumerPricing } from "@/hooks/useConsumerPricing";
import LoadingDot from "@/components/LoadingDot";
import { smartBack } from "@/lib/smartBack";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Pillars, reassurance rows and STRAND+ extras now live in the shared
// marketing component so /subscribe and /start-trial cannot drift apart.


const Subscribe = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const nextPath = params.get("next");
  const [storedNextPath, setStoredNextPath] = useState<string | null>(() => {
    try {
      return localStorage.getItem("strand_subscribe_next");
    } catch {
      return null;
    }
  });
  const {
    subscription, stripeActive, complimentary, isAdminOrPro, hasAccess, isLoading, refetch,
  } = useConsumerSubscription();
  const { accountType, loading: roleLoading, homePath } = useUpgradeEligibility();
  const [busy, setBusy] = useState<"subscribe" | "portal" | null>(null);
  const [tier, setTier] = useState<"standard" | "plus">("standard");

  // Shared with the trial paywall — one source for both prices.
  const pricing = useConsumerPricing();

  const [confirming, setConfirming] = useState(() => params.get("checkout") === "success");
  const [activationStuck, setActivationStuck] = useState(false);
  const qc = useQueryClient();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (isSafeInternalPath(nextPath)) {
      try {
        localStorage.setItem("strand_subscribe_next", nextPath);
      } catch {}
      setStoredNextPath(nextPath);
    }
    const c = params.get("checkout");
    if (c === "success") {
      toast.success("Welcome to STRAND. Your membership is active.");
      params.delete("checkout");
      setParams(params, { replace: true });
    } else if (c === "cancelled") {
      toast("Checkout cancelled.");
      params.delete("checkout");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe redirects back before the webhook has written the row, so we ask
  // Stripe directly and invalidate the paywall's own cache key. A paid member
  // is held here until access is confirmed — never dropped on the paywall.
  useEffect(() => {
    if (!confirming || activationStuck) return;
    const target = isSafeInternalPath(nextPath)
      ? nextPath
      : isSafeInternalPath(storedNextPath)
        ? storedNextPath
        : "/home";
    if (hasAccess) {
      try {
        localStorage.removeItem("strand_subscribe_next");
      } catch {}
      setConfirming(false);
      nav(target, { replace: true });
      return;
    }
    void verifyConsumerMembership(qc, user?.id);
    const poll = window.setInterval(() => void verifyConsumerMembership(qc, user?.id), 2500);
    const giveUp = window.setTimeout(() => setActivationStuck(true), 10000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, hasAccess, activationStuck]);

  // A member who was bounced here by the paywall (so a `next` path exists) but
  // actually has access must not be left staring at the membership page —
  // forward them to where they were headed, or into the app.
  useEffect(() => {
    if (confirming || isLoading || !hasAccess) return;
    const pending = isSafeInternalPath(nextPath)
      ? nextPath
      : isSafeInternalPath(storedNextPath)
        ? storedNextPath
        : null;
    if (!pending) return;
    try {
      localStorage.removeItem("strand_subscribe_next");
    } catch {}
    nav(pending === "/subscribe" ? "/home" : pending, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, hasAccess, isLoading]);


  const retryActivation = () => {
    setActivationStuck(false);
    setConfirming(true);
  };



  const startCheckout = async () => {
    setBusy("subscribe");
    const returnTo = isSafeInternalPath(nextPath) ? nextPath : isSafeInternalPath(storedNextPath) ? storedNextPath : "/home";
    try {
      localStorage.setItem("strand_subscribe_next", returnTo);
    } catch {}
    try {
      const { data, error } = await supabase.functions.invoke("consumer-checkout", {
        body: { next: returnTo, tier },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error(
        await friendlyInvokeError(
          e,
          "We couldn't open the payment page just now. Please try again in a moment.",
        ),
      );
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { data, error } = await supabase.functions.invoke("consumer-portal");
      if (error) throw error;
      if (!data?.url) throw new Error("Portal URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not open billing portal");
      setBusy(null);
    }
  };

  const basePrice = pricing.standard;
  const price = tier === "plus" ? pricing.plus : basePrice;
  const perDay = (price / 30).toFixed(2);
  const returnTo = isSafeInternalPath(nextPath) ? nextPath : isSafeInternalPath(storedNextPath) ? storedNextPath : "/home";


  const CtaBlock = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center gap-2 text-sm text-foreground/60 py-2">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {subscription?.cancel_at_period_end && stripeActive && (
          <div className="flex items-start gap-2 text-[12px] text-warn font-body">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>Cancellation scheduled — access continues until the end of the current period.</span>
          </div>
        )}

        {hasAccess ? (
          <div className="space-y-2">
            <Button variant="gold" size="pill" className="w-full" onClick={() => nav(returnTo)}>
              Continue to STRAND
            </Button>
            {stripeActive && (
              <Button variant="goldOutline" size="pill" className="w-full" onClick={openPortal} disabled={busy !== null}>
                {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : "Manage subscription"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <Button variant="gold" size="pill" className="w-full" onClick={startCheckout} disabled={busy !== null}>
              {busy === "subscribe" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : subscription?.status === "canceled" || subscription?.status === "past_due" ? (
                "Resubscribe →"
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CreditCard className="size-4" /> Begin my membership →
                </span>
              )}
            </Button>
            <p className="text-[11px] text-center text-foreground/60 font-body">
              Have a promo code? Enter it at checkout. Cancel any time.
            </p>
          </>
        )}
      </div>
    );
  };

  // Consumer plan surface only — professional, brand and admin accounts are
  // never shown the consumer paywall or plan upgrade options. Do not use
  // `canUpgrade` here: that flag intentionally requires an existing active
  // membership and is only for STRAND+ upsells. Using it on the base paywall
  // bounced an unpaid consumer to /home, whose PaidGate immediately bounced
  // them back here, producing a visible redirect loop.
  if (roleLoading) return <LoadingDot />;
  if (accountType !== "consumer") return <Navigate to={homePath} replace />;

  // Paid but not yet confirmed — recovery screen, never the paywall.
  if (activationStuck) {
    return <ActivatingMembership stuck onRetry={retryActivation} />;
  }

  // Post-payment interstitial — celebratory, then straight into the app.
  if (confirming) {

    return (
      <ScreenLayout>
        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-4">
          <CheckCircle2 className="size-10 text-primary" />
          <h1 className="font-display text-[26px] leading-tight text-foreground">
            Welcome to STRAND
          </h1>
          <p className="font-body text-sm text-foreground/70 max-w-[260px]">
            Your membership is active. Setting up your personal analysis…
          </p>
          <Loader2 className="size-5 animate-spin text-primary mt-2" />
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      {/* No membership, no way out but paying or signing out — the paywall is
          deliberately terminal, so no back arrow is offered. */}
      <TitleBar title="Membership" onBack={hasAccess ? smartBack(nav, "/home") : undefined} />

      <div className="px-5 pb-12 space-y-6">
        {hasAccess && (
          <div className="rounded-[14px] bg-good/10 border border-good/30 p-4 flex items-start gap-2">
            <CheckCircle2 className="size-4 text-good shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-body font-semibold">
                {complimentary
                  ? "You have complimentary access"
                  : isAdminOrPro
                    ? "Team / professional access"
                    : "Membership active"}
              </p>
              {stripeActive && subscription?.current_period_end && (
                <p className="text-[12px] text-foreground/70 font-body mt-0.5">
                  {subscription.cancel_at_period_end ? "Ends" : "Renews"} {formatDate(subscription.current_period_end)}
                </p>
              )}
              {complimentary && (
                <p className="text-[12px] text-foreground/70 font-body mt-0.5">
                  A gift from the STRAND team — no payment required.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="text-center pt-1 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25">
            <HairStrandIcon className="h-4 w-auto text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              The STRAND Membership
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-foreground">
            The first hair companion<br />built entirely around{" "}
            <span className="italic text-primary">you</span>.
          </h1>
          <p className="font-body text-[13.5px] text-foreground/75 leading-relaxed max-w-[320px] mx-auto">
            Not another routine tracker. STRAND reads your hair, your products and your
            history — then guides you, one wash day at a time.
          </p>
        </div>


        {/* Full marketing block — shared with /start-trial. */}
        <MembershipMarketing />


        {/* Tier toggle */}
        {!hasAccess && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 rounded-full bg-muted/40 border border-border p-1">
              <button
                type="button"
                onClick={() => setTier("standard")}
                className={cn(
                  "h-9 rounded-full text-[12px] font-body font-semibold transition-colors",
                  tier === "standard" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70",
                )}
              >
                {`STRAND · £${pricing.standard.toFixed(2)}`}
              </button>
              <button
                type="button"
                onClick={() => setTier("plus")}
                className={cn(
                  "h-9 rounded-full text-[12px] font-body font-semibold transition-colors inline-flex items-center justify-center gap-1",
                  tier === "plus" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70",
                )}
              >
                <Sparkles className="size-3" /> {`STRAND+ · £${pricing.plus.toFixed(2)}`}
              </button>
            </div>
            {tier === "plus" && <PlusExtrasList />}

          </div>
        )}

        {/* Price card */}
        <PriceCard price={price} tier={tier}>
          <CtaBlock />
        </PriceCard>

        <AdvisoryNotes />

        <PaymentsNote />



        {/* Sign out is the only exit without a membership. */}
        {!hasAccess && (
          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-[12px] font-body font-semibold text-foreground/70 underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default Subscribe;
