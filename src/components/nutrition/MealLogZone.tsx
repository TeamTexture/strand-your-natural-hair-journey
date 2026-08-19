import { useEffect, useMemo, useState } from "react";
import { Star, UtensilsCrossed, Plus } from "lucide-react";
import { toast } from "sonner";
import MealLogSheet from "@/components/nutrition/MealLogSheet";
import { useMealCookLogs, signMealLogPhoto, type MealCookLog } from "@/hooks/useMealCookLogs";

const relativeDate = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

const LogThumb = ({ log }: { log: MealCookLog }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (log.photo_path) {
      void signMealLogPhoto(log.photo_path).then((u) => {
        if (alive) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [log.photo_path]);

  return (
    <div className="shrink-0 w-[84px] space-y-1">
      <div className="w-[84px] h-[84px] rounded-[10px] bg-secondary border border-border overflow-hidden flex items-center justify-center">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <UtensilsCrossed className="size-5 text-muted-foreground/60" />
        )}
      </div>
      <div className="flex items-center gap-[1px]">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`size-[9px] ${
              n <= log.rating ? "text-primary fill-primary" : "text-muted-foreground/35"
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] font-body text-muted-foreground leading-tight break-words">
        {relativeDate(log.cooked_at)}
      </p>
    </div>
  );
};

/**
 * "Log this meal" action plus the strip of past cook logs, shown under a saved
 * meal card. Owner-only — cook logs are never shared.
 */
const MealLogZone = ({ mealId, mealName }: { mealId: string; mealName: string }) => {
  const { logs, log } = useMealCookLogs();
  const [open, setOpen] = useState(false);

  const mine = useMemo(() => logs.filter((l) => l.meal_id === mealId), [logs, mealId]);

  const submit = async (rating: number, photo: File | null) => {
    try {
      await log.mutateAsync({ mealId, rating, photo });
      setOpen(false);
      toast.success("Logged — nice one");
    } catch (e) {
      console.error("meal log failed", e);
      toast.error("Couldn't save that cook log. Please try again.");
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/70">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill bg-secondary text-foreground text-[12px] font-semibold hover:bg-secondary/80 transition"
      >
        <Plus className="size-3.5 text-primary" /> Log this meal
      </button>

      {mine.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            You've made this · {mine.length} {mine.length === 1 ? "time" : "times"}
          </p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
            {mine.map((l) => (
              <LogThumb key={l.id} log={l} />
            ))}
          </div>
        </div>
      )}

      <MealLogSheet
        open={open}
        onOpenChange={setOpen}
        mealName={mealName}
        saving={log.isPending}
        onSubmit={submit}
      />
    </div>
  );
};

export default MealLogZone;
