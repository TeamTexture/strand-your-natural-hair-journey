// Progress photos — the member's baseline/progress gallery.
//
// This used to live on the Strand Summary screen. That screen was removed (it
// only restated data the member had already entered), so the photos moved here,
// alongside goals, which is where progress is actually reviewed. The storage
// bucket, the table (user_before_photos) and the grouping behaviour are
// unchanged, so every existing photo still appears.

import { useEffect, useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";

const MAX_PHOTOS = 5;

interface PhotoItem {
  id: string;
  path: string;
  url: string;
  createdAt: string;
}

const ProgressPhotosCard = () => {
  const { user } = useAuth();
  const { upload, sign, uploading } = usePhotoUploader("before-photos");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const pendingNewDay = useRef(true);
  const todayKey = new Date().toISOString().slice(0, 10);

  const loadPhotos = async (uid: string) => {
    const { data } = await supabase
      .from("user_before_photos")
      .select("id, storage_path, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{ id: string; storage_path: string; created_at: string }>;
    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        path: r.storage_path,
        url: (await sign(r.storage_path)) ?? "",
        createdAt: r.created_at,
      })),
    );
    setPhotos(withUrls.filter((p) => p.url));
  };

  useEffect(() => {
    if (!user) return;
    void loadPhotos(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handlePick = async (file: File | null) => {
    if (!file || !user) return;
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos`);
      return;
    }
    const path = await upload(file);
    if (!path) { toast.error("Upload failed"); return; }
    const { data: inserted, error } = await supabase
      .from("user_before_photos")
      .insert({ user_id: user.id, storage_path: path })
      .select("id, storage_path, created_at")
      .single();
    if (error || !inserted) {
      toast.error("Could not save photo");
      return;
    }
    const url = await sign(inserted.storage_path);
    if (url) {
      setPhotos((p) => [
        { id: inserted.id, path: inserted.storage_path, url, createdAt: inserted.created_at },
        ...p,
      ]);
    }
    // Home's hero image reads the newest progress photo — tell it to re-fetch.
    window.dispatchEvent(new Event("strand:style-updated"));
  };

  const removePhoto = async (photo: PhotoItem) => {
    if (!user) return;
    await supabase.from("user_before_photos").delete().eq("id", photo.id).eq("user_id", user.id);
    await supabase.storage.from("before-photos").remove([photo.path]);
    setPhotos((p) => p.filter((i) => i.id !== photo.id));
    window.dispatchEvent(new Event("strand:style-updated"));
  };

  // Group photos by calendar day (YYYY-MM-DD) using createdAt.
  const groups = new Map<string, PhotoItem[]>();
  for (const p of photos) {
    const key = new Date(p.createdAt).toISOString().slice(0, 10);
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  const dayKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium">
          Progress photos
        </p>
        <span className="text-[10px] text-muted-foreground">
          {photos.length}/{MAX_PHOTOS}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        Photos are grouped by day. Tap a day to view or add more; use the new-day button to start a fresh entry.
      </p>

      <div className="space-y-2.5">
        {dayKeys.map((k) => {
          const items = groups.get(k)!;
          const open = openDay === k;
          const label = new Date(items[0].createdAt).toLocaleDateString(undefined, {
            weekday: "short", day: "numeric", month: "short", year: "numeric",
          });
          const firstTime = new Date(items[0].createdAt).toLocaleTimeString(undefined, {
            hour: "numeric", minute: "2-digit",
          });
          const timeRange = items.length > 1
            ? `${items.length} photos · from ${firstTime}`
            : firstTime;
          // Collapsed state shows the first two thumbnails so the day is
          // recognisable at a glance; the rest sit behind "see more".
          const preview = items.slice(0, 2);
          const extra = items.length - preview.length;
          return (
            <div key={k} className="rounded-[14px] overflow-hidden border border-primary/25 bg-primary/10">
              <button
                type="button"
                onClick={() => setOpenDay(open ? null : k)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
              >
                <div className="flex -space-x-2 shrink-0">
                  {preview.map((p) => (
                    <div key={p.id} className="size-11 rounded-[10px] overflow-hidden border-2 border-card bg-muted">
                      <img src={p.url} alt="Progress" className="size-full object-cover" loading="lazy" />
                    </div>
                  ))}
                  {extra > 0 && (
                    <div className="size-11 rounded-[10px] border-2 border-card bg-primary/25 flex items-center justify-center text-[11px] font-semibold text-primary-foreground">
                      +{extra}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13px] font-semibold text-foreground truncate">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{timeRange}</p>
                </div>
                <span className="text-[10px] font-medium text-primary uppercase tracking-[0.12em] shrink-0">
                  {open ? "Hide" : extra > 0 ? `See all ${items.length}` : "View"}
                </span>
              </button>
              {open && (
                <div className="px-3.5 pb-3.5 space-y-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((p) => (
                      <div key={p.id} className="space-y-1">
                        <div className="relative aspect-square rounded-[10px] overflow-hidden bg-muted">
                          <img src={p.url} alt="Progress" className="absolute inset-0 size-full object-cover" loading="lazy" />
                          <button
                            type="button"
                            onClick={() => removePhoto(p)}
                            aria-label="Remove photo"
                            className="absolute top-1 right-1 size-5 rounded-full bg-background/85 flex items-center justify-center text-foreground hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                        <p className="text-[9px] text-muted-foreground text-center">
                          {new Date(p.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                  {canAdd && k === todayKey && (
                    <button
                      type="button"
                      onClick={() => { pendingNewDay.current = false; fileRef.current?.click(); }}
                      disabled={uploading}
                      className="w-full text-[11px] font-medium py-2 rounded-full border border-primary/60 text-primary hover:bg-primary/10 transition-colors"
                    >
                      {uploading ? "Uploading…" : "+ Add more to this day"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {canAdd && (
          <button
            type="button"
            onClick={() => { pendingNewDay.current = true; fileRef.current?.click(); }}
            disabled={uploading}
            className="w-full aspect-[6/1] min-h-[52px] rounded-[14px] border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center justify-center gap-2 text-primary transition-colors"
          >
            {uploading ? (
              <span className="text-[11px]">Uploading…</span>
            ) : (
              <>
                {dayKeys.length === 0 ? <Camera className="size-4" /> : <Plus className="size-4" />}
                <span className="text-[11px] font-medium">
                  {dayKeys.length === 0 ? "Add first progress photo" : "Add photos for a new day"}
                </span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          void handlePick(f ?? null);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
    </SurfaceCard>
  );
};

export default ProgressPhotosCard;
