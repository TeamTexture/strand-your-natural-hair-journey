// Client-side PDF password handling.
// - detectPdfEncrypted: quick check of raw bytes for /Encrypt marker
// - renderPdfToImage: opens the PDF with pdf.js (optionally with a password)
//   and returns a single JPEG File containing the pages stitched vertically.
// Used by BloodUpload so password-protected lab PDFs can be unlocked and
// passed to the blood-extract edge function as an image.
import * as pdfjs from "pdfjs-dist";
// Vite worker import
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export function detectPdfEncrypted(bytes: Uint8Array): boolean {
  // Look for "/Encrypt" in the first ~200KB of the file.
  const scan = bytes.subarray(0, Math.min(bytes.length, 200_000));
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // /Encrypt
  for (let i = 0; i < scan.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (scan[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

export class PdfPasswordRequiredError extends Error {
  incorrect: boolean;
  constructor(incorrect = false) {
    super(incorrect ? "Incorrect password" : "Password required");
    this.incorrect = incorrect;
  }
}

export async function renderPdfToImage(
  bytes: Uint8Array,
  password?: string,
  opts: { maxPages?: number; maxWidth?: number } = {},
): Promise<File> {
  const maxPages = opts.maxPages ?? 6;
  const maxWidth = opts.maxWidth ?? 1400;

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    password: password ?? undefined,
    isEvalSupported: false,
  });

  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err: unknown) {
    const e = err as { name?: string; code?: number };
    // PasswordException codes: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
    if (e?.name === "PasswordException") {
      throw new PdfPasswordRequiredError(e.code === 2);
    }
    throw err;
  }

  const pageCount = Math.min(doc.numPages, maxPages);
  const canvases: HTMLCanvasElement[] = [];
  let totalHeight = 0;
  let width = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    canvases.push(canvas);
    totalHeight += canvas.height;
    width = Math.max(width, canvas.width);
  }

  const stitched = document.createElement("canvas");
  stitched.width = width;
  stitched.height = totalHeight;
  const sctx = stitched.getContext("2d")!;
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, stitched.width, stitched.height);
  let y = 0;
  for (const c of canvases) {
    sctx.drawImage(c, 0, y);
    y += c.height;
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    stitched.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.85,
    );
  });

  return new File([blob], "blood-test.jpg", { type: "image/jpeg" });
}
