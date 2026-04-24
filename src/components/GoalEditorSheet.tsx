import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useGoals, type UserGoal } from "@/hooks/useGoals";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: UserGoal | null;
  /** When true, the sheet creates a length-retention goal by default. */
  defaultKind?: string;
  defaultTitle?: string;
  defaultUnit?: string;
}

const GoalEditorSheet = ({
  open,
  onOpenChange,
  goal,
  defaultKind = "length_retention",
  defaultTitle = "Length Retention",
  defaultUnit = "inches",
}: Props) => {
  const { upsertGoal, deleteGoal } = useGoals();
  const [title, setTitle] = useState(defaultTitle);
  const [unit, setUnit] = useState(defaultUnit);
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [start, setStart] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form when the editor opens for a different goal.
  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? defaultTitle);
    setUnit(goal?.unit ?? defaultUnit);
    setTarget(goal?.target_value?.toString() ?? "");
    setCurrent(goal?.current_value?.toString() ?? "0");
    setStart(goal?.start_value?.toString() ?? "0");
    setDate(goal?.target_date ?? "");
    setNotes(goal?.notes ?? "");
  }, [open, goal, defaultTitle, defaultUnit]);

  const handleSave = async () => {
    const targetNum = parseFloat(target);
    if (!title.trim() || isNaN(targetNum) || targetNum <= 0) {
      toast.error("Add a title and a positive target value");
      return;
    }
    setSaving(true);
    try {
      await upsertGoal(
        {
          kind: goal?.kind ?? defaultKind,
          title: title.trim(),
          unit: unit.trim() || defaultUnit,
          target_value: targetNum,
          current_value: parseFloat(current) || 0,
          start_value: parseFloat(start) || 0,
          target_date: date || null,
          status: "in_progress",
          notes: notes.trim() || null,
        },
        goal?.id,
      );
      toast.success(goal ? "Goal updated" : "Goal created");
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

        <div className="space-y-4 mt-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Length Retention"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input
                id="goal-target"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-unit">Unit</Label>
              <Input
                id="goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="inches"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Starting</Label>
              <Input
                id="goal-start"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Current</Label>
              <Input
                id="goal-current"
                type="number"
                step="0.1"
                inputMode="decimal"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-date">Target date</Label>
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-notes">Notes (optional)</Label>
            <Textarea
              id="goal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What's your strategy? What are you tracking?"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button variant="gold" size="pill" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : goal ? "Save changes" : "Create goal"}
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
