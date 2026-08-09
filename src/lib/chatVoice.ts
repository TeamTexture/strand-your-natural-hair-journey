// Shared plumbing for chat voice notes.
//
// Audio lives in the private `chat-images` bucket alongside chat photos, so the
// existing participant/broadcast storage policies cover it — a thread voice note
// sits under the thread id, a group broadcast under a fresh folder the admin
// policy allows.

import { supabase } from "@/integrations/supabase/client";
import { uuid } from "@/lib/uuid";

export const CHAT_MEDIA_BUCKET = "chat-images";

const extFor = (mimeType: string) => (mimeType.includes("mp4") ? "m4a" : "webm");

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(((r.result as string) || "").split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/** Uploads a recording and returns its storage path. */
export async function uploadChatVoice(
  folder: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const path = `${folder}/${uuid()}.${extFor(mimeType)}`;
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Best-effort transcription. A voice note is still sendable when transcription
 * fails — the audio is the message, the transcript is an accessibility extra.
 */
export async function transcribeChatVoice(blob: Blob, mimeType: string): Promise<string | null> {
  try {
    const audioBase64 = await blobToBase64(blob);
    const { data, error } = await supabase.functions.invoke("transcribe-audio", {
      body: { audioBase64, mimeType: mimeType || "audio/webm" },
    });
    if (error) throw error;
    const text = ((data as { text?: string } | null)?.text ?? "").toString().trim();
    return text || null;
  } catch (e) {
    console.error("Voice note transcription failed:", e);
    return null;
  }
}
