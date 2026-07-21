import { Droplets, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HELLO_KLEAN_URL, HELLO_KLEAN_CODE, markHelloKleanUnlocked } from "@/lib/discounts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** userId used to persist the "unlocked" flag per account */
  userId: string | undefined;
}

/**
 * Popup that offers the Hello Klean shower filter discount.
 * Fires after the user has completed goals and has hard water in their area.
 * Whichever path they choose, the discount is saved to their profile so it
 * can be re-accessed anytime from Profile → Discounts & offers.
 */
const HelloKleanDialog = ({ open, onOpenChange, userId }: Props) => {
  const [remindLater, setRemindLater] = [false, () => {}]; // no-op placeholder
  // (keep the shape simple — behaviour lives in handlers below)
  void remindLater;
  void setRemindLater;

  const handleOrder = () => {
    markHelloKleanUnlocked(userId);
    window.open(HELLO_KLEAN_URL, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  const handleLater = () => {
    markHelloKleanUnlocked(userId);
    toast.success("No problem — your discount is saved in Profile → Discounts & offers.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-[20px] p-5">
        <DialogHeader>
          <div className="mx-auto size-11 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Droplets className="size-5" />
          </div>
          <DialogTitle className="font-display text-[18px] text-center leading-tight mt-1">
            Soften your water at the tap
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-[13px] font-body leading-snug text-foreground/85 text-center">
            Because you're in a hard-water area, a shower filter can genuinely change how your
            wash days feel — less mineral on the strand, softer curl definition.
          </p>

          <div className="rounded-[14px] border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3.5 text-center space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Your STRAND member discount
            </p>
            <p className="font-display text-[22px] tracking-wide text-primary leading-tight">
              {HELLO_KLEAN_CODE}
            </p>
            <p className="text-[11px] text-foreground/70 font-body">10% off at Hello Klean</p>
          </div>
        </div>

        <DialogFooter className="pt-2 flex flex-col gap-2 sm:flex-col">
          <Button variant="gold" size="pill" onClick={handleOrder} className="w-full gap-1.5">
            Order shower filter <ExternalLink className="size-3.5" />
          </Button>
          <Button variant="ghost" size="pill" onClick={handleLater} className="w-full">
            Not right now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HelloKleanDialog;
