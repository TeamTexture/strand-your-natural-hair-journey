// Re-encodes any user-picked image (including iPhone HEIC) into a JPEG that the
// Lovable AI Gateway accepts. Also returns a base64 data URL we can send
// straight to the model, removing the need for the model to fetch a signed
// URL (which has previously failed for HEIC content-type).
//
// Strategy:
//   1. If the file is HEIC/HEIF, decode it to JPEG via the `heic-to` library
//      (works in every modern browser including Chrome / Firefox / Android).
//   2. Otherwise rely on the browser's native image pipeline.
//   3. Re-encode through canvas to a size-capped JPEG for predictable AI input.
//
// Falls back to the original File only when the canvas re-encode itself
// fails on an already-supported format.
import { heicTo, isHeic } from "heic-to";

const MAX_DIM = 1600; // long-edge cap; keeps base64 payload small
const JPEG_QUALITY = 0.9;

const SUPPORTED_DIRECT = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface PreparedImage {
  /** JPEG (or original-format) Blob safe to upload to storage. */
  uploadFile: File;
  /** data:image/jpeg;base64,... — safe to send to the AI Gateway. */
  dataUrl: string;
  /** Width/height of the encoded image, useful for debugging. */
  width: number;
  height: number;
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read image"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });

/**
 * Converts the file to a JPEG (re-encoding via canvas) and returns both the
 * upload-ready File and a base64 data URL for the AI call.
 *
 * If the picked file is already a supported format AND small enough, we still
 * re-encode it through canvas — this strips EXIF rotation issues and gives the
 * AI a predictable JPEG it can read.
 */
export async function prepareImageForAi(file: File): Promise<PreparedImage> {
  // Step 1 — if the picked file is HEIC/HEIF, decode it to a JPEG Blob first.
  // iPhones save photos as HEIC by default; Chrome/Firefox/Android can't
  // decode them natively. `heic-to` works in every modern browser via wasm.
  let working: File = file;
  const looksHeicByName = /\.(heic|heif)$/i.test(file.name);
  const looksHeicByType = /heic|heif/i.test(file.type);
  if (looksHeicByName || looksHeicByType) {
    try {
      const heicCheck = await isHeic(file).catch(() => true);
      if (heicCheck) {
        const jpegBlob = await heicTo({
          blob: file,
          type: "image/jpeg",
          quality: 0.92,
        });
        working = new File([jpegBlob], `${stripExt(file.name)}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    } catch (heicErr) {
      console.error("HEIC decode failed", heicErr);
      throw new Error(
        "We couldn't read this HEIC photo. Try retaking it, or in Settings → Camera → Formats switch to 'Most Compatible'.",
      );
    }
  }

  // Step 2 — read as data URL so <img> can decode it for canvas re-encode.
  const originalDataUrl = await readAsDataUrl(working);

  try {
    const img = await loadImage(originalDataUrl);
    const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    // Solid white background — JPEG can't carry alpha.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const blob = await (await fetch(dataUrl)).blob();
    const jpegFile = new File([blob], `${stripExt(working.name)}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return { uploadFile: jpegFile, dataUrl, width: w, height: h };
  } catch (e) {
    console.warn("prepareImageForAi: re-encode failed, using original", e);
    // Last-resort fallback. If the working file is still a format the AI
    // definitely can't read, surface a clear error.
    if (!SUPPORTED_DIRECT.has(working.type)) {
      throw new Error(
        "We couldn't read this image. Try a JPEG or PNG screenshot.",
      );
    }
    return {
      uploadFile: working,
      dataUrl: originalDataUrl,
      width: 0,
      height: 0,
    };
  }
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Lightweight HEIC→JPEG conversion for upload-only flows (journal photos,
 * moodboard images, avatars) where we don't need a base64 data URL or canvas
 * resize. Returns the original file untouched if it isn't HEIC.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const looksHeicByName = /\.(heic|heif)$/i.test(file.name);
  const looksHeicByType = /heic|heif/i.test(file.type);
  if (!looksHeicByName && !looksHeicByType) return file;
  try {
    const heicCheck = await isHeic(file).catch(() => true);
    if (!heicCheck) return file;
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    return new File([blob], `${stripExt(file.name)}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (e) {
    console.error("HEIC conversion failed", e);
    throw new Error(
      "We couldn't read this HEIC photo. Try retaking it, or in Settings → Camera → Formats switch to 'Most Compatible'.",
    );
  }
}

