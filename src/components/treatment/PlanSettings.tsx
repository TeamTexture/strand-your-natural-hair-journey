import { useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Images,
  Pause,
  Play,
  Tag,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BrandTagControl from "@/components/brand/BrandTagControl";
import PlanSharingSection from "@/components/treatment/PlanSharingSection";
import ReminderPicker, {
  reminderSummary,
  type ReminderSettings,
} from "@/components/treatment/ReminderPicker";

interface Props {
  planId: string;
  reminder: ReminderSettings;
  onReminderChange: (next: ReminderSettings) => void;
  paused: boolean;
  onTogglePause: () => void;
  hasPlus: boolean;
  /** Weeks per check-in cycle: 1, 2 or 4. */
  checkinEveryWeeks: number;
  onCadenceChange: (everyWeeks: number) => void;
  /** Which row is open — held by the page so other sections can open one. */
  expanded: string | null;
  onExpandedChange: (key: string | null) => void;
  /** Writes are off when STRAND+ has lapsed or the plan is paused. */
  disabled: boolean;
}

const CADENCE_OPTIONS = [
  { weeks: 1, label: "Every week" },
  { weeks: 2, label: "Every 2 weeks" },
  { weeks: 4, label: "Every 4 weeks" },
];

const Row = ({
  icon: Icon,
  label,
  value,
  open,
  onClick,
  navigational,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  open?: boolean;
  onClick: () => void;
  navigational?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={navigational ? undefined : !!open}
    className="w-full px-4 py-3 flex items-center gap-3 text-left"
  >
    <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
    <span className="min-w-0 flex-1">
      <span className="block font-body text-[13.5px] font-semibold">{label}</span>
      {value && (
        <span className="block font-body text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
          {value}
        </span>
      )}
    </span>
    {navigational ? (
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    ) : (
      <ChevronDown
        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
      />
    )}
  </button>
);

/**
 * Everything about the plan that isn't the plan: reminders, sharing, progress,
 * the brands credited on it and pausing. All collapsed, so a one-step plan
 * never opens with a wall of settings.
 */
const PlanSettings = ({
  planId,
  reminder,
  onReminderChange,
  paused,
  onTogglePause,
  hasPlus,
  checkinEveryWeeks,
  onCadenceChange,
  expanded,
  onExpandedChange,
  disabled,
}: Props) => {
  const navigate = useNavigate();
  const openRow = expanded;
  const toggle = (key: string) => onExpandedChange(openRow === key ? null : key);

  return (
    <div className="space-y-2" id="plan-settings">
      <SectionLabel className="px-0 mt-0 mb-1.5">Plan settings</SectionLabel>

      <SurfaceCard padded={false} className="overflow-hidden divide-y divide-border/60">
        {/* reminder */}
        <div>
          <Row
            icon={Bell}
            label="Remind me to check in"
            value={reminderSummary(reminder)}
            open={openRow === "reminder"}
            onClick={() => toggle("reminder")}
          />
          {openRow === "reminder" && (
            <div className="px-4 pb-4">
              <ReminderPicker value={reminder} onChange={onReminderChange} disabled={disabled} />
            </div>
          )}
        </div>

        {/* check-in cadence */}
        <div>
          <Row
            icon={CalendarClock}
            label="How often I check in"
            value={CADENCE_OPTIONS.find((o) => o.weeks === checkinEveryWeeks)?.label ?? "Every week"}
            open={openRow === "cadence"}
            onClick={() => toggle("cadence")}
          />
          {openRow === "cadence" && (
            <div className="px-4 pb-4 space-y-2">
              <div className="flex gap-1.5">
                {CADENCE_OPTIONS.map((o) => (
                  <button
                    key={o.weeks}
                    type="button"
                    disabled={disabled}
                    onClick={() => onCadenceChange(o.weeks)}
                    className={cn(
                      "flex-1 rounded-pill border px-2 py-2 font-body text-[12px] disabled:opacity-60",
                      o.weeks === checkinEveryWeeks
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="font-body text-[11.5px] text-muted-foreground leading-snug">
                Check-ins you've already saved stay exactly as they are. This only changes the
                cycles still ahead of you.
              </p>
            </div>
          )}
        </div>

        {/* sharing */}
        <div>
          <Row
            icon={Users}
            label="Sharing"
            value="Who can follow this plan, and what they see"
            open={openRow === "sharing"}
            onClick={() => toggle("sharing")}
          />
          {openRow === "sharing" && (
            <div className="px-4 pb-4">
              <PlanSharingSection planId={planId} />
            </div>
          )}
        </div>

        {/* progress */}
        <Row
          icon={Images}
          label="Progress and photos"
          value="Your week-by-week record"
          navigational
          onClick={() => navigate(`/treatment/${planId}/progress`)}
        />

        {/* brands */}
        <div>
          <Row
            icon={Tag}
            label="Brands credited"
            value="Brands used in this plan"
            open={openRow === "brands"}
            onClick={() => toggle("brands")}
          />
          {openRow === "brands" && (
            <div className="px-4 pb-4">
              <BrandTagControl taggableType="treatment_plan" taggableId={planId} title="Brands" />
            </div>
          )}
        </div>

        {/* pause */}
        {hasPlus && (
          <div className="px-4 py-3">
            <Button
              variant="outline"
              className="rounded-pill w-full"
              onClick={() => {
                onTogglePause();
                toast.dismiss();
              }}
            >
              {paused ? <Play className="size-4 mr-1.5" /> : <Pause className="size-4 mr-1.5" />}
              {paused ? "Resume plan" : "Pause plan"}
            </Button>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};

export default PlanSettings;
