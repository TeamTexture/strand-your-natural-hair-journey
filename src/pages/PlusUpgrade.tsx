import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Users, BookOpen, Calendar, MessageCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import HairStrandIcon from "@/components/HairStrandIcon";
import { supabase } from "@/integrations/supabase/client";
import { usePlusAccess } from "@/hooks/usePlusAccess";

const PILLARS = [
  { icon: Users, title: "Community forum", body: "Ask, share and learn with members like you." },
  { icon: MessageCircle, title: "Member chat", body: "Message any STRAND+ member directly." },
  { icon: BookOpen, title: "Courses, ebooks & videos", body: "The STRAND library, added to every month." },
  { icon: Calendar, title: "Members-only events", body: "Digital and in-person, RSVP inside the app." },
];

const PlusUpgrade = () => {
  const nav = useNavigate();
  const { hasPlus } = usePlusAccess();
  const [busy, setBusy] = useState(false);

  const upgrade = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-consumer-upgrade");
      if (error) throw error;
      if (!data?.url) throw new Error("Upgrade link missing");
      window.location.href = data.url as string;
    } catch (e) {
      toast.error((e as Error).message ?? "Could not start upgrade");
      setBusy(false);
    }
  };

  if (hasPlus) {
    return (
      <ScreenLayout>
        <TitleBar title="STRAND+" onBack={() => nav("/home")} />
        <div className="px-5 pt-8 text-center space-y-4">
          <div className="mx-auto size-16 rounded-full bg-primary/12 text-primary flex items-center justify-center">
            <Sparkles className="size-8" />
          </div>
          <h1 className="font-display text-2xl font-semibold">You're already STRAND+</h1>
          <p className="font-body text-sm text-foreground/70">Everything is unlocked. Head back to explore.</p>
          <Button variant="gold" size="pill" className="w-full" onClick={() => nav("/home")}>Back to STRAND</Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Upgrade" onBack={() => nav(-1)} />
      <div className="px-5 pb-12 space-y-6">
        <div className="text-center pt-1 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25">
            <HairStrandIcon className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              STRAND+
            </span>
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-foreground">
            Everything in STRAND —<br />plus the <span className="italic text-primary">circle</span>.
          </h1>
          <p className="font-body text-[13px] text-foreground/70 leading-relaxed max-w-[320px] mx-auto">
            The premium tier adds community, chat, courses and events to
            everything you already have.
          </p>
        </div>

        <div className="space-y-2.5">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="relative overflow-hidden rounded-[14px] p-4 flex items-center gap-4 border border-primary/30 bg-brown text-brown-foreground">
                <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-primary" />
                <div className="size-11 shrink-0 rounded-full flex items-center justify-center bg-primary/15 text-primary border border-primary/30">
                  <Icon className="size-[20px]" strokeWidth={1.6} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[15px] font-semibold leading-tight text-brown-foreground">{p.title}</h3>
                  <p className="font-body text-[11.5px] leading-snug text-brown-foreground/80 mt-0.5">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <SurfaceCard tone="gold" className="!p-5 space-y-4 text-center">
          <div>
            <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">STRAND+ membership</p>
            <div className="mt-2 flex items-baseline justify-center gap-1.5">
              <span className="font-display text-[44px] font-semibold leading-none text-foreground">£14.99</span>
              <span className="font-body text-sm text-foreground/70">/ month</span>
            </div>
            <p className="text-[12px] font-body text-foreground/70 mt-1.5 leading-snug">
              Upgraded pro-rata from your current £9.99 membership.
            </p>
          </div>
          <Button variant="gold" size="pill" className="w-full" onClick={upgrade} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : (
              <span className="inline-flex items-center gap-2">Upgrade — £14.99/mo <ArrowRight className="size-4" /></span>
            )}
          </Button>
          <p className="text-[11px] text-foreground/55 font-body flex items-center justify-center gap-1">
            <CheckCircle2 className="size-3" /> Cancel any time
          </p>
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default PlusUpgrade;
