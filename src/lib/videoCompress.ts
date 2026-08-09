/**
 * Client-side video compression for style-record step clips.
 *
 * Phone-camera files are often 4K/60 at 40-100 Mbps — slow to upload on mobile
 * data. We re-encode with WebCodecs (via mediabunny) to portrait-friendly 720p
 * at ~2.5 Mbps, which is visually close on a 375px screen and typically 5-10x
 * smaller. Everything is best-effort: if the browser can't encode, or anything
 * throws, we return the original file untouched so a save never fails because
 * of compression.
 */

export const TARGET_VIDEO_BITRATE = 2_500_000;
export const TARGET_AUDIO_BITRATE = 64_000;
/** Longest edge of the output. 1280 keeps 720p portrait (720x1280). */
const MAX_LONG_EDGE = 1280;
/** Below this, re-encoding buys little and costs time. */
const SKIP_BELOW_BYTES = 6 * 1024 * 1024;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export interface CompressResult {
  blob: Blob;
  mime: string;
  compressed: boolean;
  originalBytes: number;
}

export async function compressStepVideo(
  file: Blob,
  onProgress?: (percent: number) => void,
): Promise<CompressResult> {
  const original: CompressResult = {
    blob: file,
    mime: file.type || "video/mp4",
    compressed: false,
    originalBytes: file.size,
  };
  if (file.size <= SKIP_BELOW_BYTES) return original;

  try {
    const {
      Input,
      Output,
      Conversion,
      BlobSource,
      BufferTarget,
      Mp4OutputFormat,
      ALL_FORMATS,
      canEncodeVideo,
    } = await import("mediabunny");

    if (!(await canEncodeVideo("avc"))) return original;

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return original;

    const srcW = track.displayWidth || track.codedWidth;
    const srcH = track.displayHeight || track.codedHeight;
    if (!srcW || !srcH) return original;

    const long = Math.max(srcW, srcH);
    const scale = long > MAX_LONG_EDGE ? MAX_LONG_EDGE / long : 1;
    const width = even(srcW * scale);
    const height = even(srcH * scale);

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { width, height, fit: "contain", bitrate: TARGET_VIDEO_BITRATE, forceTranscode: true },
      audio: { bitrate: TARGET_AUDIO_BITRATE, numberOfChannels: 1 },
    });
    if (conversion.isValid === false) return original;
    if (onProgress) conversion.onProgress = (p: number) => onProgress(Math.round(p * 100));

    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) return original;

    const blob = new Blob([buffer], { type: "video/mp4" });
    // Never hand back something bigger than what we started with.
    if (!blob.size || blob.size >= file.size) return original;

    return { blob, mime: "video/mp4", compressed: true, originalBytes: file.size };
  } catch (e) {
    console.warn("video compression skipped", e);
    return original;
  }
}
