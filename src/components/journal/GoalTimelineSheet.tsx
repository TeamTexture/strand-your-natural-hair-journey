import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGoalProgressUpdates } from "@/hooks/useGoalProgressUpdates";
import GoalUpdateRow from "@/components/journal/GoalUpdateRow";
import SectionLabel from "@/components/SectionLabel";
import { goalDateRange, goalDuration, goalIcon, goalTitle } from "@/lib/goalVisuals";
import type { UserGoal } from "@/hooks/useGoals";

interface LedgerRow {
  id: string;
  surface: string;
  headline: string | null;
  created_at: string;
}

/**
 * A goal's full record: its timeline of progress updates and the guidance it
 * was given while it was active (from the advice ledger).
 */
const GoalTimelineSheet = ({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: UserGoal | null;
}) => {
  const { user } = useAuth();
  const { updates, loading } = useGoalProgressUpdates(goal?.id ?? null);
  const [advice, setAdvice] = useState<LedgerRow[]>([]);
  const Icon = goal ? goalIcon(goal) : null;

  useEffect(() => {
    if (!open || !user || !goal?.started_at) {
      setAdvice([]);
      return;
    }
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("user_advice_ledger")
        .select("id, surface, headline, created_at")
        .eq("user_id", user.id)
        .gte("created_at", goal.started_at as string)
        .order("created_at", { ascending: false })
        .limit(30);
      if (goal.ended_at) q = q.lte("created_at", goal.ended_at);
      const { data } = await q;
      if (!cancelled) setAdvice((data ?? []) as LedgerRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, goal?.started_at, goal?.ended_at]);

  const range = goal ? goalDateRange(goal.started_at, goal.ended_at) : "";
  const duration = goal ? goalDuration(goal.started_at, goal.ended_at) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[20px]">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display flex items-center gap-2">
            {Icon && (
              <span className="size-9 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                <Icon className="size-4 text-primary" />
              </span>
            )}
            <span className="min-w-0 break-words">{goal ? goalTitle(goal) : "Goal"}</span>
          </SheetTitle>
          <SheetDescription className="font-body text-[12px]">
            {[range, duration].filter(Boolean).join(" · ")}
          </SheetDescription>
        </SheetHeader>

        {goal?.target_text && (
          <span className="mt-3 inline-block text-[11px] font-body px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {goal.target_text}
          </span>
        )}

        <div className="mt-4">
          <SectionLabel>Progress updates</SectionLabel>
          {loading ? (
            <div className="px-5 h-4 w-2/3 bg-border/60 rounded animate-pulse" />
          ) : updates.length === 0 ? (
            <p className="px-5 text-[12px] font-body text-muted-foreground italic">
              No updates were logged on this goal.
            </p>
          ) : (
            <ul className="px-5 space-y-4 border-l border-border ml-5">
              {updates.map((u) => (
                <GoalUpdateRow key={u.id} update={u} />
              ))}
            </ul>
          )}
        </div>

        {advice.length > 0 && (
          <div className="mt-5 pb-4">
            <SectionLabel>Guidance while this goal was active</SectionLabel>
            <ul className="px-5 space-y-2">
              {advice.map((a) => (
                <li key={a.id} className="text-[12px] font-body leading-relaxed text-foreground">
                  {a.headline ?? a.surface}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default GoalTimelineSheet;
