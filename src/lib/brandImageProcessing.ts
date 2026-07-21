/** Utilities for validating and encoding brand offer images.
 *
 *  Banner: 4.7:1 (1500×320 target, min 750×160), WebP ≤ 400KB.
 *  Product: 1:1 (min 800×800), WebP ≤ 400KB.
 *
 *  All crops are performed on a canvas after the user positions the source
 *  image inside a fixed-aspect selection window (see ImageCropDialog).
 */

export const BANNER_ASPECT = 1500 / 320; // ≈ 4.6875
export const BANNER_TARGET_W = 1500;
export const BANNER_TARGET_H = 320;
export const BANNER_MIN_W = 750;
export const BANNER_MIN_H = 160;

export const PRODUCT_ASPECT = 1;
export const PRODUCT_TARGET = 1200;
export const PRODUCT_MIN = 800;

export const MAX_INPUT_BYTES = 2 * 1024 * 1024; // 2MB source cap
export const MAX_OUTPUT_BYTES = 400 * 1024; // 400KB WebP cap

export interface LoadedImage {
  el: HTMLImageElement;
  width: number;
  height: number;
  url: string;
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  const el = new Image();
  el.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not read image"));
    el.src = url;
  });
  return { el, width: el.naturalWidth, height: el.naturalHeight, url };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

export function validateBannerSource(img: LoadedImage): ValidationResult {
  if (img.width < BANNER_MIN_W || img.height < BANNER_MIN_H) {
    return {
      ok: false,
      error: `Image too small (${img.width}×${img.height}). Minimum 750×160.`,
    };
  }
  const ratio = img.width / img.height;
  const drift = Math.abs(ratio - BANNER_ASPECT) / BANNER_ASPECT;
  if (drift > 0.05) {
    return {
      ok: true,
      warning: `Source ratio ${ratio.toFixed(2)}:1 — we'll crop to 4.7:1.`,
    };
  }
  return { ok: true };
}

export function validateProductSource(img: LoadedImage): ValidationResult {
  if (img.width < PRODUCT_MIN || img.height < PRODUCT_MIN) {
    return {
      ok: false,
      error: `Image too small (${img.width}×${img.height}). Minimum 800×800.`,
    };
  }
  return { ok: true };
}

/** Draw the source image into a target canvas using a cover-crop defined by
 *  (scale, offsetX, offsetY) relative to a reference viewport, then encode as
 *  WebP, progressively lowering quality until under `maxBytes`. */
export async function encodeCroppedWebp(
  img: HTMLImageElement,
  sourceRect: { sx: number; sy: number; sw: number; sh: number },
  targetW: number,
  targetH: number,
  maxBytes: number = MAX_OUTPUT_BYTES,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    sourceRect.sx,
    sourceRect.sy,
    sourceRect.sw,
    sourceRect.sh,
    0,
    0,
    targetW,
    targetH,
  );

  let quality = 0.9;
  for (let i = 0; i < 6; i++) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("Encode failed");
    if (blob.size <= maxBytes || quality <= 0.4) return blob;
    quality -= 0.1;
  }
  throw new Error("Could not compress below size limit");
}
