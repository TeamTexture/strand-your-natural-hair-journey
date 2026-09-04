import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import StatusBar from "@/components/StatusBar";
import SurfaceCard from "@/components/SurfaceCard";
import HairStrandIcon from "@/components/HairStrandIcon";
import PaymentConfirming from "@/components/subscribe/PaymentConfirming";
import MembershipMarketing, {
  AdvisoryNotes,
  PaymentsNote,
  PlusExtrasList,
  PriceCard,
} from "@/components/subscribe/MembershipMarketing";
import { Button } from "@/components/ui/button";
import LoadingDot from "@/components/LoadingDot";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useConsumerPricing, formatGbp } from "@/hooks/useConsumerPricing";
import { verifyConsumerMembership } from "@/lib/membershipVerify";
import { friendlyInvokeError } from "@/lib/invokeError";
import { formatTrialEnd, TRIAL_DAYS } from "@/lib/trialOffer";
import {
  getConsumerOnboardingStatus,
  getPostTrialPath,
  isSafeInternalPath,
} from "@/lib/consumerOnboarding";
import { useTrialOffer } from "@/hooks/useTrialOffer";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

const AFTER_TRIAL_PATH = "/onboarding/goal";

/**
 * Backoff between verification attempts after returning from Stripe, indexed by
 * attempt number. Stripe webhook delivery is usually sub-second but can lag by
 * tens of seconds under retry; the old fixed 5 x 2.5s (12.5s) window gave up far
 * too early and put the subscribe CTA back in front of a member who had already
 * paid. This covers ~2 minutes before we stop polling.
 */
const POLL_BACKOFF_MS: Record<number, number> = {
  1: 1_500,
  2: 2_000,
  3: 3_000,
  4: 4_000,
  5: 5_000,
  6: 6_000,
  7: 8_000,
  8: 10_000,
  9: 12_000,
  10: 15_000,
  11: 15_000,
  12: 15_000,
  13: 15_000,
};

type Tier = "standard" | "plus";


/**
 * The 3-day free trial paywall — shown after registration details are saved.
 *
 * The charge terms and the CTA share a fixed footer, so they are on screen
 * together at 375px no matter how far the content above has scrolled. A member
 * can never start a trial without the terms in view.
 */
const TrialPaywall = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, signOut, isViewingAs } = useAuth();
  const { hasAccess, isLoading } = useConsumerSubscription();
  const { standard, plus } = useConsumerPricing();
  const { trialEligible, known: offerKnown } = useTrialOffer();
  const { data: onboarding } = useOnboardingStatus();

  const [tier, setTier] = useState<Tier>("plus");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(() => params.get("checkout") === "success");
  const [stalled, setStalled] = useState(false);
  // Bumped by "Check again" so the polling effect starts a fresh backoff window.
  const [pollNonce, setPollNonce] = useState(0);

  const [checking, setChecking] = useState(false);

  const nextPath = isSafeInternalPath(params.get("next")) ? params.get("next")! : AFTER_TRIAL_PATH;
  const price = tier === "plus" ? plus : standard;
  const trialEnd = formatTrialEnd();

  // A trial is only offered when the checkout will actually honour it — the
  // one-trial-per-account rule is read from the same fields the edge function
  // checks, so the screen and Stripe can never disagree.
  const offerTrial = !offerKnown || trialEligible;

  // "Has she given us anything yet?" — read from the existing completeness
  // helpers, never a new check. Any captured stage counts as returning.
  const hasData = !!(
    onboarding &&
    (onboarding.markedComplete ||
      onboarding.basicComplete ||
      onboarding.healthComplete ||
      onboarding.hairComplete ||
      onboarding.styleComplete ||
      onboarding.bloodOnFile)
  );

  const copy = !hasData
    ? {
        eyebrow: "Welcome to STRAND",
        heading: "Three days free, then decide.",
        sub: "Set up your hair profile and use everything. Cancel before day three and you pay nothing.",
        cta: `Start my ${TRIAL_DAYS} days free`,
      }
    : offerTrial
      ? {
          eyebrow: "Your profile is waiting",
          heading: "Three days free, then decide.",
          sub: "Everything you've already entered is saved. Start your trial to pick up where you left off.",
          cta: `Start my ${TRIAL_DAYS} days free`,
        }
      : {
          eyebrow: "Your profile is waiting",
          heading: "Pick up where you left off.",
          sub: "Everything you've already entered is saved.",
          cta: "Subscribe and continue",
        };

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "cancelled") {
      toast(
        offerTrial
          ? "No card taken. You can start your free trial whenever you like."
          : "No card taken. You can subscribe whenever you like.",
      );
      params.delete("checkout");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe returns before the webhook lands, so ask Stripe directly and hold
  // here until the membership is confirmed — never drop her back on the paywall.
  // Destination is resolved AFTER entitlement is confirmed, from the single
  // source of truth. Never a hardcoded step, so nothing already answered is
  // re-asked and nothing is overwritten.
  const leaving = useRef(false);
  const resumeAfterTrial = async () => {
    if (leaving.current) return;
    leaving.current = true;
    let target = nextPath;
    try {
      if (user?.id) target = getPostTrialPath(await getConsumerOnboardingStatus(user.id));
    } catch {
      // A failed read is not an empty profile: fall back to the requested path
      // rather than risk restarting her at step one.
      target = nextPath;
    }
    nav(target, { replace: true });
  };

  useEffect(() => {
    if (hasAccess) {
      void resumeAfterTrial();
      return;
    }
    if (!confirming) return;
    let cancelled = false;
    let attempt = 0;
    let timer = 0;
    const verify = async () => {
      const active = await verifyConsumerMembership(qc, user?.id);
      if (cancelled) return;
      if (active) {
        await resumeAfterTrial();
        return;
      }
      attempt += 1;
      const delay = POLL_BACKOFF_MS[attempt];
      if (delay === undefined) {
        // Polling window exhausted. She stays on a payment-confirming screen —
        // the subscribe CTA is never restored, because a second tap would open
        // a second Stripe checkout at full price on top of the first charge.
        setStalled(true);
        return;
      }
      timer = window.setTimeout(() => void verify(), delay);
    };
    void verify();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, hasAccess, pollNonce]);

  // Manual re-check from the stalled state: asks Stripe again and restarts the
  // backoff window if it still cannot confirm. It never starts a checkout.
  const checkAgain = async () => {
    setChecking(true);
    try {
      const active = await verifyConsumerMembership(qc, user?.id);
      if (active) {
        await resumeAfterTrial();
        return;
      }
      toast("Still confirming with our payment provider — please try again in a moment.");
      // Bumping the nonce re-runs the polling effect, so she goes back to an
      // actively-polling screen and lands on the stalled state (with Check again
      // and support copy) if it still cannot confirm. Without it she was left on
      // a dead spinner with no action.
      setStalled(false);
      setPollNonce((n) => n + 1);
    } finally {
      setChecking(false);
    }
  };


  const startTrial = async () => {
    setBusy(true);
    try {
      // Last line of defence before spending money: if a subscription already
      // exists (webhook landed while she sat here) we resume instead of paying.
      if (await verifyConsumerMembership(qc, user?.id)) {
        await resumeAfterTrial();
        return;
      }
      const { data, error } = await supabase.functions.invoke("consumer-checkout", {
        body: { next: AFTER_TRIAL_PATH, tier, trial: offerTrial, returnTo: "/start-trial" },
      });
      if (error) throw error;
      if ((data as { already_processing?: boolean } | null)?.already_processing && !data?.url) {
        setConfirming(true);
        setStalled(false);
        return;
      }
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      // Read the server's own sentence out of the invoke error — never the SDK's
      // "Edge Function returned a non-2xx status code".
      toast.error(
        await friendlyInvokeError(
          e,
          offerTrial
            ? "We couldn't start your free trial just now. Please try again in a moment."
            : "We couldn't start your membership just now. Please try again in a moment.",
        ),
      );
      setBusy(false);
    }
  };

  if (confirming && !hasAccess) {
    return (
      <PaymentConfirming
        stalled={stalled}
        trial={offerTrial}
        checking={checking}
        onCheckAgain={() => void checkAgain()}
      />
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
      <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-5 pt-3 pb-6 space-y-6">
        {/* Hero — the only copy that varies between the three variants. */}
        <div className="text-center pt-1 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25">
            <HairStrandIcon className="h-4 w-auto text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              {offerTrial ? `${TRIAL_DAYS} days free` : "The STRAND Membership"}
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-foreground">
            {copy.heading}
          </h1>
          <p className="font-body text-[13.5px] text-foreground/75 leading-relaxed max-w-[320px] mx-auto">
            {copy.sub}
          </p>
        </div>

        {/* Plan cards — compact, STRAND+ pre-selected. */}
        <div className="space-y-2">
          <div className="flex items-stretch gap-2.5">
            <PlanCard value="standard" name="STRAND" amount={standard} />
            <PlanCard value="plus" name="STRAND+" amount={plus} chosen />
          </div>
          {tier === "plus" && <PlusExtrasList />}
        </div>

        {/* Subscribe's full marketing content, unabridged and shared. */}
        <MembershipMarketing />

        <AdvisoryNotes />

        <PaymentsNote />

        {/* Price card — last thing before the pinned footer. No CTA inside it:
            the only call to action is in the footer. */}
        <PriceCard price={price} tier={tier} trial={offerTrial} />
      </main>


      {/* Charge terms and CTA are pinned together — always both in view. */}
      <div className="shrink-0 border-t border-border bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        <SurfaceCard tone="gold" className="p-3">
          <p className="font-body text-[12px] leading-snug text-foreground">
            {offerTrial ? (
              <>
                <span className="font-semibold">Free until {trialEnd}</span>. After that it&apos;s{" "}
                {formatGbp(price)} a month, charged automatically, until you cancel. Cancel any time
                from your profile in two taps.
              </>
            ) : (
              <>
                <span className="font-semibold">{formatGbp(price)} a month</span>, charged today and
                renewing monthly, until you cancel. Cancel any time from your profile in two taps.
              </>
            )}
          </p>
        </SurfaceCard>
        <Button
          variant="gold"
          size="pill"
          className="mt-2.5 w-full"
          onClick={startTrial}
          disabled={busy || isViewingAs}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : copy.cta}
        </Button>
        {isViewingAs ? (
          <p className="mt-1.5 text-center font-body text-[11px] text-muted-foreground">
            Billing cannot be actioned while viewing as a member.
          </p>
        ) : (
          <p className="mt-1.5 text-center font-body text-[11px] text-muted-foreground">
            {offerTrial
              ? "Card details taken now. Nothing charged today."
              : "Cancel any time from your profile."}
          </p>
        )}

        {/* Save and sign out is the ONLY other action — a quiet exit, not a
            door. Tapping it signs the member out; her account and trial offer
            stay intact so she lands back on this screen next sign-in. There is
            deliberately no way to continue into onboarding or the app. */}
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-body text-[12px] text-muted-foreground/80"
          >
            Save and sign out
          </button>
          <p className="font-body text-[10.5px] text-muted-foreground/55">
            Your account is saved. You&apos;ll come back to this screen.
          </p>
        </div>
      </div>

    </div>
  );
};

export default TrialPaywall;
