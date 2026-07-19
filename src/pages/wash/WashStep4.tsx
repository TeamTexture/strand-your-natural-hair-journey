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
  prePoo?: string; cleanse?: string; coWash?: string; condition?: string; treatment?: string;
  treatmentType?: string[];
  products?: string[];
  productIds?: string[];
  heatTreatment?: "yes" | "no" | null;
  heatMinutes?: number | null;
  heatToolIds?: string[];
  heatToolNames?: string[];
}
interface Step2Saved {
  scalp?: string[]; breakage?: string[];
}
interface StylingSaved {
  style?: string[];
  productIds?: string[];
  productNames?: string[];
  duration?: string[];
  stress?: string[];
  note?: string;
  audioPath?: string | null;
  photoPaths?: string[];
  saveAsJournal?: boolean;
}

interface NextWashTip { action: string; why: string }

const WashStep4 = () => {
  const navigate = useNavigate();
  const [observation, setObservation] = useState<string | null>(null);
  const [nextTip, setNextTip] = useState<NextWashTip | null>(null);
  const [saveNextTip, setSaveNextTip] = useState(true);
  const [showNextTip, setShowNextTip] = useState(true);
  const [obsLoading, setObsLoading] = useState(true);
  const [obsError, setObsError] = useState<string | null>(null);

  const step1 = safeParse<Step1Saved>("strand_wash_step1", {});
  const step2 = safeParse<Step2Saved>("strand_wash_step2", {});
  const step3 = safeParse<{ note?: string; audioPath?: string | null }>("strand_wash_step3", {});
  const styling = safeParse<StylingSaved>("strand_wash_styling", {});
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const stepsSummary = useMemo(() => {
    const parts: string[] = [];
    const labels: Record<string, string> = {
      prePoo: "Pre-poo", cleanse: "Cleanse", coWash: "Co-wash", condition: "Condition", treatment: "Treatment",
    };
    (["prePoo", "cleanse", "coWash", "condition", "treatment"] as const).forEach((key) => {
      const state = step1[key];
      if (state === "done") parts.push(`${labels[key]} ✓`);
      else if (state === "skipped") parts.push(`${labels[key]} skipped`);
    });
    if (step1.heatTreatment === "yes") {
      parts.push(step1.heatMinutes ? `Heat treatment ✓ (${step1.heatMinutes} min)` : "Heat treatment ✓");
      if (step1.heatToolNames?.length) {
        parts.push(`Heat tool: ${step1.heatToolNames.join(", ")}`);
      }
    }
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
    return bits.length > 0 ? bits.join(" · ") : "No results captured yet — tap to add.";
  }, [step2]);

  const stylingSummary = useMemo(() => {
    const bits: string[] = [];
    if (styling.style?.length) bits.push(`Style: ${styling.style.join(", ")}`);
    if (styling.productNames?.length) bits.push(`Products: ${styling.productNames.join(", ")}`);
    if (styling.duration?.length) bits.push(`Duration: ${styling.duration.join(", ")}`);
    if (styling.stress?.length) bits.push(`Stress: ${styling.stress.join(", ")}`);
    if (styling.photoPaths?.length) bits.push(`${styling.photoPaths.length} photo${styling.photoPaths.length === 1 ? "" : "s"}`);
    return bits.length > 0 ? bits.join(" · ") : "No styling captured yet — tap to add.";
  }, [styling]);

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
            results: { ...results, styling },
            hairFeelNote: reflectionStep3.note ?? "",
            hairProfile,
            healthProfile,
            context,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!cancelled) {
          setObservation(data?.observation ?? "");
          const raw = data?.next_wash_tip;
          if (raw && typeof raw === "object" && (raw.action || raw.why)) {
            setNextTip({ action: raw.action ?? "", why: raw.why ?? "" });
          } else if (typeof raw === "string" && raw.trim()) {
            setNextTip({ action: raw.trim(), why: "" });
          } else {
            setNextTip(null);
          }
        }
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

  const save = async () => {
    if (saving) return;
    if (!user) {
      toast.error("Please sign in to save your wash day.");
      return;
    }
    setSaving(true);
    try {
      const stepLabels: Record<string, string> = {
        prePoo: "Pre-poo", cleanse: "Cleanse", coWash: "Co-wash", condition: "Condition", treatment: "Treatment",
      };
      const steps = (["prePoo", "cleanse", "coWash", "condition", "treatment"] as const)
        .filter((k) => step1[k] === "done")
        .map((k) => ({ name: stepLabels[k] }));

      const heatTreatment = step1.heatTreatment
        ? {
            used: step1.heatTreatment === "yes",
            ...(step1.heatTreatment === "yes" && step1.heatMinutes ? { duration_min: step1.heatMinutes } : {}),
            ...(step1.heatTreatment === "yes" && step1.heatToolIds?.length ? { tool_ids: step1.heatToolIds } : {}),
            ...(step1.heatTreatment === "yes" && step1.heatToolNames?.length ? { tools: step1.heatToolNames } : {}),
          }
        : null;

      const chosenDate = localStorage.getItem("strand_wash_date");
      const washDate = chosenDate && /^\d{4}-\d{2}-\d{2}$/.test(chosenDate)
        ? chosenDate
        : new Date().toISOString().slice(0, 10);

      // Merge wash-step + styling product IDs so use_count + last_used_at
      // get bumped for everything actually used today.
      const mergedProductIds = Array.from(
        new Set([...(step1.productIds ?? []), ...(styling.productIds ?? [])]),
      );

      const payload = {
        user_id: user.id,
        wash_date: washDate,
        steps,
        heat_treatment: heatTreatment,
        product_ids: mergedProductIds,
        scalp_feel: step2.scalp?.[0] ?? null,
        breakage: step2.breakage?.[0] ?? null,
        style_after: styling.style?.[0] ?? null,
        duration_min: null,
        stress_level: styling.stress?.[0]
          ? ({ Low: 1, Moderate: 2, High: 3 } as Record<string, number>)[styling.stress[0]] ?? null
          : null,
        hair_feel_note: step3.note?.trim() ? step3.note.trim() : null,
        hair_feel_voice_url: step3.audioPath ?? null,
        ai_insight: observation,
        next_wash_tip: saveNextTip && nextTip ? JSON.stringify(nextTip) : null,
      };

      const { error } = await supabase.from("wash_days").insert(payload);
      if (error) throw error;

      // Optionally create a Style Journal entry to document this style.
      if (styling.saveAsJournal && (styling.photoPaths?.length || styling.note?.trim() || styling.style?.length)) {
        const noteParts: string[] = [];
        if (styling.style?.length) noteParts.push(`Style: ${styling.style.join(", ")}`);
        if (styling.productNames?.length) noteParts.push(`Products: ${styling.productNames.join(", ")}`);
        if (styling.duration?.length) noteParts.push(`Styling duration: ${styling.duration.join(", ")}`);
        if (styling.stress?.length) noteParts.push(`Stress this week: ${styling.stress.join(", ")}`);
        if (styling.note?.trim()) noteParts.push(styling.note.trim());

        const { error: journalErr } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          title: `Style — ${styling.style?.[0] ?? "Wash day"}`,
          note: noteParts.join("\n\n") || null,
          photo_paths: styling.photoPaths ?? [],
          products_used: styling.productIds ?? [],
          entry_date: washDate,
        });
        if (journalErr) {
          console.error("journal insert failed", journalErr);
          toast.error("Wash day saved — journal entry failed");
        }
      }

      localStorage.setItem("strand_last_wash_date", new Date().toISOString());
      localStorage.removeItem("strand_wash_step1");
      localStorage.removeItem("strand_wash_step2");
      localStorage.removeItem("strand_wash_step3");
      localStorage.removeItem("strand_wash_styling");
      localStorage.removeItem("strand_wash_date");

      toast("💧 Wash day saved!");
      navigate("/wash-day");
    } catch (e) {
      console.error("wash_days insert failed", e);
      toast.error(e instanceof Error ? e.message : "Could not save wash day");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>5 of 5</span>} onBack={() => navigate("/wash/step-styling")} />
      <ProgressDots total={5} current={5} />
      <ItalicSub>Your wash day summary. Tap any section to edit.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <Card
          title="Steps & Products"
          body={<p className="text-xs text-foreground/80 leading-relaxed">{stepsSummary}</p>}
          to="/wash/step-1" navigate={navigate}
        />
        <Card
          title="Results"
          body={<p className="text-xs text-foreground/80 leading-relaxed">{resultsSummary}</p>}
          to="/wash/step-2" navigate={navigate}
        />
        <Card
          title="How Your Hair Felt"
          body={
            step3.note ? (
              <p className="font-body text-sm text-muted-foreground leading-snug">"{step3.note}"</p>
            ) : (
              <p className="font-body text-sm text-muted-foreground italic">
                No reflection added yet — tap to write or record one.
              </p>
            )
          }
          to="/wash/step-3" navigate={navigate}
        />
        <Card
          title="Styling"
          body={<p className="text-xs text-foreground/80 leading-relaxed">{stylingSummary}</p>}
          to="/wash/step-styling" navigate={navigate}
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

        {!obsLoading && !obsError && nextTip && (
          <SurfaceCard tone="gold">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">
                ✨ Tip for next wash day
              </p>
              <button
                type="button"
                onClick={() => setShowNextTip((s) => !s)}
                className="text-[11px] uppercase tracking-[0.15em] text-primary"
              >
                {showNextTip ? "Hide" : "Show"}
              </button>
            </div>
            {showNextTip && (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-1">
                    Do this next wash
                  </p>
                  <p className="text-sm leading-snug font-medium">{nextTip.action}</p>
                </div>
                {nextTip.why && (
                  <div className="pt-2 border-t border-primary/15">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-primary/70 font-medium mb-1">
                      Why
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">{nextTip.why}</p>
                  </div>
                )}
              </div>
            )}
            <label className="mt-3 flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
              <input
                type="checkbox"
                checked={saveNextTip}
                onChange={(e) => setSaveNextTip(e.target.checked)}
                className="size-4 accent-primary"
              />
              Save this tip to my wash day
            </label>
          </SurfaceCard>
        )}


        <Button variant="gold" size="pill" className="mt-4" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Wash Day"}
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/home")} disabled={saving}>
          Save & Exit
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep4;
