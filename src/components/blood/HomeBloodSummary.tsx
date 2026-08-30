import { Droplet, Stethoscope, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import AnchorStat from "@/components/guidance/AnchorStat";
import { titleCase } from "@/lib/humanise";
import { limitSupporting } from "@/lib/tipsRender";
import { type TipsLevel } from "@/lib/tipsLevel";

export interface HomeBloodSummaryData {
  panelDate: string | null;
  label: string | null;
  total: number;
  flagged: number;
  insights: string[];
}

/**
 * HomeBloodSummary — the "My Blood Work" home card. Anchors on the flagged
 * count, then lists supporting movement lines beneath.
 */
const HomeBloodSummary = ({
  summary,
  tipsLevel,
  onOpen,
}: {
  summary: HomeBloodSummaryData | null;
  tipsLevel: TipsLevel;
  onOpen: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <SurfaceCard data-tour="blood-work">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          My Blood Work
        </p>
        <button
          onClick={onOpen}
          className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
        >
          Review
        </button>
      </div>
      {summary ? (
        <button onClick={onOpen} className="w-full text-left">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
              <Droplet className="size-5 text-primary fill-primary/40" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base font-semibold leading-snug">
                {titleCase(summary.label) || "Blood test"}
              </p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                {summary.panelDate
                  ? new Date(summary.panelDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : ""}
                {` · ${summary.total} marker${summary.total === 1 ? "" : "s"}`}
              </p>
              <AnchorStat
                className="mt-2"
                value={summary.flagged}
                context={summary.flagged === 1 ? "marker flagged" : "markers flagged"}
                tone={summary.flagged > 0 ? "warning" : "good"}
              />
              <ul className="mt-2 space-y-1">
                {limitSupporting(summary.insights, tipsLevel).map((line, i) => {
                  const isNegative = /^(low|high)\b/i.test(line);
                  const isPositive = /back in range|within normal/i.test(line);
                  const dotClass = isNegative
                    ? "bg-destructive"
                    : isPositive
                      ? "bg-good"
                      : "bg-primary";
                  return (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/85 leading-snug">
                      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${dotClass}`} />
                      <span className="min-w-0">{line}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </button>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground font-body leading-relaxed">
            No blood work logged yet. Add a test you already have, or book one —
            STRAND uses your markers to guide your hair care.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => navigate("/blood-upload?next=analysis")}
            >
              <Upload className="size-4" />
              Add blood test
            </Button>
            <Button
              variant="goldOutline"
              size="pill"
              className="w-full"
              onClick={() => navigate("/blood-history?book=1")}
            >
              <Stethoscope className="size-4" />
              Book a blood test
            </Button>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

export default HomeBloodSummary;
