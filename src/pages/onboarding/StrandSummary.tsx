// Post-onboarding AI summary screen. Calls hair-strand-summary which writes
// to hair_strand_summaries and returns overview + action plan + routine tips.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sparkles, Loader2, Camera, Plus, X,
  Droplets, Shield, Scissors, Flame, Moon, Sun, Wind, Leaf,
  Pill, Apple, Activity, Calendar, Sparkle, Waves, HeartPulse,
  ClipboardList, ListChecks, FileText, type LucideIcon,
} from "lucide-react";
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
import { useSmartInline } from "@/lib/smartInline";

const MAX_PHOTOS = 5;

const bannedSummaryPatterns = [
  /\bit[’']s a pleasure to connect with you[.!]?\s*/gi,
  /\bpleasure to connect with you[.!]?\s*/gi,
  /\bthanks for sharing[.!]?\s*/gi,
  /\byour hair is naturally gorgeous[.!]?\s*/gi,
  /\bnaturally gorgeous[.!]?\s*/gi,
  /\bgorgeous\b/gi,
  /\bbeautiful\b/gi,
  /\bamazing\b/gi,
  /\bqueen\b/gi,
];

const cleanSummaryText = (text: string) =>
  bannedSummaryPatterns
    .reduce((next, pattern) => next.replace(pattern, ""), text)
    .replace(/\s{2,}/g, " ")
    .trim();

const normaliseSummary = (value: Partial<Summary> | null | undefined): Summary => ({
  overview: cleanSummaryText(value?.overview ?? ""),
  action_plan: Array.isArray(value?.action_plan)
    ? value.action_plan.map((item) => cleanSummaryText(String(item))).filter(Boolean)
    : [],
  routine_tips: Array.isArray(value?.routine_tips)
    ? value.routine_tips.map((item) => cleanSummaryText(String(item))).filter(Boolean)
    : [],
});

interface PhotoItem {
  id: string;
  path: string;
  url: string;
  createdAt: string;
}


// Pick a topical icon based on keywords in the tip text
const pickIcon = (text: string): LucideIcon => {
  const t = text.toLowerCase();
  if (/tt heat hat|heat hat|blow.?dry|flat.?iron|straight|thermal|heat/.test(t)) return Flame;
  if (/clarif|chelat|mineral|build.?up|shampoo/.test(t)) return Waves;
  if (/moistur|hydrat|water|conditioner|leave.?in|lco|lok/.test(t)) return Droplets;
  if (/protein|bond|keratin|strength/.test(t)) return Shield;
  if (/trim|scissor|split end|cut/.test(t)) return Scissors;
  if (/night|sleep|bonnet|satin|silk|pillow/.test(t)) return Moon;
  if (/sun|uv|spf|summer/.test(t)) return Sun;
  if (/scalp|massage|follicle|circulation/.test(t)) return HeartPulse;
  if (/oil|seal|jbco|castor|jojoba|argan/.test(t)) return Leaf;
  if (/wind|air.?dry|diffus/.test(t)) return Wind;
  if (/supplement|vitamin|iron|ferritin|biotin|zinc/.test(t)) return Pill;
  if (/diet|nutrition|protein.?rich|food|eat|omega/.test(t)) return Apple;
  if (/exercise|activity|stress|cortisol/.test(t)) return Activity;
  if (/week|month|day|schedule|routine|frequency/.test(t)) return Calendar;
  return Sparkle;
};

// Legacy signature kept for callers; product/ingredient/heat-hat linking is
// now delegated to the shared smart-inline renderer via `useSmartInline()`.


interface Summary {
  overview: string;
  action_plan: string[];
  routine_tips: string[];
}

const StrandSummary = () => {
  const renderRichText = useSmartInline();
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
  const [openDay, setOpenDay] = useState<string | null>(null);
  const pendingNewDay = useRef(true);
  const todayKey = new Date().toISOString().slice(0, 10);



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

        // Fetch cached summary + compute fingerprint in parallel so we can
        // show the cached overview instantly while we verify freshness.
        const [cachedRes, inputHash] = await Promise.all([
          supabase
            .from("hair_strand_summaries")
            .select("overview, action_plan, routine_tips, input_hash")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          computeStrandSummaryFingerprint(user.id),
        ]);
        const cached = cachedRes.data;

        // Paint cached immediately for perceived speed.
        if (!cancelled && cached?.overview) {
          setSummary(normaliseSummary({
            overview: cached.overview,
            action_plan: (cached.action_plan as string[] | null) ?? [],
            routine_tips: (cached.routine_tips as string[] | null) ?? [],
          }));
        }

        // If the fingerprint matches, the cached copy is authoritative — stop.
        if (!cancelled && cached && (cached as { input_hash?: string }).input_hash === inputHash) {
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
        setSummary(normaliseSummary({
          overview: data?.overview ?? "",
          action_plan: data?.action_plan ?? [],
          routine_tips: data?.routine_tips ?? [],
        }));
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
            {/* Overview — split long paragraph into readable sentences */}
            <SurfaceCard>
              <div className="flex items-center gap-2 mb-3">
                <span className="size-7 rounded-full bg-primary/15 flex items-center justify-center">
                  <FileText className="size-3.5 text-primary" />
                </span>
                <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">Overview</p>
              </div>
              <div className="space-y-2">
                {summary.overview
                  .split(/(?<=[.!?])\s+(?=[A-Z])/)
                  .filter(Boolean)
                  .map((sentence, i) => (
                    <p key={i} className="text-[13.5px] leading-relaxed text-foreground/90">
                      {renderRichText(sentence, `ov-${i}`)}
                    </p>
                  ))}
              </div>
            </SurfaceCard>


            {summary.routine_tips.length > 0 && (
              <SurfaceCard>
                <div className="flex items-center gap-2 mb-3">
                  <span className="size-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <ClipboardList className="size-3.5 text-primary" />
                  </span>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">Routine tips</p>
                </div>
                <ul className="space-y-2">
                  {summary.routine_tips.map((b, i) => {
                    const Icon = pickIcon(b);
                    return (
                      <li key={i} className="flex gap-2.5 items-start rounded-[12px] bg-secondary/40 px-3 py-2.5">
                        <span className="mt-0.5 size-7 rounded-full bg-background border border-primary/20 flex items-center justify-center shrink-0">
                          <Icon className="size-3.5 text-primary" />
                        </span>
                        <span className="flex-1 text-[13px] leading-snug text-foreground/90">
                          {renderRichText(b, `rt-${i}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </SurfaceCard>
            )}
          </>
        )}


        {/* Progress photos, grouped per day into brown/gold cards. Tapping a
            day card opens its photos and lets the user add more to that same
            day (any upload today) or start a new day (any upload). */}
        <SurfaceCard>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium">
              Progress photos
            </p>
            <span className="text-[10px] text-muted-foreground">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
            Photos are grouped by day. Tap a day to view or add more; use the new-day button to start a fresh entry.
          </p>

          {(() => {
            // Group photos by calendar day (YYYY-MM-DD) using createdAt.
            const groups = new Map<string, PhotoItem[]>();
            for (const p of photos) {
              const key = new Date(p.createdAt).toISOString().slice(0, 10);
              const arr = groups.get(key) ?? [];
              arr.push(p);
              groups.set(key, arr);
            }
            const dayKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
            const canAdd = photos.length < MAX_PHOTOS;

            return (
              <div className="space-y-2.5">
                {dayKeys.map((k) => {
                  const items = groups.get(k)!;
                  const open = openDay === k;
                  const label = new Date(items[0].createdAt).toLocaleDateString(undefined, {
                    weekday: "short", day: "numeric", month: "short", year: "numeric",
                  });
                  const timeRange = items.length > 1
                    ? `${items.length} photos`
                    : new Date(items[0].createdAt).toLocaleTimeString(undefined, {
                        hour: "numeric", minute: "2-digit",
                      });
                  return (
                    <div key={k} className="rounded-[14px] bg-[hsl(var(--ink-brown,25_25%_20%))] text-primary overflow-hidden" style={{ background: "hsl(28 30% 22%)" }}>
                      <button
                        type="button"
                        onClick={() => setOpenDay(open ? null : k)}
                        className="w-full flex items-center justify-between px-3.5 py-3 text-left"
                      >
                        <div>
                          <p className="font-display text-[13px] font-semibold text-primary">{label}</p>
                          <p className="text-[10px] text-primary/80 mt-0.5">{timeRange}</p>
                        </div>
                        <span className="text-[10px] font-medium text-primary/90 uppercase tracking-[0.12em]">
                          {open ? "Hide" : "View"}
                        </span>
                      </button>
                      {open && (
                        <div className="px-3.5 pb-3.5 space-y-2.5">
                          <div className="grid grid-cols-3 gap-2">
                            {items.map((p) => (
                              <div key={p.id} className="relative aspect-square rounded-[10px] overflow-hidden bg-muted">
                                <img src={p.url} alt="Progress" className="absolute inset-0 size-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removePhoto(p)}
                                  aria-label="Remove photo"
                                  className="absolute top-1 right-1 size-5 rounded-full bg-background/85 flex items-center justify-center text-foreground hover:text-destructive"
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                          {canAdd && k === todayKey && (
                            <button
                              type="button"
                              onClick={() => { pendingNewDay.current = false; fileRef.current?.click(); }}
                              disabled={uploading}
                              className="w-full text-[11px] font-medium py-2 rounded-full border border-primary/60 text-primary hover:bg-primary/10 transition-colors"
                            >
                              {uploading ? "Uploading…" : "+ Add more to this day"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {canAdd && (
                  <button
                    type="button"
                    onClick={() => { pendingNewDay.current = true; fileRef.current?.click(); }}
                    disabled={uploading}
                    className="w-full aspect-[6/1] min-h-[52px] rounded-[14px] border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center justify-center gap-2 text-primary transition-colors"
                  >
                    {uploading ? (
                      <span className="text-[11px]">Uploading…</span>
                    ) : (
                      <>
                        {dayKeys.length === 0 ? <Camera className="size-4" /> : <Plus className="size-4" />}
                        <span className="text-[11px] font-medium">
                          {dayKeys.length === 0 ? "Add first progress photo" : "Add photos for a new day"}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })()}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void handlePick(f ?? null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </SurfaceCard>




        <Button variant="gold" size="pill" onClick={goNext} disabled={loading}>
          {isRevisit ? "Done" : "Continue →"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default StrandSummary;
