import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import VoiceNoteField from "@/components/VoiceNoteField";
import { useGoals, type UserGoal } from "@/hooks/useGoals";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";

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
  defaultStatus?: string;
}

interface GoalTip {
  headline: string;
  body: string;
  actions: string[];
}

const GoalEditorSheet = ({
  open,
  onOpenChange,
  goal,
  defaultKind = "challenge",
  defaultStatus = "in_progress",
}: Props) => {
  const { upsertGoal, deleteGoal } = useGoals();
  const [challenge, setChallenge] = useState("");
  const [target, setTarget] = useState("");
  const [timelineAmount, setTimelineAmount] = useState("");
  const [timelineUnit, setTimelineUnit] = useState<"days" | "weeks" | "months">("weeks");
  const [challengeVoice, setChallengeVoice] = useState<string | null>(null);
  const [targetVoice, setTargetVoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyboardOffset = useKeyboardOffset();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // AI tip popup state — shown after a successful save.
  const [tipOpen, setTipOpen] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [tip, setTip] = useState<GoalTip | null>(null);

  const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== "TEXTAREA" && t.tagName !== "INPUT") return;
    window.setTimeout(() => {
      t.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  };

  useEffect(() => {
    if (!open) return;
    setChallenge(goal?.challenge ?? "");
    setTarget(goal?.target_text ?? "");
    setChallengeVoice(goal?.challenge_voice_url ?? null);
    setTargetVoice(goal?.target_voice_url ?? null);
    // Reverse-derive amount + unit from the stored target_date so the
    // editor opens showing what the user originally picked.
    if (goal?.target_date) {
      const diffMs = new Date(goal.target_date).getTime() - Date.now();
      const days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      if (days % 30 === 0 && days >= 30) {
        setTimelineAmount(String(days / 30));
        setTimelineUnit("months");
      } else if (days % 7 === 0 && days >= 7) {
        setTimelineAmount(String(days / 7));
        setTimelineUnit("weeks");
      } else {
        setTimelineAmount(String(days));
        setTimelineUnit("days");
      }
    } else {
      setTimelineAmount("");
      setTimelineUnit("weeks");
    }
  }, [open, goal]);

  // Convert the number + unit picker into an ISO date string for storage.
  const computeTargetDate = (): string | null => {
    const n = parseInt(timelineAmount, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date();
    if (timelineUnit === "days") d.setDate(d.getDate() + n);
    else if (timelineUnit === "weeks") d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  const fetchTip = async (savedGoal: {
    challenge: string | null;
    target_text: string | null;
    target_date: string | null;
    status: string;
  }) => {
    setTipLoading(true);
    setTip(null);
    setTipOpen(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("goal-tip", {
        body: { goal: savedGoal, context },
      });
      if (error) throw error;
      if (data?.tip) setTip(data.tip as GoalTip);
      else throw new Error("No tip returned");
    } catch (e) {
      console.error("goal-tip failed", e);
      setTip({
        headline: "Goal saved",
        body: "We'll personalise tips as you log more wash days and products.",
        actions: ["Log your next wash day", "Scan a product you're using"],
      });
    } finally {
      setTipLoading(false);
    }
  };

  const handleSave = async () => {
    if (!challenge.trim() && !target.trim() && !challengeVoice && !targetVoice) {
      toast.error("Add a challenge or a target to save");
      return;
    }
    setSaving(true);
    try {
      const savedGoal = {
        kind: goal?.kind ?? defaultKind,
        title: challenge.trim().slice(0, 80) || "Hair goal",
        challenge: challenge.trim() || null,
        target_text: target.trim() || null,
        target_date: computeTargetDate(),
        challenge_voice_url: challengeVoice,
        target_voice_url: targetVoice,
        status: goal?.status ?? defaultStatus,
      };
      await upsertGoal(savedGoal, goal?.id);
      toast.success(goal ? "Goal updated" : "Goal saved");
      onOpenChange(false);
      // Fire the AI tip popup with the fresh goal + full user context.
      void fetchTip({
        challenge: savedGoal.challenge,
        target_text: savedGoal.target_text,
        target_date: savedGoal.target_date,
        status: savedGoal.status,
      });
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

  // Min date = today, so users can't pick a date in the past.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
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
              {goal ? "Edit goal" : defaultStatus === "future" ? "Set a future goal" : "Set a new goal"}
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

            <div>
              <label
                htmlFor="goal-target-date"
                className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5 font-medium"
              >
                When do you want to achieve this by?
              </label>
              <input
                id="goal-target-date"
                type="date"
                value={targetDate}
                min={today}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-pill border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Optional — helps STRAND time your tips and check-ins.
              </p>
            </div>

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

      <Dialog open={tipOpen} onOpenChange={setTipOpen}>
        <DialogContent className="max-w-[340px] rounded-[20px]">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-full bg-gradient-to-br from-primary to-[#8B6914] flex items-center justify-center">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">
                Personalised tip
              </span>
            </div>
            <DialogTitle className="font-display text-left">
              {tipLoading ? "Reading your profile…" : tip?.headline ?? "Goal saved"}
            </DialogTitle>
            {!tipLoading && tip?.body && (
              <DialogDescription className="text-left text-sm leading-relaxed pt-1">
                {tip.body}
              </DialogDescription>
            )}
          </DialogHeader>

          {tipLoading ? (
            <div className="space-y-2 py-3">
              <div className="h-3 w-5/6 bg-border/60 rounded animate-pulse" />
              <div className="h-3 w-4/6 bg-border/60 rounded animate-pulse" />
              <div className="h-3 w-3/6 bg-border/60 rounded animate-pulse" />
            </div>
          ) : tip?.actions?.length ? (
            <ul className="space-y-2 mt-2">
              {tip.actions.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm leading-snug"
                >
                  <span className="mt-1 inline-block size-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <DialogFooter>
            <Button
              variant="gold"
              size="pill"
              onClick={() => setTipOpen(false)}
              disabled={tipLoading}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GoalEditorSheet;
