import { CalendarCheck, Camera, CheckCircle2, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS } from "@/lib/alertKeys";

/**
 * Three lines that say how to use a treatment plan. Dismissible per plan —
 * the dismissal is stored in `alert_dismissals` (key + plan id as the
 * signature), so it survives reload and a change of device.
 */
const LINES: { icon: typeof CheckCircle2; text: string }[] = [
  { icon: CheckCircle2, text: "Tick each day off as you do it — the circles below." },
  { icon: CalendarCheck, text: "Check in once a week and say how it's going." },
  { icon: Camera, text: "Add a photo on the weeks marked for one." },
];

const PlanHowItWorks = ({ planId }: { planId: string }) => {
  const { loaded, isDismissed, dismiss } = useAlertDismissals();

  if (!loaded) return null;
  if (isDismissed(ALERT_KEYS.TREATMENT_HOW_IT_WORKS, planId)) return null;

  return (
    <SurfaceCard tone="gold" className="space-y-2.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-body text-[11px] uppercase tracking-[0.18em] text-primary">
          How this works
        </p>
        <button
          type="button"
          aria-label="Hide how this works"
          onClick={() => void dismiss([{ key: ALERT_KEYS.TREATMENT_HOW_IT_WORKS, signature: planId }])}
          className="shrink-0 -mr-1 -mt-1 rounded-full p-1 text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {LINES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5">
            <Icon className="size-4 shrink-0 mt-[1px] text-primary" strokeWidth={1.75} />
            <span className="min-w-0 font-body text-[13px] leading-snug [overflow-wrap:anywhere]">
              {text}
            </span>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
};

export default PlanHowItWorks;
