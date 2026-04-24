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

const IRON = ["Ferritin", "Serum Iron", "TIBC", "Transferrin Saturation"];
const VITS = ["Vitamin D", "Vitamin B12", "Folate", "Vitamin A", "Vitamin E", "Biotin"];
const ALL = [...IRON, ...VITS];

const BloodIronVitamins = () => {
  const navigate = useNavigate();
  const { values, setValue } = useBloodValues();

  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    navigate("/onboarding/blood-minerals");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Iron & Vitamins" right={<span>1 of 4</span>} />
      <ProgressDots total={4} current={1} />
      <ItalicSub>Enter values from your report. Skip anything not tested — add later.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Iron & Storage</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {IRON.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <SectionLabel>Vitamins</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {VITS.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <BloodSummaryBar markers={ALL} />

        <Button variant="gold" size="pill" className="mt-4" onClick={onContinue}>
          Next — Minerals →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodIronVitamins;
