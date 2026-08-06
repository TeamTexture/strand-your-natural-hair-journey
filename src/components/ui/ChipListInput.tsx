import { X, Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * ChipListInput — the add-as-many tag input used for professional
 * specialisms and qualifications, extracted so member challenges reuse the
 * exact same interaction and styling instead of a second implementation.
 *
 * Type, then press Enter or comma (or tap +) to commit a chip. Chips are
 * removable. Duplicates are ignored silently. `max` is optional: omit it for
 * an uncapped list.
 */
interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Optional cap. Omit for no maximum. */
  max?: number;
  maxMessage?: string;
  /** Shown in place of the chip row when the list is empty. */
  emptyLabel?: string;
  /** Longest a single entry may be, in characters. */
  maxLength?: number;
  inputAriaLabel?: string;
}

const ChipListInput = ({
  value,
  onChange,
  placeholder = "Add an entry",
  max,
  maxMessage,
  emptyLabel = "None yet.",
  maxLength = 80,
  inputAriaLabel,
}: Props) => {
  const [draft, setDraft] = useState("");

  const add = (raw?: string) => {
    const v = (raw ?? draft).trim().replace(/[,;]+$/, "").trim();
    if (!v) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    if (max !== undefined && value.length >= max) {
      toast(maxMessage ?? `Max ${max}`);
      return;
    }
    onChange([...value, v.slice(0, maxLength)]);
    setDraft("");
  };

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 bg-primary/10 text-foreground text-[11px] px-2 py-1 rounded-full"
          >
            {s}
            <button
              type="button"
              onClick={() => remove(s)}
              className="text-muted-foreground hover:text-alert-dark"
              aria-label={`Remove ${s}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-[11px] text-muted-foreground font-body">
            {emptyLabel}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          aria-label={inputAriaLabel ?? placeholder}
          onChange={(e) => {
            const next = e.target.value;
            // A comma commits the chip, same as Enter.
            if (next.includes(",")) {
              const parts = next.split(",");
              const tail = parts.pop() ?? "";
              parts.forEach((p) => add(p));
              setDraft(tail);
              return;
            }
            setDraft(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={() => add()}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={() => add()}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChipListInput;
