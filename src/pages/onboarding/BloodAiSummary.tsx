import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useBloodValues, clearBloodDraft } from "@/hooks/useBloodValues";
import { BLOOD_RANGES, evaluate } from "@/data/bloodRanges";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";

interface Deficiency {
  marker: string;
  value?: string;
  status: "low" | "high" | "borderline";
  hair_impact: string;
  urgency: "low" | "medium" | "high";
}
interface Summary {
  deficiencies: Deficiency[];
  overall_summary: string;
  priority_actions: string[];
}

const BloodAiSummary = () => {
  const navigate = useNavigate();
  const { values } = useBloodValues();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build a stable fingerprint of the inputs so we can detect when the user
  // has updated their blood values / profile and force the AI to regenerate.
  const buildFingerprint = (
    hairProfile: Record<string, unknown>,
    healthProfile: Record<string, unknown>,
    heritage: string[],
  ) => {
    const bloodResults = Object.entries(values)
      .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
      .map(([marker, value]) => ({
        marker,
        value: value as number,
        unit: BLOOD_RANGES[marker]?.unit ?? "",
        status: evaluate(marker, value as number),
        category: BLOOD_RANGES[marker]?.category ?? "other",
      }))
      .sort((a, b) => a.marker.localeCompare(b.marker));
    // Bump promptVersion when the server-side prompt changes to bust the cache.
    const promptVersion = "v3-trend-analysis";
    return {
      payload: { bloodResults, hairProfile, healthProfile, heritage },
      fingerprint: JSON.stringify({ bloodResults, hairProfile, healthProfile, heritage, promptVersion }),
    };
  };

  const startProgress = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(0);
    const start = Date.now();
    // Tick toward 95% over ~20s; ease so it slows as it approaches the ceiling.
    progressTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const target = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 7))));
      setProgress((p) => (target > p ? target : Math.min(95, p + 1)));
    }, 200);
  };

  const stopProgress = (final: number) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgress(final);
  };

  const generate = async (force = false) => {
    setLoading(true);
    setError(null);
    startProgress();
    try {
      const clinical = await loadClinicalContext();
      const hairProfile = (clinical.hair ?? {}) as Record<string, unknown>;
      const healthProfile = (clinical.health ?? {}) as Record<string, unknown>;
      const heritage = clinical.basic?.heritage ?? [];
      const { payload, fingerprint } = buildFingerprint(hairProfile, healthProfile, heritage);
      const lastFingerprint = localStorage.getItem("strand_blood_summary_fp");
      const inputsChanged = lastFingerprint !== fingerprint;
      const shouldForce = force || inputsChanged;

      const context = await buildAiContext();
      const { data, error: fnError } = await supabase.functions.invoke("blood-ai-summary", {
        body: { ...payload, force: shouldForce, context },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary as Summary);
      localStorage.setItem("strand_blood_summary_fp", fingerprint);
      stopProgress(100);
      // Hold 100% visible for a moment before unmounting the loader.
      await new Promise((r) => setTimeout(r, 400));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not generate your summary.";
      setError(msg);
      toast.error(msg);
      stopProgress(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);


  useEffect(() => {
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  if (loading) {
    const pct = Math.min(100, Math.max(0, Math.round(progress)));
    return (
      <ScreenLayout>
        <TitleBar title="Analysing" />
        <div className="px-6 pt-10 pb-10 flex flex-col items-center text-center">
          <p className="font-display text-[22px] leading-tight text-foreground mb-6">
            Analysing your results…
          </p>
          <div
            className="text-[44px] font-display text-primary tabular-nums mb-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            {pct}%
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground font-body mt-4 leading-relaxed">
            STRAND is reading your bloods against your hair, health and heritage profile. This takes a few seconds.
          </p>
        </div>
      </ScreenLayout>
    );
  }


  if (error || !summary) {
    return (
      <ScreenLayout>
        <TitleBar title="Hair Health Profile" />
        <div className="px-5 pt-4 pb-10 space-y-3">
          <SurfaceCard tone="orange">
            <p className="text-sm">Could not generate your summary.</p>
          </SurfaceCard>
          <Button variant="gold" size="pill" onClick={() => generate(true)}>Retry</Button>
          <Button variant="goldGhost" size="pill" onClick={() => navigate("/onboarding/photos")}>
            Continue anyway →
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  const hasDeficiencies = summary.deficiencies && summary.deficiencies.length > 0;

  return (
    <ScreenLayout>
      <TitleBar title="Your Results" />
      <div className="px-5 pt-1 pb-10 space-y-4">
        <h1 className="font-display text-[26px] leading-tight text-foreground">Your Hair Health Profile</h1>

        <SectionLabel>Deficiencies Detected</SectionLabel>
        {hasDeficiencies ? (
          <div className="space-y-2">
            {summary.deficiencies.map((d) => (
              <div
                key={d.marker}
                className="bg-card border border-border border-l-4 border-l-warn rounded-[14px] p-3.5"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-body">
                      {d.marker}{" "}
                      <span className="text-warn text-xs font-medium uppercase tracking-[0.1em]">
                        {d.status}
                      </span>
                    </p>
                    {d.value && (
                      <p className="text-[11px] text-muted-foreground font-body">{d.value}</p>
                    )}
                    <p className="text-xs text-foreground/85 font-body mt-1 leading-relaxed">
                      {d.hair_impact}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <SurfaceCard tone="green" className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-good" />
            <p className="text-sm">All markers within normal range ✓</p>
          </SurfaceCard>
        )}

        <SectionLabel>What this means for your hair</SectionLabel>
        <SurfaceCard>
          <p className="text-sm leading-relaxed font-body">{summary.overall_summary}</p>
        </SurfaceCard>

        <SectionLabel>Your priority actions</SectionLabel>
        <SurfaceCard padded={false}>
          <ol className="divide-y divide-border/60">
            {summary.priority_actions.map((a, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 text-sm font-body">
                <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{a}</span>
              </li>
            ))}
          </ol>
        </SurfaceCard>

        <div className="pt-2 space-y-3">
          <Button
            variant="gold"
            size="pill"
            onClick={() => {
              clearBloodDraft();
              navigate("/nutrition-plan");
            }}
            className="whitespace-normal leading-tight px-5 py-3 h-auto min-h-[48px] text-[11px]"
          >
            See Your Personalised Nutrition Plan →
          </Button>
          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearBloodDraft();
              navigate("/onboarding/photos");
            }}
          >
            Continue to app →
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default BloodAiSummary;
