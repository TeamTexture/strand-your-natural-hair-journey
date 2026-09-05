import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, ArrowUp, ArrowDown, Trash2, ImagePlus, X, Package, ChevronRight, Wrench, Check, Film, Mic, Images } from "lucide-react";
import { captureVideoPoster } from "@/lib/videoPoster";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import VoiceNoteField from "@/components/VoiceNoteField";
import VoiceNotePlayerRow from "@/components/voice/VoiceNotePlayerRow";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import ToolPickerSheet from "@/components/ToolPickerSheet";
import ProductThumb from "@/components/ProductThumb";
import StepVideoCapture from "@/components/journal/StepVideoCapture";
import MatchStars from "@/components/MatchStars";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useStepLinkScan } from "@/hooks/useStepLinkScan";
import { useUserTools } from "@/hooks/useUserTools";

import type { JournalStep } from "@/hooks/useJournalSteps";

import TranscriptView from "@/components/voice/TranscriptView";

// Set when transcription is refused (e.g. AI credit limit) so background
// auto-transcription stops instead of retrying on every step render.
let transcriptionPaused = false;

const PHOTO_BUCKET = "journal-photos";
const VIDEO_BUCKET = "journal-videos";

/** Voice note transcript — a readable preview, expandable into paragraphs. */
const TranscriptBody = ({ text }: { text: string }) =>
  text.trim() ? <TranscriptView text={text} /> : null;

/** A square capture action — quiet until touched, so four of them read as one
 *  considered panel rather than a stack of shouting buttons. */
const CaptureTile = ({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: typeof Package;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center gap-1.5 rounded-[14px] border px-2 py-3 transition-colors disabled:opacity-50 ${
      active
        ? "border-primary/50 bg-primary/10"
        : "border-border/70 bg-secondary/30 hover:bg-secondary/60"
    }`}
  >
    <span className="size-8 rounded-full bg-primary/12 flex items-center justify-center">
      <Icon className="size-4 text-primary" />
    </span>
    <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {label}
    </span>
  </button>
);

/** Small section heading used inside a step. */
const StepSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </p>
    {children}
  </div>
);



interface Props {
  step: JournalStep;
  index: number;
  total: number;
  editing: boolean;
  onUpdate: (patch: Partial<Pick<JournalStep, "note" | "voice_path" | "voice_transcript">>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  onAddMedia: (media: {
    kind: "photo" | "video";
    storage_path: string;
    poster_path?: string | null;
    duration_seconds?: number | null;
  }) => void;
  onRemoveMedia: (mediaId: string) => void;
  onToggleProduct: (userProductId: string) => void;
  onToggleTool: (userToolId: string) => void;
  /** Called after a background link scan attaches a product to this step. */
  onProductsChanged?: () => void;
  /** Reports this step's unsaved note text (null when nothing is pending). */
  onDraftChange?: (stepId: string, draft: string | null) => void;
  /** Bumping this discards any unsaved note text. */
  discardSignal?: number;
  /** When provided, the step collapses to a one-line summary. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}



/**
 * One step of a style record — the note (typed or spoken), its photos and
 * videos, and the products used at that point in the process.
 */
const JournalStepCard = ({
  step,
  index,
  total,
  editing,
  onUpdate,
  onDelete,
  onMove,
  onAddMedia,
  onRemoveMedia,
  onToggleProduct,
  onToggleTool,
  onProductsChanged,
  onDraftChange,
  discardSignal = 0,
  expanded,
  onToggleExpand,
}: Props) => {
  const collapsible = typeof expanded === "boolean" && !!onToggleExpand;
  const isOpen = collapsible ? expanded : true;
  const { user } = useAuth();
  const { startStepLinkScan } = useStepLinkScan();
  const { tools: toolCatalogue, reload: reloadTools } = useUserTools();


  // The note is a DRAFT until saved. Media, products, tools and voice notes
  // still commit immediately — only typed text can be lost.
  const [noteDraft, setNoteDraft] = useState(step.note ?? "");
  useEffect(() => { setNoteDraft(step.note ?? ""); }, [step.id, step.note, discardSignal]);
  const noteDirty = noteDraft !== (step.note ?? "");
  useEffect(() => {
    onDraftChange?.(step.id, noteDirty ? noteDraft : null);
  }, [step.id, noteDirty, noteDraft, onDraftChange]);
  useEffect(() => () => onDraftChange?.(step.id, null), [step.id, onDraftChange]);


  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const selectedToolIds = step.tools
    .map((t) => t.user_tool_id)
    .filter((x): x is string => !!x);


  const [urls, setUrls] = useState<Record<string, string>>({});
  const [posters, setPosters] = useState<Record<string, string>>({});

  const [photoBusy, setPhotoBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Tag the URL with this step while its picker is open, so a product added by
  // pasting a link (which navigates away through the shelf add-by-link flow and
  // comes back) lands on this step rather than the entry.
  const openPicker = () => {
    navigate(`${location.pathname}?addToStep=${step.id}`, { replace: true });
    setPickerOpen(true);
  };
  const closePicker = (open: boolean) => {
    setPickerOpen(open);
    if (!open && location.search.includes("addToStep")) {
      navigate(location.pathname, { replace: true });
    }
  };
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Resolve attached products against the member's WHOLE product list, not
  // just shelf + wishlist — a product scanned inside a style step may sit
  // off-shelf, and it should still render with its name, image and rating.
  const { allProducts: catalogue } = useUserProducts("all");


  const selectedIds = step.products
    .map((p) => p.user_product_id)
    .filter((v): v is string => !!v);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      const nextPosters: Record<string, string> = {};
      for (const m of step.media) {
        const bucket = m.kind === "photo" ? PHOTO_BUCKET : VIDEO_BUCKET;
        const { data } = await supabase.storage.from(bucket).createSignedUrl(m.storage_path, 3600);
        if (data?.signedUrl) next[m.id] = data.signedUrl;
        if (m.kind === "video" && m.poster_path) {
          const { data: pd } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(m.poster_path, 3600);
          if (pd?.signedUrl) nextPosters[m.id] = pd.signedUrl;
        }
      }
      if (!alive) return;
      setUrls(next);
      setPosters(nextPosters);

      // Heal older clips saved before covers existed: capture a frame now,
      // store it, and keep it for next time.
      if (!user) return;
      for (const m of step.media) {
        if (m.kind !== "video" || m.poster_path || !next[m.id]) continue;
        const blob = await captureVideoPoster(next[m.id]);
        if (!blob || !alive) continue;
        const path = `${user.id}/steps/${step.id}/posters/${m.id}.jpg`;
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (error) continue;
        await supabase.from("journal_step_media").update({ poster_path: path }).eq("id", m.id);
        const { data: pd } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
        if (pd?.signedUrl && alive) {
          setPosters((prev) => ({ ...prev, [m.id]: pd.signedUrl }));
        }
      }
    })();
    return () => { alive = false; };
  }, [step.media, step.id, user]);

  // Signed playback URL for the read-only view of a recorded note.
  const [readVoiceUrl, setReadVoiceUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!step.voice_path) { setReadVoiceUrl(null); return; }
      const { data } = await supabase.storage
        .from("voicenotes")
        .createSignedUrl(step.voice_path, 3600);
      if (alive) setReadVoiceUrl(data?.signedUrl ?? null);
    })();
    return () => { alive = false; };
  }, [step.voice_path]);

  // Older voice notes saved before auto-transcription: transcribe once, silently.
  const autoTranscribed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const path = step.voice_path;
    // Credits exhausted earlier in this session — don't retry (and don't error).
    if (transcriptionPaused) return;
    if (!path || (step.voice_transcript ?? "").trim()) return;
    if (autoTranscribed.current.has(path)) return;
    autoTranscribed.current.add(path);
    let alive = true;
    (async () => {
      const { data: signed } = await supabase.storage
        .from("voicenotes")
        .createSignedUrl(path, 3600);
      if (!signed?.signedUrl || !alive) return;
      const blob = await (await fetch(signed.signedUrl)).blob();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(((r.result as string) || "").split(",")[1] ?? "");
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64, mimeType: blob.type || "audio/webm" },
      });
      if (error || (data as { paused?: boolean } | null)?.paused) {
        // Credit limit / provider failure: stay quiet, the member can retry
        // manually from the voice-note field once credits are restored.
        transcriptionPaused = true;
        return;
      }
      const text = (data?.text ?? "").toString().trim();
      if (text && alive) onUpdate({ voice_transcript: text });
    })().catch((e) => console.warn("auto transcribe failed", e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.voice_path, step.voice_transcript]);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setPhotoBusy(true);
    try {
      for (const raw of Array.from(files)) {
        const file = await convertHeicToJpeg(raw);
        const path = `${user.id}/steps/${step.id}/${uuid()}.jpg`;
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (error) throw error;
        onAddMedia({ kind: "photo", storage_path: path });
      }
    } catch (e) {
      console.error("step photo upload failed", e);
      toast.error("Couldn't upload that photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  // Collapsed-card thumbnail: the first photo, else the first video's cover frame.
  const coverMedia =
    step.media.find((m) => m.kind === "photo" && urls[m.id]) ??
    step.media.find((m) => m.kind === "video" && posters[m.id]) ??
    null;
  const coverUrl = coverMedia
    ? coverMedia.kind === "photo"
      ? urls[coverMedia.id]
      : posters[coverMedia.id]
    : null;

  const mediaCount = step.media.length;
  const photoCount = step.media.filter((m) => m.kind === "photo").length;
  const videoCount = mediaCount - photoCount;
  const summaryChips = [
    photoCount ? { icon: Images, label: `${photoCount} photo${photoCount === 1 ? "" : "s"}` } : null,
    videoCount ? { icon: Film, label: `${videoCount} video${videoCount === 1 ? "" : "s"}` } : null,
    step.voice_path || step.voice_transcript?.trim()
      ? { icon: Mic, label: step.voice_transcript?.trim() ? "Voice note transcribed" : "Voice note" }
      : null,
    selectedIds.length ? { icon: Package, label: `${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"}` } : null,
    selectedToolIds.length ? { icon: Wrench, label: `${selectedToolIds.length} tool${selectedToolIds.length === 1 ? "" : "s"}` } : null,
  ].filter(Boolean) as { icon: typeof Package; label: string }[];
  const notePreview = (step.note ?? "").trim() || (step.voice_transcript ?? "").trim();
  const isEmpty = !notePreview && mediaCount === 0 && !step.voice_path && !selectedIds.length && !selectedToolIds.length;

  const mediaGrid = mediaCount > 0 && (
    <div className="grid grid-cols-3 gap-1.5">
      {step.media.map((m) => (
        <div
          key={m.id}
          className="relative rounded-[12px] overflow-hidden bg-secondary aspect-square ring-1 ring-border/60"
        >
          {m.kind === "photo" ? (
            urls[m.id] ? (
              <img src={urls[m.id]} alt={`Step ${index + 1} photo`} className="size-full object-cover" />
            ) : null
          ) : urls[m.id] ? (
            <video
              src={urls[m.id]}
              poster={posters[m.id]}
              controls
              playsInline
              preload="metadata"
              className="size-full object-cover bg-black"
            />
          ) : null}
          {m.kind === "video" && (
            <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-pill bg-background/85 px-1.5 py-0.5 text-[9px] font-medium tabular-nums">
              <Film className="size-2.5" />
              {m.duration_seconds ? `${m.duration_seconds}s` : "Clip"}
            </span>
          )}
          {editing && (
            <button
              type="button"
              aria-label="Remove media"
              onClick={() => onRemoveMedia(m.id)}
              className="absolute top-1 right-1 size-5 rounded-full bg-background/90 flex items-center justify-center shadow-sm"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const productRows = selectedIds.length > 0 && (
    <div className="space-y-1.5">
      {selectedIds.map((pid) => {
        const p = catalogue.find((c) => c.id === pid);
        return (
          <div
            key={pid}
            className="flex items-center gap-2 rounded-[12px] border border-border/60 bg-secondary/25 p-1.5"
          >
            <button
              type="button"
              onClick={() =>
                navigate(`/products/profile/${pid}`, {
                  state: { returnTo: location.pathname + location.search },
                })
              }
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
              aria-label={`Open ${p?.name ?? "product"} page`}
            >
              <ProductThumb
                imageUrl={p?.image_url ?? null}
                storagePath={p?.storage_path ?? null}
                alt={p?.name ?? "Product"}
                brand={p?.brand ?? null}
                name={p?.name ?? null}
                cover
                wrapperClassName="size-10 rounded-[9px] overflow-hidden bg-card shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug break-words">{p?.name ?? "Product"}</p>
                <div className="flex items-center gap-1.5 min-w-0">
                  {p?.brand && <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>}
                  <MatchStars item={p ?? null} size="sm" showValue={false} />

                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
            {editing && (
              <button
                type="button"
                aria-label="Remove product"
                onClick={() => onToggleProduct(pid)}
                className="size-6 rounded-full border border-border bg-card flex items-center justify-center shrink-0"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const toolRows = selectedToolIds.length > 0 && (
    <div className="space-y-1.5">
      {selectedToolIds.map((tid) => {
        const t = toolCatalogue.find((c) => c.id === tid);
        return (
          <div
            key={tid}
            className="flex items-center gap-2 rounded-[12px] border border-border/60 bg-secondary/25 p-1.5"
          >
            <button
              type="button"
              onClick={() => navigate(`/tools/${tid}`, { state: { from: window.location.pathname } })}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
            >
              <ProductThumb
                imageUrl={t?.image_url ?? null}
                storagePath={t?.storage_path ?? null}
                alt={t?.name ?? "Tool"}
                brand={t?.brand ?? null}
                name={t?.name ?? null}
                cover
                wrapperClassName="size-10 rounded-[9px] overflow-hidden bg-card shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug break-words">{t?.name ?? "Tool"}</p>
                <div className="flex items-center gap-1.5 min-w-0">
                  {t?.brand && <p className="text-[11px] text-muted-foreground truncate">{t.brand}</p>}
                  <MatchStars item={t ?? null} size="sm" showValue={false} />

                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
            {editing && (
              <button
                type="button"
                aria-label="Remove tool"
                onClick={() => onToggleTool(tid)}
                className="size-6 rounded-full border border-border bg-card flex items-center justify-center shrink-0"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className={`rounded-[18px] border bg-card overflow-hidden transition-shadow ${
        isOpen ? "border-primary/25 shadow-[0_8px_24px_-16px_hsl(var(--foreground)/0.28)]" : "border-border/70"
      }`}
    >
      {/* ── Step header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-3.5 pt-3.5">
        <span
          className={`size-8 shrink-0 rounded-full flex items-center justify-center font-display text-sm font-bold ${
            isOpen ? "bg-primary text-primary-foreground" : "bg-primary/12 text-primary"
          }`}
        >
          {index + 1}
        </span>
        {!isOpen && coverUrl && (
          <img
            src={coverUrl}
            alt={`Step ${index + 1} preview`}
            className="size-12 shrink-0 rounded-[10px] object-cover ring-1 ring-border/60"
          />
        )}
        {collapsible ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="min-w-0 flex-1 text-left"
            aria-expanded={isOpen}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Step {index + 1}
            </span>
            {!isOpen && (
              <p
                className={`text-[13px] leading-relaxed line-clamp-2 mt-0.5 ${
                  notePreview ? "" : "text-muted-foreground italic"
                }`}
              >
                {notePreview || (isEmpty ? "Nothing recorded yet — tap to add" : "No note yet")}
              </p>
            )}
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Step {index + 1}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {editing && isOpen && (
            <>
              {/* Reorder: grouped segmented control, clearly separate from collapse */}
              <div className="flex items-center rounded-md border border-border bg-muted/40 overflow-hidden">
                <button
                  type="button"
                  aria-label="Move step up"
                  title="Move step up"
                  disabled={index === 0}
                  onClick={() => onMove("up")}
                  className="h-7 w-7 flex items-center justify-center disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <span className="h-4 w-px bg-border" aria-hidden />
                <button
                  type="button"
                  aria-label="Move step down"
                  title="Move step down"
                  disabled={index === total - 1}
                  onClick={() => onMove("down")}
                  className="h-7 w-7 flex items-center justify-center disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                aria-label="Delete step"
                title="Delete step"
                onClick={onDelete}
                className="size-7 rounded-full border border-border flex items-center justify-center text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
          {collapsible && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={isOpen ? "Collapse step" : "Expand step"}
              title={isOpen ? "Collapse step" : "Expand step"}
              className="h-7 rounded-full border border-border bg-background px-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              {isOpen ? "Close" : "Open"}
              {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Collapsed summary ───────────────────────────────────── */}
      {!isOpen && (summaryChips.length > 0 || noteDirty) && (
        <div className="px-3.5 pt-2 pb-3.5 flex flex-wrap gap-1.5 pl-[58px]">
          {summaryChips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-pill bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              <c.icon className="size-2.5" />
              {c.label}
            </span>
          ))}
          {noteDirty && (
            <span className="inline-flex items-center rounded-pill bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
              Unsaved note
            </span>
          )}
        </div>
      )}
      {!isOpen && summaryChips.length === 0 && !noteDirty && <div className="pb-3.5" />}

      {/* ── Open body ───────────────────────────────────────────── */}
      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-3 space-y-3.5">
          <div className="h-px bg-border/70" />

          {editing ? (
            <>
              <VoiceNoteField
                label="Short note"
                placeholder="Cleansed, blow dried on cool, sealed the ends…"
                value={noteDraft}
                onChange={setNoteDraft}
                audioPath={step.voice_path}
                onAudioPathChange={(path) => onUpdate({ voice_path: path })}
                onTranscript={(text) => onUpdate({ voice_transcript: text })}
                folder={`journal-steps/${step.id}`}
                rows={3}
                autoTranscribe
              />
              {noteDirty && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    className="flex-1"
                    onClick={() => onUpdate({ note: noteDraft })}
                  >
                    Save note
                  </Button>
                  <Button
                    type="button"
                    variant="goldGhost"
                    size="sm"
                    onClick={() => setNoteDraft(step.note ?? "")}
                  >
                    Discard
                  </Button>
                </div>
              )}

              {step.voice_transcript?.trim() && (
                <div className="rounded-[12px] border border-border/60 bg-secondary/35 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                    <Mic className="size-3 text-primary" /> Transcript
                  </p>
                  <TranscriptBody text={step.voice_transcript} />
                  <button
                    type="button"
                    onClick={() => onUpdate({ voice_transcript: null })}
                    className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-warn"
                  >
                    Remove transcript
                  </button>
                </div>
              )}

              {mediaGrid && <StepSection label="Photos & video">{mediaGrid}</StepSection>}
              {productRows && <StepSection label="Products used">{productRows}</StepSection>}
              {toolRows && <StepSection label="Tools used">{toolRows}</StepSection>}

              {/* Capture panel — four quiet tiles instead of a stack of buttons */}
              <div className="rounded-[14px] border border-border/60 bg-secondary/15 p-2.5 space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Add to this step
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <CaptureTile
                    icon={ImagePlus}
                    label={photoBusy ? "…" : "Photos"}
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                  />
                  <CaptureTile
                    icon={Film}
                    label="Video"
                    active={videoOpen}
                    onClick={() => setVideoOpen((v) => !v)}
                  />
                  <CaptureTile icon={Package} label="Products" onClick={openPicker} />
                  <CaptureTile icon={Wrench} label="Tools" onClick={() => setToolPickerOpen(true)} />
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addPhotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                {videoOpen && (
                  <div className="rounded-[12px] border border-border/60 bg-card p-2.5">
                    <StepVideoCapture
                      folder={`steps/${step.id}`}
                      onUploaded={(m) => {
                        onAddMedia({
                          kind: "video",
                          storage_path: m.storage_path,
                          poster_path: m.poster_path,
                          duration_seconds: m.duration_seconds,
                        });
                        setVideoOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>

              {collapsible && (
                <div className="space-y-2">
                  {noteDirty && (
                    <p className="text-[11px] font-body text-destructive text-center">
                      Unsaved changes — save them or discard.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="gold"
                    size="pill"
                    className="w-full"
                    onClick={() => {
                      if (noteDirty) onUpdate({ note: noteDraft });
                      onToggleExpand?.();
                    }}
                  >
                    <Check className="size-4 mr-1.5" />
                    Save step {index + 1}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="pill"
                    className={`w-full ${
                      noteDirty
                        ? "border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        : ""
                    }`}
                    disabled={!noteDirty}
                    onClick={() => {
                      setNoteDraft(step.note ?? "");
                      onDraftChange?.(step.id, null);
                      onToggleExpand?.();
                    }}
                  >
                    <X className="size-4 mr-1.5" />
                    Discard changes
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {step.note?.trim() ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{step.note}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No note for this step.</p>
              )}
              {(step.voice_path || step.voice_transcript?.trim()) && (
                <div className="rounded-[12px] border border-border/60 bg-secondary/35 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                    <Mic className="size-3 text-primary" /> Voice note
                  </p>
                  {readVoiceUrl && <VoiceNotePlayerRow url={readVoiceUrl} mediaName="voice note" />}
                  {step.voice_transcript?.trim() && (
                    <TranscriptBody text={step.voice_transcript} />
                  )}
                </div>
              )}
              {mediaGrid && <StepSection label="Photos & video">{mediaGrid}</StepSection>}
              {productRows && <StepSection label="Products used">{productRows}</StepSection>}
              {toolRows && <StepSection label="Tools used">{toolRows}</StepSection>}
            </>
          )}
        </div>
      )}



      <ToolPickerSheet
        open={toolPickerOpen}
        onOpenChange={setToolPickerOpen}
        selectedIds={selectedToolIds}
        onToggle={onToggleTool}
        onToolsChanged={() => void reloadTools()}
      />


      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={closePicker}
        selectedIds={selectedIds}
        onToggle={onToggleProduct}
        onLinkSubmit={(url) =>
          void startStepLinkScan(url, {
            entryId: step.entry_id,
            stepId: step.id,
            stepNumber: index + 1,
            onAttached: onProductsChanged,
          })
        }
        linkHint="We'll analyse it in the background — you can leave this screen and it'll appear on this step once it's done."
      />

    </div>
  );
};

export default JournalStepCard;
