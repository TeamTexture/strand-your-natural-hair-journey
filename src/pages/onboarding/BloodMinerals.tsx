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

const MINERALS = ["Zinc", "Magnesium", "Selenium", "Copper"];
const INFLAM = ["CRP", "Blood Glucose", "Albumin", "HbA1c"];
const ALL = [...MINERALS, ...INFLAM];

const BloodMinerals = () => {
  const navigate = useNavigate();
  const { values, setValue } = useBloodValues();

  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    navigate("/onboarding/blood-thyroid");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Minerals" right={<span>2 of 4</span>} />
      <ProgressDots total={4} current={2} />
      <ItalicSub>Mineral deficiencies are commonly missed and directly affect hair growth and scalp health.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Minerals</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {MINERALS.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <SectionLabel>Inflammation & General</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {INFLAM.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <BloodSummaryBar markers={ALL} />

        <Button variant="gold" size="pill" className="mt-4" onClick={onContinue}>
          Next — Thyroid →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodMinerals;
