import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const INCLUDED = [
  "Personalised guidance rooted in How To Love Your Afro",
  "Wash day tracking with weekly focus",
  "Blood work analysis and marker trends",
  "Ingredient analysis on every product",
  "Your professional passport — share with your stylist or trichologist",
];

const Subscribe = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const nextPath = params.get("next");
  const {
    subscription, stripeActive, complimentary, isAdminOrPro, hasAccess, isLoading, refetch,
  } = useConsumerSubscription();
  const [busy, setBusy] = useState<"subscribe" | "portal" | null>(null);

  const priceQ = useQuery({
    queryKey: ["platform_settings", "consumer_monthly_price_gbp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "consumer_monthly_price_gbp")
        .maybeSingle();
      const raw = (data?.value as number | string | null) ?? 9.99;
      const n = typeof raw === "string" ? parseFloat(raw) : raw;
      return isFinite(n) ? n : 9.99;
    },
  });

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") {
      toast.success("Welcome to STRAND. Your membership is active.");
      refetch();
      params.delete("checkout");
      setParams(params, { replace: true });
    } else if (c === "cancelled") {
      toast("Checkout cancelled.");
      params.delete("checkout");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = async () => {
    setBusy("subscribe");
    try {
      const { data, error } = await supabase.functions.invoke("consumer-checkout");
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not start checkout");
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

  const price = priceQ.data ?? 9.99;

  return (
    <ScreenLayout>
      <TitleBar title="Membership" onBack={hasAccess ? () => nav("/home") : undefined} />

      <div className="px-5 pb-10 space-y-5">
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

        <div className="rounded-[16px] border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-xl font-semibold leading-tight">STRAND Membership</p>
              <p className="font-display text-lg font-semibold mt-1">
                £{price.toFixed(2)}
                <span className="text-sm font-body font-normal text-foreground/70"> / month</span>
              </p>
              <p className="text-[12px] text-foreground/70 mt-1 leading-snug font-body">
                Cancel any time.
              </p>
            </div>
          </div>

          <ul className="space-y-2 pt-1">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] font-body text-foreground/85 leading-snug">
                <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-foreground/60 py-2">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {subscription?.cancel_at_period_end && stripeActive && (
                <div className="flex items-start gap-2 text-[12px] text-warn font-body">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>Cancellation scheduled — access continues until the end of the current period.</span>
                </div>
              )}

              {stripeActive ? (
                <Button className="w-full rounded-pill" onClick={openPortal} disabled={busy !== null}>
                  {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : "Manage subscription"}
                </Button>
              ) : complimentary || isAdminOrPro ? (
                <Button className="w-full rounded-pill" onClick={() => nav(nextPath ?? "/home")}>
                  Continue to STRAND
                </Button>
              ) : (
                <>
                  <Button className="w-full rounded-pill" onClick={startCheckout} disabled={busy !== null}>
                    {busy === "subscribe" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : subscription?.status === "canceled" || subscription?.status === "past_due" ? (
                      "Resubscribe"
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <CreditCard className="size-4" /> Subscribe
                      </span>
                    )}
                  </Button>
                  <p className="text-[11px] text-center text-foreground/60 font-body">
                    Have a promo code? Enter it at checkout.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
          Payments processed by Stripe. Your data is never deleted if your membership lapses —
          access is restored the moment you resubscribe.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Subscribe;
