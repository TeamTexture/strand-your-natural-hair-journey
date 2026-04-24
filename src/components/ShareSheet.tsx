import { useState } from "react";
import { Share2, Download, Copy, Instagram, Youtube, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl?: string | null;
  title: string;
  caption: string;
  filename?: string;
}

// Tries to fetch the image as a Blob so we can use the native share sheet with the file
// (works on iOS Safari + Android Chrome). Falls back to URL-only share or download.
const fetchAsFile = async (url: string, filename: string): Promise<File | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
};

const ShareSheet = ({ open, onOpenChange, imageUrl, title, caption, filename }: ShareSheetProps) => {
  const [working, setWorking] = useState<string | null>(null);

  const safeFilename =
    filename ?? `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "strand"}.jpg`;

  const handleNativeShare = async () => {
    setWorking("native");
    try {
      const file = imageUrl ? await fetchAsFile(imageUrl, safeFilename) : null;
      const shareData: ShareData = { title, text: caption };

      // Prefer sharing the file when supported (lets user pick IG/TikTok story etc.)
      if (file && navigator.canShare?.({ files: [file] })) {
        (shareData as ShareData & { files: File[] }).files = [file];
      }

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Desktop fallback: copy caption + URL
        await navigator.clipboard.writeText(`${caption}\n${imageUrl ?? ""}`);
        toast.success("Caption copied to clipboard");
      }
    } catch (e: unknown) {
      // AbortError = user cancelled — silent
      const name = (e as { name?: string })?.name;
      if (name !== "AbortError") {
        console.error("Share failed:", e);
        toast.error("Could not open share sheet");
      }
    } finally {
      setWorking(null);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) {
      toast("No photo to download");
      return;
    }
    setWorking("download");
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success("Photo saved");
    } catch (e) {
      console.error("Download failed:", e);
      toast.error("Could not download photo");
    } finally {
      setWorking(null);
    }
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success("Caption copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  // Open the native app via deep links. These open the upload/camera view where
  // available; the user picks the photo from their camera roll (we copy the
  // caption first so they can paste it).
  const openApp = async (app: "instagram" | "tiktok" | "youtube") => {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      /* clipboard may fail silently */
    }
    toast(`Caption copied — paste it into ${app[0].toUpperCase() + app.slice(1)}`);

    const links: Record<typeof app, { app: string; web: string }> = {
      instagram: { app: "instagram://library?AssetPath=", web: "https://www.instagram.com/" },
      tiktok: { app: "snssdk1233://", web: "https://www.tiktok.com/upload" },
      youtube: { app: "vnd.youtube://upload", web: "https://www.youtube.com/upload" },
    };

    const { app: appUrl, web } = links[app];
    // Try app deep link, fall back to web after a short delay
    const start = Date.now();
    window.location.href = appUrl;
    setTimeout(() => {
      // If the page is still here after 800ms, the app probably wasn't installed
      if (Date.now() - start < 1500 && document.visibilityState === "visible") {
        window.open(web, "_blank", "noopener");
      }
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>

        {imageUrl && (
          <div className="rounded-[12px] overflow-hidden bg-secondary aspect-square">
            <img src={imageUrl} alt={title} className="size-full object-cover" />
          </div>
        )}

        <p className="text-xs text-muted-foreground line-clamp-3">{caption}</p>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => openApp("instagram")}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[12px] border border-border bg-card hover:border-primary/50 min-h-[72px]"
          >
            <Instagram className="size-5 text-primary" />
            <span className="text-[10px] font-medium">Instagram</span>
          </button>
          <button
            onClick={() => openApp("tiktok")}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[12px] border border-border bg-card hover:border-primary/50 min-h-[72px]"
          >
            {/* lucide has no tiktok icon — use inline SVG */}
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.66a8.16 8.16 0 0 0 4.78 1.52v-3.4a4.85 4.85 0 0 1-1.85-.09Z" />
            </svg>
            <span className="text-[10px] font-medium">TikTok</span>
          </button>
          <button
            onClick={() => openApp("youtube")}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[12px] border border-border bg-card hover:border-primary/50 min-h-[72px]"
          >
            <Youtube className="size-5 text-primary" />
            <span className="text-[10px] font-medium">YouTube</span>
          </button>
        </div>

        <div className="space-y-2">
          <Button
            variant="gold"
            size="pill"
            onClick={handleNativeShare}
            disabled={working !== null}
            className="gap-2"
          >
            {working === "native" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Share2 className="size-4" />
            )}
            More share options…
          </Button>
          <Button
            variant="goldOutline"
            size="pill"
            onClick={handleDownload}
            disabled={working !== null || !imageUrl}
            className="gap-2"
          >
            {working === "download" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download photo
          </Button>
          <Button variant="goldGhost" size="pill" onClick={handleCopyCaption} className="gap-2">
            <Copy className="size-4" />
            Copy caption
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareSheet;
