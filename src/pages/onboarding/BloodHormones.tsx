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
import { Input } from "@/components/ui/input";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useBloodValues, persistBloodValues, useUnknownMarkers } from "@/hooks/useBloodValues";
import { toast } from "sonner";
import { useBloodDraftResume } from "@/hooks/useBloodDraftResume";
import { getSubscribePath, POST_PAYMENT_ANALYSIS_PATH } from "@/lib/consumerOnboarding";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useInvalidateOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { isResumeLocked, RESUME_PATH } from "@/lib/onboardingLock";


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
  // Auto-saved draft: restore across sessions/devices and remember this screen.
  useBloodDraftResume("/onboarding/blood-hormones");
  const { unknown, setUnknown } = useUnknownMarkers();
  const { hasAccess } = useConsumerSubscription();
  const invalidateOnboardingStatus = useInvalidateOnboardingStatus();
  const [showOther, setShowOther] = useState(false);


  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    // Payment must not wait for a six-table background progress refresh. On
    // slower tablets that extra request kept the member on this screen even
    // though her blood work had already saved successfully.
    void invalidateOnboardingStatus();
    // Finishing blood work does not unlock the app: if hair characteristics or
    // the consultation are still outstanding, she goes back to the resume
    // screen, which re-reads dataComplete and shows what is left.
    if (isResumeLocked()) {
      navigate(RESUME_PATH, { replace: true });
      return;
    }
    // Members who already have access (or are editing their bloods later)
    // must never be bounced back into the paywall.
    navigate(hasAccess ? POST_PAYMENT_ANALYSIS_PATH : getSubscribePath());
  };

  return (
    <ScreenLayout>
      <TitleBar title="Hormones" onBack={onboardingBack(navigate, "/onboarding/blood-hormones")} right={<span>4 of 4</span>} />
      <OnboardingGuide className="pt-2 pb-1" />
      <ItalicSub>Hormonal imbalances are one of the most common but least investigated causes of hair loss in women.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Hormone Panel</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {MARKERS.map((m) => (
            <BloodInputRow key={m} marker={m} value={values[m] ?? null} onChange={(v) => setValue(m, v)} />
          ))}
        </SurfaceCard>

        <BloodSummaryBar markers={MARKERS} />

        {unknown.length > 0 && (
          <>
            <SectionLabel>Other markers from your report</SectionLabel>
            <SurfaceCard>
              <p className="text-[11px] text-foreground/60 font-body mb-2">
                {unknown.length} marker{unknown.length === 1 ? "" : "s"} not tracked in STRAND's
                panel — saved with your panel for your records.
              </p>
              <button
                type="button"
                onClick={() => setShowOther((v) => !v)}
                className="flex items-center justify-between w-full text-sm font-body font-medium text-foreground/80 py-1"
                aria-expanded={showOther}
              >
                <span>{showOther ? "Hide" : `Show ${unknown.length}`} other marker{unknown.length === 1 ? "" : "s"}</span>
                <ChevronDown className={`size-4 transition-transform ${showOther ? "rotate-180" : ""}`} />
              </button>
              {showOther && (
                <div className="space-y-2 mt-2">
                  {unknown.map((u, i) => (
                    <div key={`${u.marker}-${i}`} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-medium truncate">{u.marker}</p>
                        {u.unit && (
                          <p className="text-[11px] text-foreground/60 font-body">{u.unit}</p>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="any"
                        value={u.value === null || u.value === undefined ? "" : String(u.value)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = [...unknown];
                          next[i] = { ...u, value: raw === "" ? null : Number(raw) };
                          setUnknown(next);
                        }}
                        className="h-8 w-24 text-right text-sm"
                      />
                      <button
                        onClick={() => setUnknown(unknown.filter((_, idx) => idx !== i))}
                        className="size-7 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
                        aria-label="Remove marker"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </>
        )}



        <Button variant="gold" size="pill" className="mt-4" onClick={onContinue}>
          Analyse my results →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodHormones;
