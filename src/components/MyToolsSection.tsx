// "My Tools" section for the My Products page. Mirrors the product list UI but
// tools have NO ingredients (combs/brushes/dryers don't have a label to scan),
// so there's no match score, no AI scan, no URL paste, and no ingredient
// detail navigation. Photos + name/brand/category/rating + voicenotes only.
import { useState } from "react";
import { ChevronDown, Link2, Loader2, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const { tools, loading, addTool, updateTool, deleteTool } = useUserTools();
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
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setPickedPhoto(null);
    setPhotoPreview(null);
    setName("");
    setBrand("");
    setCategory("");
    setNotes("");
    setRating(0);
  };

  const handlePickPhoto = (f: File) => {
    setPickedPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    setSaving(true);
    const created = await addTool({
      name,
      brand,
      category: category || undefined,
      rating: rating || undefined,
      notes,
      photoFile: pickedPhoto,
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
        <p className="text-[11px] text-muted-foreground text-center leading-snug px-2 mt-3">
          Tools don't have ingredients — just snap a photo and rate how it
          performs on your hair.
        </p>
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

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                Notes
              </label>
              <Textarea
                placeholder="How it feels, when you use it, what it pairs well with…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saving}
                className="min-h-[80px] text-sm"
              />
            </div>

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
