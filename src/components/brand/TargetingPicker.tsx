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

  const floor = estimate?.audience_floor ?? 50;

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-start gap-2">
        <Info className="size-3.5 text-primary shrink-0 mt-[3px]" />
        <p className="text-[11.5px] font-body text-foreground/80 leading-snug">
          Leave everything unselected to run a broad campaign shown to all members. Pick attributes
          to reach a narrower audience — only members who have opted in to personalised offers are
          ever matched, and a targeted campaign needs at least {floor} matching members to run.
          Health information is never available for targeting.
        </p>
      </div>

      {grouped.map(([key, group]) => (
        <div key={key}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            {group.label}
          </p>
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
            ) : estimate?.meets_floor ? (
              <>
                Around <span className="font-medium">{estimate.reach}</span> members match this
                audience.
              </>
            ) : (
              <>
                Fewer than {floor} members match. Widen the audience — we never report or run
                campaigns below {floor} members.
              </>
            )}
          </p>
        </div>
      </div>
    </SurfaceCard>
  );
};

export default TargetingPicker;
