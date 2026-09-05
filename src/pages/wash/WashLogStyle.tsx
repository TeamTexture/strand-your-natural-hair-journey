// PAGE 2 OF 2 — style products, one photo OR video, voicenote, 1–10 rating.
//
// Saves the wash day and returns to the Wash Day page. Favourites are only
// written when she deliberately accepts the one-tap prompt after her first log.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Camera, Video, Plus, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import Eyebrow from "@/components/nav/Eyebrow";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashFavourites, useSaveWashFavourites } from "@/hooks/useWashFavourites";
import { useWashDraftHydration } from "@/hooks/useWashDraftHydration";
import { readWashDraft, writeWashDraft, clearWashDrafts } from "@/lib/washDraft";
import { WASH_LOG_STEPS, localIsoDate } from "@/lib/washLogSteps";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { setPendingStylePrompt } from "@/lib/styleProfilePrompt";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke } from "@/lib/aiInvoke";
import { smartBack } from "@/lib/smartBack";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import StylePicker, { type StyleAttributesValue } from "@/components/style/StylePicker";
import MainPhotoPicker from "@/components/style/MainPhotoPicker";
import { ICONS } from "@/lib/iconMap";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { styleAsksTension, styleAsksExtensions } from "@/lib/hairstyles";
import { saveCurrentStyle, announceStyleChange } from "@/lib/styleChange";


const PHOTO_BUCKET = "journal-photos";
const VIDEO_BUCKET = "journal-videos";

interface StepRow {
  productId: string | null;
  used: boolean;
}

/** 1–10 rating, drawn as ten segments filling in gold. */
const SegmentRating = ({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) => (
  <div>
    <div className="flex items-end gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} out of 10`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className="flex-1 min-h-[44px] flex items-end"
        >
          <span
            className={cn(
              "w-full rounded-[4px] border transition-colors",
              value !== null && n <= value
                ? "bg-primary border-primary"
                : "bg-secondary border-border",
            )}
            style={{ height: 12 + n * 2 }}
          />
        </button>
      ))}
    </div>
    <p className="mt-1.5 text-[11.5px] font-body text-muted-foreground">
      {value ? `${value} out of 10` : "Tap to rate this wash day"}
    </p>
  </div>
);

const WashLogStyleInner = () => {
  const navigate = useNavigate();
  const { user, isViewingAs } = useAuth();
  const { products } = useUserProducts("shelf");
  const { data: favourites } = useWashFavourites();
  const saveFavourites = useSaveWashFavourites();

  const stepsDraft = readWashDraft<{ date?: string; rows?: Record<string, StepRow> }>(
    "strand_wash_log_steps",
    {},
  );
  const saved = readWashDraft<{
    styleProductIds?: string[];
    note?: string;
    audioPath?: string | null;
    mediaPath?: string | null;
    mediaType?: "photo" | "video" | null;
    rating?: number | null;
  }>("strand_wash_log_style", {});

  const [styleProductIds, setStyleProductIds] = useState<string[]>(saved.styleProductIds ?? []);
  const [note, setNote] = useState(saved.note ?? "");
  const [audioPath, setAudioPath] = useState<string | null>(saved.audioPath ?? null);
  const [mediaPath, setMediaPath] = useState<string | null>(saved.mediaPath ?? null);
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(saved.mediaType ?? null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(saved.rating ?? null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favPrompt, setFavPrompt] = useState(false);

  // Her current style, chosen right here — logging the style is the single
  // source of truth, so she never has to go and edit her profile separately.
  const [style, setStyle] = useState<string>("");
  const [originalStyle, setOriginalStyle] = useState<string>("");
  const [styleAttrs, setStyleAttrs] = useState<StyleAttributesValue>({
    tension: null,
    extensions: null,
  });
  const [attrError, setAttrError] = useState(false);
  const [stylePhotoPrompt, setStylePhotoPrompt] = useState(false);
  const afterPhotoPrompt = useRef<null | (() => void)>(null);

  const photoRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);

  // Show her current style as selected by default.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ctx = await loadClinicalContext();
      if (cancelled || !ctx.style) return;
      const row = ctx.style as unknown as Record<string, unknown>;
      const current = (row.current_hairstyle as string | null) ?? "";
      setStyle((prev) => prev || current);
      setOriginalStyle(current);
      setStyleAttrs({
        tension: (row.current_style_tension as string | null) ?? null,
        extensions: (row.current_style_extensions as boolean | null) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  const byId = useMemo(() => {
    const map: Record<string, (typeof products)[number]> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);

  // Keep this screen's slice on the draft as she fills it in.
  useEffect(() => {
    writeWashDraft("strand_wash_log_style", {
      styleProductIds, note, audioPath, mediaPath, mediaType, rating,
    });
  }, [styleProductIds, note, audioPath, mediaPath, mediaType, rating]);

  // Sign whatever media is attached, for the preview.
  useEffect(() => {
    if (!mediaPath || !mediaType) { setMediaUrl(null); return; }
    let cancelled = false;
    (async () => {
      const bucket = mediaType === "video" ? VIDEO_BUCKET : PHOTO_BUCKET;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(mediaPath, 3600);
      if (!cancelled) setMediaUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [mediaPath, mediaType]);

  const pickMedia = async (file: File | undefined, kind: "photo" | "video") => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const prepared = kind === "photo" ? await convertHeicToJpeg(file).catch(() => file) : file;
      const ext = (prepared.name?.split(".").pop() || (kind === "photo" ? "jpg" : "mp4"))
        .toLowerCase()
        .slice(0, 5);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bucket = kind === "video" ? VIDEO_BUCKET : PHOTO_BUCKET;
      const { error } = await supabase.storage.from(bucket).upload(path, prepared, {
        contentType: prepared.type || (kind === "photo" ? "image/jpeg" : "video/mp4"),
        upsert: false,
      });
      if (error) { toast.error("Upload failed — please try again."); return; }
      setMediaPath(path);
      setMediaType(kind);
      toast.success(kind === "photo" ? "Photo added" : "Video added");
    } finally {
      setUploading(false);
      if (photoRef.current) photoRef.current.value = "";
      if (videoRef.current) videoRef.current.value = "";
    }
  };

  const buildSteps = () => {
    const rows = stepsDraft.rows ?? {};
    return WASH_LOG_STEPS.filter((s) => rows[s.stored]?.used && rows[s.stored]?.productId).map(
      (s) => {
        const id = rows[s.stored]!.productId as string;
        return { name: s.stored, product_id: id, product_name: byId[id]?.name ?? undefined };
      },
    );
  };

  const persist = async (): Promise<string | null> => {
    if (!user) { toast.error("Please sign in to save your wash day."); return null; }
    if (isViewingAs) { toast.error("Cannot save while viewing as a member."); return null; }
    const steps = buildSteps();
    const stepProductIds = steps.map((s) => s.product_id);
    const washDate = stepsDraft.date && /^\d{4}-\d{2}-\d{2}$/.test(stepsDraft.date)
      ? stepsDraft.date
      : localIsoDate();

    const styleNames = styleProductIds.map((id) => byId[id]?.name).filter(Boolean) as string[];

    const payload = {
      user_id: user.id,
      wash_date: washDate,
      steps,
      product_ids: Array.from(new Set([...stepProductIds, ...styleProductIds])),
      hair_feel_note: note.trim() ? note.trim() : null,
      hair_feel_voice_url: audioPath ?? null,
      rating,
      media_path: mediaPath,
      media_type: mediaPath ? mediaType : null,
      styling: {
        productIds: styleProductIds,
        productNames: styleNames,
        ...(mediaPath && mediaType === "photo" ? { photoPaths: [mediaPath] } : {}),
        ...(mediaPath && mediaType === "video" ? { videoPath: mediaPath } : {}),
      },
    };

    const { data, error } = await supabase
      .from("wash_days")
      .insert(payload as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    const id = (data as { id?: string } | null)?.id ?? null;

    if (id) {
      setPendingStylePrompt({
        washDayId: id,
        styleAfter: null,
        styleExtensions: null,
        styleTension: null,
      });
      // Grounded wash-day observation, written in the background so saving is
      // never held open by a model call.
      void (async () => {
        try {
          const context = await buildAiContext();
          const { data: obs } = await aiInvoke<{ observation?: string }>(
            "wash-day-observation",
            {
              steps: { steps },
              results: { styling: payload.styling, rating },
              hairFeelNote: note.trim(),
              context,
            },
          );
          if (obs?.observation) {
            await supabase.from("wash_days").update({ ai_insight: obs.observation }).eq("id", id);
          }
        } catch {
          /* the log is saved either way */
        }
      })();
    }
    return id;
  };

  const finish = () => {
    localStorage.setItem("strand_last_wash_date", new Date().toISOString());
    clearWashDrafts();
    window.dispatchEvent(new Event("strand:data-changed"));
    toast("💧 Wash day saved!");
    navigate("/wash-day");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const id = await persist();
      if (!id) return;
      const hasFavourites = Object.keys(favourites ?? {}).length > 0;
      const hasPicks = buildSteps().length > 0;
      if (!hasFavourites && hasPicks) {
        setFavPrompt(true);
        return;
      }
      finish();
    } catch (e) {
      console.error("wash_days insert failed", e);
      toast.error(e instanceof Error ? e.message : "Could not save wash day");
    } finally {
      setSaving(false);
    }
  };

  const acceptFavourites = async () => {
    const rows = stepsDraft.rows ?? {};
    const map: Record<string, string | null> = {};
    for (const step of WASH_LOG_STEPS) {
      const row = rows[step.stored];
      if (row?.used && row.productId) map[step.stored] = row.productId;
    }
    try {
      await saveFavourites.mutateAsync(map);
      toast.success("Saved as your Wash Day Favourites");
    } catch {
      toast.error("Wash day saved — favourites could not be saved");
    }
    setFavPrompt(false);
    finish();
  };

  return (
    <ScreenLayout>
      <TitleBar title="Your style" onBack={smartBack(navigate, "/wash/log")} />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard>
          <Eyebrow icon={Plus}>Style products used</Eyebrow>
          <div className="mt-2 space-y-2">
            {styleProductIds.length === 0 && (
              <p className="font-body text-[12.5px] text-muted-foreground">
                Nothing added yet.
              </p>
            )}
            {styleProductIds.map((id) => {
              const p = byId[id];
              return (
                <div key={id} className="flex items-center gap-3">
                  <ProductThumb
                    imageUrl={p?.image_url ?? null}
                    storagePath={p?.storage_path ?? null}
                    alt={p?.name ?? "Product"}
                    cover
                    wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                  />
                  <Link
                    to={`/products/profile/${id}`}
                    className="flex-1 min-w-0 product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2"
                  >
                    {p?.name ?? "Product"}
                  </Link>
                  <button
                    type="button"
                    aria-label="Remove product"
                    onClick={() => setStyleProductIds((prev) => prev.filter((x) => x !== id))}
                    className="size-8 rounded-full border border-border flex items-center justify-center shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-3 text-[11.5px] uppercase tracking-[0.14em] text-primary font-medium min-h-[36px]"
          >
            + Add from your shelf
          </button>
        </SurfaceCard>

        <SurfaceCard>
          <Eyebrow icon={Camera}>Photo or video</Eyebrow>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => photoRef.current?.click()}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-primary/30 bg-primary/10 text-primary text-[12px] font-medium disabled:opacity-60"
            >
              <Camera className="size-3.5" /> Photo
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => videoRef.current?.click()}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-primary/30 bg-primary/10 text-primary text-[12px] font-medium disabled:opacity-60"
            >
              <Video className="size-3.5" /> Video
            </button>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickMedia(e.target.files?.[0], "photo")}
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void pickMedia(e.target.files?.[0], "video")}
          />
          {mediaPath && (
            <div className="mt-3 relative rounded-[10px] overflow-hidden border border-border bg-muted">
              {mediaType === "video" ? (
                mediaUrl && <video src={mediaUrl} controls className="w-full" />
              ) : (
                mediaUrl && <img src={mediaUrl} alt="This wash day" className="w-full" />
              )}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => { setMediaPath(null); setMediaType(null); }}
                className="absolute top-1.5 right-1.5 size-7 rounded-full bg-background/85 border border-border flex items-center justify-center"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {uploading && (
            <p className="mt-2 text-[11.5px] font-body text-muted-foreground">Uploading…</p>
          )}
        </SurfaceCard>

        <VoiceNoteField
          label="How it went"
          placeholder="How did your hair feel today?"
          value={note}
          onChange={setNote}
          audioPath={audioPath}
          onAudioPathChange={setAudioPath}
          folder="wash-day"
          rows={4}
        />

        <SurfaceCard>
          <Eyebrow icon={Camera}>Rate this wash day</Eyebrow>
          <div className="mt-2">
            <SegmentRating value={rating} onChange={setRating} />
          </div>
        </SurfaceCard>

        {isViewingAs && (
          <p className="text-center font-body text-[11.5px] text-muted-foreground">
            Cannot save while viewing as a member.
          </p>
        )}

        <Button
          variant="gold"
          size="pill"
          className="mt-2"
          onClick={save}
          disabled={saving || isViewingAs}
        >
          {saving ? "Saving…" : "Save wash day"}
        </Button>
      </div>

      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={styleProductIds}
        onToggle={(id) =>
          setStyleProductIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
          )
        }
      />

      <Dialog open={favPrompt} onOpenChange={(o) => { if (!o) { setFavPrompt(false); finish(); } }}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Save these as your Wash Day Favourites?
            </DialogTitle>
            <DialogDescription className="font-body text-[13px] leading-snug">
              Every wash day will pre-fill with these products. You can change them
              any time, and past logs always keep what you actually used.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <Button variant="gold" size="pill" onClick={acceptFavourites}>
              Save favourites
            </Button>
            <Button
              variant="goldGhost"
              size="pill"
              onClick={() => { setFavPrompt(false); finish(); }}
            >
              Not now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

const WashLogStyle = () => {
  const { ready } = useWashDraftHydration();
  if (!ready) return <LoadingDot />;
  return <WashLogStyleInner />;
};

export default WashLogStyle;
