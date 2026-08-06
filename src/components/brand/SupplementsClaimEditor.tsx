import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Brand-owned claim: "we sell supplements". Mirrors the at-home blood test
 * claim — the brand ticks the claim, and only STRAND can mark it verified
 * (the verified column is reverted by a database trigger if a brand tries).
 */
const SupplementsClaimEditor = ({
  claimed,
  verified,
  onClaimChange,
}: {
  claimed: boolean;
  verified: boolean;
  onClaimChange: (v: boolean) => void;
}) => (
  <SurfaceCard className="space-y-3">
    <SectionLabel className="!px-0 !mt-0">Supplements</SectionLabel>

    <label className="flex items-start gap-2.5">
      <Checkbox
        checked={claimed}
        onCheckedChange={(v) => onClaimChange(v === true)}
        className="mt-0.5"
      />
      <span className="text-[12.5px] font-body leading-snug">
        We sell supplements
        <span className="block text-[11px] text-muted-foreground mt-0.5">
          Tick this if you sell ingestible supplements — for example iron, vitamin D, biotin or
          collagen. STRAND reviews the claim before members see it.
        </span>
      </span>
    </label>

    {claimed && (
      <p
        className={
          verified
            ? "text-[11px] font-body text-good"
            : "text-[11px] font-body text-muted-foreground"
        }
      >
        {verified
          ? "Verified by STRAND — members can see that you sell supplements."
          : "Awaiting STRAND review. This stays hidden from members until then."}
      </p>
    )}
  </SurfaceCard>
);

export default SupplementsClaimEditor;
