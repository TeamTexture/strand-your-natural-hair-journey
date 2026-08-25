import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BloodInputRow from "@/components/BloodInputRow";
import BloodSummaryBar from "@/components/BloodSummaryBar";
import { Button } from "@/components/ui/button";
import { useMembershipExit } from "@/hooks/useMembershipExit";
import { useBloodValues, persistBloodValues } from "@/hooks/useBloodValues";
import { toast } from "sonner";
import { useBloodDraftResume } from "@/hooks/useBloodDraftResume";

const MARKERS = ["TSH", "Free T3", "Free T4", "Thyroid Antibodies (TPO)"];

const BloodThyroid = () => {
  const navigate = useNavigate();
  const { resolveMembershipPath } = useMembershipExit();
  const { values, setValue } = useBloodValues();
  // Auto-saved draft: restore across sessions/devices and remember this screen.
  useBloodDraftResume("/onboarding/blood-thyroid");

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
      <TitleBar title="Thyroid" onBack={onboardingBack(navigate, "/onboarding/blood-thyroid")} right={<span>3 of 4</span>} />
      <OnboardingGuide className="pt-2 pb-1" />
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
