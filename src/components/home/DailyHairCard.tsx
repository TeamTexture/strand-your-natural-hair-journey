// HOME — the daily touchpoint between wash days.
//
// The card FOLDS, it never disappears. Nothing on Home vanishes — the chevron
// collapses it to a single row, matching the WhatsApp card so Home has one
// interaction language. The collapsed choice is remembered for the rest of the
// day and opens fresh the next day: collapsing means "not now", not "never".
//
// Two contents, each with an expanded and a collapsed presentation:
//   1. Nothing logged today → asks, with a one-tap yes.
//   2. Logged today         → shows what she logged, plus "Add another".

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Droplets, Plus } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import ProductThumb from "@/components/ProductThumb";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import { localIsoDate } from "@/lib/washLogSteps";
import { isDailyPromptCollapsed, setDailyPromptCollapsed } from "@/lib/dailyHairPrompt";

const DailyHairCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = localIsoDate();
  const { todaysEntries, isLoading } = useDailyHairEntries();
  const { products } = useUserProducts("all", { static: true });
  const [collapsed, setCollapsed] = useState(() => isDailyPromptCollapsed(user?.id, today));

  if (isLoading) return null;

  const logged = todaysEntries.length > 0;

  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const usedIds = Array.from(
    new Set(todaysEntries.flatMap((e) => e.product_ids ?? [])),
  );
  // Most recent first — the collapsed row shows the latest thing she logged.
  const latest = usedIds.length > 0 ? byId[usedIds[usedIds.length - 1]] : undefined;

  const fold = (next: boolean) => {
    setCollapsed(next);
    setDailyPromptCollapsed(user?.id, today, next);
  };

  if (collapsed) {
    return (
      <div className="px-5 pb-2">
        <SurfaceCard className="!py-[11px] !px-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fold(false)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-expanded={false}
            >
              {logged && latest ? (
                <ProductThumb
                  imageUrl={latest.image_url}
                  storagePath={latest.storage_path}
                  alt={latest.name}
                  cover
                  wrapperClassName="size-7 rounded-[7px] overflow-hidden border-[0.5px] border-border bg-secondary shrink-0"
                />
              ) : (
                <span className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <Droplets className="size-3.5 text-primary" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-body text-[13px] leading-snug text-foreground break-words">
                  {logged
                    ? `Logged today${latest ? ` · ${latest.name}` : ""}`
                    : "Log something you did today"}
                </span>
                {logged && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/daily-log");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate("/daily-log");
                      }
                    }}
                    className="mt-0.5 block font-body text-[11px] leading-snug text-primary"
                  >
                    Add another
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              aria-label="Expand"
              onClick={() => fold(false)}
              className="size-8 rounded-full flex items-center justify-center text-muted-foreground shrink-0"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="px-5 pb-2">
      <SurfaceCard className="py-4 relative">
        <button
          type="button"
          aria-label="Collapse"
          aria-expanded
          onClick={() => fold(true)}
          className="absolute right-2.5 top-2.5 size-8 rounded-full flex items-center justify-center text-muted-foreground"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>

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
