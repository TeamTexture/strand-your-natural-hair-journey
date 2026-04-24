import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodInputRow from "@/components/BloodInputRow";
import BloodSummaryBar from "@/components/BloodSummaryBar";
import { Button } from "@/components/ui/button";
import { useBloodValues, persistBloodValues } from "@/hooks/useBloodValues";
import { toast } from "sonner";

const MARKERS = ["TSH", "Free T3", "Free T4", "Thyroid Antibodies (TPO)"];

const BloodThyroid = () => {
  const navigate = useNavigate();
  const { values, setValue } = useBloodValues();

  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    navigate("/onboarding/blood-hormones");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Thyroid" right={<span>3 of 4</span>} />
      <ProgressDots total={4} current={3} />
      <ItalicSub>Both underactive and overactive thyroid are a leading cause of hair shedding and texture changes.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Thyroid Panel</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {MARKERS.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-relaxed">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">Tip — </span>
            Have not had a thyroid test? Ask your GP for TSH as part of a routine blood panel — it is a standard request alongside iron and vitamin D.
          </p>
        </SurfaceCard>

        <BloodSummaryBar markers={MARKERS} />

        <Button variant="gold" size="pill" className="mt-4" onClick={onContinue}>
          Next — Hormones →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodThyroid;
