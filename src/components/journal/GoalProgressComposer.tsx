import { useEffect, useState } from "react";
import { Loader2, Mic, Image as ImageIcon, Type as TypeIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReviewVoicenoteRecorder from "@/components/ReviewVoicenoteRecorder";
import { useGoalProgressUpdates, GOAL_AUDIO_BUCKET } from "@/hooks/useGoalProgressUpdates";
import { cn } from "@/lib/utils";

const PHOTO_BUCKET = "journal-photos";

interface PhotoOption {
  path: string;
  url: string;
  label: string;
}

/**
 * "Update progress" composer — type it or record a voicenote (reusing the
 * review recorder + transcription infra), and optionally attach a photo
 * already saved in the photo journal.
 */
const GoalProgressComposer = ({
  open,
  onOpenChange,
  goalId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
}) => {
  const { user } = useAuth();
  const { addUpdate, saving } = useGoalProgressUpdates(goalId);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [bodyText, setBodyText] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");
  const [photos, setPhotos] = useState<PhotoOption[]>([]);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBodyText("");
      setAudioPath(null);
      setTranscription("");
      setPhotoPath(null);
      setMode("text");
    }
  }, [open]);

  // Recent journal photos the user can attach to this update.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, title, entry_date, photo_paths")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false })
        .limit(8);
      if (cancelled || !data) return;
      const opts: PhotoOption[] = [];
      for (const row of data as Array<{ title: string | null; entry_date: string; photo_paths: string[] | null }>) {
        const path = row.photo_paths?.[0];
        if (!path) continue;
        const { data: sig } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
        if (sig?.signedUrl) {
          opts.push({ path, url: sig.signedUrl, label: row.title ?? row.entry_date });
        }
      }
      if (!cancelled) setPhotos(opts);
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  const save = async () => {
    const hasText = bodyText.trim().length > 0;
    if (!hasText && !audioPath) {
      toast("Add a note or record a voicenote first");
      return;
    }
    try {
      await addUpdate({
        goalId,
        bodyText: bodyText,
        audioPath,
        transcriptionText: transcription,
        photoEntryRef: photoPath,
      });
      toast.success("Progress saved to your goal.");
      onOpenChange(false);
    } catch {
      toast.error("Could not save that update");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[20px]">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">Update your progress</SheetTitle>
          <SheetDescription className="font-body text-[12px]">
            Nothing is overwritten — every update stays on this goal's timeline.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            {([["text", "Write it", TypeIcon], ["voice", "Record it", Mic]] as const).map(
              ([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={cn(
                    "flex-1 min-h-[44px] rounded-full border text-[11px] uppercase tracking-[0.15em] font-body inline-flex items-center justify-center gap-1.5",
                    mode === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ),
            )}
          </div>

          {mode === "text" ? (
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={6}
              placeholder="What's changed since your last update?"
              className="w-full px-3.5 py-3 bg-background rounded-[10px] border border-border text-sm font-body focus:outline-none focus:border-primary/60 resize-none"
            />
          ) : (
            <ReviewVoicenoteRecorder
              audioPath={audioPath}
              onAudioPathChange={setAudioPath}
              transcription={transcription}
              onTranscriptionChange={setTranscription}
              bucket={GOAL_AUDIO_BUCKET}
              folder="goal-progress"
            />
          )}

          {photos.length > 0 && (
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
                <ImageIcon className="size-3.5" /> Attach a journal photo
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p) => (
                  <button
                    key={p.path}
                    type="button"
                    onClick={() => setPhotoPath(photoPath === p.path ? null : p.path)}
                    aria-label={`Attach photo from ${p.label}`}
                    className={cn(
                      "relative size-16 rounded-[10px] overflow-hidden shrink-0 border-2",
                      photoPath === p.path ? "border-primary" : "border-transparent",
                    )}
                  >
                    <img src={p.url} alt={p.label} className="size-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button variant="gold" size="pill" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save update"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GoalProgressComposer;
