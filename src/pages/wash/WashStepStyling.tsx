// Wash Day — Styling step. Captures the style they chose post-wash, the
// products they used to style it, how long it took, this week's stress, an
// optional voicenote (transcribable), and optional photos that can be saved
// as a Style Journal entry on the final review step.
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import Tag from "@/components/Tag";
import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";
import { convertHeicToJpeg } from "@/lib/imagePrep";

const PHOTO_BUCKET = "journal-photos";

const STYLE_OPTIONS = [
  "Wash and go", "Twist-out", "Braid-out", "Finger comb coils",
  "Loose afro", "Back into braids", "Silk press", "Wig / unit", "Protective style",
];
const DURATION_OPTIONS = ["Under 30 min", "30-60 min", "1-2 hours", "2-4 hours", "4+ hours"];
const STRESS_OPTIONS = ["Low", "Moderate", "High"];

const TG = ({
  label, options, value, onChange, error = false,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (n: string[]) => void;
  error?: boolean;
}) => (
  <div>
    <div className="text-[11px] uppercase tracking-[0.18em] font-body mb-2 flex items-center gap-1.5">
      <span className={cn(error ? "text-destructive" : "text-muted-foreground")}>{label}</span>
      <span className={cn(error ? "text-destructive" : "text-primary")}>*</span>
    </div>
    <div className={cn("flex flex-wrap gap-2", error && "ring-1 ring-destructive/40 rounded-[10px] p-1.5 -m-1.5")}>
      {options.map((o) => (
        <Tag
          key={o}
          selected={value.includes(o)}
          onClick={() => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])}
        >
          {o}
        </Tag>
      ))}
    </div>
    {error && (
      <p className="mt-1.5 text-[11px] text-destructive flex items-center gap-1">
        <AlertCircle className="size-3" /> Pick at least one
      </p>
    )}
  </div>
);

interface StylingSaved {
  style?: string[];
  productIds?: string[];
  productNames?: string[];
  duration?: string[];
  stress?: string[];
  note?: string;
  audioPath?: string | null;
  photoPaths?: string[];
  saveAsJournal?: boolean;
}

const safeParse = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};

const WashStepStyling = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products: shelfProducts, loading: shelfLoading } = useUserProducts("shelf");

  const saved = useMemo(() => safeParse<StylingSaved>("strand_wash_styling", {}), []);
  const [style, setStyle] = useState<string[]>(saved.style ?? []);
  const [productIds, setProductIds] = useState<string[]>(saved.productIds ?? []);
  const [duration, setDuration] = useState<string[]>(saved.duration ?? []);
  const [stress, setStress] = useState<string[]>(saved.stress ?? []);
  const [note, setNote] = useState<string>(saved.note ?? "");
  const [audioPath, setAudioPath] = useState<string | null>(saved.audioPath ?? null);
  const [photoPaths, setPhotoPaths] = useState<string[]>(saved.photoPaths ?? []);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [saveAsJournal, setSaveAsJournal] = useState<boolean>(saved.saveAsJournal ?? true);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Sign any photos already on this draft for preview thumbs.
  useMemo(() => {
    if (photoPaths.length === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photoPaths) {
        if (photoUrls[p]) { next[p] = photoUrls[p]; continue; }
        const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 3600);
        if (data?.signedUrl) next[p] = data.signedUrl;
      }
      setPhotoUrls((prev) => ({ ...prev, ...next }));
    })();
  }, [photoPaths]);

  const toggleProduct = (id: string) => {
    setProductIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const handlePick = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const uploadedPaths: string[] = [];
      const uploadedUrls: Record<string, string> = {};
      for (const raw of Array.from(files)) {
        const file = await convertHeicToJpeg(raw).catch(() => raw);
        const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (error) { toast.error(`${file.name}: upload failed`); continue; }
        uploadedPaths.push(path);
        const { data: sig } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
        if (sig?.signedUrl) uploadedUrls[path] = sig.signedUrl;
      }
      if (uploadedPaths.length) {
        setPhotoPaths((prev) => [...prev, ...uploadedPaths]);
        setPhotoUrls((prev) => ({ ...prev, ...uploadedUrls }));
        toast.success(uploadedPaths.length === 1 ? "Photo added" : `${uploadedPaths.length} photos added`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async (path: string) => {
    setPhotoPaths((prev) => prev.filter((p) => p !== path));
    await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
  };

  const errors = {
    style: style.length === 0,
    duration: duration.length === 0,
    stress: stress.length === 0,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleNext = () => {
    if (hasErrors) {
      setSubmitted(true);
      toast.error("Pick a style, duration, and stress level");
      return;
    }
    const productNames = productIds
      .map((id) => shelfProducts.find((p) => p.id === id)?.name)
      .filter((n): n is string => !!n);
    const payload: StylingSaved = {
      style, productIds, productNames, duration, stress,
      note, audioPath, photoPaths, saveAsJournal,
    };
    localStorage.setItem("strand_wash_styling", JSON.stringify(payload));
    navigate("/wash/step-4");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>4 of 5</span>} onBack={() => navigate("/wash/step-3")} />
      <ProgressDots total={5} current={4} />
      <ItalicSub>
        Now the styling — what you chose, what you used, and how it sat with you this week.
      </ItalicSub>

      <div className="px-5 pb-10 space-y-5">
        <TG label="Style You Chose" options={STYLE_OPTIONS} value={style} onChange={setStyle} error={submitted && errors.style} />

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-body mb-2 text-muted-foreground">
            Products Used
          </div>
          {shelfLoading ? (
            <p className="text-xs text-muted-foreground italic">Loading your shelf…</p>
          ) : shelfProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No products on your shelf yet — add some on the Products screen.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shelfProducts.map((p) => (
                <Tag key={p.id} selected={productIds.includes(p.id)} onClick={() => toggleProduct(p.id)}>
                  {p.name}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <TG label="Styling Duration" options={DURATION_OPTIONS} value={duration} onChange={setDuration} error={submitted && errors.duration} />
        <TG label="Stress This Week" options={STRESS_OPTIONS} value={stress} onChange={setStress} error={submitted && errors.stress} />

        <VoiceNoteField
          label="Styling voicenote (optional)"
          placeholder="How did the styling feel? What worked, what didn't…"
          value={note}
          onChange={setNote}
          audioPath={audioPath}
          onAudioPathChange={setAudioPath}
          folder="wash-day-styling"
          rows={4}
        />

        <SurfaceCard>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">
              Style Photos
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium border border-primary/30 transition-colors min-h-[32px] disabled:opacity-60"
            >
              <Camera className="size-3.5" />
              {uploading ? "Uploading…" : "Add photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handlePick(e.target.files)}
            />
          </div>
          {photoPaths.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Capture your finished style — add to journal below to keep a record.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photoPaths.map((path) => (
                <div key={path} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                  {photoUrls[path] && (
                    <img src={photoUrls[path]} alt="Style" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(path)}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 size-6 rounded-full bg-background/85 border border-border flex items-center justify-center"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="min-w-0">
              <p className="text-xs font-medium">Add to Style Journal</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Save these photos + notes as a journal entry to document this style.
              </p>
            </div>
            <Switch checked={saveAsJournal} onCheckedChange={setSaveAsJournal} />
          </div>
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={handleNext}>
          Next — Review & Save →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStepStyling;
