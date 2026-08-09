import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ImageIcon, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { JournalStep } from "@/hooks/useJournalSteps";

const PHOTO_BUCKET = "journal-photos";
const VIDEO_BUCKET = "journal-videos";

interface Props {
  entryId: string;
  steps: JournalStep[];
  /** Currently chosen cover, or null when the record is on auto (first media). */
  coverMediaId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (coverMediaId: string | null) => void;
}

interface Thumb {
  id: string;
  kind: "photo" | "video";
  stepIndex: number;
  url: string | null;
}

/**
 * Lets the member choose which photo or video represents the style record on
 * the Style Journal list. Clearing the choice returns the card to auto mode —
 * the first piece of media in step order.
 */
const CoverPicker = ({ entryId, steps, coverMediaId, open, onClose, onSaved }: Props) => {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [selected, setSelected] = useState<string | null>(coverMediaId);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setSelected(coverMediaId); }, [open, coverMediaId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const flat = steps.flatMap((s, i) => s.media.map((m) => ({ m, stepIndex: i })));
      const signed = await Promise.all(
        flat.map(async ({ m, stepIndex }) => {
          // Videos show their captured still frame; that lives in the photo bucket.
          const usePoster = m.kind === "video" && !!m.poster_path;
          const bucket = m.kind === "photo" || usePoster ? PHOTO_BUCKET : VIDEO_BUCKET;
          const path = usePoster ? m.poster_path! : m.storage_path;
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          return { id: m.id, kind: m.kind, stepIndex, url: data?.signedUrl ?? null } as Thumb;
        }),
      );
      if (!cancelled) setThumbs(signed);
    })();
    return () => { cancelled = true; };
  }, [open, steps]);

  const save = async (value: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("journal_entries")
      .update({ cover_media_id: value })
      .eq("id", entryId);
    setSaving(false);
    if (error) {
      console.error("cover save failed", error);
      toast.error("Couldn't save that cover");
      return;
    }
    onSaved(value);
    toast.success(value ? "Cover updated" : "Cover set back to the first photo");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Choose a cover</DialogTitle>
          <p className="text-[11.5px] font-body text-foreground/60 leading-snug">
            Pick the photo or video that represents this style in your journal.
          </p>
        </DialogHeader>

        {thumbs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-6 text-center">
            Add a photo or video to a step first.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-[46vh] overflow-y-auto">
            {thumbs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`relative rounded-[10px] overflow-hidden border-2 transition ${
                  selected === t.id ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                {t.url ? (
                  <img src={t.url} alt="" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-secondary/50 flex items-center justify-center">
                    {t.kind === "video" ? (
                      <Video className="size-4 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[9px] uppercase tracking-[0.12em] text-muted-foreground py-0.5">
                  Step {t.stepIndex + 1}
                </span>
                {selected === t.id && (
                  <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {coverMediaId && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-pill"
              disabled={saving}
              onClick={() => void save(null)}
            >
              Use first photo
            </Button>
          )}
          <Button
            variant="gold"
            size="sm"
            className="rounded-pill"
            disabled={saving || !selected}
            onClick={() => void save(selected)}
          >
            Use this cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CoverPicker;
