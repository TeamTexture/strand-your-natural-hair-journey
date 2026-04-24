import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodResultRow from "@/components/BloodResultRow";
import { Button } from "@/components/ui/button";

const BloodThyroid = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Thyroid" right={<span>3 of 4</span>} />
      <ProgressDots total={4} current={3} />
      <ItalicSub>Both underactive and overactive thyroid are a leading cause of hair shedding and texture changes.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Thyroid Panel</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {["TSH", "Free T3", "Free T4", "Thyroid Antibodies (TPO)"].map((l) => (
            <BloodResultRow key={l} label={l} value="Not tested" status="untested" />
          ))}
        </SurfaceCard>

        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-relaxed">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">Tip — </span>
            Have not had a thyroid test? Ask your GP for TSH as part of a routine blood panel — it is a standard request alongside iron and vitamin D.
          </p>
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/blood-hormones")}>
          Next — Hormones →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodThyroid;
