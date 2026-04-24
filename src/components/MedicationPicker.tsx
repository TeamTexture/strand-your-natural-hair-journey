import { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MEDICATION_CATALOG,
  MAX_MEDICATIONS,
  searchMedications,
  type MedOption,
} from "@/data/medications";

interface SelectedMed {
  name: string;
  category: string;
}

interface Props {
  value: SelectedMed[];
  onChange: (next: SelectedMed[]) => void;
  label?: string;
}

/**
 * Search-and-add medication picker.
 * - Type to filter the curated catalogue (matches name OR class).
 * - Tap a result to add it as a gold chip.
 * - If no match, "Add 'X'" appears so users can free-text any medication.
 * - Capped at MAX_MEDICATIONS items; chip X removes an entry.
 */
const MedicationPicker = ({ value, onChange, label = "Medications" }: Props) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedNames = value.map((v) => v.name);
  const matches = searchMedications(query, selectedNames);
  const exactExists = MEDICATION_CATALOG.some(
    (m) => m.name.toLowerCase() === query.trim().toLowerCase(),
  );
  const alreadyAdded = selectedNames.some(
    (n) => n.toLowerCase() === query.trim().toLowerCase(),
  );
  const showFreeTextOption =
    query.trim().length >= 2 && !exactExists && !alreadyAdded;

  const atLimit = value.length >= MAX_MEDICATIONS;

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const addMed = (med: MedOption | SelectedMed) => {
    if (atLimit) return;
    if (selectedNames.some((n) => n.toLowerCase() === med.name.toLowerCase())) return;
    onChange([...value, { name: med.name, category: med.category }]);
    setQuery("");
    setOpen(false);
  };

  const addFreeText = () => {
    const name = query.trim();
    if (!name || atLimit) return;
    addMed({ name, category: "Other" });
  };

  const remove = (name: string) =>
    onChange(value.filter((m) => m.name !== name));

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
          {label}
        </span>
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.15em] font-medium",
            atLimit ? "text-warn" : "text-muted-foreground",
          )}
        >
          {value.length}/{MAX_MEDICATIONS}
        </span>
      </div>

      <div ref={wrapRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length > 0) addMed(matches[0]);
              else if (showFreeTextOption) addFreeText();
            }
          }}
          placeholder={
            atLimit
              ? `Limit reached (${MAX_MEDICATIONS} max)`
              : "Search medications…"
          }
          autoComplete="off"
          disabled={atLimit}
          className={cn(
            "w-full px-3.5 py-3 bg-card rounded-[10px] border text-sm",
            "placeholder:text-muted-foreground/60 focus:outline-none",
            "focus:border-primary/60 transition-colors",
            atLimit ? "border-border opacity-60" : "border-border",
          )}
        />

        {open && (matches.length > 0 || showFreeTextOption) && !atLimit && (
          <div className="absolute z-20 left-0 right-0 mt-1.5 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => addMed(m)}
                className="w-full px-3.5 py-2.5 text-left hover:bg-primary/10 transition-colors flex items-baseline justify-between gap-2 min-h-[44px]"
              >
                <span className="text-sm font-body text-foreground">{m.name}</span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground shrink-0">
                  {m.category}
                </span>
              </button>
            ))}
            {showFreeTextOption && (
              <button
                type="button"
                onClick={addFreeText}
                className="w-full px-3.5 py-2.5 text-left hover:bg-primary/10 transition-colors flex items-center gap-2 border-t border-border min-h-[44px]"
              >
                <Plus className="size-4 text-primary shrink-0" />
                <span className="text-sm font-body">
                  Add <span className="font-semibold">"{query.trim()}"</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((m) => (
            <span
              key={m.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body bg-primary text-primary-foreground border border-primary"
            >
              {m.name}
              <button
                type="button"
                onClick={() => remove(m.name)}
                aria-label={`Remove ${m.name}`}
                className="size-5 rounded-full flex items-center justify-center hover:bg-primary-foreground/20 -mr-1"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground font-body">
        Search by name or drug class. Not in the list? Type it and tap "Add" — max{" "}
        {MAX_MEDICATIONS}.
      </p>
    </div>
  );
};

export default MedicationPicker;
