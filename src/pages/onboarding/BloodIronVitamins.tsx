import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodResultRow from "@/components/BloodResultRow";
import { Button } from "@/components/ui/button";

const BloodIronVitamins = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Iron & Vitamins" right={<span>1 of 4</span>} />
      <ProgressDots total={4} current={1} />
      <ItalicSub>Enter values from your report. Skip anything not tested — add later.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Iron & Storage</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          <BloodResultRow label="Ferritin (ng/mL)" value="12 — LOW ⚠" status="low" />
          <BloodResultRow label="Serum Iron (μmol/L)" value="9.2 — LOW ⚠" status="low" />
          <BloodResultRow label="TIBC (μmol/L)" value="Not tested" status="untested" />
          <BloodResultRow label="Transferrin Saturation (%)" value="Not tested" status="untested" />
        </SurfaceCard>

        <SectionLabel>Vitamins</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          <BloodResultRow label="Vitamin D (nmol/L)" value="28 — LOW ⚠" status="low" />
          <BloodResultRow label="Vitamin B12 (pmol/L)" value="342 — Normal ✓" status="normal" />
          <BloodResultRow label="Folate / B9 (nmol/L)" value="18.2 — Normal ✓" status="normal" />
          <BloodResultRow label="Vitamin A" value="Not tested" status="untested" />
          <BloodResultRow label="Vitamin E" value="Not tested" status="untested" />
          <BloodResultRow label="Biotin / B7" value="Not tested" status="untested" />
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/blood-minerals")}>
          Next — Minerals →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodIronVitamins;
