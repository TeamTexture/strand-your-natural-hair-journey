import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import { useAuth } from "@/hooks/useAuth";

const Card = ({ title, body, to, navigate }: { title: string; body: React.ReactNode; to: string; navigate: (s: string) => void }) => (
  <SurfaceCard>
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">{title}</p>
      <button onClick={() => navigate(to)} className="text-xs uppercase tracking-[0.15em] text-primary">Edit</button>
    </div>
    {body}
  </SurfaceCard>
);

const safeParse = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

interface Step1Saved {
  prePoo?: string; cleanse?: string; condition?: string; treatment?: string;
  treatmentType?: string[];
  products?: string[];
  heatTreatment?: "yes" | "no" | null;
}
interface Step2Saved {
  scalp?: string[]; breakage?: string[]; style?: string[]; duration?: string[]; stress?: string[];
}

const WashStep4 = () => {
  const navigate = useNavigate();
  const [observation, setObservation] = useState<string | null>(null);
  const [obsLoading, setObsLoading] = useState(true);
  const [obsError, setObsError] = useState<string | null>(null);

  // Re-read the saved steps so the review reflects the user's real input
  // instead of a hardcoded summary line.
  const step1 = safeParse<Step1Saved>("strand_wash_step1", {});
  const step2 = safeParse<Step2Saved>("strand_wash_step2", {});
  const step3 = safeParse<{ note?: string; audioPath?: string | null }>("strand_wash_step3", {});
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  // Build a "Pre-poo ✓ · Cleanse (X) · Condition ✓ + Heat ✓" style line from
  // the user's actual selections. Skipped steps are dropped, todo steps too.
  const stepsSummary = useMemo(() => {
    const parts: string[] = [];
    const labels: Record<string, string> = {
      prePoo: "Pre-poo", cleanse: "Cleanse", condition: "Condition", treatment: "Treatment",
    };
    (["prePoo", "cleanse", "condition", "treatment"] as const).forEach((key) => {
      const state = step1[key];
      if (state === "done") parts.push(`${labels[key]} ✓`);
      else if (state === "skipped") parts.push(`${labels[key]} skipped`);
    });
    if (step1.heatTreatment === "yes") parts.push("Heat treatment ✓");
    if (step1.heatTreatment === "no") parts.push("No heat");
    if (step1.products?.length) {
      parts.push(`Products: ${step1.products.join(", ")}`);
    }
    if (step1.treatmentType?.length) {
      parts.push(`Treatment type: ${step1.treatmentType.join(", ")}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "No steps logged yet — tap to add.";
  }, [step1]);

  const resultsSummary = useMemo(() => {
    const bits: string[] = [];
    if (step2.scalp?.length) bits.push(`Scalp: ${step2.scalp.join(", ")}`);
    if (step2.breakage?.length) bits.push(`Breakage: ${step2.breakage.join(", ")}`);
    if (step2.style?.length) bits.push(`Style: ${step2.style.join(", ")}`);
    if (step2.duration?.length) bits.push(`Duration: ${step2.duration.join(", ")}`);
    if (step2.stress?.length) bits.push(`Stress: ${step2.stress.join(", ")}`);
    return bits.length > 0 ? bits.join(" · ") : "No results captured yet — tap to add.";
  }, [step2]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setObsLoading(true);
      setObsError(null);
      try {
        const steps = safeParse<Record<string, unknown>>("strand_wash_step1", {});
        const results = safeParse<Record<string, unknown>>("strand_wash_step2", {});
        const reflectionStep3 = safeParse<{ note?: string }>("strand_wash_step3", {});
        const hairProfile = safeParse<Record<string, unknown>>("strand_hair_profile", {});
        const healthProfile = safeParse<Record<string, unknown>>("strand_health_profile", {});
        const context = await buildAiContext();

        const { data, error } = await supabase.functions.invoke("wash-day-observation", {
          body: {
            steps,
            results,
            hairFeelNote: reflectionStep3.note ?? "",
            hairProfile,
            healthProfile,
            context,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!cancelled) setObservation(data?.observation ?? "");
      } catch (e: unknown) {
        if (!cancelled) {
          setObsError(e instanceof Error ? e.message : "Could not generate observation");
        }
      } finally {
        if (!cancelled) setObsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = () => {
    localStorage.setItem("strand_last_wash_date", new Date().toISOString());
    toast("💧 Wash day saved!");
    navigate("/home");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>4 of 4</span>} onBack={() => navigate("/wash/step-3")} />
      <ProgressDots total={4} current={4} />
      <ItalicSub>Your wash day summary. Tap any section to edit.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <Card
          title="Steps & Products"
          body={
            <p className="text-xs text-foreground/80 leading-relaxed">{stepsSummary}</p>
          }
          to="/wash/step-1" navigate={navigate}
        />
        <Card
          title="Results"
          body={
            <p className="text-xs text-foreground/80 leading-relaxed">{resultsSummary}</p>
          }
          to="/wash/step-2" navigate={navigate}
        />
        <Card
          title="How Your Hair Felt"
          body={
            step3.note ? (
              <p className="font-body text-sm text-muted-foreground leading-snug">
                "{step3.note}"
              </p>
            ) : (
              <p className="font-body text-sm text-muted-foreground italic">
                No reflection added yet — tap to write or record one.
              </p>
            )
          }
          to="/wash/step-3" navigate={navigate}
        />

        <SurfaceCard tone="green">
          {obsLoading ? (
            <p className="text-sm leading-snug text-foreground/70">
              <span className="font-semibold">🤖 </span>
              Analysing your wash day…
            </p>
          ) : obsError ? (
            <p className="text-sm leading-snug text-foreground/70">
              <span className="font-semibold">🤖 </span>
              Couldn't generate an observation right now — your wash day is still saved.
            </p>
          ) : (
            <p className="text-sm leading-snug">
              <span className="font-semibold">🤖 </span>
              {observation}
            </p>
          )}
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={save}>
          Save Wash Day
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/home")}>
          Save & Exit
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep4;
