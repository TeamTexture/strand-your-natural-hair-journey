// Re-encodes any user-picked image (including iPhone HEIC) into a JPEG that the
// Lovable AI Gateway accepts. Also returns a base64 data URL we can send
// straight to the model, removing the need for the model to fetch a signed
// URL (which has previously failed for HEIC content-type).
//
// Strategy: decode via the browser's native image pipeline (Safari can decode
// HEIC there), then re-encode to JPEG via canvas. Falls back to the original
// File when re-encoding fails (e.g. some Android Chrome HEIC pickers) so the
// upload still succeeds — the AI call will then surface a clear error.

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
  // Read original as data URL so <img> can decode it. Safari handles HEIC here;
  // Chrome/Firefox typically don't, in which case loadImage rejects and we
  // fall back below.
  const originalDataUrl = await readAsDataUrl(file);

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
    const jpegFile = new File([blob], `${stripExt(file.name)}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return { uploadFile: jpegFile, dataUrl, width: w, height: h };
  } catch (e) {
    console.warn("prepareImageForAi: re-encode failed, using original", e);
    // Last-resort fallback. If the original is a format the AI definitely
    // can't read (HEIC), we still need *something*. We surface the original
    // so the upload + AI call can still proceed and fail with a clear
    // server-side message.
    if (!SUPPORTED_DIRECT.has(file.type)) {
      throw new Error(
        "We couldn't read this image. iPhone users: in Settings → Camera → Formats, switch to 'Most Compatible' and try again, or pick a JPEG/PNG screenshot.",
      );
    }
    return {
      uploadFile: file,
      dataUrl: originalDataUrl,
      width: 0,
      height: 0,
    };
  }
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
