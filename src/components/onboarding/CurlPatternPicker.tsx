import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The four hair patterns a member can pick from, described in words only.
 * There is deliberately no letter/number classification anywhere in this
 * feature — the title is what gets stored, verbatim.
 */
export const CURL_PATTERN_OPTIONS: { title: string; description: string }[] = [
  { title: "Straight", description: "Has no natural curl or wave." },
  { title: "Wavy", description: "More defined, distinct S-waves." },
  { title: "Curly", description: "Big, loose, springy spiral ringlets." },
  { title: "Coily (Afro-textured)", description: "Tightly packed coils." },
];

interface Props {
  value: string | null;
  onChange: (next: string) => void;
}

/**
 * Vertical list of selectable rows. Each option carries a description, so pills
 * would truncate badly — one full-width row per pattern instead.
 */
const CurlPatternPicker = ({ value, onChange }: Props) => (
  <div className="flex flex-col gap-2">
    {CURL_PATTERN_OPTIONS.map((opt) => {
      const selected = value === opt.title;
      return (
        <button
          key={opt.title}
          type="button"
          aria-pressed={selected}
          onClick={() => onChange(opt.title)}
          className={cn(
            "flex w-full items-start gap-2 rounded-[12px] border px-[14px] py-3 text-left transition-colors",
            selected
              ? "border-primary bg-primary/10"
              : "border-border bg-surface-raised hover:border-primary/50",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-body text-[14px] font-medium leading-snug text-foreground">
              {opt.title}
            </span>
            <span className="mt-0.5 block font-body text-[12px] font-normal leading-snug text-muted-foreground">
              {opt.description}
            </span>
          </span>
          {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />}
        </button>
      );
    })}
  </div>
);

export default CurlPatternPicker;
