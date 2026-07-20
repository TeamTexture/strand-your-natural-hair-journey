import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Plus, Camera, ImagePlus, X, Link as LinkIcon, Check } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMoodboards, type Moodboard } from "@/hooks/useMoodboards";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const GRADIENTS = [
  "from-[#6B4423] to-[#3E2410]",
  "from-[#D4AA52] to-[#C49A3C]",
  "from-[#E8D8C0] to-[#A07828]",
  "from-[#DDD0B8] to-[#C8B89A]",
  "from-[#D4B96A] to-[#8B6914]",
  "from-[#C49A3C] to-[#8B6914]",
];

const MoodboardList = () => {
  const navigate = useNavigate();
  const { boards, loading, createBoard, deleteBoard, reload } = useMoodboards();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gradient, setGradient] = useState(GRADIENTS[0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add-from-link state (for the cover image)
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkImages, setLinkImages] = useState<string[]>([]);
  const [linkScraping, setLinkScraping] = useState(false);
  const [linkProgress, setLinkProgress] = useState(0);
  const linkTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (linkScraping) {
      setLinkProgress(6);
      const start = Date.now();
      linkTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - start;
        const target = Math.min(92, 6 + (elapsed / 9000) * 86);
        setLinkProgress((p) => (p < target ? target : p));
      }, 120);
    } else {
      if (linkTimerRef.current) {
        window.clearInterval(linkTimerRef.current);
        linkTimerRef.current = null;
      }
      if (linkProgress > 0) {
        setLinkProgress(100);
        const t = window.setTimeout(() => setLinkProgress(0), 400);
        return () => window.clearTimeout(t);
      }
    }
    return () => {
      if (linkTimerRef.current) {
        window.clearInterval(linkTimerRef.current);
        linkTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkScraping]);

  const handleScrapeLink = async () => {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      toast.error("Paste a link to scan");
      return;
    }
    setLinkScraping(true);
    setLinkImages([]);
    try {
      const { data, error } = await supabase.functions.invoke("moodboard-scrape-url", {
        body: { url: trimmed },
      });
      if (error) throw error;
      const list: string[] = Array.isArray(data?.images) ? data.images : [];
      if (list.length === 0) {
        toast.error("No images found on that page");
      } else {
        setLinkImages(list);
        toast.success(`Found ${list.length} image${list.length === 1 ? "" : "s"}`);
      }
    } catch (e) {
      console.error("Scrape failed:", e);
      toast.error(e instanceof Error ? e.message : "Could not scan that link");
    } finally {
      setLinkScraping(false);
    }
  };

  const handlePickLinkImage = async (src: string) => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Could not download image");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split(";")[0];
      const file = new File([blob], `cover.${ext}`, { type: blob.type || "image/jpeg" });
      await handlePickCover(file);
      setLinkOpen(false);
      setLinkUrl("");
      setLinkImages([]);
    } catch (e) {
      console.error(e);
      toast.error("Could not use that image — try another");
    }
  };


  const handlePickCover = async (file: File | undefined) => {
    if (!file) return;
    const isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    if (!file.type.startsWith("image/") && !isHeic) {
      toast.error("Please choose an image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image is too large (max 8MB)");
      return;
    }
    try {
      const prepped = await convertHeicToJpeg(file);
      setCoverFile(prepped);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverPreview(URL.createObjectURL(prepped));
    } catch (e) {
      console.error(e);
      toast.error("Could not load image");
    }
  };

  const resetForm = () => {
    setName("");
    setGradient(GRADIENTS[0]);
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Give your board a name");
      return;
    }
    setSaving(true);
    try {
      const board = await createBoard({ name: name.trim(), gradient, coverFile: coverFile ?? undefined });
      toast.success(`${name.trim()} created`);
      setOpen(false);
      resetForm();
      if (board) navigate(`/journal/moodboards/${board.id}`);
      else await reload();
    } catch (e) {
      console.error(e);
      toast.error("Could not create board");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Moodboard, e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.is_favourites) {
      toast("Favourites board can't be deleted");
      return;
    }
    if (!confirm(`Delete "${b.name}" and all its images?`)) return;
    try {
      await deleteBoard(b);
      toast.success("Board deleted");
    } catch {
      toast.error("Could not delete");
    }
  };

  const favourites = boards.find((b) => b.is_favourites);
  const others = boards.filter((b) => !b.is_favourites);

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Mood Boards"
        right={
          <button
            onClick={() => setOpen(true)}
            className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]"
          >
            + New
          </button>
        }
      />

      <p className="text-[11px] text-muted-foreground px-5 pb-3">
        Save inspiration. Tap any image's heart to add it to your Favourites board.
      </p>

      {/* Favourites hero */}
      {favourites && (
        <div className="px-5 pb-4">
          <button
            onClick={() => navigate(`/journal/moodboards/${favourites.id}`)}
            className={`w-full h-32 rounded-[14px] bg-gradient-to-br ${favourites.gradient} text-primary-foreground p-4 flex flex-col justify-between text-left overflow-hidden relative`}
          >
            {favourites.coverUrl && (
              <img
                src={favourites.coverUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="relative">
              <p className="font-display text-lg font-semibold">{favourites.name}</p>
              <p className="text-xs opacity-90">
                {favourites.imageCount ?? 0} {favourites.imageCount === 1 ? "image" : "images"}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* User boards */}
      <div className="px-5 pb-6 grid grid-cols-2 gap-3">
        {loading && (
          <>
            <div className="h-36 rounded-[14px] bg-card border border-border animate-pulse" />
            <div className="h-36 rounded-[14px] bg-card border border-border animate-pulse" />
          </>
        )}

        {!loading &&
          others.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/journal/moodboards/${b.id}`)}
              className={`relative h-36 rounded-[14px] bg-gradient-to-br ${b.gradient} p-3 flex flex-col justify-between text-left text-white overflow-hidden group`}
            >
              {b.coverUrl && (
                <img
                  src={b.coverUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="flex items-start justify-end relative">
                <button
                  onClick={(e) => handleDelete(b, e)}
                  className="size-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete board"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="relative">
                <p className="font-display text-sm font-semibold leading-tight truncate">{b.name}</p>
                <p className="text-[10px] opacity-90">
                  {b.imageCount ?? 0} {b.imageCount === 1 ? "image" : "images"}
                </p>
              </div>
            </button>
          ))}

        {!loading && (
          <button
            onClick={() => setOpen(true)}
            className="h-36 rounded-[14px] border-2 border-dashed border-primary/60 bg-card flex flex-col items-center justify-center gap-2 text-primary"
          >
            <Plus className="size-7" />
            <span className="text-[11px] uppercase tracking-[0.2em] font-medium">New Board</span>
          </button>
        )}
      </div>

      {/* Create board dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle>New Mood Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Protective Styles"
                maxLength={40}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Cover image</label>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handlePickCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  handlePickCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {coverPreview ? (
                <div className={`relative h-28 rounded-[12px] overflow-hidden bg-gradient-to-br ${gradient}`}>
                  <img src={coverPreview} alt="Cover preview" className="absolute inset-0 size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setCoverFile(null);
                      if (coverPreview) URL.revokeObjectURL(coverPreview);
                      setCoverPreview(null);
                    }}
                    className="absolute top-1.5 right-1.5 size-7 rounded-full bg-black/55 text-white flex items-center justify-center"
                    aria-label="Remove cover"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="p-3 rounded-[12px] border-2 border-dashed border-primary/50 bg-card text-center"
                  >
                    <Camera className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-[10px] font-medium leading-tight">Take Photo</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-[12px] border-2 border-dashed border-primary/50 bg-card text-center"
                  >
                    <ImagePlus className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-[10px] font-medium leading-tight">Upload</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkOpen(true)}
                    className="p-3 rounded-[12px] border-2 border-dashed border-primary/50 bg-card text-center"
                  >
                    <LinkIcon className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-[10px] font-medium leading-tight">From Link</p>
                  </button>
                </div>
              )}
              {linkOpen && (
                <div className="mt-3 space-y-2 rounded-[12px] border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Add cover from a link
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkOpen(false);
                        setLinkUrl("");
                        setLinkImages([]);
                      }}
                      aria-label="Close link import"
                      className="text-muted-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Paste image or page link"
                      className="h-11 pl-9 text-[13px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!linkScraping) handleScrapeLink();
                        }
                      }}
                    />
                  </div>
                  <div
                    className="h-3 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={Math.round(linkProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-primary transition-[width] duration-200 ease-out"
                      style={{ width: `${linkProgress}%` }}
                    />
                  </div>
                  <Button
                    variant="gold"
                    size="pill"
                    onClick={handleScrapeLink}
                    disabled={linkScraping || !linkUrl.trim()}
                    className="h-10 w-full text-[12px]"
                  >
                    {linkScraping ? "Scanning" : "Scan"}
                  </Button>
                  {linkImages.length > 0 && (
                    <>
                      <p className="text-[10px] text-muted-foreground">
                        Tap an image to use as cover
                      </p>
                      <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                        {linkImages.map((src) => (
                          <button
                            type="button"
                            key={src}
                            onClick={() => handlePickLinkImage(src)}
                            className={cn(
                              "relative aspect-square rounded-[10px] overflow-hidden border-2 border-transparent bg-secondary",
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
                            <span className="absolute top-1 right-1 size-5 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center opacity-0 hover:opacity-100">
                              <Check className="size-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1.5">Optional — you can add one later.</p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Colour</label>
              <div className="grid grid-cols-3 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradient(g)}
                    className={`h-12 rounded-[10px] bg-gradient-to-br ${g} border-2 ${
                      gradient === g ? "border-black" : "border-transparent"
                    }`}
                    aria-label="Pick colour"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between sm:space-x-0">
            <Button variant="goldGhost" size="pill" onClick={() => setOpen(false)} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button variant="gold" size="pill" onClick={handleCreate} disabled={saving} className="flex-1">
              {saving ? "Creating…" : "Create Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

export default MoodboardList;
