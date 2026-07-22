import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Check } from "lucide-react";
import { toast } from "sonner";

type Props = {
  file?: File | null;
  sourceUrl?: string | null;
  open: boolean;
  onClose: () => void;
  onPick: (blob: Blob) => void;
  onSkip?: () => void;
};

// Grab 4 frames from a local video File or remote URL at 15/35/55/75% of duration.
async function grabFrames(source: File | string): Promise<Blob[]> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const revoke = typeof source === "string" ? null : url;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Only set crossOrigin for remote URLs — setting it on blob: URLs can taint the canvas.
  if (typeof source === "string") video.crossOrigin = "anonymous";
  video.src = url;
  // Some browsers require the element to be in the DOM to decode frames reliably.
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.top = "0";
  video.style.width = "1px";
  video.style.height = "1px";
  document.body.appendChild(video);

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { video.removeEventListener("loadeddata", onReady); resolve(); };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("error", () => reject(new Error("Could not load video")), { once: true });
      // Kick decode
      video.load();
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
    const points = [0.15, 0.35, 0.55, 0.75].map((p) => Math.max(0.05, Math.min(duration - 0.1, duration * p)));

    const canvas = document.createElement("canvas");
    const targetW = 640;
    const w = video.videoWidth || targetW;
    const h = video.videoHeight || 360;
    const scale = Math.min(1, targetW / w);
    canvas.width = Math.max(2, Math.round(w * scale));
    canvas.height = Math.max(2, Math.round(h * scale));
    const ctx = canvas.getContext("2d")!;

    const seekTo = (t: number) => new Promise<void>((resolve, reject) => {
      const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
      const to = window.setTimeout(() => {
        video.removeEventListener("seeked", onSeek);
        reject(new Error("seek timeout"));
      }, 6000);
      video.addEventListener("seeked", () => { window.clearTimeout(to); onSeek(); });
      try { video.currentTime = t; } catch (e) { window.clearTimeout(to); reject(e as Error); }
    });

    const waitForFrame = () =>
      new Promise<void>((resolve) => {
        const anyVid = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        if (typeof anyVid.requestVideoFrameCallback === "function") {
          anyVid.requestVideoFrameCallback(() => resolve());
        } else {
          requestAnimationFrame(() => resolve());
        }
      });

    const blobs: Blob[] = [];
    for (const t of points) {
      try { await seekTo(t); } catch { continue; }
      await waitForFrame();
      // Extra tick to let paint land in some Safari builds.
      await new Promise((r) => setTimeout(r, 30));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (blob && blob.size > 0) blobs.push(blob);
    }

    return blobs;
  } finally {
    video.removeAttribute("src");
    video.load();
    video.remove();
    if (revoke) URL.revokeObjectURL(revoke);
  }
}

const VideoThumbnailPicker = ({ file, sourceUrl, open, onClose, onPick, onSkip }: Props) => {
  const [frames, setFrames] = useState<{ blob: Blob; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [customBlob, setCustomBlob] = useState<{ blob: Blob; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const src: File | string | null = file ?? sourceUrl ?? null;
    if (!src) return;
    setFrames([]);
    setSelected(null);
    setCustomBlob(null);
    setLoading(true);
    grabFrames(src)
      .then((blobs) => {
        const mapped = blobs.map((b) => ({ blob: b, url: URL.createObjectURL(b) }));
        setFrames(mapped);
        if (mapped.length) setSelected(0);
      })
      .catch(() => toast.error("Could not read frames from video"))
      .finally(() => setLoading(false));
    return () => {
      frames.forEach((f) => URL.revokeObjectURL(f.url));
      if (customBlob) URL.revokeObjectURL(customBlob.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file, sourceUrl]);

  const pickCustom = (f: File) => {
    if (customBlob) URL.revokeObjectURL(customBlob.url);
    const url = URL.createObjectURL(f);
    setCustomBlob({ blob: f, url });
    setSelected(-1);
  };

  const confirm = () => {
    if (selected === -1 && customBlob) { onPick(customBlob.blob); return; }
    if (selected != null && frames[selected]) { onPick(frames[selected].blob); return; }
    toast.error("Choose a thumbnail");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Choose a cover</DialogTitle>
          <p className="text-[11.5px] font-body text-foreground/60 leading-snug">
            Pick a frame from the video or upload your own cover photo.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {frames.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`relative rounded-[10px] overflow-hidden border-2 transition ${
                    selected === i ? "border-primary ring-2 ring-primary/40" : "border-border"
                  }`}
                >
                  <img src={f.url} alt="" className="w-full aspect-video object-cover" />
                  {selected === i && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      <Check className="size-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-body font-semibold leading-tight">Or upload custom cover</p>
                <p className="text-[10px] text-foreground/55">JPG or PNG · 16:9 recommended</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && pickCustom(e.target.files[0])}
              />
              <Button size="sm" variant="goldOutline" className="rounded-pill h-8 px-3 text-[11px]" onClick={() => inputRef.current?.click()}>
                <Upload className="size-3 mr-1" /> Choose
              </Button>
            </div>
            {customBlob && (
              <button
                onClick={() => setSelected(-1)}
                className={`mt-2 block w-full rounded-[10px] overflow-hidden border-2 ${
                  selected === -1 ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <img src={customBlob.url} alt="" className="w-full aspect-video object-cover" />
              </button>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {onSkip && (
            <Button variant="ghost" size="sm" className="rounded-pill" onClick={onSkip}>
              Skip
            </Button>
          )}
          <Button variant="gold" size="sm" className="rounded-pill" onClick={confirm} disabled={loading}>
            Use this cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VideoThumbnailPicker;
