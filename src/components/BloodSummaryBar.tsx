import { useBloodValues, summariseValues } from "@/hooks/useBloodValues";
import AnchorStat from "@/components/guidance/AnchorStat";

interface Props {
  markers: string[];
}

const BloodSummaryBar = ({ markers }: Props) => {
  const { values } = useBloodValues();
  const { entered, normal, flagged } = summariseValues(values, markers);
  return (
    <div className="rounded-[14px] border border-border/60 bg-card px-4 py-3">
      <AnchorStat
        value={flagged}
        context={flagged === 1 ? "marker flagged so far" : "markers flagged so far"}
        tone={flagged > 0 ? "warning" : "good"}
      />
      <p className="mt-2 text-[11px] font-body text-muted-foreground">
        {entered} entered · {normal} normal
      </p>
    </div>
  );
};

export default BloodSummaryBar;
