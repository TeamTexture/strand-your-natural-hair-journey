// The second, better-placed ask for personalised offers — shown once, right
// after a member finishes their hair profile. Optional, dismissible, and it
// never blocks anything: closing it continues the flow exactly as before.

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSetPersonalisedOffersConsent } from "@/hooks/useAdTargeting";
import { usePersonalisedOffersAsk } from "@/hooks/usePersonalisedOffersAsk";

interface Props {
  open: boolean;
  /** Called after accept, decline or dismiss — the caller then continues. */
  onFinish: () => void;
}

const PersonalisedOffersPrompt = ({ open, onFinish }: Props) => {
  const { markAsked } = usePersonalisedOffersAsk();
  const setConsent = useSetPersonalisedOffersConsent();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await markAsked();
    onFinish();
  };

  const accept = () => {
    setBusy(true);
    setConsent.mutate(
      { on: true, source: "hair_profile_prompt" },
      {
        onSuccess: async () => {
          toast.success("Personalised offers turned on");
          await finish();
        },
        onError: () => {
          setBusy(false);
          toast.error("Could not save that — try again.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) void finish(); }}>
      <DialogContent className="max-w-[320px] rounded-[18px] p-5">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <DialogTitle className="font-display text-[17px] leading-tight">
              Want brand offers matched to your hair, instead of the same banner everyone sees?
            </DialogTitle>
          </div>
          <DialogDescription className="text-[11.5px] font-body leading-snug">
            It uses details of your hair like porosity and length — never your health information or
            blood results.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          <Button variant="gold" size="pill" className="w-full" disabled={busy} onClick={accept}>
            Yes, match them to my hair
          </Button>
          <Button
            variant="ghost"
            size="pill"
            className="w-full text-muted-foreground"
            disabled={busy}
            onClick={() => void finish()}
          >
            No thanks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PersonalisedOffersPrompt;
