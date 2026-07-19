import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodInputRow from "@/components/BloodInputRow";
import BloodSummaryBar from "@/components/BloodSummaryBar";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBloodValues, persistBloodValues, useUnknownMarkers } from "@/hooks/useBloodValues";
import { toast } from "sonner";


const MARKERS = [
  "Oestrogen / Oestradiol",
  "Testosterone",
  "DHEA-S",
  "Prolactin",
  "FSH",
  "LH",
  "Cortisol",
  "Insulin / HbA1c",
];

const BloodHormones = () => {
  const navigate = useNavigate();
  const { values, setValue } = useBloodValues();

  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    navigate("/onboarding/blood-ai-summary");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Hormones" right={<span>4 of 4</span>} />
      <ProgressDots total={4} current={4} />
      <ItalicSub>Hormonal imbalances are one of the most common but least investigated causes of hair loss in women.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Hormone Panel</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {MARKERS.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <BloodSummaryBar markers={MARKERS} />

        <Button variant="gold" size="pill" className="mt-4" onClick={onContinue}>
          Analyse my results →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodHormones;
