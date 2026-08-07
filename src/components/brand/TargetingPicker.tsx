import { useMemo, useState } from "react";
import { Users, Info, ChevronDown, Search, Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Input } from "@/components/ui/input";
import { useTargetingOptions, useReachEstimate } from "@/hooks/useAdTargeting";
import {
  ATTRIBUTE_ORDER,
  AUDIENCE_PRESETS,
  REACH_REPORTING_MILESTONE,
  cleanRules,
  describeAudience,
  presetIsActive,
  rulesAreEmpty,
  togglePreset,
  type TargetingRules,
  type TargetingOption,
} from "@/lib/adTargeting";

interface Props {
  value: TargetingRules;
  onChange: (next: TargetingRules) => void;
  /** Locked once the campaign is paid or live. */
  disabled?: boolean;
}

/** Attribute groups long enough to need a search field. */
const SEARCHABLE = new Set(["current_style", "planned_style"]);

const prettyLabel = (label: string) =>
  label.replace(/^(Goal:|Uses|Washes)\s*/i, (m) => (m.trim() === "Goal:" ? "" : m));

/** Campaign audience picker. Brands choose from a fixed vocabulary only — there
 *  is no free-text targeting, and health attributes are not offered anywhere. */
const TargetingPicker = ({ value, onChange, disabled }: Props) => {
  const { data: options } = useTargetingOptions();
  const clean = cleanRules(value);
  const empty = rulesAreEmpty(clean);
  const { data: estimate, isFetching } = useReachEstimate(clean);
  const [buildOpen, setBuildOpen] = useState(false);
  const [search, setSearch] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const byKey = new Map<string, { label: string; opts: TargetingOption[] }>();
    for (const key of ATTRIBUTE_ORDER) {
      const opts = (options ?? [])
        .filter((o) => o.attribute_key === key)
        .sort((a, b) => a.sort_order - b.sort_order);
      if (opts.length > 0) byKey.set(key, { label: opts[0].attribute_label, opts });
    }
    return [...byKey.entries()];
  }, [options]);

  const selectedCount = Object.values(clean).reduce((n, v) => n + v.length, 0);
  const attributeCount = (options ?? []).length;

  const toggle = (key: string, code: string) => {
    if (disabled) return;
    const current = value[key] ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    onChange(cleanRules({ ...value, [key]: next }));
  };

  const allSelectedFor = (key: string, opts: TargetingOption[]) =>
    opts.length > 0 && opts.every((o) => (value[key] ?? []).includes(o.value_code));

  const toggleGroup = (key: string, opts: TargetingOption[]) => {
    if (disabled) return;
    onChange(
      cleanRules({ ...value, [key]: allSelectedFor(key, opts) ? [] : opts.map((o) => o.value_code) }),
    );
  };

  const reach = estimate?.reach ?? null;
  const progress = Math.min(100, Math.round(((reach ?? 0) / REACH_REPORTING_MILESTONE) * 100));

  return (
    <SurfaceCard className="space-y-3.5">
      {/* Current state */}
      <div className="rounded-[12px] border border-border bg-muted/40 px-3 py-2 flex items-start gap-2">
        <Users className="size-3.5 text-primary shrink-0 mt-[3px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-body text-foreground/85 leading-snug [overflow-wrap:anywhere]">
            {describeAudience(clean, options)}
          </p>
          {!empty && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({})}
              className="mt-1 text-[10.5px] font-body underline underline-offset-2 text-muted-foreground"
            >
              Reset to everyone
            </button>
          )}
        </div>
      </div>

      {/* Presets */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Quick audiences</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {AUDIENCE_PRESETS.map((p) => {
            const on = presetIsActive(p, clean);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(togglePreset(p, value))}
                className={`text-left rounded-[12px] border p-2.5 transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-primary/5"
                } ${disabled ? "opacity-60" : ""}`}
              >
                <p className="font-body text-[12px] font-medium leading-tight">{p.label}</p>
                <p
                  className={`text-[10px] font-body leading-snug mt-0.5 ${
                    on ? "text-primary-foreground/85" : "text-muted-foreground"
                  }`}
                >
                  {p.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Build your own */}
      <div className="rounded-[12px] border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setBuildOpen((o) => !o)}
          aria-expanded={buildOpen}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block font-body text-[12.5px] font-medium">Build your own audience</span>
            <span className="block text-[10.5px] font-body text-muted-foreground">
              {attributeCount} attributes across {grouped.length} categories
              {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
            </span>
          </span>
          <ChevronDown
            className={`size-4 text-muted-foreground shrink-0 transition-transform ${buildOpen ? "rotate-180" : ""}`}
          />
        </button>

        {buildOpen && (
          <div className="px-3 pb-3 pt-0.5 space-y-3.5 border-t border-border">
            {grouped.map(([key, group]) => {
              const term = (search[key] ?? "").trim().toLowerCase();
              const visible = term
                ? group.opts.filter((o) => o.label.toLowerCase().includes(term))
                : group.opts;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleGroup(key, group.opts)}
                      className={`text-[10.5px] font-body underline underline-offset-2 ${
                        allSelectedFor(key, group.opts) ? "text-primary" : "text-muted-foreground"
                      } ${disabled ? "opacity-60" : ""}`}
                    >
                      {allSelectedFor(key, group.opts) ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  {SEARCHABLE.has(key) && (
                    <div className="relative mb-1.5">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        value={search[key] ?? ""}
                        onChange={(e) => setSearch((s) => ({ ...s, [key]: e.target.value }))}
                        placeholder={`Search ${group.label.toLowerCase()}`}
                        className="pl-8 h-8 text-[12px]"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {visible.length === 0 ? (
                      <p className="text-[11px] font-body text-muted-foreground">No matches.</p>
                    ) : (
                      visible.map((o) => {
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
                            {prettyLabel(o.label)}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reach */}
      <div className="rounded-[12px] border border-border bg-muted/40 p-3">
        {empty ? (
          <p className="font-body text-[12.5px] flex items-center gap-2">
            <Users className="size-4 text-primary shrink-0" />
            Broad campaign — shown to all members in the slots you book.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Audience</p>
              <p className="font-body text-[12.5px]">
                {isFetching ? (
                  "Estimating…"
                ) : (
                  <>
                    <span className="font-medium">{reach ?? "—"}</span>
                    <span className="text-muted-foreground"> / {REACH_REPORTING_MILESTONE}</span>
                  </>
                )}
              </p>
            </div>
            <div
              className="mt-1.5 h-1.5 rounded-pill bg-border overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-pill bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10.5px] font-body text-muted-foreground mt-1.5 leading-snug">
              {progress >= 100
                ? `${REACH_REPORTING_MILESTONE} members reached — full reporting is on for this audience.`
                : `Your campaign can run at any size. Numbers aren't reported below ${REACH_REPORTING_MILESTONE} members, to protect member privacy.`}
            </p>
          </>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Info className="size-3.5 text-primary shrink-0 mt-[3px]" />
        <p className="text-[11px] font-body text-muted-foreground leading-snug">
          Only members who have opted in to personalised offers are ever matched. Health information
          is never available for targeting.
        </p>
      </div>
    </SurfaceCard>
  );
};

export default TargetingPicker;
