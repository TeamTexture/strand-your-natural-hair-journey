import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrialSavePersonalisation } from "@/hooks/useTrialSaveOffer";

/**
 * The one personal line shown on a trial save screen, plus at most one next
 * action. Everything here is decided server-side — this component never invents
 * a fact and never renders a missing one.
 */
const ACTION_LABEL = {
  log_wash_day: "Log a wash day",
  scan_product: "Scan a product",
} as const;

const ACTION_PATH = {
  log_wash_day: "/wash-day",
  scan_product: "/products",
} as const;

const TrialSavePersonalisationCard = ({
  personalisation,
  onNavigate,
}: {
  personalisation: TrialSavePersonalisation | null;
  onNavigate?: () => void;
}) => {
  const navigate = useNavigate();
  if (!personalisation) return null;

  const { factLine, reasonLine, action, noActivity } = personalisation;
  // Nothing logged yet → the fallback card, whatever her profile holds.
  const body = noActivity
    ? "You haven't logged a wash day yet. It takes two minutes and we'll start building tips around your hair from there."
    : [factLine, reasonLine].filter(Boolean).join(" ");

  if (!body) return null;

  return (
    <div className="rounded-[14px] border border-border bg-card px-4 py-3.5 min-w-0">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center mt-0.5">
          <Sparkles className="size-3.5" />
        </span>
        <p className="font-body text-[12.5px] leading-snug text-foreground min-w-0 flex-1 break-words">
          {body}
        </p>
      </div>
      {action && (
        <Button
          variant="outline"
          size="pill"
          className="w-full mt-3"
          onClick={() => {
            onNavigate?.();
            navigate(ACTION_PATH[action]);
          }}
        >
          {ACTION_LABEL[action]}
        </Button>
      )}
    </div>
  );
};

export default TrialSavePersonalisationCard;
