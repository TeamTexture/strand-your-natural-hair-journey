import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodResultRow from "@/components/BloodResultRow";
import { Button } from "@/components/ui/button";

const BloodHormones = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Hormones" right={<span>4 of 4</span>} />
      <ProgressDots total={4} current={4} />
      <ItalicSub>Hormonal imbalances are one of the most common but least investigated causes of hair loss in women.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Hormone Panel</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {[
            "Oestrogen / Oestradiol", "Testosterone", "DHEA-S", "Prolactin",
            "FSH", "LH", "Cortisol", "Insulin / HbA1c",
          ].map((l) => (
            <BloodResultRow key={l} label={l} value="Not tested" status="untested" />
          ))}
        </SurfaceCard>

        <SurfaceCard tone="orange">
          <p className="text-sm leading-snug">
            <span className="font-semibold">2 deficiencies detected — </span>
            Low ferritin and vitamin D. Personalised nutrition guidance is now active. Retest in 90 days.
          </p>
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/success")}>
          All done — View My Results →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodHormones;
