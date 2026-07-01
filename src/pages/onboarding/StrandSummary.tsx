// Post-onboarding AI summary screen. Calls hair-strand-summary which writes
// to hair_strand_summaries and returns overview + action plan + routine tips.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { computeStrandSummaryFingerprint } from "@/lib/strandSummaryFingerprint";
import { toast } from "sonner";

interface Summary {
  overview: string;
  action_plan: string[];
  routine_tips: string[];
}

const StrandSummary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Progress driver — climbs to 95 while we wait; snaps to 100 on completion.
  useEffect(() => {
    if (!loading) { setProgress(100); return; }
    const id = window.setInterval(() => {
      setProgress((p) => (p < 95 ? p + Math.max(1, Math.round((95 - p) * 0.08)) : p));
    }, 220);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const inputHash = await computeStrandSummaryFingerprint(user.id);

        // 1) Try the most recent cached summary. If its input_hash matches
        //    the current fingerprint, reuse it — no AI call needed.
        const { data: cached } = await supabase
          .from("hair_strand_summaries")
          .select("overview, action_plan, routine_tips, input_hash")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled && cached && (cached as { input_hash?: string }).input_hash === inputHash) {
          setSummary({
            overview: cached.overview ?? "",
            action_plan: (cached.action_plan as string[] | null) ?? [],
            routine_tips: (cached.routine_tips as string[] | null) ?? [],
          });
          setLoading(false);
          return;
        }

        // 2) Stale or missing → regenerate.
        const context = await buildAiContext();
        const { count: photoCount } = await supabase
          .from("user_before_photos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        const { data, error: fnErr } = await supabase.functions.invoke("hair-strand-summary", {
          body: { context, beforePhotoCount: photoCount ?? 0, inputHash },
        });
        if (cancelled) return;
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        setSummary({
          overview: data?.overview ?? "",
          action_plan: data?.action_plan ?? [],
          routine_tips: data?.routine_tips ?? [],
        });
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not generate summary";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const goNext = () => navigate("/onboarding/success");

  return (
    <ScreenLayout>
      <TitleBar title="Your Strand Summary" onBack={() => navigate("/onboarding/photos")} />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard tone="gold">
          <div className="flex items-start gap-2.5">
            <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12px] font-semibold mb-0.5">Personalised by AI</p>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Built from everything you just shared — your hair profile, goals, blood results and habits.
              </p>
            </div>
          </div>
        </SurfaceCard>

        {/* Progress bar while loading */}
        {loading && (
          <div className="space-y-2">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Building your strand summary…
            </p>
          </div>
        )}

        {error && !loading && (
          <SurfaceCard>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              You can continue and re-run this from your Profile later.
            </p>
          </SurfaceCard>
        )}

        {summary && (
          <>
            <SurfaceCard>
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-2">Overview</p>
              <p className="text-sm leading-relaxed text-foreground/90">{summary.overview}</p>
            </SurfaceCard>

            {summary.action_plan.length > 0 && (
              <SurfaceCard>
                <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-2">Action plan</p>
                <ul className="space-y-2">
                  {summary.action_plan.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span className="flex-1 leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            )}

            {summary.routine_tips.length > 0 && (
              <SurfaceCard>
                <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-2">Routine tips</p>
                <ul className="space-y-2">
                  {summary.routine_tips.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span className="flex-1 leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            )}
          </>
        )}

        <Button variant="gold" size="pill" onClick={goNext} disabled={loading}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default StrandSummary;
