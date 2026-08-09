import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STYLE_GROUPS } from "@/lib/hairstyles";
import { useJournalSteps } from "@/hooks/useJournalSteps";
import JournalStepCard from "@/components/journal/JournalStepCard";
import EmptyState from "@/components/EmptyState";

const OTHER = "__other__";

interface Props {
  entryId: string;
  styleName: string | null;
  styleDate: string | null;
  status: string | null;
  /** Persists the style-record header fields on `journal_entries`. */
  onHeaderChange: (patch: { style_name?: string | null; style_date?: string | null; status?: string }) => void;
  /** Legacy entries (no steps, note/photos only) still render their own blocks. */
  hasLegacyContent: boolean;
}

/**
 * The style record — what style, when, and the ordered steps that got them
 * there. Steps are unlimited and reorderable; the header fields reuse the
 * shared STYLE_GROUPS constant with a free-text escape hatch.
 */
const StyleRecordSection = ({
  entryId,
  styleName,
  styleDate,
  status,
  onHeaderChange,
  hasLegacyContent,
}: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    steps,
    loading,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    addMedia,
    removeMedia,
    toggleProduct,
  } = useJournalSteps(entryId);

  const knownStyles = useMemo(() => STYLE_GROUPS.flatMap((g) => g.options), []);
  const isKnown = !!styleName && knownStyles.includes(styleName);
  const [freeText, setFreeText] = useState(!styleName || isKnown ? false : true);
  const complete = status === "complete";
  const [editing, setEditing] = useState(!complete);

  useEffect(() => { setEditing(status !== "complete"); }, [status]);

  // A product added via "paste a link" navigates away to the analysis screen
  // and returns with the new `user_products` id. `addToStep` tells us which
  // step it belongs to, so it lands on the step rather than the entry.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const stepId = params.get("addToStep");
    const productId = (location.state as { journalAddProductId?: string } | null)?.journalAddProductId;
    if (!stepId || !productId) return;
    void toggleProduct(stepId, productId).then(() => {
      toast.success("Product added to this step");
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate, toggleProduct]);

  const handleAddStep = async () => {
    const id = await addStep();
    if (id) setEditing(true);
  };

  return (
    <section className="space-y-3">
      <div className="rounded-[14px] border border-border bg-card p-3.5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          The style
        </p>

        <div className="space-y-1.5">
          <Label className="text-[13px]">What style is this?</Label>
          {freeText ? (
            <div className="flex gap-2">
              <Input
                value={styleName ?? ""}
                onChange={(e) => onHeaderChange({ style_name: e.target.value })}
                placeholder="Type the style"
                className="h-10 text-sm"
              />
              <Button
                type="button"
                variant="goldGhost"
                size="sm"
                className="h-10 shrink-0"
                onClick={() => { setFreeText(false); onHeaderChange({ style_name: null }); }}
              >
                List
              </Button>
            </div>
          ) : (
            <Select
              value={isKnown ? (styleName as string) : ""}
              onValueChange={(v) => {
                if (v === OTHER) { setFreeText(true); onHeaderChange({ style_name: "" }); return; }
                onHeaderChange({ style_name: v });
              }}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Choose a style" />
              </SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {STYLE_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {g.label}
                    </p>
                    {g.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </div>
                ))}
                <SelectItem value={OTHER}>Something else…</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">When is it being done?</Label>
          <Input
            type="date"
            value={styleDate ?? ""}
            onChange={(e) => onHeaderChange({ style_date: e.target.value || null })}
            className="h-10 text-sm"
          />
        </div>

        <Button
          type="button"
          variant={complete ? "goldGhost" : "gold"}
          size="pill"
          className="w-full"
          onClick={() => onHeaderChange({ status: complete ? "in_progress" : "complete" })}
        >
          {complete ? (
            <><RotateCcw className="size-4 mr-1.5" /> Reopen this record</>
          ) : (
            <><CheckCircle2 className="size-4 mr-1.5" /> Mark style complete</>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          How you got there
        </p>
        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-[11px] font-medium text-primary"
          >
            {editing ? "Done editing" : "Edit steps"}
          </button>
        )}
      </div>

      {loading && steps.length === 0 ? null : steps.length === 0 ? (
        <EmptyState
          message="No steps recorded yet"
          hint={
            hasLegacyContent
              ? "Your original note and photos are kept below. Add steps to build this out as a timeline."
              : "Add a step for each thing you did — cleanse, blow dry, protect, the appointment itself."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {steps.map((s, i) => (
            <JournalStepCard
              key={s.id}
              step={s}
              index={i}
              total={steps.length}
              editing={editing}
              onUpdate={(patch) => void updateStep(s.id, patch)}
              onDelete={() => void deleteStep(s.id)}
              onMove={(dir) => void moveStep(s.id, dir)}
              onAddMedia={(m) => void addMedia(s.id, m)}
              onRemoveMedia={(id) => void removeMedia(id)}
              onToggleProduct={(pid) => void toggleProduct(s.id, pid)}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="goldOutline"
        size="pill"
        className="w-full"
        onClick={() => void handleAddStep()}
      >
        <Plus className="size-4 mr-1.5" /> Add a step
      </Button>
    </section>
  );
};

export default StyleRecordSection;
