import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import TrialSavePersonalisationCard from "@/components/profile/TrialSavePersonalisationCard";
import { useClaimRetentionOffer, type RetentionOfferCheck } from "@/hooks/useRetentionOffer";
import { memberSafeMessage } from "@/lib/invokeError";

const money = (n: number) => `£${n.toFixed(2)}`;

/**
 * SAVE SCREEN 2 — "Are you sure?": half price for 3 months, shown on a LATER
 * cancel attempt after the 7-free-days screen was turned down.
 *
 * It claims the SAME one-time retention offer paying members get (percentage
 * coupon on whatever tier she is on), so there is no second billing mechanism
 * and it can never be taken twice.
 */
const TrialAreYouSureDialog = ({
  open,
  onOpenChange,
  offer,
  onCancelAnyway,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: RetentionOfferCheck;
  onCancelAnyway: () => void;
}) => {
  const claim = useClaimRetentionOffer();
  const [error, setError] = useState<string | null>(null);

  const trialEnds = (() => {
    if (!offer.trial_end) return null;
    const d = new Date(offer.trial_end);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  })();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-background border-border max-h-[88vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-[20px] leading-tight text-foreground">
            Are you sure?
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body text-[13px] leading-snug text-muted-foreground">
            Would it help to have more time at a lower cost, so you can really get the most out of
            it?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-[14px] border border-primary/40 bg-primary/5 px-4 py-3.5 min-w-0">
          <div className="flex items-end gap-2 flex-wrap">
            <span className="font-body text-[13px] text-muted-foreground line-through">
              {money(offer.price)}
            </span>
            <span className="font-display text-[26px] font-bold leading-none text-[hsl(var(--gold-deep))]">
              {money(offer.discounted_price)}
            </span>
            <span className="font-body text-[12px] text-muted-foreground pb-0.5">/mo</span>
          </div>
          <p className="font-body text-[11.5px] leading-snug text-muted-foreground mt-1.5">
            {trialEnds
              ? `Your free trial still runs to ${trialEnds}. After that it is ${money(offer.discounted_price)} a month for ${offer.months} months, then ${money(offer.price)} a month.`
              : `Your free trial runs as normal. After that it is ${money(offer.discounted_price)} a month for ${offer.months} months, then ${money(offer.price)} a month.`}
          </p>
        </div>

        <TrialSavePersonalisationCard
          personalisation={offer.personalisation ?? null}
          onNavigate={() => onOpenChange(false)}
        />

        {error && <p className="font-body text-[12px] leading-snug text-destructive">{error}</p>}

        <div className="space-y-2 pt-1">
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            disabled={claim.isPending}
            onClick={() => {
              setError(null);
              claim.mutate(undefined, {
                onSuccess: (res) => {
                  onOpenChange(false);
                  toast.success(
                    `Discount applied — ${money(res.discounted_price)} a month for ${res.months} months once your trial ends. Your membership stays active.`,
                  );
                },
                onError: (e) => {
                  const msg = memberSafeMessage(
                    e,
                    "We couldn't apply your discount just now. Nothing has changed on your membership — please try again.",
                  );
                  setError(msg);
                  toast.error(msg);
                },
              });
            }}
          >
            {claim.isPending ? "Applying…" : "Get 50% off for 3 months"}
          </Button>
          <Button
            variant="ghost"
            size="pill"
            className="w-full text-muted-foreground"
            disabled={claim.isPending}
            onClick={() => {
              onOpenChange(false);
              onCancelAnyway();
            }}
          >
            No thanks, cancel my plan
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default TrialAreYouSureDialog;
