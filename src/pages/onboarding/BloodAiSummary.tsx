import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useBloodValues } from "@/hooks/useBloodValues";
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
    const promptVersion = "v2-full-coverage";
    return {
      payload: { bloodResults, hairProfile, healthProfile, heritage },
      fingerprint: JSON.stringify({ bloodResults, hairProfile, healthProfile, heritage, promptVersion }),
    };
  };

  const generate = async (force = false) => {
    setLoading(true);
    setError(null);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not generate your summary.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Analysing" />
        <LoadingDot label="Analysing your results…" />
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
          <Button variant="goldGhost" size="pill" onClick={() => navigate("/onboarding/success")}>
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
            onClick={() => navigate("/nutrition-plan")}
            className="whitespace-normal leading-tight px-5 py-3 h-auto min-h-[48px] text-[11px]"
          >
            See Your Personalised Nutrition Plan →
          </Button>
          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/onboarding/success")}
          >
            Continue to app →
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default BloodAiSummary;
