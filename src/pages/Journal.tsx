import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { challengesOf } from "@/lib/goalChallenges";
import { useGoals, type UserGoal } from "@/hooks/useGoals";
import { useMoodboards } from "@/hooks/useMoodboards";
import GoalEditorSheet from "@/components/GoalEditorSheet";
import GoalHeroCard from "@/components/journal/GoalHeroCard";
import GoalTipsSection from "@/components/journal/GoalTipsSection";
import ChallengesCard from "@/components/journal/ChallengesCard";
import GoalProgressComposer from "@/components/journal/GoalProgressComposer";
import GoalTimelineSheet from "@/components/journal/GoalTimelineSheet";
import PastGoalsSection from "@/components/journal/PastGoalsSection";
import GoalDetailSheet from "@/components/GoalDetailSheet";
import ProgressPhotosCard from "@/components/journal/ProgressPhotosCard";
import LevelGate from "@/components/tips/LevelGate";
import SectionHeader from "@/components/nav/SectionHeader";
import EmptyState from "@/components/EmptyState";
import { ICONS } from "@/lib/iconMap";

const PHOTO_BUCKET = "journal-photos";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Format a journal entry date string (e.g. "14 Apr 2026" or an ISO date) as
 * "14 Apr" if it falls in the current calendar year, otherwise "14 Apr 2026".
 * Falls back to the input string if it can't be parsed.
 */
const formatEntryDate = (raw: string): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return year === new Date().getFullYear() ? `${day} ${month}` : `${day} ${month} ${year}`;
};


const Journal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    goals,
    activeGoals,
    pastGoals,
    goal: rawGoal,
    loading: goalsLoading,
    endGoal,
  } = useGoals();

  const { boards: moodboards, loading: boardsLoading } = useMoodboards();
  // Only surface boards that actually have content (or the Favourites board if it has favourites).
  const populatedBoards = useMemo(
    () => moodboards.filter((b) => (b.imageCount ?? 0) > 0).slice(0, 3),
    [moodboards],
  );
  // Cover URLs and video flags are computed inline per saved entry now —
  // no separate map needed since the mock catalog is gone.

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UserGoal | null>(null);
  const [editorStatus, setEditorStatus] = useState<string>("in_progress");
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<UserGoal | null>(null);
  const [progressGoal, setProgressGoal] = useState<UserGoal | null>(null);
  const [timelineGoal, setTimelineGoal] = useState<UserGoal | null>(null);
  const [newGoalConfirm, setNewGoalConfirm] = useState(false);

  // Goals split by status so future goals can render in their own section
  // and the primary card always reflects what's actively in-progress.
  const inProgressGoals = activeGoals;
  const futureGoals = useMemo(
    () => goals.filter((g) => g.status === "future" && !g.ended_at),
    [goals],
  );
  const primaryGoal = rawGoal && (rawGoal.status ?? "in_progress") === "in_progress"
    ? rawGoal
    : inProgressGoals[0] ?? null;
  const otherInProgress = useMemo(
    () => inProgressGoals.filter((g) => g.id !== primaryGoal?.id),
    [inProgressGoals, primaryGoal],
  );

  const openEditor = (goal: UserGoal | null, status: string = "in_progress") => {
    setEditing(goal);
    setEditorStatus(status);
    setEditorOpen(true);
  };


  const openDetail = (goal: UserGoal) => {
    setViewing(goal);
    setDetailOpen(true);
  };

  // Saved style records from the database, newest first.
  interface SavedEntry {
    id: string;
    title: string | null;
    style_name: string | null;
    style_date: string | null;
    status: string | null;
    entry_date: string;
    photo_paths: string[];
    /** Member-chosen cover; null means auto (the first media in step order). */
    cover_media_id: string | null;
    /** A cover photo uploaded just for the card — wins over step media. */
    cover_path?: string | null;
    stepCount: number;
    productNames: string[];
    coverUrl?: string;
    coverIsVideo?: boolean;
  }
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [pendingDelete, setPendingDelete] = useState<SavedEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteSaved = async () => {
    if (!pendingDelete || !user) return;
    setDeleting(true);
    // Best-effort: remove any legacy uploaded photos from storage too.
    if (pendingDelete.photo_paths?.length) {
      await supabase.storage.from(PHOTO_BUCKET).remove(pendingDelete.photo_paths).catch(() => {});
    }
    const { error } = await supabase
      .from("journal_entries")
      .delete()
      .eq("id", pendingDelete.id)
      .eq("user_id", user.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete this style record");
      return;
    }
    setSavedEntries((rows) => rows.filter((r) => r.id !== pendingDelete.id));
    setPendingDelete(null);
    toast.success("Style record deleted.");
  };

  useEffect(() => {
    if (!user) { setSavedEntries([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, title, style_name, style_date, status, entry_date, photo_paths, cover_media_id, cover_path")
        .eq("user_id", user.id)
        .order("style_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      const entries = data as Omit<SavedEntry, "stepCount" | "productNames">[];
      const ids = entries.map((e) => e.id);

      // One query for every step of every record — gives us the step count,
      // the cover media and the products used across the whole record.
      const { data: stepRows } = ids.length
        ? await supabase
            .from("journal_steps")
            .select(
              "id, entry_id, step_order, journal_step_media(id, storage_path, poster_path, kind, sort_order), journal_step_products(user_product_id)",
            )
            .in("entry_id", ids)
            .order("step_order", { ascending: true })
        : { data: [] as never[] };
      if (cancelled) return;

      type StepRow = {
        entry_id: string;
        step_order: number;
        journal_step_media:
          | { id: string; storage_path: string; poster_path: string | null; kind: string; sort_order: number }[]
          | null;
        journal_step_products: { user_product_id: string | null }[] | null;
      };
      const byEntry = new Map<string, StepRow[]>();
      for (const r of (stepRows ?? []) as StepRow[]) {
        const list = byEntry.get(r.entry_id) ?? [];
        list.push(r);
        byEntry.set(r.entry_id, list);
      }

      const productIds = new Set<string>();
      for (const list of byEntry.values()) {
        for (const s of list) {
          for (const p of s.journal_step_products ?? []) {
            if (p.user_product_id) productIds.add(p.user_product_id);
          }
        }
      }
      const lookup: Record<string, { name: string; brand: string | null }> = {};
      if (productIds.size) {
        const { data: prods } = await supabase
          .from("user_products")
          .select("id, name, brand")
          .in("id", Array.from(productIds));
        for (const p of prods ?? []) lookup[p.id] = { name: p.name, brand: p.brand };
      }
      if (cancelled) return;

      const rows: SavedEntry[] = await Promise.all(
        entries.map(async (e) => {
          const steps = (byEntry.get(e.id) ?? []).sort((a, b) => a.step_order - b.step_order);
          const media = steps.flatMap((s) =>
            (s.journal_step_media ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
          );
          // The member's chosen cover wins. On auto, prefer a real photo over a
          // video's still frame (motion frames are usually blurred), then a
          // video that has a captured poster, and only then whatever is first.
          const chosen = e.cover_media_id
            ? media.find((m) => m.id === e.cover_media_id)
            : undefined;
          const cover =
            chosen ??
            media.find((m) => m.kind === "photo") ??
            media.find((m) => m.kind === "video" && !!m.poster_path) ??
            media[0];
          const names = Array.from(
            new Set(
              steps.flatMap((s) =>
                (s.journal_step_products ?? [])
                  .map((p) => (p.user_product_id ? lookup[p.user_product_id] : undefined))
                  .filter(Boolean)
                  .map((p) => (p!.brand ? `${p!.brand} ${p!.name}` : p!.name)),
              ),
            ),
          );
          // A video cover always shows its captured still frame, so the card
          // never renders a black rectangle. Photos sign as normal.
          let coverUrl: string | undefined;
          let coverIsVideo = false;
          if (e.cover_path) {
            // A cover photo uploaded for the card itself always wins.
            const { data: sig } = await supabase.storage
              .from(PHOTO_BUCKET)
              .createSignedUrl(e.cover_path, 3600);
            coverUrl = sig?.signedUrl;
          } else if (cover) {
            const isVideo = cover.kind === "video";
            const usePoster = isVideo && !!cover.poster_path;
            const bucket = isVideo && !usePoster ? "journal-videos" : PHOTO_BUCKET;
            const path = usePoster ? cover.poster_path! : cover.storage_path;
            const { data: sig } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
            coverUrl = sig?.signedUrl;
            // Only treat it as a video when we're falling back to the clip itself.
            coverIsVideo = isVideo && !usePoster;
          }
          return {
            ...e,
            stepCount: steps.length,
            productNames: names,
            coverUrl,
            coverIsVideo,
          };
        }),
      );
      if (cancelled) return;
      setSavedEntries(rows);
    })();
    return () => { cancelled = true; };
  }, [user]);


  // Neutral recency line for the entries list — no wash advice here.
  const lastEntryLabel = useMemo(() => {
    const latest = savedEntries[0];
    if (!latest) return null;
    const d = new Date(latest.entry_date);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.max(
      0,
      Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)),
    );
    if (days === 0) return "Last entry today";
    if (days === 1) return "Last entry yesterday";
    return `Last entry ${days} days ago`;
  }, [savedEntries]);

  // Photo-pull effect for the old mock catalog removed — saved entries fetch
  // their own cover URL from journal_entries.photo_paths above.


  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Style Journal" back={false} />

      <LevelGate min={2}>
        <div className="px-5 pb-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The place to document your favourite styles and track every step of your hair journey.
          </p>
        </div>
      </LevelGate>

      {/* GOAL FIRST — the current goal is the hero of this page. Wash
          messaging lives on the Wash Day page only. */}
      <div className="px-5 pb-4 space-y-3">
        {goalsLoading ? (
          <SurfaceCard>
            <div className="h-4 w-2/3 bg-border/60 rounded animate-pulse" />
            <div className="h-2 w-full bg-border/60 rounded mt-3 animate-pulse" />
          </SurfaceCard>
        ) : primaryGoal ? (
          <>
            <GoalHeroCard
              goal={primaryGoal}
              onUpdateProgress={() => setProgressGoal(primaryGoal)}
              onSetNewGoal={() => setNewGoalConfirm(true)}
              onEdit={() => openEditor(primaryGoal)}
              onViewUpdates={() => setTimelineGoal(primaryGoal)}
            />

            {/* How you'll get there — goal-anchored, grounded guidance. */}
            <GoalTipsSection goal={primaryGoal} />

            {otherInProgress.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => openEditor(g)}
                onView={() => openDetail(g)}
              />
            ))}
          </>
        ) : (
          <EmptyState
            icon="🎯"
            message="Set your first goal"
            hint="Whatever you're working on — thickness, retention, scalp health, definition."
            action={
              <Button variant="gold" size="pill" onClick={() => openEditor(null)}>
                + Add a goal
              </Button>
            }
          />
        )}

        {/* CHALLENGES — a separate feature from the goal above. A member can
            aim for length retention while battling shedding; these are
            different inputs, updated independently, and both feed AI. */}
        <ChallengesCard />

        {futureGoals.length > 0 && (
          <div className="pt-2 space-y-3">
            <SectionHeader icon={ICONS.calendar} className="text-muted-foreground">Future goals</SectionHeader>
            {futureGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => openEditor(g, "future")}
                onView={() => openDetail(g)}
              />
            ))}
          </div>
        )}

        {/* PROGRESS PHOTOS — moved here from the removed Strand Summary screen.
            Progress belongs next to goals, where it's reviewed. */}
        <div className="pt-2 space-y-3">
          <SectionHeader icon={ICONS.length} className="text-muted-foreground">Progress photos</SectionHeader>
          <ProgressPhotosCard />
        </div>
      </div>



      <SectionLabel>Style Records</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {lastEntryLabel && (
          <p className="text-[11px] font-body text-muted-foreground">{lastEntryLabel}</p>
        )}

        {/* Starting a style sits at the top, above the logged records. */}
        <button
          type="button"
          onClick={() => navigate("/journal/entry/new")}
          className="w-full h-36 rounded-[14px] border-2 border-dashed border-primary/60 bg-card flex flex-col items-center justify-center gap-2 text-primary"
        >
          <Plus className="size-7" />
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium">
            {savedEntries.length === 0 ? "Start your first style" : "Start a style"}
          </span>
        </button>



        {savedEntries.map((s) => {
          const match = s.title?.match(/^\[([^\]]+)\]\s*(.*)$/);
          const displayTitle =
            s.style_name?.trim() || match?.[2] || s.title || "Style record";
          const dateLabel = formatEntryDate(s.style_date ?? s.entry_date);
          const productNames = s.productNames;
          const extraProducts = Math.max(0, productNames.length - 2);
          const complete = s.status === "complete";
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/journal/entry/${s.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/journal/entry/${s.id}`);
                }
              }}
              className="w-full text-left cursor-pointer"
            >
              <SurfaceCard padded={false} className="overflow-hidden hover:border-primary/50 transition-all hover:shadow-lg">
                <div className={`relative h-56 flex items-center justify-center ${s.coverUrl ? "bg-secondary" : "bg-gradient-to-br from-[#C8B89A] to-[#D4B96A]"}`}>
                  {s.coverUrl ? (
                    s.coverIsVideo ? (
                      <>
                        <video src={s.coverUrl} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover object-[center_20%] bg-black" />
                        <span className="absolute bottom-1 left-1 text-[9px] uppercase tracking-[0.12em] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded">Video</span>
                      </>
                    ) : (
                      <img src={s.coverUrl} alt={displayTitle} className="absolute inset-0 size-full object-cover object-[center_20%]" loading="lazy" />
                    )
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-medium">
                      No photo
                    </span>
                  )}
                  {/* Soft bottom gradient so the date pill stays legible on any cover. */}
                  {s.coverUrl && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                  )}
                  <span className="absolute top-2 right-2 text-[10px] font-body text-white bg-black/55 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {dateLabel}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(s);
                    }}
                    aria-label="Delete style record"
                    className="absolute top-2 left-2 size-9 rounded-full bg-black/55 hover:bg-destructive text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {/* Style, date, steps, products used. */}
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Style</p>
                    <p className="font-display text-base font-semibold leading-tight text-foreground">
                      {displayTitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Date</p>
                      <p className="font-body text-[12px] text-foreground mt-0.5">{dateLabel}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Steps</p>
                      <p className="font-body text-[12px] text-foreground mt-0.5">
                        {s.stepCount} {s.stepCount === 1 ? "step" : "steps"}
                        {complete ? "" : " · in progress"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-primary/80 font-medium mb-1.5 flex items-center gap-1">
                      <Sparkles className="size-3" /> Products used
                    </p>
                    {productNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {productNames.slice(0, 2).map((n) => (
                          <span
                            key={n}
                            className="text-[10px] font-body px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 max-w-[140px] truncate"
                          >
                            {n}
                          </span>
                        ))}
                        {extraProducts > 0 && (
                          <span className="text-[10px] font-body px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            +{extraProducts} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">None logged yet</p>
                    )}
                  </div>
                  <div className="flex items-center justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/journal/entry/${s.id}`);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                      aria-label="Open style record"
                    >
                      <Pencil className="size-3" /> Open
                    </button>
                  </div>
                </div>
              </SurfaceCard>
            </div>
          );
        })}
      </div>


      {(boardsLoading || populatedBoards.length > 0) && (
        <>
          <SectionLabel>Mood Boards</SectionLabel>
          <div className="px-5 pb-6 space-y-3">
            {boardsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-square rounded-[12px] bg-border/40 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {populatedBoards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => navigate(`/journal/moodboards/${b.is_favourites ? "favourites" : b.id}`)}
                    className={`relative aspect-square rounded-[12px] overflow-hidden flex items-center justify-center text-3xl bg-gradient-to-br ${b.gradient}`}
                    aria-label={`Open ${b.name} mood board`}
                  >
                    {b.coverUrl ? (
                      <img src={b.coverUrl} alt={b.name} className="absolute inset-0 size-full object-cover" loading="lazy" />
                    ) : (
                      <span>{b.emoji}</span>
                    )}
                    <span className="absolute bottom-1 left-1 right-1 truncate text-[10px] font-body text-white bg-black/55 px-1.5 py-0.5 rounded text-center">
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="brown" size="pill" onClick={() => navigate("/journal/moodboards")}>
              View Mood Boards
            </Button>
          </div>
        </>
      )}

      {!boardsLoading && populatedBoards.length === 0 && (
        <>
          <SectionLabel>Mood Boards</SectionLabel>
          <div className="px-5 pb-6 space-y-3">
            <EmptyState
              icon="🖼️"
              message="No mood boards yet"
              hint="Create a board and start saving inspiration to see it here."
              action={
                <Button variant="gold" size="pill" onClick={() => navigate("/journal/moodboards")}>
                  + Create a mood board
                </Button>
              }
            />
          </div>
        </>
      )}

      <PastGoalsSection goals={pastGoals} onOpen={(g) => setTimelineGoal(g)} />

      <GoalEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        goal={editing}
        defaultStatus={editorStatus}
      />
      <GoalDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        goal={viewing}
        onEdit={() => {
          setDetailOpen(false);
          if (viewing) openEditor(viewing);
        }}
      />

      <GoalProgressComposer
        open={!!progressGoal}
        onOpenChange={(o) => !o && setProgressGoal(null)}
        goalId={progressGoal?.id ?? ""}
      />
      <GoalTimelineSheet
        open={!!timelineGoal}
        onOpenChange={(o) => !o && setTimelineGoal(null)}
        goal={timelineGoal}
      />

      <AlertDialog open={newGoalConfirm} onOpenChange={setNewGoalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set a new goal?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current goal moves into Past goals with all of its updates kept —
              nothing is deleted. Then you'll write the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                setNewGoalConfirm(false);
                if (primaryGoal) await endGoal(primaryGoal.id);
                openEditor(null, "in_progress");
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this style record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the style record, its steps and everything attached to them. This cannot be undone.
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteSaved(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </ScreenLayout>
  );
};

interface GoalCardProps {
  goal: UserGoal;
  onEdit: () => void;
  onView: () => void;
}

const GoalCard = ({ goal, onEdit, onView }: GoalCardProps) => {
  // New simple shape: Challenge + Target. Fall back to legacy length-retention
  // numeric progress only when the user hasn't migrated yet.
  const goalChallenges = challengesOf(goal);
  const hasNewShape = goalChallenges.length > 0 || !!goal.target_text;
  const isComplete = goal.status === "complete";
  const isFuture = goal.status === "future";
  const statusLabel = isComplete ? "Complete" : isFuture ? "Future" : "In progress";


  // Stop the card-level click from firing when the pencil is tapped.
  const stopAndEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  if (!hasNewShape && goal.target_value != null) {
    const span = Math.max((goal.target_value ?? 0) - goal.start_value, 0.0001);
    const progressed = Math.min(
      Math.max(goal.current_value - goal.start_value, 0),
      span,
    );
    const pct = Math.round((progressed / span) * 100);
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onView}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onView();
          }
        }}
        className="cursor-pointer"
      >
        <SurfaceCard className="hover:border-primary/50 transition-colors">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium leading-tight flex-1 min-w-0">{goal.title}</p>
            <span className="shrink-0 font-body font-semibold text-foreground text-[15px]">{pct}%</span>
            <button
              onClick={stopAndEdit}
              className="size-7 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary shrink-0"
              aria-label="Edit goal"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Goal: {goal.target_value} {goal.unit} · Current: {goal.current_value} {goal.unit}
          </p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
      className="cursor-pointer"
    >
      <SurfaceCard className="hover:border-primary/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            {statusLabel}
          </span>
          <button
            onClick={stopAndEdit}
            className="size-7 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary"
            aria-label="Edit goal"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
        {goalChallenges.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
              {goalChallenges.length === 1 ? "Challenge" : "Challenges"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {goalChallenges.map((c) => (
                <span
                  key={c}
                  className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground leading-snug"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
        {goal.target_text && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Target</p>
            <p className="text-sm leading-snug whitespace-pre-line">{goal.target_text}</p>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};

export default Journal;
