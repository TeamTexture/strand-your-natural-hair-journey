import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Check, ImageIcon, Loader2, Upload, Video } from "lucide-react";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { useAuth } from "@/hooks/useAuth";
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
  /** Called after a freshly uploaded photo is attached, so steps reload. */
  onMediaAdded?: () => void | Promise<void>;
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
const CoverPicker = ({ entryId, steps, coverMediaId, open, onClose, onSaved, onMediaAdded }: Props) => {
  const { user } = useAuth();
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [selected, setSelected] = useState<string | null>(coverMediaId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

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

  /**
   * A cover can be a brand-new photo. It still has to live on a step (media is
   * owned by steps), so it attaches to the first step — creating one if the
   * record has none yet — and is selected straight away.
   */
  const uploadPhoto = async (raw: File) => {
    if (!user) return;
    if (!raw.type.startsWith("image/") && !/\.(heic|heif)$/i.test(raw.name)) {
      toast.error("Choose a photo");
      return;
    }
    setUploading(true);
    try {
      const file = await convertHeicToJpeg(raw);
      let stepId = steps[0]?.id;
      if (!stepId) {
        const { data, error } = await supabase
          .from("journal_steps")
          .insert({ entry_id: entryId, step_order: 0 })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("no step");
        stepId = data.id;
      }
      const path = `${user.id}/steps/${stepId}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const existing = steps.find((s) => s.id === stepId)?.media.length ?? 0;
      const { data: inserted, error: insErr } = await supabase
        .from("journal_step_media")
        .insert({ step_id: stepId, kind: "photo", storage_path: path, sort_order: existing })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("no media");
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, 3600);
      const stepIndex = Math.max(0, steps.findIndex((s) => s.id === stepId));
      setThumbs((prev) => [
        { id: inserted.id, kind: "photo", stepIndex, url: signed?.signedUrl ?? null },
        ...prev,
      ]);
      setSelected(inserted.id);
      await onMediaAdded?.();
      toast.success("Photo added — tap “Use this cover” to set it");
    } catch (e) {
      console.error("cover upload failed", e);
      toast.error("Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  };

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

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void uploadPhoto(f);
          }}
          className={`rounded-[14px] border border-dashed p-3 text-center transition ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2 text-[12px] font-body text-foreground/70">
              <Loader2 className="size-3.5 animate-spin" /> Uploading…
            </span>
          ) : (
            <>
              <p className="text-[11.5px] font-body text-foreground/60 leading-snug">
                Drag a photo here, or
              </p>
              <div className="flex gap-2 justify-center mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-pill text-[11px]"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-3.5" /> Upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-pill text-[11px]"
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera className="size-3.5" /> Take a photo
                </Button>
              </div>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadPhoto(f);
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadPhoto(f);
            }}
          />
        </div>

        {thumbs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-4 text-center">
            No photos or video yet — add one above.
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
