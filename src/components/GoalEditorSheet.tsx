import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import VoiceNoteField from "@/components/VoiceNoteField";
import { useGoals, type UserGoal } from "@/hooks/useGoals";

/**
 * Track the iOS visual-viewport so the sheet can shrink/translate above
 * the on-screen keyboard. Without this, the input sits beneath the
 * keyboard and the user can't see what they're typing.
 */
const useKeyboardOffset = () => {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard height
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(diff > 40 ? diff : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return offset;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: UserGoal | null;
  defaultKind?: string;
}

/**
 * Simplified goal editor — just Challenge and Target fields, both supporting
 * voice notes that can be transcribed to text. No title, start, or current
 * fields. Both fields are optional, but at least one must be filled.
 */
const GoalEditorSheet = ({
  open,
  onOpenChange,
  goal,
  defaultKind = "challenge",
}: Props) => {
  const { upsertGoal, deleteGoal } = useGoals();
  const [challenge, setChallenge] = useState("");
  const [target, setTarget] = useState("");
  const [challengeVoice, setChallengeVoice] = useState<string | null>(null);
  const [targetVoice, setTargetVoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyboardOffset = useKeyboardOffset();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // When an input gains focus inside the sheet, scroll it into view above
  // the keyboard. iOS Safari doesn't do this for fixed-position elements.
  const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") return;
    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  };

  useEffect(() => {
    if (!open) return;
    setChallenge(goal?.challenge ?? "");
    setTarget(goal?.target_text ?? "");
    setChallengeVoice(goal?.challenge_voice_url ?? null);
    setTargetVoice(goal?.target_voice_url ?? null);
  }, [open, goal]);

  const handleSave = async () => {
    if (!challenge.trim() && !target.trim() && !challengeVoice && !targetVoice) {
      toast.error("Add a challenge or a target to save");
      return;
    }
    setSaving(true);
    try {
      await upsertGoal(
        {
          kind: goal?.kind ?? defaultKind,
          title: challenge.trim().slice(0, 80) || "Hair goal",
          challenge: challenge.trim() || null,
          target_text: target.trim() || null,
          challenge_voice_url: challengeVoice,
          target_voice_url: targetVoice,
          status: "in_progress",
        },
        goal?.id,
      );
      toast.success(goal ? "Goal updated" : "Goal saved");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    await deleteGoal(goal.id);
    toast("Goal removed");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        ref={scrollRef}
        onFocusCapture={handleFocusCapture}
        style={{
          maxHeight: `calc(92vh - ${keyboardOffset}px)`,
          paddingBottom: keyboardOffset ? `${keyboardOffset + 16}px` : undefined,
        }}
        className="rounded-t-[20px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-display">
            {goal ? "Edit goal" : "Set a new goal"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4 pb-6">
          <VoiceNoteField
            label="Challenge"
            placeholder="What do you want to tackle?"
            value={challenge}
            onChange={setChallenge}
            audioPath={challengeVoice}
            onAudioPathChange={setChallengeVoice}
            folder="goal-challenge"
            rows={3}
          />

          <VoiceNoteField
            label="Target"
            placeholder="What does success look like?"
            value={target}
            onChange={setTarget}
            audioPath={targetVoice}
            onAudioPathChange={setTargetVoice}
            folder="goal-target"
            rows={3}
          />

          <div className="flex flex-col gap-2 pt-2">
            <Button variant="gold" size="pill" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : goal ? "Save changes" : "Save"}
            </Button>
            {goal && (
              <Button variant="ghost" size="pill" onClick={handleDelete} className="text-destructive">
                Delete goal
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GoalEditorSheet;
