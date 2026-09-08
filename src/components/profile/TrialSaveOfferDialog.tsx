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
import {
  useClaimTrialSaveOffer,
  useDeclineTrialSaveOffer,
  type TrialSaveOfferCheck,
} from "@/hooks/useTrialSaveOffer";
import { memberSafeMessage } from "@/lib/invokeError";

const formatLong = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
};

/**
 * SAVE SCREEN 1 — "Give it one more week": 7 more free days on the initial
 * trial, one time only, before any payment has been taken.
 *
 * Turning it down burns the offer too and hands straight to the real cancel;
 * screen 2 only appears on a LATER, separate cancel attempt.
 */
const TrialSaveOfferDialog = ({
  open,
  onOpenChange,
  offer,
  onCancelAnyway,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: TrialSaveOfferCheck;
  onCancelAnyway: () => void;
}) => {
  const claim = useClaimTrialSaveOffer();
  const decline = useDeclineTrialSaveOffer();
  const [error, setError] = useState<string | null>(null);

  const endsOn = formatLong(offer.new_trial_end);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-background border-border max-h-[88vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-[20px] leading-tight text-foreground">
            Give it one more week
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body text-[13px] leading-snug text-muted-foreground">
            {endsOn
              ? `7 more days, free. No card change, ends on its own on ${endsOn}.`
              : "7 more days, free. No card change, ends on its own."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <TrialSavePersonalisationCard
          personalisation={offer.personalisation}
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
                  const until = formatLong(res.trial_end);
                  toast.success(
                    until
                      ? `7 more free days added — your trial now runs to ${until}. Nothing has been charged and your card is unchanged.`
                      : "7 more free days added. Nothing has been charged and your card is unchanged.",
                  );
                },
                onError: (e) => {
                  const msg = memberSafeMessage(
                    e,
                    "We couldn't add your extra days just now. Nothing has changed on your membership — please try again.",
                  );
                  setError(msg);
                  toast.error(msg);
                },
              });
            }}
          >
            {claim.isPending ? "Adding…" : "Get 7 more days free"}
          </Button>
          <Button
            variant="ghost"
            size="pill"
            className="w-full text-muted-foreground"
            disabled={claim.isPending}
            onClick={() => {
              // Burn the one-time record in the background; her cancel never waits.
              decline.mutate();
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

export default TrialSaveOfferDialog;
