import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  Megaphone,
  BarChart3,
  Sparkles,
  CalendarDays,
  Heart,
  Users,
  ShieldCheck,
  Lock,
  Zap,
  Loader2,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import HairStrandIcon from "@/components/HairStrandIcon";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type Pillar = { icon: LucideIcon; title: string; benefit: string };

const PILLARS: Pillar[] = [
  {
    icon: Megaphone,
    title: "In-app placements",
    benefit: "Sponsored banners on Home, Products and Wash Day — seen by members every single day.",
  },
  {
    icon: CalendarDays,
    title: "Placement calendar",
    benefit: "Book exclusive daily slots ahead of time. One brand, one placement, no clutter.",
  },
  {
    icon: Sparkles,
    title: "AI product pages",
    benefit: "Every offer gets a native, personalised suitability analysis for each member's hair.",
  },
  {
    icon: Heart,
    title: "Wishlist integration",
    benefit: "Members save your product to their shelf with your discount code preserved.",
  },
  {
    icon: BarChart3,
    title: "Live performance stats",
    benefit: "Impressions, taps and wishlist adds tracked in real time on your dashboard.",
  },
  {
    icon: Users,
    title: "A curated audience",
    benefit: "Reach women deeply invested in natural hair, health and clean product choices.",
  },
  {
    icon: Zap,
    title: "Fast approvals",
    benefit: "Admin-reviewed offers go live within days, not weeks. Refresh creative any time.",
  },
  {
    icon: ShieldCheck,
    title: "Trust by design",
    benefit: "Clear 'Sponsored' labelling and honest AI analysis. No hidden pushes.",
  },
];

const REASSURANCE = [
  { icon: Lock, title: "Cancel any time", body: "One tap in the billing portal. No calls, no forms." },
  { icon: ShieldCheck, title: "Your brand, your control", body: "Pause, edit or retire offers whenever you like." },
  { icon: Sparkles, title: "Always improving", body: "New placement surfaces and analytics ship every month." },
];

const PRICE = 5.99;

const BrandSubscribe = () => {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const startCheckout = async () => {
    setBusy(true);
    // Backend wiring (brand-subscribe-checkout) can be added later.
    toast("Brand subscription checkout is coming soon.");
    setBusy(false);
  };

  const perDay = (PRICE / 30).toFixed(2);

  return (
    <ScreenLayout>
      <TitleBar title="Brand membership" onBack={() => nav("/brand")} />

      <div className="px-5 pb-12 space-y-6">
        {/* Hero */}
        <div className="text-center pt-1 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25">
            <HairStrandIcon className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              STRAND for Brands
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-foreground">
            Place your brand in the<br />hands of women who{" "}
            <span className="italic text-primary">care</span>.
          </h1>
          <p className="font-body text-[13.5px] text-foreground/75 leading-relaxed max-w-[320px] mx-auto">
            STRAND members are opted-in, engaged and hungry for products that actually
            work for their hair. Show up where the decisions are being made.
          </p>
        </div>

        {/* Section header */}
        <div className="text-center pt-2 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brown/10 border border-brown/20">
            <HairStrandIcon className="w-3 h-3 text-brown" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-brown">
              What you get
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Eight ways to reach members
          </h2>
          <p className="font-body text-[12.5px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
            Everything you need to launch, run and measure an offer inside STRAND.
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
                £{PRICE.toFixed(2)}
              </span>
              <span className="font-body text-sm text-foreground/70">/ month</span>
            </div>
            <p className="text-[12px] font-body text-foreground/70 mt-1.5 leading-snug">
              Roughly <span className="font-semibold text-foreground">£{perDay} a day</span> —
              less than a coffee to be seen by an audience actively choosing products.
            </p>
            <p className="text-[11px] font-body text-foreground/60 mt-1.5 leading-snug">
              Placement bookings (£50 / £75 / £100 per slot) are billed separately.
            </p>
          </div>

          <div className="space-y-3">
            <Button variant="gold" size="pill" className="w-full" onClick={startCheckout} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CreditCard className="size-4" /> Begin brand membership →
                </span>
              )}
            </Button>
            <p className="text-[11px] text-center text-foreground/60 font-body">
              Have a promo code? Enter it at checkout. Cancel any time.
            </p>
          </div>
        </SurfaceCard>

        <p className="text-[11px] text-foreground/50 font-body text-center leading-relaxed">
          Payments processed securely by Stripe. Your offers and analytics are preserved
          if your membership lapses — access is restored the moment you resubscribe.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default BrandSubscribe;
