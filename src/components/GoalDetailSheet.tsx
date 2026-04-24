import { useEffect, useState } from "react";
import { Pencil, Loader2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import VoiceNoteField from "@/components/VoiceNoteField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { UserGoal } from "@/hooks/useGoals";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: UserGoal | null;
  onEdit: () => void;
}

interface GoalUpdate {
  id: string;
  goal_id: string;
  user_id: string;
  note: string | null;
  voice_url: string | null;
  created_at: string;
  signedAudioUrl?: string;
}

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
};

/**
 * Read-only viewer for a saved goal showing the original challenge / target,
 * the date it was set, and a timeline of timestamped progress updates that
 * the user can add via text or voice note (transcribed by the same Lovable
 * AI flow used elsewhere).
 */
const GoalDetailSheet = ({ open, onOpenChange, goal, onEdit }: Props) => {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<GoalUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftVoice, setDraftVoice] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // Load updates whenever the sheet opens for a particular goal.
  useEffect(() => {
    if (!open || !goal || !user) return;
    let cancelled = false;
    setLoading(true);
    setDraftText("");
    setDraftVoice(null);
    (async () => {
      const { data, error } = await supabase
        .from("goal_updates")
        .select("id, goal_id, user_id, note, voice_url, created_at")
        .eq("goal_id", goal.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error("Could not load updates");
        setUpdates([]);
        setLoading(false);
        return;
      }
      // Sign any audio URLs so the inline player works.
      const enriched = await Promise.all(
        (data ?? []).map(async (u) => {
          if (!u.voice_url) return u as GoalUpdate;
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(u.voice_url, 3600);
          return { ...u, signedAudioUrl: sig?.signedUrl } as GoalUpdate;
        }),
      );
      if (!cancelled) {
        setUpdates(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, goal, user]);

  const handlePost = async () => {
    if (!user || !goal) return;
    if (!draftText.trim() && !draftVoice) {
      toast.error("Add a note or record a voice update");
      return;
    }
    setPosting(true);
    const { data, error } = await supabase
      .from("goal_updates")
      .insert({
        goal_id: goal.id,
        user_id: user.id,
        note: draftText.trim() || null,
        voice_url: draftVoice,
      })
      .select()
      .single();
    setPosting(false);
    if (error || !data) {
      toast.error("Could not save update");
      return;
    }
    let signedAudioUrl: string | undefined;
    if (data.voice_url) {
      const { data: sig } = await supabase.storage
        .from("voicenotes")
        .createSignedUrl(data.voice_url, 3600);
      signedAudioUrl = sig?.signedUrl;
    }
    setUpdates((prev) => [{ ...(data as GoalUpdate), signedAudioUrl }, ...prev]);
    setDraftText("");
    setDraftVoice(null);
    toast.success("Update added");
  };

  const handleDeleteUpdate = async (u: GoalUpdate) => {
    setUpdates((prev) => prev.filter((x) => x.id !== u.id));
    const { error } = await supabase.from("goal_updates").delete().eq("id", u.id);
    if (error) {
      toast.error("Could not remove update");
      return;
    }
    if (u.voice_url) {
      await supabase.storage.from("voicenotes").remove([u.voice_url]).catch(() => {});
    }
  };

  if (!goal) return null;

  const setOn = goal.created_at ? formatDate(goal.created_at) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display">Your goal</SheetTitle>
              {setOn && (
                <p className="text-[11px] text-muted-foreground mt-1">Set on {setOn}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="size-8 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary"
              aria-label="Edit goal"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {goal.challenge && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Challenge
              </p>
              <p className="text-sm leading-snug whitespace-pre-line">{goal.challenge}</p>
            </div>
          )}
          {goal.target_text && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Target
              </p>
              <p className="text-sm leading-snug whitespace-pre-line">{goal.target_text}</p>
            </div>
          )}
          {!goal.challenge && !goal.target_text && goal.title && (
            <div>
              <p className="text-sm leading-snug">{goal.title}</p>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Add an update
            </p>
            <VoiceNoteField
              label=""
              placeholder="How's it going? Record or type an update."
              value={draftText}
              onChange={setDraftText}
              audioPath={draftVoice}
              onAudioPathChange={setDraftVoice}
              folder="goal-update"
              rows={3}
            />
            <Button
              variant="gold"
              size="pill"
              onClick={handlePost}
              disabled={posting}
            >
              {posting ? "Saving..." : "Post update"}
            </Button>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Timeline
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="size-3.5 animate-spin" /> Loading updates…
              </div>
            ) : updates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No updates yet. Your progress notes will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {updates.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-[12px] border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium">
                        {formatDate(u.created_at)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteUpdate(u)}
                        className="size-6 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
                        aria-label="Delete update"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {u.note && (
                      <p className="text-sm leading-snug mt-1.5 whitespace-pre-line">
                        {u.note}
                      </p>
                    )}
                    {u.signedAudioUrl && (
                      <audio
                        controls
                        src={u.signedAudioUrl}
                        className="w-full mt-2"
                        preload="metadata"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GoalDetailSheet;
