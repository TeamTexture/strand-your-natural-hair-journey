// LocationAutocomplete — free-text input backed by a suggestion list.
// Suggestions come from the caller (e.g. previously-used appointment
// locations + the pro's registered clinic addresses). The user can pick
// a suggestion OR type a brand new location.
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

const LocationAutocomplete = ({ value, onChange, suggestions, placeholder, className }: Props) => {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const uniq = Array.from(new Set(suggestions.map((s) => s.trim()).filter(Boolean)));
    if (!q) return uniq.slice(0, 6);
    return uniq
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, 6);
  }, [suggestions, value]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder ?? "Clinic, address or link"}
        className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-40 left-0 right-0 mt-1 rounded-[10px] border border-border bg-background shadow-lg max-h-[180px] overflow-y-auto">
          {filtered.map((s) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => {
                // Prevent input blur before onClick fires.
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-muted/60"
            >
              <MapPin className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
