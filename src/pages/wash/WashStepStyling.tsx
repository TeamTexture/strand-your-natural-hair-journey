// Wash Day — Styling step. Captures the style they chose post-wash, the
// products they used to style it, how long it took, this week's stress, an
// optional voicenote (transcribable), and optional photos that can be saved
// as a Style Journal entry on the final review step.
import { smartBack } from "@/lib/smartBack";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import StepProgress from "@/components/nav/StepProgress";
import Eyebrow from "@/components/nav/Eyebrow";
import ChoiceChips, { type Choice } from "@/components/nav/ChoiceChips";
import { ICONS } from "@/lib/iconMap";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import Tag from "@/components/Tag";
import ProductThumb from "@/components/ProductThumb";
import LevelGate from "@/components/tips/LevelGate";

import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import {
  CANONICAL_STYLE_OPTIONS,
  OTHER_STYLE,
  OTHER_STYLE_HELPER,
  TENSION_CHOICES,
  TENSION_HELPER,
  EXTENSION_CHOICES,
  styleCanTakeExtensions,
} from "@/lib/hairstyles";

const PHOTO_BUCKET = "journal-photos";

// Canonical style list — shared with onboarding / the hair profile pickers so
// the two lists can never drift apart (see src/lib/hairstyles.ts).
const STYLE_OPTIONS = CANONICAL_STYLE_OPTIONS;
const DURATION_OPTIONS = ["Under 30 min", "30-60 min", "1-2 hours", "2-4 hours", "4+ hours"];
const STRESS_OPTIONS = ["Low", "Moderate", "High"];

const DURATION_CHOICES: Choice[] = DURATION_OPTIONS.map((v) => ({ value: v, label: v, icon: ICONS.duration }));
const STRESS_CHOICES: Choice[] = STRESS_OPTIONS.map((v) => ({ value: v, label: v, icon: ICONS.stress }));

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
  /** With / without extensions — only asked for styles that can take them. */
  extensions?: boolean | null;
  /** "low" | "medium" | "high" — optional, asked for every style. */
  tension?: string | null;
  /** Typed or transcribed description when the style is "Other". */
  otherNote?: string;
  otherAudioPath?: string | null;
  /**
   * THERMAL STYLING heat (blow dry / flat iron). Deliberately separate from
   * conditioning heat (`heat_treatment` / `steps[].heat`) — snake_case keys,
   * stored as `styling.heat` on the wash day row.
   */
  heat?: StylingHeat;
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
  const [extensions, setExtensions] = useState<boolean | null>(saved.extensions ?? null);
  const [tension, setTension] = useState<string | null>(saved.tension ?? null);
  const [otherNote, setOtherNote] = useState<string>(saved.otherNote ?? "");
  const [otherAudioPath, setOtherAudioPath] = useState<string | null>(saved.otherAudioPath ?? null);
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

  const isOther = style.includes(OTHER_STYLE);
  const asksExtensions = style.some((s) => styleCanTakeExtensions(s));

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
      extensions: asksExtensions ? extensions : null,
      tension,
      otherNote: isOther ? otherNote.trim() : "",
      otherAudioPath: isOther ? otherAudioPath : null,
    };
    localStorage.setItem("strand_wash_styling", JSON.stringify(payload));
    navigate("/wash/step-4");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" onBack={smartBack(navigate, "/wash/step-3")} />
      <div className="px-5 pt-1 pb-3"><StepProgress current={4} total={5} label="Styling" /></div>
      <LevelGate min={2} fallback={<ItalicSub>Log the style and products you used.</ItalicSub>}>
        <ItalicSub>
          Now the styling — what you chose, what you used, and how it sat with you this week.
        </ItalicSub>
      </LevelGate>

      <div className="px-5 pb-10 space-y-5">
        <TG label="Style You Chose" options={STYLE_OPTIONS} value={style} onChange={setStyle} error={submitted && errors.style} />

        {isOther && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground leading-snug">{OTHER_STYLE_HELPER}</p>
            <VoiceNoteField
              label="Describe your style (optional)"
              placeholder="Say it or type it — what style did you go for?"
              value={otherNote}
              onChange={setOtherNote}
              audioPath={otherAudioPath}
              onAudioPathChange={setOtherAudioPath}
              folder="wash-day-style-other"
              rows={3}
            />
          </div>
        )}

        {asksExtensions && (
          <div>
            <Eyebrow className="mb-2">Extensions (optional)</Eyebrow>
            <ChoiceChips
              options={EXTENSION_CHOICES}
              value={extensions === null || extensions === undefined ? null : extensions ? "yes" : "no"}
              columns={2}
              onChange={(v) => setExtensions(extensions === (v === "yes") ? null : v === "yes")}
            />
          </div>
        )}

        {style.length > 0 && (
          <div>
            <Eyebrow className="mb-2">Tension (optional)</Eyebrow>
            <ChoiceChips
              options={TENSION_CHOICES}
              value={tension}
              columns={3}
              onChange={(v) => setTension(tension === v ? null : v)}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">{TENSION_HELPER}</p>
          </div>
        )}

        <div>
          <Eyebrow icon={ICONS.products} className="mb-2">Products Used</Eyebrow>
          {shelfLoading ? (
            <p className="text-xs text-muted-foreground italic">Loading your shelf…</p>
          ) : shelfProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No products on your shelf yet — add some on the Products screen.
            </p>
          ) : (
            <div className="space-y-1.5">
              {shelfProducts.map((p) => {
                const selected = productIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    aria-pressed={selected}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-[12px] border transition-colors text-left",
                      selected
                        ? "bg-primary/10 border-primary/50"
                        : "bg-card border-border hover:bg-muted/40",
                    )}
                  >
                    <ProductThumb
                      imageUrl={p.image_url}
                      storagePath={p.storage_path}
                      alt={p.name}
                      cover
                      wrapperClassName="size-11 rounded-[10px] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium leading-tight truncate">{p.name}</p>
                      {p.brand && (
                        <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "size-5 rounded-full border flex items-center justify-center shrink-0",
                        selected ? "bg-primary border-primary" : "border-border",
                      )}
                      aria-hidden
                    >
                      {selected && <span className="text-primary-foreground text-[11px] leading-none">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>


        <div>
          <div className="flex items-center justify-between mb-2">
            <Eyebrow icon={ICONS.duration} tone={submitted && errors.duration ? "warning" : "gold"}>Styling Duration</Eyebrow>
            <span className={cn("text-[11px] font-medium", submitted && errors.duration ? "text-destructive" : "text-primary")}>*</span>
          </div>
          <div className={cn(submitted && errors.duration && "ring-1 ring-destructive/40 rounded-[12px] p-1.5 -m-1.5")}>
            <ChoiceChips
              options={DURATION_CHOICES}
              value={duration}
              multiple
              columns={2}
              onChange={(v) => setDuration(duration.includes(v) ? duration.filter((x) => x !== v) : [...duration, v])}
            />
          </div>
          {submitted && errors.duration && (
            <p className="mt-1.5 text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" /> Pick at least one
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Eyebrow icon={ICONS.stress} tone={submitted && errors.stress ? "warning" : "gold"}>Stress This Week</Eyebrow>
            <span className={cn("text-[11px] font-medium", submitted && errors.stress ? "text-destructive" : "text-primary")}>*</span>
          </div>
          <div className={cn(submitted && errors.stress && "ring-1 ring-destructive/40 rounded-[12px] p-1.5 -m-1.5")}>
            <ChoiceChips
              options={STRESS_CHOICES}
              value={stress}
              multiple
              columns={3}
              onChange={(v) => setStress(stress.includes(v) ? stress.filter((x) => x !== v) : [...stress, v])}
            />
          </div>
          {submitted && errors.stress && (
            <p className="mt-1.5 text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" /> Pick at least one
            </p>
          )}
        </div>

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
            <Eyebrow icon={Camera}>Style Photos</Eyebrow>
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
