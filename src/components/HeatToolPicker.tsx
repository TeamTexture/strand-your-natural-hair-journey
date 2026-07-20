// Lightweight tool picker shown inside the wash-day Condition step when the
// user confirms they used a heat treatment. Lets them attach the actual tool
// (TT Heat Hat) from their My Tools list — and
// quick-add a new one inline if it isn't there yet.
//
// Kept intentionally minimal: name + category only, no photo, no rating. The
// full add-tool flow (with photo, brand, notes) lives on the My Products page.
import { useMemo, useState } from "react";
import { Check, Plus, X, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserTools, type UserTool } from "@/hooks/useUserTools";

import { cn } from "@/lib/utils";

const isHeatHatCategory = (category?: string | null) =>
  !!category && /tt\s*heat\s*hat|deep\s*conditioning\s*cap|heat\s*hat|heat\s*cap|heated\s*cap/i.test(category);

interface HeatToolPickerProps {
  /** IDs of tools currently attached to this heat treatment. */
  selectedIds: string[];
  /** Toggle a tool in/out of the selection. */
  onToggle: (id: string) => void;
}

const HeatToolPicker = ({ selectedIds, onToggle }: HeatToolPickerProps) => {
  const { tools, loading, addTool } = useUserTools();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category] = useState<string>("TT Heat Hat");
  const [submitting, setSubmitting] = useState(false);

  // Wash-day heat step is heat-hat only — filter everything else out so the
  // picker doesn't surface straighteners, wands, etc.
  const sorted = useMemo(
    () =>
      tools.filter((t) => isHeatHatCategory(t.category)),
    [tools],
  );


  const formatTool = (t: UserTool) =>
    t.brand ? `${t.name} — ${t.brand}` : t.name;

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const created = await addTool({ name: trimmed, category });
    setSubmitting(false);
    if (created) {
      onToggle(created.id);
      setName("");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <Wrench className="size-3.5 text-primary" />
        <p className="text-[11px] font-medium text-foreground flex-1">
          Which tool did you use? <span className="text-muted-foreground font-normal">(optional)</span>
        </p>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground">Loading your tools…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No TT Heat Hat yet — add it below.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((t) => {
            const active = selectedIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggle(t.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors min-h-[32px] max-w-full",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {active && <Check className="size-3 shrink-0" />}
                <span className="truncate max-w-[160px]">{formatTool(t)}</span>
              </button>
            );
          })}
        </div>
      )}

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-primary/50 rounded-[10px] text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors min-h-[36px]"
        >
          <Plus className="size-3.5" />
          Add a new tool
        </button>
      )}

      {adding && (
        <div className="space-y-2 p-2.5 rounded-[10px] border border-primary/30 bg-card">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold">New tool</p>
            <button
              type="button"
              onClick={() => { setAdding(false); setName(""); }}
              aria-label="Cancel"
              className="size-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TT Heat Hat"
            className="h-9 text-xs"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground">
            Category: TT Heat Hat
          </p>

          <Button
            type="button"
            variant="gold"
            size="pill"
            className="w-full"
            onClick={handleAdd}
            disabled={submitting || !name.trim()}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Adding…
              </span>
            ) : (
              "Add & select"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default HeatToolPicker;
