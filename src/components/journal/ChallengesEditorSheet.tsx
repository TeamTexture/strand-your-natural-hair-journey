import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import ChipListInput from "@/components/ui/ChipListInput";
import VoiceNoteField from "@/components/VoiceNoteField";
import { proposeChallengesFromTranscript } from "@/lib/goalChallenges";
import { useChallenges } from "@/hooks/useChallenges";
import { toast } from "sonner";

/**
 * Challenges editor — separate from the goal editor on purpose. A goal is
 * what you're working toward; a challenge is what's getting in the way.
 * They're updated independently.
 */
const ChallengesEditorSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const { challenges, saveChallenges, saving } = useChallenges();
  const [list, setList] = useState<string[]>([]);
  const [proposed, setProposed] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) {
      setList(challenges);
      setProposed(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    await saveChallenges(list);
    toast.success("Challenges updated");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] overflow-y-auto max-h-[92vh]">
        <SheetHeader>
          <SheetTitle className="font-display">Your biggest challenges</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4 pb-6">
          <div className="rounded-[12px] border border-border bg-secondary/40 p-3">
            <p className="text-[12px] font-body leading-relaxed text-muted-foreground">
              A challenge is what's getting in the way — shedding, breakage at your
              nape, dryness after week two, no time on wash day. Your goal is
              separate: it's what you're working toward.
            </p>
            <p className="text-[12px] font-body leading-relaxed text-muted-foreground mt-2">
              Add as many as you like, but lead with the biggest one and keep each
              entry short and specific. Vague or repeated entries make your
              guidance less focused.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Challenges</p>
            <ChipListInput
              value={list}
              onChange={setList}
              placeholder="e.g. Shedding at my crown"
              emptyLabel="No challenges added yet."
              inputAriaLabel="Add a challenge"
            />
          </div>

          <VoiceNoteField
            label="Or say it out loud"
            placeholder=""
            value=""
            onChange={() => {}}
            audioPath={null}
            onAudioPathChange={() => {}}
            folder="goal-challenge"
            hideTextarea
            onTranscript={(text) => {
              const next = proposeChallengesFromTranscript(text);
              if (next.length === 0) {
                toast("Nothing we could pick out — try typing it instead");
                return;
              }
              setProposed(next);
            }}
          />

          {proposed && proposed.length > 0 && (
            <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-body">
                We heard these
              </p>
              <div className="flex flex-wrap gap-1.5">
                {proposed.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-2 py-1 rounded-full bg-secondary text-secondary-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="gold"
                  size="pill"
                  onClick={() => {
                    const merged = [...list];
                    for (const p of proposed) {
                      if (!merged.some((m) => m.toLowerCase() === p.toLowerCase())) merged.push(p);
                    }
                    setList(merged);
                    setProposed(null);
                    toast.success("Added to your challenges");
                  }}
                >
                  Add these
                </Button>
                <Button variant="ghost" size="pill" onClick={() => setProposed(null)}>
                  Discard
                </Button>
              </div>
            </div>
          )}

          <Button variant="gold" size="pill" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save challenges"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChallengesEditorSheet;
