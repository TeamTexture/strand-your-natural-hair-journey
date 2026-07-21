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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSubscribePath } from "@/lib/consumerOnboarding";


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
  const { user } = useAuth();
  const { values, setValue } = useBloodValues();
  const { unknown, setUnknown } = useUnknownMarkers();


  const onContinue = async () => {
    const res = await persistBloodValues();
    if (!res.ok) {
      toast.error("Could not save. Check your connection.");
      return;
    }
    if (user?.id) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }
    navigate(getSubscribePath());
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

        {unknown.length > 0 && (
          <>
            <SectionLabel>Other markers from your report</SectionLabel>
            <SurfaceCard>
              <p className="text-[11px] text-foreground/60 font-body mb-2">
                These aren't tracked with a reference range in STRAND, but they'll
                be saved with your panel so nothing is lost.
              </p>
              <div className="space-y-2">
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
