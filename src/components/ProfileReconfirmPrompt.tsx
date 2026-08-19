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

/**
 * Reconfirmation prompt. Shown once per sign-in to members who finished
 * onboarding before the pre-filled answers were removed. Honest about why:
 * some answers were filled in for her, so we are asking rather than guessing.
 */
const ProfileReconfirmPrompt = () => {
  const navigate = useNavigate();
  const { shouldPrompt, sections, snooze } = useProfileConfirmation();
  const next = sections.find((s) => !s.confirmed) ?? sections[0];

  const start = () => {
    snooze();
    navigate(`${next.route}?confirm=1`);
  };

  return (
    <Dialog open={shouldPrompt} onOpenChange={(o) => { if (!o) snooze(); }}>
      <DialogContent className="max-w-[320px] rounded-[20px]">
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

        <ul className="divide-y divide-border/60 rounded-[14px] border border-border/60 bg-muted/20">
          {sections.map((s) => (
            <li
              key={s.section}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
            >
              <span className="font-body text-[13px] text-foreground">{s.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="font-body text-[11px] text-muted-foreground">
                  {s.questions} questions
                </span>
                {s.confirmed && <Check className="size-3.5 text-primary" />}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 pt-1">
          <Button variant="gold" size="pill" onClick={start}>
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
