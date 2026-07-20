import { useEffect, useRef, useState } from "react";
import { Loader2, Link as LinkIcon, ImagePlus, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  onImported: () => void;
}

const MoodboardLinkImportDialog = ({ open, onOpenChange, boardId, onImported }: Props) => {
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [importing, setImporting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);

  const reset = () => {
    setUrl("");
    setImages([]);
    setSelected(new Set());
    setSourceLabel(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Paste a link to scan");
      return;
    }
    setScraping(true);
    setImages([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("moodboard-scrape-url", {
        body: { url: trimmed },
      });
      if (error) throw error;
      const list: string[] = Array.isArray(data?.images) ? data.images : [];
      if (list.length === 0) {
        toast.error("No images found on that page");
      } else {
        setImages(list);
        // Auto-select the first one so a single-image paste is one click.
        setSelected(new Set(list.length === 1 ? [list[0]] : []));
        setSourceLabel(data?.source ?? trimmed);
        toast.success(`Found ${list.length} image${list.length === 1 ? "" : "s"}`);
      }
    } catch (e) {
      console.error("Scrape failed:", e);
      const msg = e instanceof Error ? e.message : "Could not scan that link";
      toast.error(msg);
    } finally {
      setScraping(false);
    }
  };

  const toggle = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === images.length) setSelected(new Set());
    else setSelected(new Set(images));
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one image");
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("moodboard-import-image", {
        body: { board_id: boardId, image_urls: Array.from(selected) },
      });
      if (error) throw error;
      const imported = data?.imported ?? 0;
      const failed = (data?.results ?? []).filter((r: { ok: boolean }) => !r.ok).length;
      if (imported > 0) {
        toast.success(`${imported} image${imported === 1 ? "" : "s"} added`);
        onImported();
        handleClose(false);
      }
      if (failed > 0 && imported === 0) {
        toast.error("Couldn't add those images — try a different link");
      } else if (failed > 0) {
        toast(`${failed} skipped`);
      }
    } catch (e) {
      console.error("Import failed:", e);
      const msg = e instanceof Error ? e.message : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[340px] p-5 rounded-[16px]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-lg">Add from a link</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Paste a Google Images result, Pinterest pin, blog post, or a direct image URL. We'll pull the images we find so you can pick.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="pl-8 h-10 text-[13px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!scraping) handleScrape();
                  }
                }}
              />
            </div>
            <Button
              variant="gold"
              size="pill"
              onClick={handleScrape}
              disabled={scraping || !url.trim()}
              className="h-10 px-4 text-[12px]"
            >
              {scraping ? <Loader2 className="size-3.5 animate-spin" /> : "Scan"}
            </Button>
          </div>

          {images.length > 0 && (
            <>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground truncate mr-2">
                  {images.length} found · {selected.size} selected
                </span>
                <button
                  onClick={selectAll}
                  className="text-primary font-medium uppercase tracking-[0.1em]"
                >
                  {selected.size === images.length ? "Clear" : "Select all"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto -mx-1 px-1 pb-1">
                {images.map((src) => {
                  const isSel = selected.has(src);
                  return (
                    <button
                      type="button"
                      key={src}
                      onClick={() => toggle(src)}
                      className={cn(
                        "relative aspect-square rounded-[10px] overflow-hidden border-2 bg-secondary transition-all",
                        isSel ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-transparent",
                      )}
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                        }}
                      />
                      {isSel && (
                        <span className="absolute top-1 right-1 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="gold"
                size="pill"
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="w-full"
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Adding…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ImagePlus className="size-4" />
                    Add {selected.size > 0 ? `${selected.size} ` : ""}to board
                  </span>
                )}
              </Button>
            </>
          )}

          {images.length === 0 && !scraping && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tip: on Google Images, right-click an image → "Copy image address" for the cleanest result, or paste the page URL to browse everything on it.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MoodboardLinkImportDialog;
