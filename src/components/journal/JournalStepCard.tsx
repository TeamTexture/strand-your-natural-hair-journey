import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, Trash2, ImagePlus, X, Package, ChevronRight, Wrench, Check } from "lucide-react";
import { captureVideoPoster } from "@/lib/videoPoster";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import VoiceNoteField from "@/components/VoiceNoteField";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import ToolPickerSheet from "@/components/ToolPickerSheet";
import ProductThumb from "@/components/ProductThumb";
import StepVideoCapture from "@/components/journal/StepVideoCapture";
import StarRating from "@/components/StarRating";
import MatchStars from "@/components/MatchStars";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useStepLinkScan } from "@/hooks/useStepLinkScan";
import { useUserTools } from "@/hooks/useUserTools";

import type { JournalStep } from "@/hooks/useJournalSteps";

import { toParagraphs, transcriptPreview } from "@/lib/formatTranscript";

const PHOTO_BUCKET = "journal-photos";
const VIDEO_BUCKET = "journal-videos";

/** Voice note transcript — a readable preview, expandable into paragraphs. */
const TranscriptBody = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  const preview = transcriptPreview(text);
  if (!preview) return null;
  const paragraphs = toParagraphs(text);
  return (
    <div className="space-y-1.5">
      {open ? (
        paragraphs.map((p, i) => (
          <p key={i} className="text-[13px] leading-relaxed">{p}</p>
        ))
      ) : (
        <p className="text-[13px] leading-relaxed">{preview.text}</p>
      )}
      {preview.truncated && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] uppercase tracking-[0.14em] text-primary"
        >
          {open ? "Show less" : `See all — ${preview.words} words`}
        </button>
      )}
    </div>
  );
};


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

  const mediaCount = step.media.length;
  const summaryBits = [
    mediaCount ? `${mediaCount} ${mediaCount === 1 ? "photo/video" : "photos & videos"}` : null,
    selectedIds.length ? `${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"}` : null,
    selectedToolIds.length ? `${selectedToolIds.length} tool${selectedToolIds.length === 1 ? "" : "s"}` : null,
    step.voice_path ? "voice note" : null,
  ].filter(Boolean) as string[];
  const notePreview = (step.note ?? "").trim() || (step.voice_transcript ?? "").trim();


  return (
    <div className="rounded-[14px] border border-border bg-card p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            aria-expanded={isOpen}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Step {index + 1}
            </span>
            {isOpen ? (
              <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
            )}
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Step {index + 1}
          </span>
        )}
        {editing && isOpen && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Move step up"
              disabled={index === 0}
              onClick={() => onMove("up")}
              className="size-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move step down"
              disabled={index === total - 1}
              onClick={() => onMove("down")}
              className="size-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"
            >
              <ChevronDown className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete step"
              onClick={onDelete}
              className="size-7 rounded-full border border-border flex items-center justify-center text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {!isOpen && (
        <button type="button" onClick={onToggleExpand} className="w-full text-left space-y-1">
          <p className={`text-[13px] leading-relaxed ${notePreview ? "" : "text-muted-foreground"} line-clamp-2`}>
            {notePreview || "Nothing recorded yet — tap to add"}
          </p>
          {summaryBits.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{summaryBits.join(" · ")}</p>
          )}
          {noteDirty && (
            <p className="text-[10px] uppercase tracking-[0.14em] text-primary">Unsaved note</p>
          )}
        </button>
      )}

      {isOpen && (
      <>
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
            <div className="rounded-[10px] bg-secondary/60 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Transcript
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
        </>
      ) : (
        <>
          {step.note?.trim() ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{step.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No note for this step.</p>
          )}
          {step.voice_transcript?.trim() && (
            <div className="rounded-[10px] bg-secondary/60 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Voice note
              </p>
              <TranscriptBody text={step.voice_transcript} />
            </div>
          )}
        </>
      )}


      {/* Media */}
      {(step.media.length > 0 || editing) && (
        <div className="space-y-2">
          {step.media.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {step.media.map((m) => (
                <div key={m.id} className="relative rounded-[10px] overflow-hidden bg-secondary aspect-square">
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
                      className="size-full object-contain bg-black"
                    />
                  ) : null}
                  {m.kind === "video" && m.duration_seconds ? (
                    <span className="absolute bottom-1 left-1 rounded-pill bg-background/85 px-1.5 text-[10px] tabular-nums">
                      {m.duration_seconds}s
                    </span>
                  ) : null}
                  {editing && (
                    <button
                      type="button"
                      aria-label="Remove media"
                      onClick={() => onRemoveMedia(m.id)}
                      className="absolute top-1 right-1 size-5 rounded-full bg-background/90 flex items-center justify-center"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {editing && (
            <>
              <Button
                type="button"
                variant="goldGhost"
                size="sm"
                className="h-10 w-full"
                disabled={photoBusy}
                onClick={() => photoInputRef.current?.click()}
              >
                <ImagePlus className="size-4 mr-1.5" />
                {photoBusy ? "Uploading…" : "Add photos"}
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { void addPhotos(e.target.files); e.currentTarget.value = ""; }}
              />
              <StepVideoCapture
                folder={`steps/${step.id}`}
                onUploaded={(m) =>
                  onAddMedia({
                    kind: "video",
                    storage_path: m.storage_path,
                    poster_path: m.poster_path,
                    duration_seconds: m.duration_seconds,
                  })
                }
              />
            </>
          )}
        </div>
      )}

      {/* Products used at this step */}
      {(selectedIds.length > 0 || editing) && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Products used
          </p>
          {selectedIds.length > 0 ? (
            <div className="space-y-1.5">
              {selectedIds.map((pid) => {
                const p = catalogue.find((c) => c.id === pid);
                return (
                  <div key={pid} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/products/profile/${pid}`, { state: { returnTo: location.pathname + location.search } })}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-secondary/50 transition-colors"
                      aria-label={`Open ${p?.name ?? "product"} page`}
                    >
                      <ProductThumb
                        imageUrl={p?.image_url ?? null}
                        storagePath={p?.storage_path ?? null}
                        alt={p?.name ?? "Product"}
                        brand={p?.brand ?? null}
                        name={p?.name ?? null}
                        cover
                        wrapperClassName="size-9 rounded-[8px] overflow-hidden bg-secondary shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{p?.name ?? "Product"}</p>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {p?.brand && <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>}
                          {typeof p?.rating === "number" && p.rating > 0 && (
                            <StarRating value={p.rating} size="size-3" />
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    </button>
                    {editing && (
                      <button
                        type="button"
                        aria-label="Remove product"
                        onClick={() => onToggleProduct(pid)}
                        className="size-6 rounded-full border border-border flex items-center justify-center shrink-0"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}

            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">None recorded.</p>
          )}
          {editing && (
            <Button
              type="button"
              variant="goldGhost"
              size="sm"
              className="h-10 w-full"
              onClick={openPicker}
            >
              <Package className="size-4 mr-1.5" />
              Add products
            </Button>
          )}
        </div>
      )}

      {/* Tools used at this step */}
      {(selectedToolIds.length > 0 || editing) && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Tools used
          </p>
          {selectedToolIds.length > 0 ? (
            <div className="space-y-1.5">
              {selectedToolIds.map((tid) => {
                const t = toolCatalogue.find((c) => c.id === tid);
                return (
                  <div key={tid} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/tools/${tid}`)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <ProductThumb
                        imageUrl={t?.image_url ?? null}
                        storagePath={t?.storage_path ?? null}
                        alt={t?.name ?? "Tool"}
                        brand={t?.brand ?? null}
                        name={t?.name ?? null}
                        cover
                        wrapperClassName="size-9 rounded-[8px] overflow-hidden bg-secondary shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{t?.name ?? "Tool"}</p>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {t?.brand && (
                            <p className="text-[11px] text-muted-foreground truncate">{t.brand}</p>
                          )}
                          {typeof t?.rating === "number" && t.rating > 0 ? (
                            <StarRating value={t.rating} size="size-3" />
                          ) : (
                            <MatchStars item={t ?? null} size="sm" showValue={false} />
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    </button>
                    {editing && (
                      <button
                        type="button"
                        aria-label="Remove tool"
                        onClick={() => onToggleTool(tid)}
                        className="size-6 rounded-full border border-border flex items-center justify-center shrink-0"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">None recorded.</p>
          )}
          {editing && (
            <Button
              type="button"
              variant="goldGhost"
              size="sm"
              className="h-10 w-full"
              onClick={() => setToolPickerOpen(true)}
            >
              <Wrench className="size-4 mr-1.5" />
              Add tools
            </Button>
          )}
        </div>
      )}

      {collapsible && (
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
      )}
      </>
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
