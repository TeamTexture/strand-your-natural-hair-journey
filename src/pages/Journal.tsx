import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Target } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { journalEntries } from "@/data/journalEntries";
import { useJournalEncouragement } from "@/hooks/useJournalEncouragement";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useGoals, type UserGoal } from "@/hooks/useGoals";
import GoalEditorSheet from "@/components/GoalEditorSheet";

const PHOTO_BUCKET = "journal-photos";

const moodTiles = [
  { gradient: "from-[#C8B89A] to-[#D4B96A]", emoji: "🌀" },
  { gradient: "from-[#D4AA52] to-[#C49A3C]", emoji: "🌿" },
  { gradient: "from-[#E8D8C0] to-[#A07828]", emoji: "✨" },
];

const Journal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { signals, banner, loading } = useJournalEncouragement();
  const { goals, lengthGoal, loading: goalsLoading } = useGoals();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UserGoal | null>(null);

  // Other (non-length) goals are listed beneath the primary card.
  const otherGoals = useMemo(
    () => goals.filter((g) => g.id !== lengthGoal?.id),
    [goals, lengthGoal],
  );

  const openEditor = (goal: UserGoal | null) => {
    setEditing(goal);
    setEditorOpen(true);
  };

  // Pull through any photos uploaded on individual entries.
  // Photo paths are stored per-entry under `strand_journal_photo_<id>` by JournalEntry.tsx.
  useEffect(() => {
    if (!user) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        journalEntries.map(async (j) => {
          const path = localStorage.getItem(`strand_journal_photo_${j.id}`);
          if (!path) return;
          const { data } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(path, 3600);
          if (data?.signedUrl) next[j.id] = data.signedUrl;
        }),
      );
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Hair Journal" back={false} />

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
          <SectionLabel className="!mb-0 !px-0">Goals & Challenges</SectionLabel>
          {goals.length > 0 && (
            <button
              onClick={() => openEditor(null)}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[36px]"
              aria-label="Add a new goal"
            >
              <Plus className="size-3.5" /> Add
            </button>
          )}
        </div>

        {goalsLoading ? (
          <SurfaceCard>
            <div className="h-4 w-2/3 bg-border/60 rounded animate-pulse" />
            <div className="h-2 w-full bg-border/60 rounded mt-3 animate-pulse" />
          </SurfaceCard>
        ) : lengthGoal ? (
          <GoalCard goal={lengthGoal} onEdit={() => openEditor(lengthGoal)} />
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

        {otherGoals.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={() => openEditor(g)} />
        ))}
      </div>

      <SectionLabel>Photo Journal</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {journalEntries.map((j) => {
          const url = photoUrls[j.id];
          return (
            <button
              key={j.id}
              onClick={() => navigate(`/journal/entry/${j.id}`)}
              className="w-full text-left"
            >
              <SurfaceCard padded={false} className="overflow-hidden hover:border-primary/50 transition-colors">
                <div
                  className={`relative h-40 flex items-center justify-center ${
                    url ? "bg-secondary" : `bg-gradient-to-br ${j.gradient}`
                  }`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={j.title}
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-5xl">{j.emoji}</span>
                  )}
                  <span className="absolute bottom-2 right-3 text-[11px] text-white/90 font-body bg-black/40 px-2 py-1 rounded">
                    {j.date}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-display text-base font-semibold">{j.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{j.note}</p>
                </div>
              </SurfaceCard>
            </button>
          );
        })}
      </div>

      <SectionLabel>Mood Boards</SectionLabel>
      <div className="px-5 pb-6 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {moodTiles.map((t, i) => (
            <div key={i} className={`aspect-square rounded-[12px] bg-gradient-to-br ${t.gradient} flex items-center justify-center text-3xl`}>
              {t.emoji}
            </div>
          ))}
        </div>
        <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal/moodboards")}>
          View Mood Boards
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/journal/moodboards/favourites")}>
          + Add to Mood Board
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default Journal;
