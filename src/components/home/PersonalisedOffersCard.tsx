// The personalised-offers ask, in the ordinary /home card idiom.
//
// Not a modal and not a blocker: she can ignore it, and closing it leaves her
// stored preference untouched. Either explicit answer retires the card for good
// and is changeable afterwards from Profile → Personalised offers by email.

import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { usePersonalisedOffersCard } from "@/hooks/usePersonalisedOffersCard";
import { useFirstRunPromptsBlocked } from "@/hooks/useFirstRunPromptsBlocked";
import { markOffersCardDone } from "@/lib/firstRunQueue";

const PersonalisedOffersCard = () => {
  const { eligible, answer, dismiss } = usePersonalisedOffersCard();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  // The guided tour owns the first-run moment; this ask waits its turn.
  const blockedByTour = useFirstRunPromptsBlocked();

  if (!eligible || gone || blockedByTour) return null;

  const choose = async (on: boolean) => {
    setBusy(true);
    try {
      await answer(on);
      setGone(true);
      markOffersCardDone();
      toast.success(on ? "Personalised offers turned on" : "Saved — no offer emails");
    } catch {
      setBusy(false);
      toast.error("Could not save that — try again.");
    }
  };

  return (
    <div className="px-5 pb-3">
      <SurfaceCard tone="gold" className="space-y-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
            <Megaphone className="size-3.5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] leading-snug">Offers picked for your hair?</p>
            <p className="mt-1 font-body text-[12px] leading-relaxed text-muted-foreground">
              We'll email you brand offers and discounts matched to your profile. Nothing generic,
              and you can turn it off any time.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            disabled={busy}
            onClick={() => {
              setGone(true);
              markOffersCardDone();
              void dismiss();
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="gold"
            size="pill"
            className="min-w-0 min-h-[38px] px-3 text-[10.5px] normal-case tracking-normal font-body font-medium whitespace-nowrap rounded-[8px]"
            disabled={busy}
            onClick={() => void choose(true)}
          >
            Yes, send them
          </Button>
          <Button
            variant="outline"
            size="pill"
            className="min-w-0 min-h-[38px] px-3 text-[10.5px] normal-case tracking-normal font-body font-medium whitespace-nowrap rounded-[8px] border-primary/25 text-foreground/70"
            disabled={busy}
            onClick={() => void choose(false)}
          >
            No thanks
          </Button>
        </div>

      </SurfaceCard>
    </div>
  );
};

export default PersonalisedOffersCard;
