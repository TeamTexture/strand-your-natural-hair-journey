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
import { useAuth } from "@/hooks/useAuth";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import { localIsoDate } from "@/lib/washLogSteps";
import { isDailyPromptCollapsed, setDailyPromptCollapsed } from "@/lib/dailyHairPrompt";

const DailyLineIcon = ({ className }: { className?: string }) => (
  <Droplets className={className} strokeWidth={1.6} aria-hidden />
);

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

  const primaryCta = (
    <button
      type="button"
      onClick={() => navigate("/daily-log")}
      className="w-full rounded-[9px] bg-primary px-4 py-2.5 text-center font-body text-[10px] font-medium uppercase tracking-[0.15em] text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-primary/90"
    >
      LOG IT NOW
    </button>
  );

  if (collapsed) {
    return (
      <div className="px-5 pb-2">
        <SurfaceCard className="p-3.5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fold(false)}
            className="flex items-center gap-3"
          >
            {logged && latest ? (
              <ProductThumb
                imageUrl={latest.image_url}
                storagePath={latest.storage_path}
                alt={latest.name}
                brand={latest.brand}
                name={latest.name}
                cover
                wrapperClassName="size-7 rounded-[7px] overflow-hidden border-[0.5px] border-border bg-icon-muted shrink-0"
              />
            ) : (
              <span className="size-[34px] rounded-full bg-icon-muted flex items-center justify-center shrink-0">
                <DailyLineIcon className="size-5 text-primary" />
              </span>
            )}
            <div className="min-w-0 flex-1 text-left">
              <span className="block font-display text-[15px] leading-[1.3] text-foreground break-words">
                {logged
                  ? `Logged today${latest ? ` \u00b7 ${latest.name}` : ""}`
                  : "Did something to your hair today?"}
              </span>
              {logged && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/daily-log");
                  }}
                  className="mt-0.5 block text-left font-body text-[11px] leading-snug text-primary"
                >
                  Add another
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Expand"
              onClick={(e) => {
                e.stopPropagation();
                fold(false);
              }}
              className="size-8 -mr-1 rounded-full flex items-center justify-center text-muted-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronDown className="size-5" aria-hidden />
            </button>
          </div>

          {!logged && <div className="mt-3">{primaryCta}</div>}
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="px-5 pb-2">
      <SurfaceCard className="p-3.5 relative">
        <button
          type="button"
          aria-label="Collapse"
          aria-expanded
          onClick={() => fold(true)}
          className="absolute right-2 top-2 size-8 rounded-full flex items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronUp className="size-5" aria-hidden />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <span className="size-10 rounded-full bg-icon-muted flex items-center justify-center shrink-0">
            <DailyLineIcon className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[16px] leading-tight text-foreground break-words">
              {logged ? "Logged today" : "Did something to your hair today?"}
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
                    brand={p.brand}
                    name={p.name}
                    cover
                    wrapperClassName="size-[34px] rounded-[7px] overflow-hidden border-[0.5px] border-border bg-icon-muted shrink-0"
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

        <div className="mt-3.5">
          {logged ? (
            <button
              type="button"
              onClick={() => navigate("/daily-log")}
              className="w-full rounded-[9px] bg-primary px-4 py-2.5 text-center font-body text-[10px] font-medium uppercase tracking-[0.15em] text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-primary/90"
            >
              <Plus className="inline-block size-4 -mt-0.5 mr-1.5 align-middle" aria-hidden />
              Add another
            </button>
          ) : (
            primaryCta
          )}
        </div>
      </SurfaceCard>
    </div>
  );
};

export default DailyHairCard;
