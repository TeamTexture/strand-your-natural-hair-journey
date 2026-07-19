// Resize a File/Blob to a small JPEG suitable for a list-thumbnail.
//
// When a `bbox` is supplied (normalised 0–1 fractions returned by the
// blood-extract model identifying the lab logo), we crop tightly to that
// region so the thumbnail becomes the lab's actual logo/brand mark. When it
// isn't, we fall back to the top ~60% of the source (which usually contains
// the letterhead) so the tile still shows something identifiable.
export type LogoBBox = { x: number; y: number; w: number; h: number };

export async function resizeToThumbnail(
  source: Blob,
  size = 320,
  quality = 0.82,
  bbox?: LogoBBox | null,
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image_load_failed"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas_ctx");
    // Warm off-white background matches the app card colour.
    ctx.fillStyle = "#F5EFE2";
    ctx.fillRect(0, 0, size, size);

    let sx: number;
    let sy: number;
    let sw: number;
    let sh: number;

    if (bbox && bbox.w > 0 && bbox.h > 0) {
      // Pad the model bbox slightly so the logo isn't clipped by tight bounds.
      const pad = 0.04;
      const bx = Math.max(0, bbox.x - pad);
      const by = Math.max(0, bbox.y - pad);
      const bw = Math.min(1 - bx, bbox.w + pad * 2);
      const bh = Math.min(1 - by, bbox.h + pad * 2);
      sx = bx * img.naturalWidth;
      sy = by * img.naturalHeight;
      sw = bw * img.naturalWidth;
      sh = bh * img.naturalHeight;
    } else {
      // Fallback: top 60% of the source.
      sx = 0;
      sy = 0;
      sw = img.naturalWidth;
      sh = Math.min(img.naturalHeight, img.naturalHeight * 0.6);
    }

    const scale = Math.min(size / sw, size / sh);
    const drawW = sw * scale;
    const drawH = sh * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, drawW, drawH);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))),
        "image/jpeg",
        quality,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
