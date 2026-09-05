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
import { ShieldCheck } from "lucide-react";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke } from "@/lib/aiInvoke";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { readBloodData } from "@/lib/bloodRead";
import { canonDiet } from "@/lib/dietaryPattern";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { shortForm } from "@/lib/tipsRender";
import AnchorStat from "@/components/guidance/AnchorStat";
import GuidanceBody from "@/components/guidance/GuidanceBody";
import ActionList from "@/components/guidance/ActionList";
import MarkerBadgeRow, { type MarkerSeverity } from "@/components/blood/MarkerBadgeRow";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

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
  const { level } = useTipsLevel();
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
    const promptVersion = "v5-manuscript-2026-08-22";
    return {
      payload: { bloodResults, hairProfile, healthProfile, heritage },
      fingerprint: JSON.stringify({ bloodResults, hairProfile, healthProfile, heritage, promptVersion, tipsLevel: level }),
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
      const { payload } = buildFingerprint(hairProfile, healthProfile, heritage);
      // SPEND CONTROL (2026-08-26). `force` now comes ONLY from an explicit
      // member action. The old localStorage fingerprint treated any incidental
      // profile change (and any cleared browser storage) as a reason to
      // regenerate, and passed that same force through to the nutrition-plan
      // prewarm — so opening this screen could pay for two cold generations.
      // Staleness is decided server side from her actual blood data.
      const shouldForce = force;

      const context = await buildAiContext();
      const { data, error: fnError } = await aiInvoke<{ error?: string; summary?: Summary }>(
        "blood-ai-summary",
        { ...payload, force: shouldForce, context },
      );
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary as Summary);
      stopProgress(100);

      // Fire-and-forget: pre-warm the nutrition plan while the user reads
      // their blood summary. Claude/Opus can take 30-50s cold, and the
      // result is cached in ai_summaries — so by the time the user taps
      // "See Your Personalised Nutrition Plan" it's typically instant.
      // IMPORTANT: the prewarm must send the SAME inputs the Nutrition Plan
      // page sends (diet, dietOther, alcohol, flaggedMarkers), because those
      // fields are part of the server-side cache signature. Warming without
      // them generated a plan under a different key, so the page still paid
      // for a cold generation and the prewarm was wasted spend.
      void (async () => {
        try {
          const { data: authData } = await getDisplayedAuthUser();
          const uid = authData?.user?.id;
          const blood = uid ? await readBloodData(uid) : { flagged: [] as string[] };
          await aiInvoke("nutrition-plan", {
            context,
            // Prewarm only: never forces a regeneration.
            force: false,
            diet: canonDiet((healthProfile as { diet?: string }).diet),
            dietOther: (healthProfile as { dietOther?: string }).dietOther ?? "",
            alcohol: (healthProfile as { alcohol?: string }).alcohol ?? "unknown",
            flaggedMarkers: blood.flagged,
          });
        } catch (err) {
          // Silent — the Nutrition Plan screen generates on first open if needed.
          console.warn("[nutrition-plan prewarm] skipped", err);
        }
      })();

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


  // Defensive guard: blood work is optional, so a stale link, bookmark or
  // back-button must never strand a member on a progress bar with nothing to
  // analyse. No panel on file → straight into the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: authData } = await getDisplayedAuthUser();
      const uid = authData?.user?.id;
      if (!uid) return;
      const { count } = await supabase
        .from("blood_panels")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      if (!cancelled && (count ?? 0) === 0) navigate("/home", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Button variant="goldGhost" size="pill" onClick={() => navigate("/nutrition-plan?onboarding=1")}>
            Continue anyway →
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  // The model's JSON is not a contract: a missing or null array must render as
  // "nothing flagged", never throw and dead-end her on an error card.
  const deficiencies = Array.isArray(summary.deficiencies) ? summary.deficiencies : [];
  const priorityActions = Array.isArray(summary.priority_actions) ? summary.priority_actions : [];
  const hasDeficiencies = deficiencies.length > 0;

  return (
    <ScreenLayout>
      <TitleBar title="Your Results" />
      <div className="px-5 pt-1 pb-10 space-y-4">
        <h1 className="font-display text-[26px] leading-tight text-foreground">Your Hair Health Profile</h1>

        <SurfaceCard>
          <AnchorStat
            value={deficiencies.length}
            context={
              deficiencies.length === 1
                ? "marker flagged from your results"
                : "markers flagged from your results"
            }
            tone={hasDeficiencies ? "warning" : "good"}
          />
        </SurfaceCard>

        <SectionLabel>Deficiencies detected</SectionLabel>
        {hasDeficiencies ? (
          <SurfaceCard padded={false}>
            <div className="divide-y divide-border/60 px-4">
              {deficiencies.map((d) => {
                const severity: MarkerSeverity =
                  d.status === "low" ? "deficient" : d.status === "high" ? "high" : "borderline";
                return (
                  <MarkerBadgeRow
                    key={d.marker}
                    marker={d.marker}
                    severity={severity}
                    value={d.value}
                    impact={shortForm(d.hair_impact, level)}
                  />
                );
              })}
            </div>
          </SurfaceCard>
        ) : (
          <SurfaceCard tone="green" className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-good" />
            <p className="text-sm">All markers within normal range ✓</p>
          </SurfaceCard>
        )}

        <SectionLabel>What this means for your hair</SectionLabel>
        <SurfaceCard>
          <GuidanceBody text={summary.overall_summary} />
        </SurfaceCard>




        <SectionLabel>Your priority actions</SectionLabel>
        <SurfaceCard>
          <ActionList
            idPrefix="blood-priority"
            actions={priorityActions.map((a) => ({ action: a }))}
            showWhy={false}
          />
        </SurfaceCard>

        <div className="pt-2 space-y-3">
          <Button
            variant="gold"
            size="pill"
            onClick={() => {
              clearBloodDraft();
              navigate("/nutrition-plan?onboarding=1");
            }}
            className="whitespace-normal leading-tight px-5 py-3 h-auto min-h-[48px] text-[11px]"
          >
            See Your Personalised Nutrition Plan →
          </Button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default BloodAiSummary;
