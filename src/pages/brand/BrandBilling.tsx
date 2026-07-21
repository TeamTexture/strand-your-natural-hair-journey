import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, AlertCircle, Loader2, Receipt } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";
import { useRoles } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}
const money = (p: number | null | undefined) => `£${((p ?? 0) / 100).toFixed(2)}`;

function statusLabel(status: string | undefined) {
  switch (status) {
    case "active": return { label: "Active", tone: "good" as const };
    case "trialing": return { label: "Trial", tone: "good" as const };
    case "past_due":
    case "unpaid": return { label: "Past due", tone: "warn" as const };
    case "canceled": return { label: "Cancelled", tone: "muted" as const };
    case "incomplete":
    case "incomplete_expired": return { label: "Incomplete", tone: "warn" as const };
    default: return { label: "Not subscribed", tone: "muted" as const };
  }
}

const PRICE = 99;

const BrandBilling = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { subscription, isActive, subActive, isLoading, refetch } = useBrandSubscription();
  const { isAdmin } = useRoles();
  const [busy, setBusy] = useState<"subscribe" | "portal" | null>(null);

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") {
      toast.success("Subscription started. Welcome to STRAND Brand Access.");
      refetch();
      const nextPath = params.get("next");
      params.delete("checkout");
      params.delete("next");
      setParams(params, { replace: true });
      if (nextPath && nextPath.startsWith("/") && nextPath !== "/brand/billing") {
        // Small delay so the toast is seen.
        setTimeout(() => nav(nextPath), 600);
      }
    } else if (c === "cancelled") {
      toast("Checkout cancelled.");
      params.delete("checkout");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placement payment history — paid brand_offers for this user.
  const historyQ = useQuery({
    queryKey: ["brand_placement_history", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("id, headline, total_price_pence, paid_at, status, starts_on, ends_on")
        .eq("brand_user_id", user!.id)
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const startCheckout = async () => {
    setBusy("subscribe");
    try {
      const { data, error } = await supabase.functions.invoke("brand-subscription-checkout", {
        body: { next: "/brand/billing" },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url as string;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not start checkout");
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { data, error } = await supabase.functions.invoke("brand-portal");
      if (error) throw error;
      if (!data?.url) throw new Error("Portal URL missing");
      window.location.href = data.url as string;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not open billing portal");
      setBusy(null);
    }
  };

  const status = isAdmin && !subActive
    ? { label: "Admin", tone: "good" as const }
    : statusLabel(subscription?.status);

  return (
    <ScreenLayout>
      <TitleBar title="Billing" onBack={() => nav("/brand")} />
      <div className="px-5 pb-10 space-y-5">
        <SectionLabel>STRAND Brand Access</SectionLabel>

        <div className="rounded-[16px] border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CreditCard className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display text-lg font-semibold leading-tight">
                  £{PRICE}
                  <span className="text-sm font-body font-normal text-foreground/70"> / year</span>
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
                Unlimited offer submissions. Placement fees per campaign apply.
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
              {!subActive && !isAdmin && (subscription?.status === "past_due" || subscription?.status === "unpaid") && (
                <div className="flex items-start gap-2 text-[12px] text-warn font-body">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>Your payment failed. Update your card in the billing portal to keep submitting new campaigns.</span>
                </div>
              )}

              {subActive ? (
                <Button className="w-full rounded-pill" onClick={openPortal} disabled={busy !== null}>
                  {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : "Manage subscription"}
                </Button>
              ) : (
                <Button className="w-full rounded-pill" onClick={startCheckout} disabled={busy !== null}>
                  {busy === "subscribe" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : subscription?.status === "canceled" || subscription?.status === "past_due"
                    ? "Resubscribe"
                    : "Subscribe"}
                </Button>
              )}
              {isAdmin && !subActive && (
                <p className="text-[11px] text-foreground/60 font-body text-center">
                  Admin override — you have brand access without a subscription.
                </p>
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
            <li>· Unlimited offer campaigns for 12 months</li>
            <li>· Performance analytics (impressions, taps, wishlist)</li>
            <li>· AI product pages personalised for each member</li>
            <li>· Placement fees per campaign apply</li>
          </ul>
        </div>

        <SectionLabel>Placement payments</SectionLabel>
        <div className="space-y-2">
          {historyQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-foreground/60 py-2">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (historyQ.data ?? []).length === 0 ? (
            <p className="text-[12px] text-foreground/60 font-body italic px-1">
              No paid campaigns yet.
            </p>
          ) : (
            (historyQ.data ?? []).map((o) => (
              <button
                key={o.id}
                onClick={() => nav(`/brand/offers/${o.id}`)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-[12px] border border-border bg-card hover:bg-secondary/40 transition"
              >
                <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Receipt className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-body font-semibold truncate">{o.headline || "Campaign"}</p>
                  <p className="text-[11px] text-foreground/60 font-body">
                    {formatDate(o.paid_at)} · {o.starts_on ? formatDate(o.starts_on) : "—"} → {o.ends_on ? formatDate(o.ends_on) : "—"}
                  </p>
                </div>
                <span className="text-[13px] font-body font-semibold">{money(o.total_price_pence)}</span>
              </button>
            ))
          )}
        </div>

        <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
          Payments processed by Stripe. Cancel any time from the billing portal.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default BrandBilling;
