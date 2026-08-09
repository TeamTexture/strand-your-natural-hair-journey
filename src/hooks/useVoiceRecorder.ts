// Shared microphone recorder for chat voice notes.
//
// Kept deliberately small: it owns the MediaRecorder, the live duration, and
// hands the finished audio back as a Blob. Uploading, transcribing and storing
// belong to the caller — a chat thread and a group broadcast persist the same
// recording in very different places.

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

/** Formats a duration in milliseconds as m:ss. */
export const formatVoiceDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function useVoiceRecorder(onFinish: (rec: VoiceRecording) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const cancelRef = useRef(false);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const cleanup = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4"; // Safari
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const durationMs = Date.now() - startedRef.current;
        cleanup();
        setRecording(false);
        setElapsedMs(0);
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime });
        if (durationMs < 600 || blob.size === 0) {
          setError("That was too short — hold on a little longer.");
          return;
        }
        finishRef.current({ blob, durationMs, mimeType: mime });
      };
      mr.start();
      mrRef.current = mr;
      startedRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedRef.current);
      }, 200);
    } catch (e) {
      console.error("Microphone unavailable:", e);
      setError("Microphone access denied.");
      cleanup();
      setRecording(false);
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    if (!mrRef.current || mrRef.current.state === "inactive") return;
    mrRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    stop();
  }, [stop]);

  return { recording, elapsedMs, error, start, stop, cancel, setError };
}
