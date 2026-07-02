// "My Tools" section for the My Products page. Mirrors the product list UI but
// tools have NO ingredients (combs/brushes/dryers don't have a label to scan),
// so there's no match score, no AI scan, no URL paste, and no ingredient
// detail navigation. Photos + name/brand/category/rating + voicenotes only.
import { useState } from "react";
import { ChevronDown, Heart, Info, Link2, Loader2, Sparkles, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VoiceNoteField from "@/components/VoiceNoteField";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserTools, TOOL_CATEGORIES, type UserTool } from "@/hooks/useUserTools";
import { buildAiContext } from "@/lib/aiContext";
import { cn } from "@/lib/utils";

const Stars = ({ n, onChange }: { n: number; onChange?: (n: number) => void }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <button
        key={i}
        type="button"
        onClick={onChange ? () => onChange(i === n ? 0 : i) : undefined}
        className={cn(
          "text-[14px] leading-none",
          i <= n ? "text-primary" : "text-border",
          onChange && "hover:scale-110 transition-transform",
        )}
        aria-label={onChange ? `Rate ${i} star${i === 1 ? "" : "s"}` : undefined}
        disabled={!onChange}
      >
        ★
      </button>
    ))}
  </span>
);

const MyToolsSection = () => {
  const { tools, loading, addTool, updateTool, setFavourite, deleteTool } = useUserTools();
  // Voicenote counts keyed off the tool_key (ProductVoicenotes works for any key).
  const { counts } = useVoicenoteCounts(tools.map((t) => t.tool_key));

  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserTool | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add-tool form state
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [notesAudio, setNotesAudio] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [analysing, setAnalysing] = useState(false);
  // Remote image URL pulled from the scraped product page (og:image / JSON-LD).
  // Persisted on the tool row so the tile + detail page show the right photo.
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null);
  // Full AI advice payload from tool-analyse-url. Shown in the advice popup
  // and saved onto the user_tools row so it can be re-opened later.
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [viewAdvice, setViewAdvice] = useState<UserTool | null>(null);

  const resetForm = () => {
    setPickedPhoto(null);
    setPhotoPreview(null);
    setName("");
    setBrand("");
    setCategory("");
    setNotes("");
    setRating(0);
    setLinkUrl("");
    setRemoteImageUrl(null);
    setAnalysis(null);
  };

  const handlePickPhoto = (f: File) => {
    setPickedPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleAnalyseLink = async () => {
    const raw = linkUrl.trim();
    if (!raw) {
      toast.error("Paste a product link first");
      return;
    }
    let normalised = raw;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try { new URL(normalised); } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    setAnalysing(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("tool-analyse-url", {
        body: { url: normalised, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.is_tool === false) {
        toast.error("That page doesn't look like a hair tool. Try a different link.");
        return;
      }
      // Pre-fill — keep anything the user has already typed.
      if (data?.name && !name) setName(String(data.name));
      if (data?.brand && !brand) setBrand(String(data.brand));
      if (data?.category && !category) {
        const matched = TOOL_CATEGORIES.find(
          (c) => c.toLowerCase() === String(data.category).toLowerCase(),
        );
        if (matched) setCategory(matched);
      }
      if (data?.summary && !notes) setNotes(String(data.summary));
      if (data?.image_url && !photoPreview && !pickedPhoto) {
        const img = String(data.image_url);
        setRemoteImageUrl(img);
        setPhotoPreview(img);
      }
      setAnalysis(data as Record<string, unknown>);
      setAdviceOpen(true);
      toast.success("STRAND has some advice on this tool");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't analyse that page";
      console.error("tool URL scan failed", e);
      toast.error(msg);
    } finally {
      setAnalysing(false);
    }
  };


  const handleSave = async () => {
    setSaving(true);
    const rawScore = analysis?.match_score;
    const matchScore =
      typeof rawScore === "number" ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
    const created = await addTool({
      name,
      brand,
      category: category || undefined,
      rating: rating || undefined,
      notes,
      photoFile: pickedPhoto,
      imageUrl: !pickedPhoto ? remoteImageUrl : null,
      matchScore,
      aiAnalysis: analysis,
      sourceUrl: linkUrl.trim() || null,
    });
    setSaving(false);
    if (created) {
      setAddOpen(false);
      resetForm();
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    await deleteTool(pendingDelete);
    setDeleting(false);
    setPendingDelete(null);
  };

  return (
    <>
      <SectionLabel>My Tools</SectionLabel>

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your tools…" />
        ) : tools.length === 0 ? (
          <EmptyState
            message="No tools yet"
            hint="Add a brush, comb, dryer or anything you use on wash day."
          />
        ) : (
          tools.map((t) => {
            const isOpen = expanded === t.tool_key;
            const noteCount = counts[t.tool_key] ?? 0;
            return (
              <div
                key={t.id}
                className="bg-card border border-border rounded-[14px] overflow-hidden"
              >
                <div className="p-3.5 flex items-center gap-3">
                  <div className="size-12 rounded-[10px] overflow-hidden bg-secondary shrink-0">
                    {t.image_url ? (
                      <img src={t.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center bg-primary/15 text-primary">
                        <Wrench className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-body leading-tight truncate">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[t.brand, t.category].filter(Boolean).join(" · ") || "Tool"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Stars
                        n={t.rating ?? 0}
                        onChange={(n) => updateTool(t.id, { rating: n || null })}
                      />
                      {noteCount > 0 && (
                        <span className="text-[10px] text-primary font-medium">
                          🎙 {noteCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setFavourite(t.id, !t.on_favourite)}
                    aria-label={t.on_favourite ? "Remove from favourites" : "Add to favourites"}
                    aria-pressed={t.on_favourite}
                    className="size-9 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                  >
                    <Heart
                      className={cn(
                        "size-4 transition-colors",
                        t.on_favourite
                          ? "text-primary fill-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                  <button
                    onClick={() => setPendingDelete(t)}
                    aria-label="Delete tool"
                    className="size-9 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : t.tool_key)}
                    className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                    aria-label={isOpen ? "Hide notes" : "Show notes"}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60 space-y-3">
                    {t.notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        {t.notes}
                      </p>
                    )}
                    <ProductVoicenotes
                      productKey={t.tool_key}
                      productName={t.name}
                      productBrand={t.brand ?? "Tool"}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 pb-6">
        <Button
          variant="gold"
          size="pill"
          onClick={() => setAddOpen(true)}
          className="w-full"
        >
          <Wrench className="size-4 mr-1.5" /> + Add a Tool
        </Button>
      </div>

      {/* Add tool sheet */}
      <Sheet
        open={addOpen}
        onOpenChange={(o) => {
          if (saving) return;
          setAddOpen(o);
          if (!o) resetForm();
        }}
      >
        <SheetContent side="bottom" className="rounded-t-[24px] pb-8 max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Add a tool</SheetTitle>
            <SheetDescription className="text-xs">
              Brushes, combs, dryers, bonnets — anything you use on your hair.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-20 rounded-[12px] overflow-hidden bg-secondary border border-border shrink-0 flex items-center justify-center">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <Wrench className="size-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <FilePickerButton
                  variant="goldOutline"
                  size="pill"
                  preferCamera
                  disabled={saving}
                  onPick={handlePickPhoto}
                >
                  📸 Take Photo
                </FilePickerButton>
                <FilePickerButton
                  variant="goldGhost"
                  size="pill"
                  disabled={saving}
                  onPick={handlePickPhoto}
                >
                  Upload from camera roll
                </FilePickerButton>
              </div>
            </div>

            <div className="space-y-1.5 rounded-[12px] border border-dashed border-primary/30 bg-primary/5 p-3">
              <label className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium flex items-center gap-1.5">
                <Link2 className="size-3" /> Or paste a product link
              </label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                We'll fetch the page and pre-fill the name, brand, category and a short note.
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="https://brand.com/products/wide-tooth-comb"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  disabled={saving || analysing}
                  className="h-11 text-sm w-full"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="goldOutline"
                  size="pill"
                  onClick={handleAnalyseLink}
                  disabled={saving || analysing || !linkUrl.trim()}
                  className="w-full"
                >
                  {analysing ? (
                    <>
                      <Loader2 className="size-3.5 mr-1 animate-spin" /> Reading…
                    </>
                  ) : (
                    "Analyse link"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                Name *
              </label>
              <Input
                placeholder="e.g. Denman D3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                  Brand
                </label>
                <Input
                  placeholder="Optional"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={saving}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory} disabled={saving}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                Your rating
              </label>
              <div className="text-2xl">
                <Stars n={rating} onChange={setRating} />
              </div>
            </div>

            <VoiceNoteField
              label="Notes"
              placeholder="How it feels, when you use it, what it pairs well with…"
              value={notes}
              onChange={setNotes}
              audioPath={notesAudio}
              onAudioPathChange={setNotesAudio}
              folder="tools/notes"
              rows={3}
            />

            <Button
              variant="gold"
              size="pill"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full"
            >
              {saving ? "Saving…" : "Save tool"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tool?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the tool and its photo. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MyToolsSection;
