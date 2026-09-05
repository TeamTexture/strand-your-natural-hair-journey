// HOME — the daily touchpoint between wash days.
//
// Three states, never more than one card:
//   1. Nothing logged today → asks, with a one-tap yes and a dismiss for today.
//   2. Logged today        → shows what she logged, plus "Add another".
//   3. Dismissed today     → nothing at all, back tomorrow.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Plus, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import { localIsoDate } from "@/lib/washLogSteps";
import { dismissDailyPrompt, isDailyPromptDismissed } from "@/lib/dailyHairPrompt";

const DailyHairCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = localIsoDate();
  const { todaysEntries, isLoading } = useDailyHairEntries();
  const { products } = useUserProducts("all", { static: true });
  const [dismissed, setDismissed] = useState(() => isDailyPromptDismissed(user?.id, today));

  if (isLoading) return null;

  const logged = todaysEntries.length > 0;
  if (!logged && dismissed) return null;

  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const usedIds = Array.from(
    new Set(todaysEntries.flatMap((e) => e.product_ids ?? [])),
  );

  return (
    <div className="px-5 pb-2">
      <SurfaceCard className="py-4 relative">
        {!logged && (
          <button
            type="button"
            aria-label="Not today"
            onClick={() => {
              dismissDailyPrompt(user?.id, today);
              setDismissed(true);
            }}
            className="absolute right-2.5 top-2.5 size-8 rounded-full flex items-center justify-center text-muted-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}

        <div className="flex items-start gap-3 pr-8">
          <span className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Droplets className="size-5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[16px] leading-tight text-foreground break-words">
              {logged ? "Logged today" : "Have you done anything with your hair today?"}
            </h2>
            <p className="mt-1 font-body text-[12px] leading-snug text-muted-foreground">
              {logged
                ? "It's saved to your hair history and waiting for you at your next wash day."
                : "A spritz, a leave-in, a refresh, some oil on your scalp — takes five seconds to note."}
            </p>
          </div>
        </div>

        {logged && (
          <div className="mt-3 space-y-2">
            {usedIds.map((id) => {
              const p = byId[id];
              if (!p) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(`/products/profile/${p.id}`)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <ProductThumb
                    imageUrl={p.image_url}
                    storagePath={p.storage_path}
                    alt={p.name}
                    cover
                    wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                  />
                  <span className="product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2">
                    {p.name}
                  </span>
                </button>
              );
            })}
            {todaysEntries.some((e) => e.note) && (
              <p className="font-body text-[12px] leading-snug text-foreground/80">
                {todaysEntries.find((e) => e.note)?.note}
              </p>
            )}
          </div>
        )}

        <Button
          variant="gold"
          size="pill"
          className="mt-3.5"
          onClick={() => navigate("/daily-log")}
        >
          {logged ? (
            <>
              <Plus className="size-4 mr-1.5" aria-hidden />
              Add another
            </>
          ) : (
            "Yes — log it"
          )}
        </Button>
      </SurfaceCard>
    </div>
  );
};

export default DailyHairCard;
