import { useMemo } from "react";
import { Users, Info } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useTargetingOptions, useReachEstimate } from "@/hooks/useAdTargeting";
import {
  ATTRIBUTE_ORDER,
  cleanRules,
  rulesAreEmpty,
  type TargetingRules,
} from "@/lib/adTargeting";

interface Props {
  value: TargetingRules;
  onChange: (next: TargetingRules) => void;
  /** Locked once the campaign is paid or live. */
  disabled?: boolean;
}

/** Campaign audience picker. Brands choose from a fixed vocabulary only — there
 *  is no free-text targeting, and health attributes are not offered anywhere. */
const TargetingPicker = ({ value, onChange, disabled }: Props) => {
  const { data: options } = useTargetingOptions();
  const clean = cleanRules(value);
  const empty = rulesAreEmpty(clean);
  const { data: estimate, isFetching } = useReachEstimate(clean);

  const grouped = useMemo(() => {
    const byKey = new Map<string, { label: string; opts: typeof options }>();
    for (const key of ATTRIBUTE_ORDER) {
      const opts = (options ?? [])
        .filter((o) => o.attribute_key === key)
        .sort((a, b) => a.sort_order - b.sort_order);
      if (opts.length > 0) byKey.set(key, { label: opts[0].attribute_label, opts });
    }
    return [...byKey.entries()];
  }, [options]);

  const toggle = (key: string, code: string) => {
    if (disabled) return;
    const current = value[key] ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    onChange({ ...value, [key]: next });
  };

  const allSelectedFor = (key: string, opts: TargetingOption[]) =>
    opts.length > 0 && opts.every((o) => (value[key] ?? []).includes(o.value_code));

  const toggleGroup = (key: string, opts: TargetingOption[]) => {
    if (disabled) return;
    onChange({ ...value, [key]: allSelectedFor(key, opts) ? [] : opts.map((o) => o.value_code) });
  };

  const everythingSelected = grouped.length > 0 && grouped.every(([k, g]) => allSelectedFor(k, (g.opts ?? []) as TargetingOption[]));

  const toggleEverything = () => {
    if (disabled) return;
    if (everythingSelected) {
      onChange({});
      return;
    }
    const next: TargetingRules = {};
    for (const [key, group] of grouped) next[key] = (group.opts ?? []).map((o) => o.value_code);
    onChange(next);
  };

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-start gap-2">
        <Info className="size-3.5 text-primary shrink-0 mt-[3px]" />
        <p className="text-[11.5px] font-body text-foreground/80 leading-snug">
          Leave everything unselected to run a broad campaign shown to all members. Pick attributes
          to reach a narrower audience, or select all within a category to include every option —
          only members who have opted in to personalised offers are ever matched. Audience numbers
          are reported at any size. Health information is never available for targeting.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={toggleEverything}
          className={`rounded-pill border px-3 py-1 text-[11px] font-body ${
            everythingSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/80"
          } ${disabled ? "opacity-60" : ""}`}
        >
          {everythingSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      {grouped.map(([key, group]) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {group.label}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggleGroup(key, (group.opts ?? []) as TargetingOption[])}
              className={`text-[10.5px] font-body underline underline-offset-2 ${
                allSelectedFor(key, (group.opts ?? []) as TargetingOption[])
                  ? "text-primary"
                  : "text-muted-foreground"
              } ${disabled ? "opacity-60" : ""}`}
            >
              {allSelectedFor(key, (group.opts ?? []) as TargetingOption[]) ? "Clear" : "All"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(group.opts ?? []).map((o) => {
              const on = (value[key] ?? []).includes(o.value_code);
              return (
                <button
                  key={o.value_code}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => toggle(key, o.value_code)}
                  className={`rounded-pill border px-2.5 py-1 text-[11.5px] font-body transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground/80 hover:border-primary/40"
                  } ${disabled ? "opacity-60" : ""}`}
                >
                  {o.label.replace(/^(Goal:|Uses|Washes)\s*/i, (m) => (m.trim() === "Goal:" ? "" : m))}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-[12px] border border-border bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <p className="font-body text-[12.5px]">
            {empty ? (
              <>Broad campaign — shown to all members in the slots you book.</>
            ) : isFetching ? (
              <>Estimating audience…</>
            ) : (
              <>
                Around <span className="font-medium">{estimate?.reach ?? 0}</span> member
                {estimate?.reach === 1 ? "" : "s"} match this audience.
              </>
            )}
          </p>
        </div>
      </div>

    </SurfaceCard>
  );
};

export default TargetingPicker;
