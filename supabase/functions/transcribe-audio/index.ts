// Transcribes a short audio clip via the Lovable AI Gateway speech-to-text API.
// POST { audioBase64: string, mimeType: string } -> { text: string }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const extFor = (mime: string) => {
  const base = mime.split(";")[0].trim();
  switch (base) {
    case "audio/mp4":
    case "video/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/flac":
      return "flac";
    default:
      return "webm";
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return json({ error: "audioBase64 required" }, 400);
    }
    const mt = typeof mimeType === "string" && mimeType ? mimeType : "audio/webm";

    let bytes: Uint8Array;
    try {
      const raw = atob(audioBase64);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } catch {
      return json({ error: "Audio could not be decoded" }, 400);
    }
    if (bytes.byteLength < 512) {
      return json({ error: "That recording was too short — please try again." }, 400);
    }

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append(
      "file",
      new Blob([bytes], { type: mt.split(";")[0] }),
      `recording.${extFor(mt)}`,
    );

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: form,
      },
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("transcribe gateway", aiResp.status, t.slice(0, 400));
      if (aiResp.status === 429) {
        return json({ error: "Too many requests — try again in a moment." }, 429);
      }
      if (aiResp.status === 402 || aiResp.status === 403) {
        // Return 200 with a paused flag: this is an expected billing state, not
        // a function fault, so it must not surface as a client runtime error.
        return json({
          paused: true,
          error:
            "Transcription is paused — the workspace AI credit limit has been reached.",
        });
      }
      return json({ error: "Transcription failed" }, 502);
    }

    const out = await aiResp.json();
    const text = typeof out?.text === "string" ? out.text.trim() : "";
    return json({ text });
  } catch (e) {
    console.error("transcribe-audio error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
