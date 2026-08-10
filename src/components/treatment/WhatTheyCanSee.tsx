import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { cn } from "@/lib/utils";

/**
 * "What [name] can see" — plain language, no legalese, no scare wording.
 * Deliberately shown before any decision, and again on the plan detail screen.
 */
const WhatTheyCanSee = ({ name }: { name: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <SurfaceCard padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
      >
        <span className="font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
          What {name} can see
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="font-body text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              With sharing off
            </p>
            <ul className="mt-1.5 space-y-1 font-body text-[13px] leading-snug">
              <li>The plan itself.</li>
              <li>Which steps you've ticked off.</li>
              <li>Your weekly ratings and anything you write in a check-in.</li>
            </ul>
          </div>
          <div>
            <p className="font-body text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              With sharing on
            </p>
            <ul className="mt-1.5 space-y-1 font-body text-[13px] leading-snug">
              <li>Everything above, plus your photos, videos and voice notes.</li>
            </ul>
          </div>
          <p className="font-body text-[12px] text-muted-foreground leading-snug">
            STRAND staff can access plan content where it's needed to help you or to keep
            people safe.
          </p>
        </div>
      )}
    </SurfaceCard>
  );
};

export default WhatTheyCanSee;
