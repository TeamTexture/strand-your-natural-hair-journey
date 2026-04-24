import { useBloodValues, summariseValues } from "@/hooks/useBloodValues";

interface Props {
  markers: string[];
}

const BloodSummaryBar = ({ markers }: Props) => {
  const { values } = useBloodValues();
  const { entered, normal, flagged } = summariseValues(values, markers);
  return (
    <div className="bg-alert-dark text-alert-dark-foreground rounded-[14px] px-4 py-3 text-[12px] font-body flex items-center justify-between">
      <span className="opacity-90">
        <strong className="font-semibold">{entered}</strong> entered
      </span>
      <span className="opacity-90">
        <strong className="font-semibold text-good">{normal}</strong> normal
      </span>
      <span className="opacity-90">
        <strong className="font-semibold text-warn">{flagged}</strong> flagged
      </span>
    </div>
  );
};

export default BloodSummaryBar;
