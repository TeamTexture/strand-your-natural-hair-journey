// Fetch a remote image server-side and add it to a mood board.
// Bypasses browser CORS and hotlink restrictions.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const BUCKET = "moodboard-images";
const MAX_BYTES = 12 * 1024 * 1024; // 12MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function extForType(type: string): string {
  switch (type) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/avif": return "avif";
    default: return "jpg";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({})) as {
      board_id?: string;
      image_urls?: string[];
      caption?: string;
    };
    const { board_id, image_urls, caption } = body;
    if (!board_id || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(JSON.stringify({ error: "Missing board_id or image_urls" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (image_urls.length > 30) {
      return new Response(JSON.stringify({ error: "Too many images (max 30)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify board ownership + is_favourites flag
    const { data: board, error: boardErr } = await admin
      .from("moodboards")
      .select("id, user_id, is_favourites")
      .eq("id", board_id)
      .maybeSingle();
    if (boardErr || !board || board.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Board not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { url: string; ok: boolean; error?: string }[] = [];
    for (const rawUrl of image_urls) {
      try {
        let u: URL;
        try {
          u = new URL(rawUrl);
        } catch {
          results.push({ url: rawUrl, ok: false, error: "Invalid URL" });
          continue;
        }
        if (!/^https?:$/.test(u.protocol)) {
          results.push({ url: rawUrl, ok: false, error: "Not http(s)" });
          continue;
        }

        const imgRes = await fetch(u.toString(), {
          headers: {
            // Some CDNs (Google, Pinterest) block empty UAs.
            "User-Agent":
              "Mozilla/5.0 (compatible; STRAND-Moodboard/1.0; +https://mystrand.co.uk)",
            Accept: "image/*,*/*;q=0.8",
          },
          redirect: "follow",
        });
        if (!imgRes.ok) {
          results.push({ url: rawUrl, ok: false, error: `HTTP ${imgRes.status}` });
          continue;
        }

        const contentType = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED.includes(contentType)) {
          results.push({ url: rawUrl, ok: false, error: `Unsupported type (${contentType || "unknown"})` });
          continue;
        }
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        if (buf.byteLength === 0) {
          results.push({ url: rawUrl, ok: false, error: "Empty file" });
          continue;
        }
        if (buf.byteLength > MAX_BYTES) {
          results.push({ url: rawUrl, ok: false, error: "File too large" });
          continue;
        }

        const ext = extForType(contentType);
        const id = crypto.randomUUID();
        const path = `${userId}/${board_id}/${id}.${ext}`;

        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, buf, { contentType, upsert: false });
        if (upErr) {
          results.push({ url: rawUrl, ok: false, error: upErr.message });
          continue;
        }

        const { error: insErr } = await admin.from("moodboard_images").insert({
          user_id: userId,
          board_id,
          storage_path: path,
          caption: caption ?? null,
          is_favourite: !!board.is_favourites,
        });
        if (insErr) {
          await admin.storage.from(BUCKET).remove([path]);
          results.push({ url: rawUrl, ok: false, error: insErr.message });
          continue;
        }
        results.push({ url: rawUrl, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ url: rawUrl, ok: false, error: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ imported: okCount, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("moodboard-import-image error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
