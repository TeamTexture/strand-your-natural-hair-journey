import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ReviewField from "@/components/ReviewField";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { COUNTRIES } from "@/data/countries";
import { HERITAGE_OPTIONS } from "@/data/heritage";
import HealthFieldsSection from "@/components/profile-review/HealthFieldsSection";
import HardWaterHint from "@/components/HardWaterHint";

const AVATAR_BUCKET = "avatars";

const heritageValues = HERITAGE_OPTIONS.flatMap((o) =>
  o.kind === "option" ? [o.value] : [],
);

const PersonalDetailsReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const editKey = params.get("edit");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile-review", "personal", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select(
          "display_name, phone_number, birth_year, postcode, country, heritage, avatar_url",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // Signed URL for avatar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = profile?.avatar_url;
      if (!p) {
        setAvatarUrl(null);
        return;
      }
      const { data: sig } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(p, 3600);
      if (!cancelled) setAvatarUrl(sig?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["profile-review", "personal"] });

  const age = useMemo(() => {
    if (!profile?.birth_year) return null;
    return new Date().getFullYear() - profile.birth_year;
  }, [profile?.birth_year]);

  const saveField = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    // Keep localStorage snapshot in sync so Home/Profile stay instant.
    try {
      const cached = JSON.parse(
        localStorage.getItem("strand_profile_basic") ?? "{}",
      );
      localStorage.setItem(
        "strand_profile_basic",
        JSON.stringify({ ...cached, ...patch }),
      );
    } catch {
      /* ignore */
    }
    // Also refresh the main profile clinical cache.
    qc.invalidateQueries({ queryKey: ["profile", "clinical"] });
    invalidate();
    toast.success("Saved");
  };

  const handlePickPhoto = async (rawFile: File | undefined) => {
    if (!rawFile || !user) return;
    const isHeic =
      /\.(heic|heif)$/i.test(rawFile.name) || /heic|heif/i.test(rawFile.type);
    if (!rawFile.type.startsWith("image/") && !isHeic) {
      toast.error("Pick an image file");
      return;
    }
    if (rawFile.size > 8 * 1024 * 1024) {
      toast.error("Photo too large (max 8MB)");
      return;
    }
    setAvatarBusy(true);
    try {
      const file = await convertHeicToJpeg(rawFile);
      if (profile?.avatar_url) {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([profile.avatar_url]);
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const newPath = `${user.id}/${uuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(newPath, file, { contentType: file.type });
      if (upErr) throw upErr;
      await saveField({ avatar_url: newPath });
      toast.success("Photo updated");
    } catch (e) {
      console.error("Avatar upload failed:", e);
      toast.error("Could not upload photo");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!user || !profile?.avatar_url) return;
    setAvatarBusy(true);
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_url]);
      await saveField({ avatar_url: null });
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar
        title="Personal details"
        onBack={() => navigate("/profile")}
        right={<span className="text-[12px] text-muted-foreground">Review</span>}
      />

      <div className="px-5 pb-8 space-y-3">
        <p className="text-[13px] text-muted-foreground leading-snug pb-1">
          Tap the pencil next to any field to update just that one thing.
        </p>

        {/* Profile photo — dedicated card */}
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-3">
            Profile photo
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="user"
            className="hidden"
            onChange={(e) => {
              handlePickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              handlePickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !avatarBusy && fileInputRef.current?.click()}
              disabled={avatarBusy}
              className={cn(
                "relative size-20 rounded-full overflow-hidden border-2 flex items-center justify-center bg-card shrink-0",
                avatarUrl ? "border-primary/60" : "border-dashed border-primary/50",
              )}
            >
              {avatarBusy ? (
                <Loader2 className="size-5 text-primary animate-spin" />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Your profile"
                  className="size-full object-cover"
                />
              ) : (
                <Camera className="size-6 text-primary/70" />
              )}
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="w-full !px-3 !gap-2 !min-h-[40px] !text-[11px] !tracking-[0.14em] justify-center"
                onClick={() => cameraInputRef.current?.click()}
                disabled={avatarBusy}
              >
                <Camera className="size-3.5 shrink-0" />
                <span className="whitespace-nowrap">Take photo</span>
              </Button>
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="w-full !px-3 !gap-2 !min-h-[40px] !text-[11px] !tracking-[0.14em] justify-center"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
              >
                <ImagePlus className="size-3.5 shrink-0" />
                <span className="whitespace-nowrap">Upload</span>
              </Button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={avatarBusy}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 mt-0.5"
                >
                  <X className="size-3" /> Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        <ReviewField
          label="Full name"
          value={profile?.display_name ?? ""}
          kind={{ type: "text", placeholder: "Enter your full name", maxLength: 100 }}
          autoEdit={editKey === "name"}
          onSave={(v) => saveField({ display_name: String(v).trim() })}
        />

        <ReviewField
          label="Mobile number"
          value={(profile as { phone_number?: string | null } | null)?.phone_number ?? ""}
          kind={{ type: "text", placeholder: "e.g. 07700 900123", maxLength: 20 }}
          autoEdit={editKey === "phone"}
          onSave={(v) => {
            const trimmed = String(v).trim();
            const digits = trimmed.replace(/\D/g, "");
            if (trimmed && digits.length < 7) {
              toast.error("Enter a valid mobile number");
              throw new Error("invalid phone");
            }
            return saveField({ phone_number: trimmed || null });
          }}
        />

        <ReviewField
          label="Age"
          value={age ?? ""}
          hint={
            profile?.birth_year
              ? `Birth year on file: ${profile.birth_year}`
              : undefined
          }
          kind={{ type: "number", min: 16, max: 100, placeholder: "e.g. 34" }}
          autoEdit={editKey === "age"}
          onSave={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 16 || n > 100) {
              toast.error("Enter an age between 16 and 100");
              throw new Error("invalid age");
            }
            return saveField({
              birth_year: new Date().getFullYear() - n,
            });
          }}
        />

        <ReviewField
          label="Postcode"
          value={profile?.postcode ?? ""}
          kind={{ type: "text", placeholder: "e.g. SW6 3BX", uppercase: true, maxLength: 8 }}
          autoEdit={editKey === "postcode"}
          onSave={async (v) => {
            const pc = String(v).trim().toUpperCase();
            await saveField({ postcode: pc });
          }}
        />
        <HardWaterHint postcode={profile?.postcode} className="-mt-1" />

        <ReviewField
          label="Country"
          value={profile?.country ?? ""}
          kind={{ type: "select", options: COUNTRIES }}
          autoEdit={editKey === "country"}
          onSave={(v) => saveField({ country: String(v) })}
        />

        <ReviewField
          label="Heritage"
          value={(profile?.heritage ?? [])[0] ?? ""}
          hint="Used only to personalise recommendations."
          kind={{ type: "chip-single", options: heritageValues }}
          autoEdit={editKey === "heritage"}
          onSave={(v) => {
            const s = String(v);
            return saveField({ heritage: s ? [s] : [] });
          }}
        />

        {/* Health & medical — same review-first inline-edit pattern */}
        <div className="pt-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-body mb-2">
            Health & medical
          </div>
          <p className="text-[13px] text-muted-foreground leading-snug pb-2">
            These directly shape your STRAND guidance. Edit any field individually.
          </p>
          <HealthFieldsSection />
        </div>
      </div>
    </ScreenLayout>
  );
};

export default PersonalDetailsReview;
