// Admin-facing diff of a proposed audience change on a live campaign.
//
// Admins see EXACT member counts here (they are the reviewer of record and
// need real numbers to judge a tier change). Brand-facing surfaces must keep
// using bandMemberCount — do not reuse this component outside admin screens.

import { AlertTriangle, Minus, Plus } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { useTargetingOptions } from "@/hooks/useAdTargeting";
import { ATTRIBUTE_ORDER, cleanRules, rulesAreEmpty, type TargetingRules } from "@/lib/adTargeting";
import { money } from "@/lib/adPricing";

interface Props {
  /** Audience currently running on the live campaign. */
  before: TargetingRules;
  /** Audience the brand has proposed. {} = broad (no targeting). */
  after: TargetingRules;
  reachBefore: number | null;
  reachAfter: number | null;
  tierBefore: "broad" | "targeted" | null;
  tierAfter: "broad" | "targeted" | null;
  remainingDays: number;
  upliftPence: number;
  paymentRequired: boolean;
  paidAt: string | null;
  paymentWaived: boolean;
}

const TargetingDiff = ({
  before,
  after,
  reachBefore,
  reachAfter,
  tierBefore,
  tierAfter,
  remainingDays,
  upliftPence,
  paymentRequired,
  paidAt,
  paymentWaived,
}: Props) => {
  const { data: options = [] } = useTargetingOptions();
  const labelFor = (attribute: string, code: string) =>
    options.find((o) => o.attribute_key === attribute && o.value_code === code)?.label ?? code;
  const attributeLabelFor = (attribute: string) =>
    options.find((o) => o.attribute_key === attribute)?.attribute_label ?? attribute;

  const beforeClean = cleanRules(before);
  const afterClean = cleanRules(after);
  const keys = [...new Set([...ATTRIBUTE_ORDER, ...Object.keys(beforeClean), ...Object.keys(afterClean)])].filter(
    (k) => (beforeClean[k]?.length ?? 0) > 0 || (afterClean[k]?.length ?? 0) > 0,
  );

  const rows = keys
    .map((key) => {
      const b = beforeClean[key] ?? [];
      const a = afterClean[key] ?? [];
      return {
        key,
        added: a.filter((v) => !b.includes(v)),
        removed: b.filter((v) => !a.includes(v)),
        kept: a.filter((v) => b.includes(v)),
      };
    })
    .filter((r) => r.added.length > 0 || r.removed.length > 0);

  const tierChange = tierBefore !== tierAfter;
  const settled = !paymentRequired || !!paidAt || paymentWaived;

  return (
    <>
      <SectionLabel className="!px-0">Audience change requested</SectionLabel>

      {tierChange && (
        <SurfaceCard
          className={
            paymentRequired && !settled
              ? "bg-warn/5 border-warn/40 space-y-1.5"
              : "bg-primary/5 border-primary/30 space-y-1.5"
          }
        >
          <p className="font-display text-[14px] flex items-center gap-1.5">
            {paymentRequired && !settled && <AlertTriangle className="size-4 text-warn" />}
            {tierBefore === "broad" ? "Broad → targeted (rate increase)" : "Targeted → broad (no refund)"}
          </p>
          {paymentRequired ? (
            <p className="text-[11.5px] font-body text-foreground/85 leading-snug">
              {money(upliftPence)} due for the {remainingDays} remaining day{remainingDays === 1 ? "" : "s"}. Days already delivered keep the
              rate they were sold at.{" "}
              {settled ? (
                <strong>{paymentWaived ? "Waived by admin — approvable." : "Payment received — approvable."}</strong>
              ) : (
                <strong>Not paid yet — approval is blocked until it is settled or waived.</strong>
              )}
            </p>
          ) : (
            <p className="text-[11.5px] font-body text-foreground/85 leading-snug">
              No payment due. Removing targeting applies from approval onward and is not refunded; the rate already charged for delivered days
              is unchanged.
            </p>
          )}
        </SurfaceCard>
      )}

      <SurfaceCard className="space-y-2">
        <div className="flex items-baseline justify-between gap-2 text-[12px] font-body">
          <span className="text-muted-foreground">Reach (exact — admin only)</span>
          <span className="tabular-nums">
            {reachBefore ?? "—"} → <strong>{reachAfter ?? "—"}</strong> member
            {reachAfter === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-[12px] font-body text-muted-foreground leading-snug">
            No attribute-level change detected between the running audience and this request.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className="space-y-1">
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">
                  {attributeLabelFor(row.key)}
                </p>
                <div className="flex flex-wrap gap-1">
                  {row.removed.map((code) => (
                    <span
                      key={`r-${code}`}
                      className="inline-flex items-center gap-1 rounded-pill border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-[11px] font-body line-through text-foreground/70"
                    >
                      <Minus className="size-3" /> {labelFor(row.key, code)}
                    </span>
                  ))}
                  {row.added.map((code) => (
                    <span
                      key={`a-${code}`}
                      className="inline-flex items-center gap-1 rounded-pill border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-body"
                    >
                      <Plus className="size-3" /> {labelFor(row.key, code)}
                    </span>
                  ))}
                  {row.kept.map((code) => (
                    <span
                      key={`k-${code}`}
                      className="inline-flex items-center rounded-pill border border-border px-2 py-0.5 text-[11px] font-body text-muted-foreground"
                    >
                      {labelFor(row.key, code)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {rulesAreEmpty(afterClean) && (
          <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
            Proposed audience is broad — the campaign would be shown to all eligible members.
          </p>
        )}
      </SurfaceCard>
    </>
  );
};

export default TargetingDiff;
