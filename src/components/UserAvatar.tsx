import { uuid } from "@/lib/uuid";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { useMyProfile, useInvalidateMyProfile } from "@/hooks/useMyProfile";

interface Props {
  name: string;
  size?: string;
  /** Allow editing (camera button + file picker). */
  editable?: boolean;
  /** Show a gold "+" badge for STRAND+ members. */
  plus?: boolean;
}

const BUCKET = "avatars";

/** path -> signed url, shared across every mounted avatar. */
const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Round avatar that loads `profiles.avatar_url` for the signed-in user.
 * When `editable`, tapping it opens a file picker so the user can upload
 * or replace their photo. Falls back to initials when no photo exists.
 */
const UserAvatar = ({ name, size = "size-14", editable = true, plus = false }: Props) => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);

  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();

  // Resolve the signed avatar URL from the shared profile row. Signed URLs are
  // memoised per storage path so a screen with several avatars signs once.
  useEffect(() => {
    let cancelled = false;
    const p = profile?.avatar_url ?? null;
    setPath(p);
    if (!p) {
      setSignedUrl(null);
      return;
    }
    const cached = signedUrlCache.get(p);
    if (cached && cached.expires > Date.now()) {
      setSignedUrl(cached.url);
      return;
    }
    (async () => {
      const { data: sig } = await supabase.storage.from(BUCKET).createSignedUrl(p, 3600);
      if (sig?.signedUrl) signedUrlCache.set(p, { url: sig.signedUrl, expires: Date.now() + 50 * 60_000 });
      if (!cancelled) setSignedUrl(sig?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url]);

  const handlePick = async (rawFile: File) => {
    if (!user) {
      toast.error("Please sign in to add a photo");
      return;
    }
    const isHeicFile = /\.(heic|heif)$/i.test(rawFile.name) || /heic|heif/i.test(rawFile.type);
    if (!rawFile.type.startsWith("image/") && !isHeicFile) {
      toast.error("Pick an image file");
      return;
    }
    if (rawFile.size > 8 * 1024 * 1024) {
      toast.error("Photo too large (max 8MB)");
      return;
    }
    setBusy(true);
    try {
      const file = await convertHeicToJpeg(rawFile);
      // Remove existing avatar
      if (path) await supabase.storage.from(BUCKET).remove([path]);

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const newPath = `${user.id}/${uuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, avatar_url: newPath },
          { onConflict: "user_id" },
        );
      if (dbErr) throw dbErr;

      const { data: sig } = await supabase.storage.from(BUCKET).createSignedUrl(newPath, 3600);
      setPath(newPath);
      if (sig?.signedUrl) signedUrlCache.set(newPath, { url: sig.signedUrl, expires: Date.now() + 50 * 60_000 });
      setSignedUrl(sig?.signedUrl ?? null);
      invalidateProfile();
      toast.success("Avatar updated");
    } catch (e) {
      console.error("Avatar upload failed:", e);
      toast.error("Could not upload avatar");
    } finally {
      setBusy(false);
    }
  };

  const inner = signedUrl ? (
    <img src={signedUrl} alt={name} className="size-full object-cover" />
  ) : (
    <span className="font-display text-lg font-semibold">{initials}</span>
  );

  if (!editable) {
    return (
      <div className={cn("relative shrink-0", size)}>
        <div
          className={cn(
            "size-full rounded-full bg-primary text-primary-foreground flex items-center justify-center overflow-hidden",
          )}
        >
          {inner}
        </div>
        {plus && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center text-[9px] font-bold leading-none"
          >
            +
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative shrink-0", size)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await handlePick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={signedUrl ? "Change profile photo" : "Add profile photo"}
        className={cn(
          "size-full rounded-full bg-primary text-primary-foreground flex items-center justify-center overflow-hidden",
          "transition-transform active:scale-95 hover:opacity-90 cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background",
        )}
      >
        {inner}
      </button>
      {busy ? (
        <span className="pointer-events-none absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
          <Loader2 className="size-4 text-white animate-spin" />
        </span>
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center"
        >
          <Camera className="size-2.5" />
        </span>
      )}
      {plus && (
        <span
          aria-hidden
          title="STRAND+ member"
          className="pointer-events-none absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center text-[9px] font-bold leading-none"
        >
          +
        </span>
      )}
    </div>
  );
};

export default UserAvatar;

