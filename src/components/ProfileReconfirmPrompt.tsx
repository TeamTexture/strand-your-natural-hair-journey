import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProfileConfirmation } from "@/hooks/useProfileConfirmation";
import { isTourActive, TOUR_ACTIVE_EVENT } from "@/lib/firstRunTour";
import { useLateFirstRunSlot } from "@/hooks/useLateFirstRunSlot";

/**
 * Reconfirmation prompt. Shown once per sign-in to members who finished
 * onboarding before the pre-filled answers were removed. Honest about why:
 * some answers were filled in for her, so we are asking rather than guessing.
 */
const ProfileReconfirmPrompt = () => {
  const navigate = useNavigate();
  const { shouldPrompt, sections, snooze } = useProfileConfirmation();
  const next = sections.find((s) => !s.confirmed) ?? sections[0];
  // Waits behind the tour and the offers card, and only if no other prompt
  // has already used this session's single slot.
  const slot = useLateFirstRunSlot("profile-reconfirm");

  // Never cover the guided first-run tour.
  const [tourOn, setTourOn] = useState(() => isTourActive());
  useEffect(() => {
    const on = (e: Event) => setTourOn(!!(e as CustomEvent).detail);
    window.addEventListener(TOUR_ACTIVE_EVENT, on as EventListener);
    return () => window.removeEventListener(TOUR_ACTIVE_EVENT, on as EventListener);
  }, []);

  const start = () => {
    snooze();
    navigate(`${next.route}?confirm=1`);
  };

  return (
    <Dialog open={shouldPrompt && slot && !tourOn} onOpenChange={(o) => { if (!o) snooze(); }}>
      <DialogContent className="w-[calc(100%-32px)] max-w-[320px] max-h-[calc(100dvh-32px)] overflow-y-auto overflow-x-hidden rounded-[20px] p-5">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-[20px] leading-tight">
            Confirm your hair profile
          </DialogTitle>
          <DialogDescription className="font-body text-[13px] leading-snug text-muted-foreground">
            An earlier version of STRAND filled in some of these answers for
            you. Confirm them in your own words so your guidance is built on
            your hair, not our assumptions.
          </DialogDescription>
        </DialogHeader>

        <ul className="min-w-0 overflow-hidden divide-y divide-border/60 rounded-[14px] border border-border/60 bg-muted/20">
          {sections.map((s) => (
            <li
              key={s.section}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5"
            >
              <span className="min-w-0 font-body text-[13px] leading-tight text-foreground">{s.label}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-right">
                <span className="whitespace-nowrap font-body text-[11px] text-muted-foreground">
                  {s.questions} questions
                </span>
                {s.confirmed && <Check className="size-3.5 text-primary" />}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="gold"
            size="pill"
            className="h-auto min-h-[48px] px-4 py-3 text-center leading-snug whitespace-normal"
            onClick={start}
          >
            {next.confirmed ? "Review my profile" : `Continue with ${next.label.toLowerCase()}`}
          </Button>
          <button
            type="button"
            onClick={snooze}
            className="text-center font-body text-xs text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileReconfirmPrompt;
