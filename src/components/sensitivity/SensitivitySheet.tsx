import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSensitivities } from "@/hooks/useSensitivities";
import {
  SEVERITY_LABEL,
  vocabFor,
  type SensitivityEntry,
  type SensitivityScope,
  type SensitivitySeverity,
} from "@/lib/sensitivityVocab";

const SEVERITIES: SensitivitySeverity[] = ["avoid", "limit", "dislike"];

const COPY: Record<SensitivityScope, { title: string; description: string }> = {
  dietary: {
    title: "Food allergies and intolerances",
    description:
      "Tap anything you react to. Set how strict each one is — only \"Avoid completely\" is removed from every meal plan.",
  },
  topical: {
    title: "Product sensitivities",
    description:
      "Tap any ingredient that irritates your skin or scalp. Set how strict each one is — only \"Avoid completely\" raises a warning on a product.",
  },
};

/**
 * Chip picker + severity + free text + an explicit "I have none".
 * Never a full form, never blocking — it lives in a sheet over the page.
 */
const SensitivitySheet = ({
  scope,
  open,
  onOpenChange,
}: {
  scope: SensitivityScope;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const { entriesFor, save } = useSensitivities();
  const existing = entriesFor(scope);
  const [draft, setDraft] = useState<SensitivityEntry[]>(existing);
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(existing);
      setCustomText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const vocab = useMemo(() => vocabFor(scope), [scope]);
  const byCode = useMemo(
    () => new Map(draft.filter((d) => d.code).map((d) => [d.code as string, d])),
    [draft],
  );

  const toggle = (code: string, label: string) => {
    setDraft((prev) =>
      prev.some((p) => p.code === code)
        ? prev.filter((p) => p.code !== code)
        : [...prev, { code, label, severity: "avoid" as SensitivitySeverity }],
    );
  };

  const setSeverity = (index: number, severity: SensitivitySeverity) => {
    setDraft((prev) => prev.map((p, i) => (i === index ? { ...p, severity } : p)));
  };

  const addCustom = () => {
    const label = customText.trim();
    if (!label) return;
    if (draft.some((d) => d.label.toLowerCase() === label.toLowerCase())) {
      setCustomText("");
      return;
    }
    setDraft((prev) => [...prev, { code: null, label, severity: "avoid", custom: true }]);
    setCustomText("");
  };

  const removeAt = (index: number) =>
    setDraft((prev) => prev.filter((_, i) => i !== index));

  const persist = async (entries: SensitivityEntry[]) => {
    setSaving(true);
    try {
      await save(scope, entries);
      onOpenChange(false);
      toast.success(entries.length === 0 ? "Saved — nothing to avoid" : "Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const copy = COPY[scope];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-[17px]">{copy.title}</SheetTitle>
          <SheetDescription className="font-body text-[12px] leading-relaxed">
            {copy.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {vocab.map((item) => {
            const active = byCode.has(item.code);
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => toggle(item.code, item.label)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-[12px] font-body min-w-0 [overflow-wrap:anywhere] text-left",
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={scope === "dietary" ? "Something else you react to" : "Another ingredient"}
            maxLength={60}
            className="h-9 text-[12px]"
          />
          <Button
            type="button"
            variant="goldOutline"
            size="sm"
            onClick={addCustom}
            className="shrink-0"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>

        {draft.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
              How strict is each one?
            </p>
            {draft.map((entry, i) => (
              <div
                key={`${entry.code ?? "custom"}-${entry.label}`}
                className="rounded-[12px] border border-border bg-card p-2.5"
              >
                <div className="flex items-start gap-2">
                  <p className="flex-1 min-w-0 font-body text-[13px] [overflow-wrap:anywhere]">
                    {entry.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`Remove ${entry.label}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(i, sev)}
                      className={cn(
                        "rounded-pill border px-2.5 py-1 text-[11px] font-body",
                        entry.severity === sev
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {SEVERITY_LABEL[sev]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 font-body text-[11px] leading-relaxed text-muted-foreground">
          STRAND filters what it suggests, but it cannot check a label for you.
          Always read the packaging and check for cross-contamination warnings.
        </p>

        <div className="mt-4 flex gap-2 pb-2">
          <Button
            variant="gold"
            size="pill"
            className="flex-1"
            disabled={saving}
            onClick={() => persist(draft)}
          >
            Save
          </Button>
          <Button
            variant="goldOutline"
            size="pill"
            className="flex-1"
            disabled={saving}
            onClick={() => persist([])}
          >
            I have none
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SensitivitySheet;
