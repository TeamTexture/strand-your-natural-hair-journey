import { useMemo, useState } from "react";
import { Users, Info, ChevronDown, Search, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useTargetingOptions, useReachEstimate } from "@/hooks/useAdTargeting";
import {
  ATTRIBUTE_ORDER,
  bandMemberCount,
  isZeroCount,
  WIDEN_AUDIENCE_PROMPT,
  cleanRules,
  rulesAreEmpty,
  type TargetingRules,
  type TargetingOption,
} from "@/lib/adTargeting";


interface Props {
  value: TargetingRules;
  onChange: (next: TargetingRules) => void;
  /** Locked once the campaign is paid or live. */
  disabled?: boolean;
}


const prettyLabel = (label: string) =>
  label.replace(/^(Goal:|Uses|Washes)\s*/i, (m) => (m.trim() === "Goal:" ? "" : m));

/** Campaign audience picker. Brands choose from a fixed vocabulary only — there
 *  is no free-text targeting, health attributes are never offered, and nothing
 *  is bundled: every allowlisted value is picked individually. */
const TargetingPicker = ({ value, onChange, disabled }: Props) => {
  const { data: options } = useTargetingOptions();
  const clean = cleanRules(value);
  const empty = rulesAreEmpty(clean);
  const { data: estimate, isFetching } = useReachEstimate(clean);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

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

  const toggle = (key: string, code: string) => {
    if (disabled) return;
    const current = value[key] ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    onChange(cleanRules({ ...value, [key]: next }));
  };

  const allSelectedFor = (key: string, opts: TargetingOption[]) =>
    opts.length > 0 && opts.every((o) => (value[key] ?? []).includes(o.value_code));

  const setGroup = (key: string, opts: TargetingOption[], on: boolean) => {
    if (disabled) return;
    onChange(cleanRules({ ...value, [key]: on ? opts.map((o) => o.value_code) : [] }));
  };

  /** Every selected value, flattened, in attribute order — the chip row. */
  const chips = useMemo(() => {
    const out: { key: string; code: string; label: string }[] = [];
    for (const [key, group] of grouped) {
      for (const code of clean[key] ?? []) {
        const hit = group.opts.find((o) => o.value_code === code);
        out.push({ key, code, label: prettyLabel(hit?.label ?? code) });
      }
    }
    return out;
  }, [grouped, clean]);

  /** Cross-attribute search: one field, filtering all ten attributes at once. */
  const term = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return [];
    const out: { key: string; attributeLabel: string; opt: TargetingOption }[] = [];
    for (const [key, group] of grouped) {
      for (const opt of group.opts) {
        if (
          opt.label.toLowerCase().includes(term) ||
          group.label.toLowerCase().includes(term)
        ) {
          out.push({ key, attributeLabel: group.label, opt });
        }
      }
    }
    return out.slice(0, 40);
  }, [term, grouped]);

  const reach = estimate?.reach ?? null;
  const progress = Math.min(100, Math.round(((reach ?? 0) / REACH_REPORTING_MILESTONE) * 100));

  return (
    <SurfaceCard className="space-y-3.5">
      {/* Selected values at a glance */}
      <div className="rounded-[12px] border border-border bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Users className="size-3.5 text-primary shrink-0" />
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Your audience
          </p>
          {!empty && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({})}
              className="ml-auto text-[10.5px] font-body underline underline-offset-2 text-muted-foreground"
            >
              Reset to everyone
            </button>
          )}
        </div>
        {empty ? (
          <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
            Showing to everyone. Narrow it below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={`${c.key}_${c.code}`}
                type="button"
                disabled={disabled}
                onClick={() => toggle(c.key, c.code)}
                aria-label={`Remove ${c.label}`}
                className={`inline-flex items-center gap-1 rounded-pill bg-primary text-primary-foreground px-2.5 py-1 text-[11.5px] font-body ${
                  disabled ? "opacity-60" : ""
                }`}
              >
                <span className="[overflow-wrap:anywhere]">{c.label}</span>
                <X className="size-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cross-attribute search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all characteristics"
            className="pl-8 h-9 text-[12.5px]"
            disabled={disabled}
          />
        </div>
        {term.length > 0 && (
          <div className="mt-1.5 rounded-[12px] border border-border divide-y divide-border max-h-56 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-[11.5px] font-body text-muted-foreground">No matches.</p>
            ) : (
              matches.map(({ key, attributeLabel, opt }) => {
                const on = (value[key] ?? []).includes(opt.value_code);
                return (
                  <button
                    key={`${key}_${opt.value_code}`}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggle(key, opt.value_code)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  >
                    <Checkbox checked={on} className="pointer-events-none" tabIndex={-1} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-body text-[12.5px] [overflow-wrap:anywhere]">
                        {prettyLabel(opt.label)}
                      </span>
                      <span className="block text-[10px] font-body text-muted-foreground">
                        {attributeLabel}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* One collapsed row per attribute */}
      <div className="rounded-[12px] border border-border divide-y divide-border overflow-hidden">
        {grouped.map(([key, group]) => {
          const open = !!openRows[key];
          const count = (clean[key] ?? []).length;
          const all = allSelectedFor(key, group.opts);
          return (
            <div key={key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenRows((r) => ({ ...r, [key]: !r[key] }))}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="font-body text-[12.5px] min-w-0 [overflow-wrap:anywhere]">
                  {group.label}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[11px] font-body ${
                      count > 0 ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {count > 0 ? `${count} selected` : "Any"}
                  </span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {open && (
                <div className="px-3 pb-3 space-y-1">
                  <div className="flex items-center gap-3 pb-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setGroup(key, group.opts, true)}
                      className={`text-[10.5px] font-body underline underline-offset-2 ${
                        all ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      disabled={disabled || count === 0}
                      onClick={() => setGroup(key, group.opts, false)}
                      className="text-[10.5px] font-body underline underline-offset-2 text-muted-foreground disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                  {group.opts.map((o) => {
                    const on = (value[key] ?? []).includes(o.value_code);
                    return (
                      <label
                        key={o.value_code}
                        className={`flex items-center gap-2 py-1 ${disabled ? "opacity-60" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={on}
                          disabled={disabled}
                          onCheckedChange={() => toggle(key, o.value_code)}
                        />
                        <span className="font-body text-[12.5px] min-w-0 [overflow-wrap:anywhere]">
                          {prettyLabel(o.label)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
                    <span className="text-muted-foreground"> of {REACH_REPORTING_MILESTONE}</span>
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
                : `Your campaign can run at any size. Exact numbers aren't reported below ${REACH_REPORTING_MILESTONE} members, to protect member privacy.`}
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
