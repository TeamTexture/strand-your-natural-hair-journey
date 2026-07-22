// Optional "before" photos captured at the end of onboarding.
// Users can skip — anything they upload lands in the before-photos bucket
// and is recorded in user_before_photos so future progress screens have a
// baseline to compare against.

import { smartBack } from "@/lib/smartBack";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X, Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { toast } from "sonner";

const MAX_PHOTOS = 4;

interface Item {
  path: string;
  url: string;
}

const ProfileStepPhotos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { upload, sign, uploading } = usePhotoUploader("before-photos");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Load any previously-saved before photos so the user can re-enter this screen.
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_before_photos")
        .select("storage_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ storage_path: string }>;
      const withUrls = await Promise.all(
        rows.map(async (r) => ({ path: r.storage_path, url: (await sign(r.storage_path)) ?? "" })),
      );
      setItems(withUrls.filter((i) => i.url));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, sign]);

  const handlePick = async (file: File | null) => {
    if (!file || !user) return;
    if (items.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos`);
      return;
    }
    const path = await upload(file);
    if (!path) { toast.error("Upload failed"); return; }
    const { error } = await supabase
      .from("user_before_photos")
      .insert({ user_id: user.id, storage_path: path });
    if (error) {
      console.error(error);
      toast.error("Could not save photo");
      return;
    }
    const url = await sign(path);
    if (url) setItems((p) => [...p, { path, url }]);
  };

  const removeItem = async (path: string) => {
    if (!user) return;
    await supabase.from("user_before_photos").delete().eq("user_id", user.id).eq("storage_path", path);
    await supabase.storage.from("before-photos").remove([path]);
    setItems((p) => p.filter((i) => i.path !== path));
  };

  const goNext = () => navigate("/onboarding/strand-summary", { state: { fromOnboarding: true } });

  return (
    <ScreenLayout>
      <TitleBar title="Before Photos" onBack={smartBack(navigate, "/nutrition-plan?onboarding=1")} />
      <ItalicSub>
        Optional. Capture 1–{MAX_PHOTOS} baseline photos so your future progress is real and visible — not guesswork.
      </ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard tone="gold">
          <p className="text-[12px] leading-snug">
            <strong>Good baseline angles:</strong> front, top of head, back, and length when stretched. Natural light helps.
          </p>
        </SurfaceCard>

        <div className="grid grid-cols-2 gap-3">
          {items.map((i) => (
            <div key={i.path} className="relative aspect-square rounded-[14px] overflow-hidden bg-muted">
              <img src={i.url} alt="Before" className="absolute inset-0 size-full object-cover" />
              <button
                type="button"
                onClick={() => removeItem(i.path)}
                aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 size-7 rounded-full bg-background/85 backdrop-blur flex items-center justify-center text-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {items.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-[14px] border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex flex-col items-center justify-center gap-2 text-primary transition-colors"
            >
              {uploading ? (
                <span className="text-[11px]">Uploading…</span>
              ) : items.length === 0 ? (
                <>
                  <Camera className="size-6" />
                  <span className="text-[11px] font-medium">Add first photo</span>
                </>
              ) : (
                <>
                  <Plus className="size-6" />
                  <span className="text-[11px] font-medium">Add another</span>
                </>
              )}
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            void handlePick(f ?? null);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        <div className="space-y-2 pt-2">
          <Button variant="gold" size="pill" onClick={goNext} disabled={loading}>
            {items.length > 0 ? "Continue →" : "Skip for now →"}
          </Button>
          {items.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              You can always add baseline photos later from your Profile.
            </p>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStepPhotos;
