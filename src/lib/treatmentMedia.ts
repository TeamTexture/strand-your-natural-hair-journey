/**
 * TREATMENT PLAN MEDIA — the single upload path.
 *
 * The per-type size and MIME rules live on a CHECK constraint on
 * treatment_plan_media (`treatment_plan_media_type_rules`), not on the bucket.
 * So the order is non-negotiable and is implemented once, here:
 *
 *   1. Validate locally against the same rules (so the member gets our wording,
 *      not a Postgres error).
 *   2. INSERT the treatment_plan_media row. If the constraint rejects it,
 *      nothing is ever pushed to storage.
 *   3. Upload the object to the private bucket.
 *   4. If the upload fails, DELETE the row so nothing is orphaned.
 *
 * Reads are always signed URLs. There is no public URL for this bucket and
 * nothing in the app may construct one.
 */

import { supabase } from "@/integrations/supabase/client";
import { uuid } from "@/lib/uuid";
import { prepareImageForAi } from "@/lib/imagePrep";

export const TREATMENT_MEDIA_BUCKET = "treatment-plan-media";

export type TreatmentMediaType = "photo" | "audio" | "video";

export interface TreatmentMediaRow {
  id: string;
  plan_id: string;
  checkin_id: string | null;
  milestone_id: string | null;
  user_id: string;
  media_type: TreatmentMediaType;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  caption: string | null;
  captured_at: string;
}

/** Mirrors the database CHECK constraint exactly. Keep the two in step. */
export const MEDIA_RULES: Record<
  TreatmentMediaType,
  { mimes: string[]; maxBytes: number; maxSeconds?: number }
> = {
  photo: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * 1024 * 1024 },
  audio: {
    mimes: ["audio/webm", "audio/mp4", "audio/mpeg"],
    maxBytes: 15 * 1024 * 1024,
    maxSeconds: 180,
  },
  video: { mimes: ["video/mp4"], maxBytes: 50 * 1024 * 1024, maxSeconds: 60 },
};

export const PHOTO_MAX_EDGE = 1600;
export const VOICE_MAX_SECONDS = MEDIA_RULES.audio.maxSeconds!;
export const VIDEO_MAX_SECONDS = MEDIA_RULES.video.maxSeconds!;

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

const extFor = (mime: string) =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
  })[mime] ?? "bin";

/** Drops any `;codecs=…` suffix — the constraint wants the bare type. */
export const baseMime = (mime: string) => mime.split(";")[0].trim().toLowerCase();

/**
 * Our own words for a file we can't accept, plus what to do about it. Returned
 * instead of thrown so a caller can show it inline next to the picker.
 */
export function describeRejection(type: TreatmentMediaType, mime: string, bytes: number): string | null {
  const rules = MEDIA_RULES[type];
  if (!rules.mimes.includes(baseMime(mime))) {
    if (type === "video")
      return "That clip isn't an MP4. Record it with your phone's camera app, or save it as MP4 and try again.";
    if (type === "photo") return "That file isn't a photo we can read. A JPEG, PNG or WebP works.";
    return "We couldn't read that recording. Record it here and it'll save in the right format.";
  }
  if (bytes > rules.maxBytes) {
    if (type === "video")
      return `That clip is ${mb(bytes)}. Videos need to be under ${mb(rules.maxBytes)} — a shorter clip, up to ${VIDEO_MAX_SECONDS} seconds, will fit comfortably.`;
    return `That file is ${mb(bytes)}, which is over the ${mb(rules.maxBytes)} limit. Try a smaller one.`;
  }
  return null;
}

export class TreatmentMediaError extends Error {}

/* -------------------------------------------------------------- photos */

/**
 * Long edge capped at 1600px and re-encoded to JPEG (handles iPhone HEIC too),
 * which lands a normal phone photo far under the 10MB ceiling.
 */
export async function prepareCheckinPhoto(file: File): Promise<File> {
  const prepared = await prepareImageForAi(file);
  return prepared.uploadFile;
}

/* ------------------------------------------------------------- uploads */

export interface UploadArgs {
  userId: string;
  planId: string;
  checkinId?: string | null;
  milestoneId?: string | null;
  mediaType: TreatmentMediaType;
  /** Already prepared: photos resized, audio recorded, video validated. */
  file: Blob;
  mimeType: string;
  durationSeconds?: number | null;
  caption?: string | null;
}

/**
 * The one upload path for photos, voice notes and video. Row first, object
 * second, row removed if the object never lands.
 */
export async function uploadTreatmentMedia(args: UploadArgs): Promise<TreatmentMediaRow> {
  const mime = baseMime(args.mimeType);
  const bytes = args.file.size;

  const problem = describeRejection(args.mediaType, mime, bytes);
  if (problem) throw new TreatmentMediaError(problem);

  // First path segment must be the owner's id — the storage policy requires it.
  const path = `${args.userId}/${args.planId}/${args.mediaType}/${uuid()}.${extFor(mime)}`;

  // 1. The row, so the CHECK constraint decides before anything is uploaded.
  const { data: row, error: insertError } = await (supabase as any)
    .from("treatment_plan_media")
    .insert({
      plan_id: args.planId,
      checkin_id: args.checkinId ?? null,
      milestone_id: args.milestoneId ?? null,
      user_id: args.userId,
      media_type: args.mediaType,
      storage_path: path,
      mime_type: mime,
      file_size_bytes: bytes,
      duration_seconds: args.durationSeconds ?? null,
      caption: args.caption ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    // One video per check-in is a partial unique index — say so in our voice.
    if ((insertError as { code?: string }).code === "23505")
      throw new TreatmentMediaError(
        "There's already a video on this check-in. Remove that one first if you'd rather use this clip.",
      );
    if ((insertError as { code?: string }).code === "23514")
      throw new TreatmentMediaError(
        describeRejection(args.mediaType, mime, bytes) ??
          "That file doesn't fit what we can store for this kind of media.",
      );
    console.error("treatment media insert failed", insertError);
    throw new TreatmentMediaError("We couldn't save that just now. Try again in a moment.");
  }

  // 2. The object.
  const { error: uploadError } = await supabase.storage
    .from(TREATMENT_MEDIA_BUCKET)
    .upload(path, args.file, { contentType: mime, upsert: false });

  if (uploadError) {
    // 3. Nothing orphaned.
    await (supabase as any).from("treatment_plan_media").delete().eq("id", (row as { id: string }).id);
    console.error("treatment media upload failed, row removed", uploadError);
    throw new TreatmentMediaError("The upload didn't finish. Check your connection and try again.");
  }

  return row as TreatmentMediaRow;
}

/** Removes the object then the row — safe to call on a row with no object. */
export async function deleteTreatmentMedia(row: Pick<TreatmentMediaRow, "id" | "storage_path">) {
  await supabase.storage.from(TREATMENT_MEDIA_BUCKET).remove([row.storage_path]);
  const { error } = await (supabase as any).from("treatment_plan_media").delete().eq("id", row.id);
  if (error) throw error;
}

/* ---------------------------------------------------------- signed reads */

const SIGNED_TTL = 60 * 60; // an hour, comfortably longer than a session on a screen
const cache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a private object. The only way media is ever read. */
export async function signedMediaUrl(storagePath: string): Promise<string | null> {
  const hit = cache.get(storagePath);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage
    .from(TREATMENT_MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL);
  if (error || !data?.signedUrl) {
    console.error("signed url failed", error);
    return null;
  }
  cache.set(storagePath, { url: data.signedUrl, expires: Date.now() + (SIGNED_TTL - 300) * 1000 });
  return data.signedUrl;
}

export async function signedMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    paths.map(async (p) => {
      const url = await signedMediaUrl(p);
      if (url) out[p] = url;
    }),
  );
  return out;
}

/** Reads a media clip's duration in seconds from the blob itself. */
export const readMediaDuration = (blob: Blob, kind: "video" | "audio"): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? Math.round(el.duration) : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });

export const formatClock = (seconds: number) => {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${`${t % 60}`.padStart(2, "0")}`;
};
