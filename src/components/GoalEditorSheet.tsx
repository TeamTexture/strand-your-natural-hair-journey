import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import VoiceNoteField from "@/components/VoiceNoteField";
import { useGoals, type UserGoal } from "@/hooks/useGoals";

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
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[92vh] overflow-y-auto">
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
