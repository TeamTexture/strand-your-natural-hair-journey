import { useEffect, useState } from "react";
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

const WashStep4 = () => {
  const navigate = useNavigate();
  const [observation, setObservation] = useState<string | null>(null);
  const [obsLoading, setObsLoading] = useState(true);
  const [obsError, setObsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setObsLoading(true);
      setObsError(null);
      try {
        const steps = safeParse<Record<string, unknown>>("strand_wash_step1", {});
        const results = safeParse<Record<string, unknown>>("strand_wash_step2", {});
        const step3 = safeParse<{ note?: string }>("strand_wash_step3", {});
        const hairProfile = safeParse<Record<string, unknown>>("strand_hair_profile", {});
        const healthProfile = safeParse<Record<string, unknown>>("strand_health_profile", {});
        const context = await buildAiContext();

        const { data, error } = await supabase.functions.invoke("wash-day-observation", {
          body: {
            steps,
            results,
            hairFeelNote: step3.note ?? "",
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
            <p className="text-xs text-foreground/80 leading-relaxed">
              Pre-poo ✓ · Cleanse ✓ (Camille Rose shampoo) · Condition ✓ (TGIN deep cond + Heat Hat 25 mins) · Style ✓ (Camille Rose gel)
            </p>
          }
          to="/wash/step-1" navigate={navigate}
        />
        <Card
          title="Results"
          body={
            <p className="text-xs text-foreground/80 leading-relaxed">
              Scalp: Clean · Breakage: Minimal · Style: Wash &amp; go · Duration: 2-3 hours · Stress: Moderate
            </p>
          }
          to="/wash/step-2" navigate={navigate}
        />
        <Card
          title="How Your Hair Felt"
          body={
            <p className="font-body text-sm text-muted-foreground leading-snug">
              "Soft and bouncy after the heat hat. Curls feel really defined and the ends are not as dry as last time."
            </p>
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
              Couldn’t generate an observation right now — your wash day is still saved.
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
