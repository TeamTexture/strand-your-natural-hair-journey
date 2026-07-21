import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Droplet,
  FlaskConical,
  BookOpen,
  Camera,
  Users,
  Calendar,
  Leaf,
  Heart,
  ShieldCheck,
  Lock,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import HairStrandIcon from "@/components/HairStrandIcon";
import { supabase } from "@/integrations/supabase/client";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

type Pillar = {
  icon: LucideIcon;
  title: string;
  benefit: string;
};

const PILLARS: Pillar[] = [
  {
    icon: BookOpen,
    title: "Your personal guide",
    benefit: "Expert guidance tailored to your hair, health and history.",
  },
  {
    icon: Droplet,
    title: "Wash days that count",
    benefit: "Log, schedule and perfect every cleanse, treat and seal.",
  },
  {
    icon: FlaskConical,
    title: "Product intelligence",
    benefit: "Scan, analyse and curate a shelf that actually works for you.",
  },
  {
    icon: Heart,
    title: "Blood work decoded",
    benefit: "Upload results and see what every marker means for your strands.",
  },
  {
    icon: Camera,
    title: "Your hair archive",
    benefit: "Milestones, moodboards, colour and appointment photos in one place.",
  },
  {
    icon: Users,
    title: "The Client Passport",
    benefit: "Walk into any chair with your full story ready to share.",
  },
  {
    icon: Calendar,
    title: "Journaling that listens",
    benefit: "Track goals, moods and appointments with gentle AI prompts.",
  },
  {
    icon: Leaf,
    title: "Rooted in the book",
    benefit: "No fads. Every insight is grounded in How To Love Your Afro.",
  },
];

const REASSURANCE = [
  { icon: Lock, title: "Cancel any time", body: "One tap in the billing portal. No calls, no forms, no guilt." },
  { icon: ShieldCheck, title: "Your data is yours", body: "Encrypted, private, and never sold. Pause your membership and it waits for you." },
  { icon: Sparkles, title: "Always improving", body: "New features and refinements every month, included at no extra cost." },
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
  const perDay = (price / 30).toFixed(2);

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

        {stripeActive ? (
          <Button variant="gold" size="pill" className="w-full" onClick={openPortal} disabled={busy !== null}>
            {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : "Manage subscription"}
          </Button>
        ) : complimentary || isAdminOrPro ? (
          <Button variant="gold" size="pill" className="w-full" onClick={() => nav(nextPath ?? "/home")}>
            Continue to STRAND
          </Button>
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

  return (
    <ScreenLayout>
      <TitleBar title="Membership" onBack={hasAccess ? () => nav("/home") : undefined} />

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
            <HairStrandIcon className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              The STRAND Membership
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-foreground">
            The first hair companion<br />built entirely around{" "}
            <span className="italic text-primary">you</span>.
          </h1>
          <p className="font-body text-[13.5px] text-foreground/75 leading-relaxed max-w-[320px] mx-auto">
            Not another routine tracker. STRAND reads your hair, your bloodwork, your
            products and your history — then guides you, one wash day at a time.
          </p>
        </div>


        {/* Section header */}
        <div className="text-center pt-2 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brown/10 border border-brown/20">
            <HairStrandIcon className="w-3 h-3 text-brown" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-brown">
              What's inside
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Eight pillars, one hair story
          </h2>
          <p className="font-body text-[12.5px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
            Every feature in STRAND is designed to answer one question: what does{" "}
            <span className="italic">your</span> hair need next?
          </p>
        </div>

        {/* Pillars */}
        <div className="relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative space-y-2.5">
            {PILLARS.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="relative overflow-hidden rounded-[14px] p-4 flex items-center gap-4 border border-primary/30 bg-brown text-brown-foreground"
                >
                  <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-primary" />
                  <div className="size-11 shrink-0 rounded-full flex items-center justify-center bg-primary/15 text-primary border border-primary/30">
                    <Icon className="size-[20px]" strokeWidth={1.6} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-body font-bold uppercase tracking-[0.22em] text-primary/80 mb-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="font-display text-[15px] font-semibold leading-[1.2] text-brown-foreground mb-0.5">
                      {p.title}
                    </h3>
                    <p className="font-body text-[11.5px] leading-snug text-brown-foreground/80">
                      {p.benefit}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>



        {/* Reassurance strip */}
        <div className="space-y-2 pt-1">
          {REASSURANCE.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="flex items-start gap-3 p-4 rounded-[14px] border border-border bg-card">
                <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-[13px] font-semibold text-foreground">{r.title}</p>
                  <p className="font-body text-[12px] text-foreground/70 leading-snug mt-0.5">{r.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Price card */}
        <SurfaceCard tone="gold" className="!p-5 space-y-4 text-center">
          <div>
            <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              Monthly membership
            </p>
            <div className="mt-2 flex items-baseline justify-center gap-1.5">
              <span className="font-display text-[44px] font-semibold leading-none text-foreground">
                £{price.toFixed(2)}
              </span>
              <span className="font-body text-sm text-foreground/70">/ month</span>
            </div>
            <p className="text-[12px] font-body text-foreground/70 mt-1.5 leading-snug">
              Roughly <span className="font-semibold text-foreground">£{perDay} a day</span> — less
              than a single deep-conditioning treatment, every month for life.
            </p>
          </div>
          <CtaBlock />
        </SurfaceCard>

        <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
          Payments processed securely by Stripe. Your data is never deleted if your
          membership lapses — access is restored the moment you resubscribe.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Subscribe;
