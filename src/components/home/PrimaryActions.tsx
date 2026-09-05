// HOME — the four primary destinations that sit directly under the daily
// touchpoint card. Ordering and hierarchy only: these use the exact same card
// treatment as the existing Quick actions tiles (14px radius, card surface,
// border, gold accents) — no new design.

import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

type Action = {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  to: string;
  tour?: string;
};

const PrimaryActions = ({ lastWashSub }: { lastWashSub?: string }) => {
  const navigate = useNavigate();

  const actions: Action[] = [
    {
      key: "wash",
      emoji: "💧",
      title: "Wash day",
      sub: lastWashSub || "Log and plan your wash days",
      to: "/wash-day",
      tour: "primary-wash",
    },
    {
      key: "products",
      emoji: "📸",
      title: "Scan a product",
      sub: "Ingredient analysis for your hair",
      to: "/products",
      tour: "primary-products",
    },
    {
      key: "nutrition",
      emoji: "🥗",
      title: "Diet and nutrition",
      sub: "Food and supplements for your hair",
      to: "/nutrition-plan",
      tour: "primary-nutrition",
    },
    {
      key: "directory",
      emoji: "💇🏾‍♀️",
      title: "Professional directory",
      sub: "Find a trusted specialist",
      to: "/directory",
      tour: "primary-directory",
    },
  ];

  return (
    <div className="px-5 pb-2 space-y-2.5">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          data-tour={a.tour}
          onClick={() => navigate(a.to)}
          className="w-full text-left p-3.5 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors flex items-center gap-3"
        >
          <span className="text-xl leading-none shrink-0" aria-hidden>
            {a.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="card-title block font-display text-[14.5px] font-semibold leading-tight break-words">
              {a.title}
            </span>
            <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug break-words">
              {a.sub}
            </span>
          </span>
          <ChevronRight className="size-4 text-primary shrink-0" aria-hidden />
        </button>
      ))}
    </div>
  );
};

export default PrimaryActions;
