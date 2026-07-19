import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
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

import { useJournalEncouragement } from "@/hooks/useJournalEncouragement";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useGoals, type UserGoal } from "@/hooks/useGoals";
import { useMoodboards } from "@/hooks/useMoodboards";
import GoalEditorSheet from "@/components/GoalEditorSheet";
import GoalDetailSheet from "@/components/GoalDetailSheet";

const PHOTO_BUCKET = "journal-photos";

/** Returns true if the storage path looks like a video (mp4 / mov / webm). */
const isVideoPath = (p: string) => /\.(mp4|mov|m4v|webm|quicktime)$/i.test(p);

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
  const { signals, banner, loading } = useJournalEncouragement();
  const { goals, lengthGoal, loading: goalsLoading } = useGoals();
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
  const [chooserOpen, setChooserOpen] = useState(false);

  // Goals split by status so future goals can render in their own section
  // and the primary card always reflects what's actively in-progress.
  const inProgressGoals = useMemo(
    () => goals.filter((g) => (g.status ?? "in_progress") === "in_progress"),
    [goals],
  );
  const futureGoals = useMemo(
    () => goals.filter((g) => g.status === "future"),
    [goals],
  );
  const primaryGoal = lengthGoal && (lengthGoal.status ?? "in_progress") === "in_progress"
    ? lengthGoal
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

  // Saved entries from the database — these appear above the mock catalog,
  // newest first, so a freshly-saved entry shows at the top of the list.
  interface SavedEntry {
    id: string;
    title: string | null;
    note: string | null;
    entry_date: string;
    photo_paths: string[];
    coverUrl?: string;
  }
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [pendingDelete, setPendingDelete] = useState<SavedEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteSaved = async () => {
    if (!pendingDelete || !user) return;
    setDeleting(true);
    // Best-effort: remove any uploaded photos from storage too.
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
      toast.error("Could not delete entry");
      return;
    }
    setSavedEntries((rows) => rows.filter((r) => r.id !== pendingDelete.id));
    setPendingDelete(null);
    toast.success("Journal entry deleted.");
  };

  useEffect(() => {
    if (!user) { setSavedEntries([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, title, note, entry_date, photo_paths")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      const rows: SavedEntry[] = await Promise.all(
        (data as SavedEntry[]).map(async (r) => {
          const cover = r.photo_paths?.[0];
          if (!cover) return r;
          const { data: sig } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(cover, 3600);
          return { ...r, coverUrl: sig?.signedUrl };
        }),
      );
      if (!cancelled) setSavedEntries(rows);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Photo-pull effect for the old mock catalog removed — saved entries fetch
  // their own cover URL from journal_entries.photo_paths above.


  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Style Journal" back={false} />

      <div className="px-5 pb-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The place to document your favourite styles and track every step of your hair journey.
        </p>
      </div>

      <div className="px-5 pb-4">
        <div className="rounded-[14px] p-4 bg-gradient-to-r from-primary to-[#8B6914] text-primary-foreground">
          {loading || !banner ? (
            <>
              <div className="h-4 w-2/3 bg-primary-foreground/20 rounded animate-pulse" />
              <div className="h-3 w-5/6 bg-primary-foreground/15 rounded animate-pulse mt-2" />
            </>
          ) : (
            <>
              {signals?.milestoneLabel && (
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-80 mb-1">
                  {signals.milestoneLabel}
                </p>
              )}
              <p className="text-base font-semibold">{banner.headline}</p>
              <p className="font-body text-sm opacity-90 mt-1">{banner.subline}</p>
            </>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-primary font-body font-medium">
            Goals & Challenges
          </h2>
        </div>

        {goalsLoading ? (
          <SurfaceCard>
            <div className="h-4 w-2/3 bg-border/60 rounded animate-pulse" />
            <div className="h-2 w-full bg-border/60 rounded mt-3 animate-pulse" />
          </SurfaceCard>
        ) : primaryGoal ? (
          <>
            <GoalCard
              goal={primaryGoal}
              onEdit={() => openEditor(primaryGoal)}
              onView={() => openDetail(primaryGoal)}
            />
            {otherInProgress.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => openEditor(g)}
                onView={() => openDetail(g)}
              />
            ))}
            <Button
              variant="goldOutline"
              size="pill"
              onClick={() => setChooserOpen(true)}
            >
              + Set new goal
            </Button>
          </>
        ) : (
          <SurfaceCard className="text-center">
            <Target className="size-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Set your first goal</p>
            <p className="text-[11px] text-muted-foreground mt-1 mb-3">
              Track length retention or any hair challenge you're working on.
            </p>
            <Button variant="gold" size="pill" onClick={() => openEditor(null)}>
              + Add a goal
            </Button>
          </SurfaceCard>
        )}

        {futureGoals.length > 0 && (
          <div className="pt-2 space-y-3">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Future goals
            </h3>
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
      </div>


      <SectionLabel>Photo Journal</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {savedEntries.map((s) => {
          // Saved-entry titles previously embedded a mock catalog id like "[wash-go-day1] My title"
          // so the detail page could load. Now we just navigate to the entry's real DB id.
          const match = s.title?.match(/^\[([^\]]+)\]\s*(.*)$/);
          const displayTitle = match?.[2] || s.title || "Journal entry";
          const dateLabel = formatEntryDate(s.entry_date);
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
              <SurfaceCard padded={false} className="overflow-hidden hover:border-primary/50 transition-colors">
                <div className={`relative h-40 flex items-center justify-center ${s.coverUrl ? "bg-secondary" : "bg-gradient-to-br from-[#C8B89A] to-[#D4B96A]"}`}>
                  {s.coverUrl ? (
                    isVideoPath(s.photo_paths?.[0] ?? "") ? (
                      <>
                        <video src={s.coverUrl} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover bg-black" />
                        <span className="absolute bottom-1 left-1 text-[9px] uppercase tracking-[0.12em] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded">Video</span>
                      </>
                    ) : (
                      <img src={s.coverUrl} alt={displayTitle} className="absolute inset-0 size-full object-cover" loading="lazy" />
                    )
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-medium">
                      No photo
                    </span>
                  )}
                  <span className="absolute top-2 right-2 text-[10px] font-body text-white bg-black/55 px-2 py-0.5 rounded-full">
                    {dateLabel}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(s);
                    }}
                    aria-label="Delete journal entry"
                    className="absolute top-2 left-2 size-9 rounded-full bg-black/55 hover:bg-destructive text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="font-display text-base font-semibold">{displayTitle}</p>
                  {s.note && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{s.note}</p>}
                </div>
              </SurfaceCard>
            </div>
          );
        })}
        {/* Always-visible "new entry" tile so users can keep adding entries
            once they have some saved (previously this only rendered when
            the photo journal was empty, leaving no entry point). */}
        <button
          type="button"
          onClick={() => navigate("/journal/entry/new")}
          className="w-full h-36 rounded-[14px] border-2 border-dashed border-primary/60 bg-card flex flex-col items-center justify-center gap-2 text-primary"
        >
          <Plus className="size-7" />
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium">
            {savedEntries.length === 0 ? "Add first entry" : "Add new entry"}
          </span>
        </button>
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
            <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal/moodboards")}>
              View Mood Boards
            </Button>
            <Button variant="goldGhost" size="pill" onClick={() => navigate("/journal/moodboards/favourites")}>
              + Add to Mood Board
            </Button>
          </div>
        </>
      )}

      {!boardsLoading && populatedBoards.length === 0 && (
        <>
          <SectionLabel>Mood Boards</SectionLabel>
          <div className="px-5 pb-6 space-y-3">
            <SurfaceCard className="text-center">
              <p className="text-sm font-medium">No mood boards yet</p>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                Create a board and start saving inspiration to see it here.
              </p>
              <Button variant="gold" size="pill" onClick={() => navigate("/journal/moodboards")}>
                + Create a mood board
              </Button>
            </SurfaceCard>
          </div>
        </>
      )}

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

      <AlertDialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set a new goal</AlertDialogTitle>
            <AlertDialogDescription>
              How would you like to handle your current goal?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="gold"
              size="pill"
              onClick={() => {
                setChooserOpen(false);
                if (primaryGoal) openEditor(primaryGoal, "in_progress");
              }}
            >
              Replace current goal
            </Button>
            <Button
              variant="goldOutline"
              size="pill"
              onClick={() => {
                setChooserOpen(false);
                openEditor(null, "in_progress");
              }}
            >
              Add to current goal
            </Button>
            <Button
              variant="goldGhost"
              size="pill"
              onClick={() => {
                setChooserOpen(false);
                openEditor(null, "future");
              }}
            >
              Set as future goal
            </Button>
            <AlertDialogCancel className="mt-1">Cancel</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>



      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the entry and any photos attached to it. This cannot be undone.
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
  const hasNewShape = !!(goal.challenge || goal.target_text);
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
            <p className="text-sm font-medium leading-tight">{goal.title}</p>
            <button
              onClick={stopAndEdit}
              className="size-7 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary"
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
        {goal.challenge && (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Challenge</p>
            <p className="text-sm leading-snug whitespace-pre-line">{goal.challenge}</p>
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
