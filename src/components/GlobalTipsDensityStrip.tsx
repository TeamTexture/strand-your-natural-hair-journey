import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, ListChecks, Sparkles } from "lucide-react";
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


const COLLAPSE_KEY = "strand.tipsStrip.collapsed";

const GlobalTipsDensityStrip = ({ className }: { className?: string }) => {
  const { level } = useTipsLevel();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

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
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show guidance level detail"
          className="w-full flex items-center gap-2 text-left"
        >
          <Icon className="size-3.5 text-primary shrink-0" />
          <span className="text-[10px] uppercase tracking-[0.12em] text-primary font-body font-bold truncate">
            {section} · {isNutrition ? "Full plan" : TIPS_LEVEL_LABEL[level]}
          </span>
          <ChevronDown className="size-3.5 text-primary/70 ml-auto shrink-0" />
        </button>
      ) : (
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
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Minimise guidance level bar"
          className="size-6 rounded-full flex items-center justify-center text-primary/70 hover:bg-primary/10 transition-colors shrink-0"
        >
          <ChevronUp className="size-3.5" />
        </button>
      </div>
      )}
    </div>
  );
};

export default GlobalTipsDensityStrip;