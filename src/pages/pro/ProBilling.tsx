import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useRoles } from "@/hooks/useRoles";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { smartBack } from "@/lib/smartBack";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case "active":
      return { label: "Active", tone: "good" as const };
    case "trialing":
      return { label: "Trial", tone: "good" as const };
    case "past_due":
    case "unpaid":
      return { label: "Past due", tone: "warn" as const };
    case "canceled":
      return { label: "Cancelled", tone: "muted" as const };
    case "incomplete":
    case "incomplete_expired":
      return { label: "Incomplete", tone: "warn" as const };
    default:
      return { label: "Not subscribed", tone: "muted" as const };
  }
}

const ProBilling = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { subscription, isActive, isLoading, refetch } = useProSubscription();
  const { isAdmin } = useRoles();
  const [busy, setBusy] = useState<"subscribe" | "portal" | null>(null);

  // Fetch price from platform_settings
  const priceQ = useQuery({
    queryKey: ["platform_settings", "pro_monthly_price_gbp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "pro_monthly_price_gbp")
        .maybeSingle();
      const raw = (data?.value as number | string | null) ?? 12.99;
      const n = typeof raw === "string" ? parseFloat(raw) : raw;
      return isFinite(n) ? n : 12.99;
    },
  });

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") {
      toast.success("Subscription started. Welcome to STRAND Pro.");
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
      const { data, error } = await supabase.functions.invoke("pro-checkout");
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message ?? "Could not start checkout");
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { data, error } = await supabase.functions.invoke("pro-portal");
      if (error) throw error;
      if (!data?.url) throw new Error("Portal URL missing");
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message ?? "Could not open billing portal");
      setBusy(null);
    }
  };

  const status = isAdmin && !isActive
    ? { label: "Admin", tone: "good" as const }
    : statusLabel(subscription?.status);
  const price = priceQ.data ?? 12.99;

  return (
    <ScreenLayout>
      <TitleBar title="Billing" onBack={smartBack(nav, "/pro")} />
      <div className="px-5 pb-10 space-y-5">
        <SectionLabel>STRAND Pro Membership</SectionLabel>

        <div className="rounded-[16px] border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CreditCard className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display text-lg font-semibold leading-tight">
                  £{price.toFixed(2)}
                  <span className="text-sm font-body font-normal text-foreground/70"> / month</span>
                </p>
                <span
                  className={
                    "text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full font-body " +
                    (status.tone === "good"
                      ? "bg-good/15 text-good"
                      : status.tone === "warn"
                        ? "bg-warn/20 text-warn"
                        : "bg-secondary text-muted-foreground")
                  }
                >
                  {status.label}
                </span>
              </div>
              <p className="text-[12px] text-foreground/70 mt-1 leading-snug font-body">
                Client enquiries, passport access and the STRAND directory placement.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-foreground/60 py-2">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {subscription?.current_period_end && (
                <div className="flex items-center justify-between text-sm font-body">
                  <span className="text-foreground/70">
                    {subscription.cancel_at_period_end ? "Ends" : "Renews"}
                  </span>
                  <span className="font-medium">{formatDate(subscription.current_period_end)}</span>
                </div>
              )}
              {subscription?.cancel_at_period_end && (
                <div className="flex items-start gap-2 text-[12px] text-warn font-body">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>Cancellation scheduled — access continues until the end of the current period.</span>
                </div>
              )}

              {isActive ? (
                <Button
                  className="w-full rounded-pill"
                  onClick={openPortal}
                  disabled={busy !== null}
                >
                  {busy === "portal" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Manage subscription"
                  )}
                </Button>
              ) : (
                <Button
                  className="w-full rounded-pill"
                  onClick={startCheckout}
                  disabled={busy !== null}
                >
                  {busy === "subscribe" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : subscription?.status === "canceled" || subscription?.status === "past_due" ? (
                    "Resubscribe"
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-[14px] bg-secondary/40 border border-border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary" />
            <p className="font-display text-sm font-semibold">What's included</p>
          </div>
          <ul className="text-[13px] font-body text-foreground/80 space-y-1 pl-1">
            <li>· Directory placement</li>
            <li>· Client enquiries with pre-populated context</li>
            <li>· Access to consented client passports</li>
            <li>· Profile, photos and offers</li>
          </ul>
        </div>

        <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
          Payments processed by Stripe. Cancel any time from the billing portal.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default ProBilling;
