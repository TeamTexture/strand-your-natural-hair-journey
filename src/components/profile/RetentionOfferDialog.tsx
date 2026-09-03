import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useClaimRetentionOffer, type RetentionOfferCheck } from "@/hooks/useRetentionOffer";

const money = (n: number) => `£${n.toFixed(2)}`;

/**
 * "Before you cancel" — the one-time half-price-for-3-months retention offer.
 *
 * Shown only when the SERVER has said the member is eligible. Claiming calls the
 * edge function, which applies the Stripe coupon and burns the offer. "Cancel
 * anyway" hands straight back to the existing cancellation confirmation.
 */
const RetentionOfferDialog = ({
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

  const planName = offer.tier === "plus" ? "STRAND+" : "STRAND";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-background border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-[20px] leading-tight text-foreground">
            Before you cancel
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body text-[13px] leading-snug text-muted-foreground">
            Half price for your next {offer.months} months on us.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-[14px] border border-primary/40 bg-primary/5 px-4 py-3.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-6 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center">
              <Sparkles className="size-3.5" />
            </span>
            <p className="font-body text-[13px] font-semibold text-foreground min-w-0 flex-1 break-words">
              {planName}
            </p>
          </div>
          <div className="mt-2.5 flex items-end gap-2 flex-wrap">
            <span className="font-body text-[13px] text-muted-foreground line-through">
              {money(offer.price)}
            </span>
            <span className="font-display text-[26px] font-bold leading-none text-[hsl(var(--gold-deep,42_60%_34%))] text-primary">
              {money(offer.discounted_price)}
            </span>
            <span className="font-body text-[12px] text-muted-foreground pb-0.5">/mo</span>
          </div>
          <p className="font-body text-[11.5px] leading-snug text-muted-foreground mt-1.5">
            For {offer.months} months, then {money(offer.price)}/mo
          </p>
        </div>

        {error && (
          <p className="font-body text-[12px] leading-snug text-destructive">{error}</p>
        )}

        <div className="space-y-2 pt-1">
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            disabled={claim.isPending}
            onClick={() => {
              setError(null);
              claim.mutate(undefined, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast("Your discount is on — half price for the next 3 months");
                },
                onError: (e) => {
                  const msg = e instanceof Error ? e.message : "Could not apply your discount";
                  setError(msg);
                  toast.error(msg);
                },
              });
            }}
          >
            {claim.isPending ? "Applying…" : `Claim ${offer.months} months half price`}
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
            Cancel anyway
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RetentionOfferDialog;
