import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  BANNER_ASPECT,
  BANNER_TARGET_W,
  BANNER_TARGET_H,
  PRODUCT_ASPECT,
  PRODUCT_TARGET,
  MAX_INPUT_BYTES,
  loadImageFromFile,
  validateBannerSource,
  validateProductSource,
  encodeCroppedWebp,
  type LoadedImage,
} from "@/lib/brandImageProcessing";

type Mode = "banner" | "product";

interface Props {
  file: File | null;
  mode: Mode;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

/** Aspect-locked crop dialog. Displays the source inside a viewport at the
 *  target ratio; the user pans (drag) and zooms (slider) to frame the shot,
 *  then we render the cropped region to a WebP within size limits. */
const ImageCropDialog = ({ file, mode, onCancel, onCropped }: Props) => {
  const aspect = mode === "banner" ? BANNER_ASPECT : PRODUCT_ASPECT;
  const targetW = mode === "banner" ? BANNER_TARGET_W : PRODUCT_TARGET;
  const targetH = mode === "banner" ? BANNER_TARGET_H : PRODUCT_TARGET;

  // Viewport display size (fits in dialog). Banner is wide, product is square.
  const VIEW_W = mode === "banner" ? 320 : 260;
  const VIEW_H = VIEW_W / aspect;

  const [img, setImg] = useState<LoadedImage | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    if (!file) {
      setImg(null);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("Image too large. Maximum 2MB.");
      onCancel();
      return;
    }
    (async () => {
      try {
        const loaded = await loadImageFromFile(file);
        revoke = loaded.url;
        const v = mode === "banner" ? validateBannerSource(loaded) : validateProductSource(loaded);
        if (!v.ok) {
          toast.error(v.error ?? "Image not valid");
          onCancel();
          return;
        }
        setWarning(v.warning ?? null);
        setImg(loaded);
        // Fit-cover baseline: pick min scale so the viewport is fully covered.
        const base = Math.max(VIEW_W / loaded.width, VIEW_H / loaded.height);
        setZoom(base);
        setTx(0);
        setTy(0);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load image");
        onCancel();
      }
    })();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [file, mode, onCancel, VIEW_W, VIEW_H]);

  const clampPan = (nx: number, ny: number, z: number) => {
    if (!img) return { x: nx, y: ny };
    const dispW = img.width * z;
    const dispH = img.height * z;
    const maxX = Math.max(0, (dispW - VIEW_W) / 2);
    const maxY = Math.max(0, (dispH - VIEW_H) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !img) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const { x, y } = clampPan(dragRef.current.tx + dx, dragRef.current.ty + dy, zoom);
    setTx(x);
    setTy(y);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onZoom = (v: number) => {
    if (!img) return;
    const base = Math.max(VIEW_W / img.width, VIEW_H / img.height);
    const z = base * v;
    setZoom(z);
    const { x, y } = clampPan(tx, ty, z);
    setTx(x);
    setTy(y);
  };

  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    try {
      // Source rect: figure out which region of the source is under the
      // fixed viewport window at the current zoom+pan.
      const dispW = img.width * zoom;
      const dispH = img.height * zoom;
      const leftDisp = (dispW - VIEW_W) / 2 - tx;
      const topDisp = (dispH - VIEW_H) / 2 - ty;
      const sx = Math.max(0, leftDisp / zoom);
      const sy = Math.max(0, topDisp / zoom);
      const sw = Math.min(img.width - sx, VIEW_W / zoom);
      const sh = Math.min(img.height - sy, VIEW_H / zoom);
      const blob = await encodeCroppedWebp(img.el, { sx, sy, sw, sh }, targetW, targetH);
      onCropped(blob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Crop failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {mode === "banner" ? "Crop banner image" : "Crop product image"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground font-body leading-snug -mt-2">
          {mode === "banner"
            ? "Locked to 4.7:1 (1500×320). Keep headline text & logos inside the green dashed SAFE ZONE — the red edge may crop on some phones."
            : "Locked to 1:1. Keep the product inside the green dashed SAFE ZONE so nothing important is trimmed."}
        </p>
        {warning && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-body">{warning}</p>
        )}
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden bg-muted rounded-lg touch-none select-none"
            style={{ width: VIEW_W, height: VIEW_H }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              <img
                src={img.url}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                style={{
                  width: img.width * zoom,
                  height: img.height * zoom,
                  transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
                }}
              />
            )}
            {mode === "banner" && (
              <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
            )}
            {/* Bleed edge — red inset marks the risky outer margin */}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-red-500/70 ring-inset rounded-lg" />
            {/* Safe zone — dashed green: keep text, logos & product focal point inside */}
            <div
              className="pointer-events-none absolute border border-dashed border-emerald-400 rounded-md"
              style={
                mode === "banner"
                  ? { top: "10%", bottom: "10%", left: "4%", right: "4%" }
                  : { inset: "6%" }
              }
            />
            <span className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider font-body px-1.5 py-0.5 rounded bg-emerald-500/90 text-white">
              Safe zone
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground font-body leading-snug px-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 align-middle mr-1" />
          Keep inside dashed line ·
          <span className="inline-block w-2 h-2 rounded-sm bg-red-500/70 align-middle mx-1" />
          Bleed edge may crop
        </p>

        <div className="px-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-body">Zoom</p>
          <Slider min={1} max={3} step={0.05} value={[zoom && img ? zoom / Math.max(VIEW_W / img.width, VIEW_H / img.height) : 1]} onValueChange={(v) => onZoom(v[0])} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="pill" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="gold" size="pill" onClick={confirm} disabled={busy || !img}>
            {busy ? "Preparing…" : "Use image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropDialog;
