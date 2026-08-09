import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, ListChecks, Sparkles } from "lucide-react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { TIPS_LEVEL_LABEL, type TipsLevel } from "@/lib/tipsLevel";
import { cn } from "@/lib/utils";

const routeLabel = (path: string): string => {
  if (path.startsWith("/wash")) return "Wash day";
  if (path.startsWith("/products")) return "Products";
  if (path.startsWith("/blood")) return "Blood work";
  if (path.startsWith("/nutrition")) return "Nutrition";
  if (path.startsWith("/appointments")) return "Appointments";
  if (path.startsWith("/directory")) return "Directory";
  if (path.startsWith("/messages")) return "Messages";
  if (path.startsWith("/journal")) return "Journal";
  if (path.startsWith("/onboarding")) return "Setup";
  if (path.startsWith("/profile")) return "Profile";
  if (path.startsWith("/forum") || path.startsWith("/plus")) return "STRAND+";
  if (path.startsWith("/brands") || path.startsWith("/offers")) return "Offers";
  return "Today";
};

const densityCopy: Record<TipsLevel, { icon: typeof CheckCircle2; label: string; body: string }> = {
  1: { icon: CheckCircle2, label: "One clear next step", body: "The single thing that matters most, and why — nothing else." },
  2: { icon: ListChecks, label: "Essentials only", body: "The top few actions, each with the why and how to do it." },
  3: { icon: Sparkles, label: "Step-by-step support", body: "Everything in full: extended explanations, plain language and what to avoid." },
};


const GlobalTipsDensityStrip = ({ className }: { className?: string }) => {
  const { level } = useTipsLevel();
  const location = useLocation();
  // Nutrition/diet guidance ignores the guidance level — always full detail.
  const isNutrition = location.pathname.startsWith("/nutrition");
  const meta = isNutrition
    ? { icon: Sparkles, label: "Always full detail", body: "Your nutrition plan is shown in full — every supplement, meal idea and thing to avoid." }
    : densityCopy[level];
  const Icon = meta.icon;
  const section = useMemo(() => routeLabel(location.pathname), [location.pathname]);

  return (
    <div
      data-testid="global-tips-density-strip"
      data-tips-level={level}
      className={cn(
        "border-t border-border/30 bg-primary/5 px-4 py-2 animate-in fade-in-0 duration-200",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 size-7 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
          <Icon className="size-3.5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary font-body font-bold leading-none">
            {section} · {isNutrition ? "Full plan" : TIPS_LEVEL_LABEL[level]}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/80">
            <span className="font-semibold text-foreground">{meta.label}.</span> {meta.body}
          </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalTipsDensityStrip;