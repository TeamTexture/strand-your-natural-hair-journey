import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodResultRow from "@/components/BloodResultRow";
import { Button } from "@/components/ui/button";

const BloodMinerals = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Minerals" right={<span>2 of 4</span>} />
      <ProgressDots total={4} current={2} />
      <ItalicSub>Mineral deficiencies are commonly missed and directly affect hair growth and scalp health.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Minerals</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {["Zinc", "Magnesium", "Selenium", "Copper"].map((l) => (
            <BloodResultRow key={l} label={l} value="Not tested" status="untested" />
          ))}
        </SurfaceCard>

        <SectionLabel>Inflammation & General</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {["CRP", "FBC", "ESR", "Blood Glucose", "Albumin", "ANA"].map((l) => (
            <BloodResultRow key={l} label={l} value="Not tested" status="untested" />
          ))}
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/blood-thyroid")}>
          Next — Thyroid →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodMinerals;
