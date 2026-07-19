// Resize a File/Blob to a small JPEG suitable for a list-thumbnail.
// Keeps the entire source doc visible (fit=contain on a padded canvas) so a
// lab logo or header is readable, but crops the image to a square for a tidy
// thumbnail on the blood-work page.
export async function resizeToThumbnail(
  source: Blob,
  size = 320,
  quality = 0.82,
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
    // Warm off-white background — matches the app card colour so letterboxed
    // reports don't sit on stark white.
    ctx.fillStyle = "#F5EFE2";
    ctx.fillRect(0, 0, size, size);

    // Fit the top portion of the doc (the header/logo band) inside the tile.
    // We crop to the top 60% of the source so we favour the letterhead.
    const cropH = Math.min(img.naturalHeight, img.naturalHeight * 0.6);
    const scale = Math.min(size / img.naturalWidth, size / cropH);
    const drawW = img.naturalWidth * scale;
    const drawH = cropH * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      cropH,
      dx,
      dy,
      drawW,
      drawH,
    );
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
