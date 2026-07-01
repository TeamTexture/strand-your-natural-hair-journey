// Post-onboarding AI summary screen. Calls hair-strand-summary which writes
// to hair_strand_summaries and returns overview + action plan + routine tips.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Loader2, Camera, Plus, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { buildAiContext } from "@/lib/aiContext";
import { computeStrandSummaryFingerprint } from "@/lib/strandSummaryFingerprint";
import { toast } from "sonner";

const MAX_PHOTOS = 12;

interface PhotoItem {
  id: string;
  path: string;
  url: string;
  createdAt: string;
}


interface Summary {
  overview: string;
  action_plan: string[];
  routine_tips: string[];
}

const StrandSummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Treat as a revisit (not the onboarding flow) when the route was pushed
  // from anywhere other than the onboarding photos step, or when the user
  // has already completed onboarding.
  const [isRevisit, setIsRevisit] = useState<boolean>(
    (location.state as { fromOnboarding?: boolean } | null)?.fromOnboarding !== true,
  );

  const { upload, sign, uploading } = usePhotoUploader("before-photos");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  // Treat as a revisit (not the onboarding flow) when the route was pushed
  // from anywhere other than the onboarding photos step, or when the user
  // has already completed onboarding.
  const [isRevisit, setIsRevisit] = useState<boolean>(
    (location.state as { fromOnboarding?: boolean } | null)?.fromOnboarding !== true,
  );

  const loadPhotos = async (uid: string) => {
    const { data } = await supabase
      .from("user_before_photos")
      .select("id, storage_path, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{ id: string; storage_path: string; created_at: string }>;
    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        path: r.storage_path,
        url: (await sign(r.storage_path)) ?? "",
        createdAt: r.created_at,
      })),
    );
    setPhotos(withUrls.filter((p) => p.url));
  };

  useEffect(() => {
    if (!user) return;
    void loadPhotos(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handlePick = async (file: File | null) => {
    if (!file || !user) return;
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos`);
      return;
    }
    const path = await upload(file);
    if (!path) { toast.error("Upload failed"); return; }
    const { data: inserted, error } = await supabase
      .from("user_before_photos")
      .insert({ user_id: user.id, storage_path: path })
      .select("id, storage_path, created_at")
      .single();
    if (error || !inserted) {
      toast.error("Could not save photo");
      return;
    }
    const url = await sign(inserted.storage_path);
    if (url) {
      setPhotos((p) => [
        { id: inserted.id, path: inserted.storage_path, url, createdAt: inserted.created_at },
        ...p,
      ]);
    }
  };

  const removePhoto = async (photo: PhotoItem) => {
    if (!user) return;
    await supabase.from("user_before_photos").delete().eq("id", photo.id).eq("user_id", user.id);
    await supabase.storage.from("before-photos").remove([photo.path]);
    setPhotos((p) => p.filter((i) => i.id !== photo.id));
  };

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
        // Check if the user has completed onboarding — used to flip this
        // page into "revisit" mode (back-arrow returns to previous route,
        // CTA becomes Done rather than pushing to /onboarding/success).
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && (profile as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at) {
          setIsRevisit(true);
        }

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

  const goBack = () => (isRevisit ? navigate(-1) : navigate("/onboarding/photos"));
  const goNext = () => (isRevisit ? navigate(-1) : navigate("/onboarding/success"));

  return (
    <ScreenLayout>
      <TitleBar title="Your Strand Summary" onBack={goBack} />

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
          {isRevisit ? "Done" : "Continue →"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default StrandSummary;
