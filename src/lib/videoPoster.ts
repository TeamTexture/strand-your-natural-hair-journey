/**
 * videoPoster — grabs a still frame from a video so it can be shown as a cover
 * image instead of a black rectangle.
 *
 * Every uploaded style-journal clip gets a poster: one is captured at upload
 * time from the local blob, and any older clip without one is healed the first
 * time it renders (see JournalStepCard).
 */

/** Where in the clip to sample. Not frame 0 — that is often black. */
const SAMPLE_FRACTION = 0.15;
const MAX_WIDTH = 720;

const waitFor = (el: HTMLVideoElement, event: string, ms = 12000) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("video failed to load")); };
    const cleanup = () => {
      window.clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
    };
    el.addEventListener(event, onEvent);
    el.addEventListener("error", onError);
  });

/**
 * Captures a JPEG still from a video blob or URL. Returns null when the browser
 * cannot decode the clip (or blocks the frame, e.g. a cross-origin source
 * without CORS) — callers should treat a poster as best-effort.
 */
export async function captureVideoPoster(source: Blob | string): Promise<Blob | null> {
  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = objectUrl ?? (source as string);

  try {
    await waitFor(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0.4 ? Math.min(duration * SAMPLE_FRACTION, duration - 0.1) : 0;
    if (target > 0) {
      video.currentTime = target;
      await waitFor(video, "seeked");
    } else {
      // Very short clip: let it paint at least one frame.
      await waitFor(video, "loadeddata");
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_WIDTH / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
    });
  } catch (e) {
    console.warn("poster capture failed", e);
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
