import { useEffect, useRef, useState } from "react";
import { Heart, Trash2, Loader2, ImagePlus, Camera, Share2, Link as LinkIcon } from "lucide-react";
import MoodboardLinkImportDialog from "@/components/MoodboardLinkImportDialog";
import { useNavigate, useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ShareSheet from "@/components/ShareSheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMoodboardImages, type MoodboardImage } from "@/hooks/useMoodboards";
import { convertHeicToJpeg } from "@/lib/imagePrep";

interface BoardMeta {
  id: string;
  name: string;
  emoji: string;
  is_favourites: boolean;
  gradient: string;
}

const MoodboardBoard = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState<BoardMeta | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);

  // Refs for the two upload inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState<MoodboardImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) handleFiles(files);
  };

  // Resolve "favourites" alias to the user's actual Favourites board UUID
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setBoardLoading(true);

      if (id === "favourites") {
        const { data } = await supabase
          .from("moodboards")
          .select("id, name, emoji, is_favourites, gradient")
          .eq("user_id", user.id)
          .eq("is_favourites", true)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setBoard(data as BoardMeta);
          // canonicalise URL
          navigate(`/journal/moodboards/${data.id}`, { replace: true });
        } else {
          setBoard(null);
        }
      } else {
        const { data } = await supabase
          .from("moodboards")
          .select("id, name, emoji, is_favourites, gradient")
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        setBoard((data as BoardMeta) ?? null);
      }
      setBoardLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate]);

  const { images, loading, uploadImage, toggleFavourite, deleteImage, reload } = useMoodboardImages(
    board?.id,
    { isFavouritesBoard: !!board?.is_favourites },
  );
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    for (const rawFile of Array.from(files)) {
      const isHeicFile = /\.(heic|heif)$/i.test(rawFile.name) || /heic|heif/i.test(rawFile.type);
      if (!rawFile.type.startsWith("image/") && !isHeicFile) {
        toast.error(`${rawFile.name} is not an image`);
        continue;
      }
      if (rawFile.size > 8 * 1024 * 1024) {
        toast.error(`${rawFile.name} is too large (max 8MB)`);
        continue;
      }
      try {
        const file = await convertHeicToJpeg(rawFile);
        await uploadImage(file);
        okCount++;
      } catch (e) {
        console.error("Upload failed:", e);
        const msg = e instanceof Error ? e.message : `Could not upload ${rawFile.name}`;
        toast.error(msg);
      }
    }
    if (okCount > 0) toast.success(`${okCount} image${okCount === 1 ? "" : "s"} added`);
    setUploading(false);
  };

  const handleFav = async (img: MoodboardImage) => {
    try {
      await toggleFavourite(img);
      toast(img.is_favourite ? "Removed from Favourites" : "❤️ Added to Favourites board");
    } catch {
      toast.error("Could not update");
    }
  };

  const handleDelete = async (img: MoodboardImage) => {
    if (!confirm("Delete this image?")) return;
    try {
      await deleteImage(img);
      toast.success("Image deleted");
    } catch {
      toast.error("Could not delete");
    }
  };


  if (boardLoading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Loading…" onBack={() => navigate("/journal/moodboards")} />

        <div className="px-5 py-10 flex justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      </ScreenLayout>
    );
  }

  if (!board) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Board" onBack={() => navigate("/journal/moodboards")} />
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">Board not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal/moodboards")}>
            All Boards
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      bottomNav
      backgroundClassName={`bg-gradient-to-br ${board.gradient ?? "from-[#C8B89A] to-[#D4B96A]"}`}
    >
      <TitleBar title={board.name} onBack={() => navigate("/journal/moodboards")} />


      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative"
      >
        {isDragging && (
          <div className="absolute inset-0 z-30 rounded-[16px] border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none mx-3">
            <div className="text-center">
              <ImagePlus className="size-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium text-primary">Drop photos to add</p>
              <p className="text-[11px] text-muted-foreground">JPG, PNG or HEIC · up to 8MB</p>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center pb-3 px-5">
        {images.length} {images.length === 1 ? "image" : "images"}
        {board.is_favourites
          ? " · Tap ♥ to remove from Favourites"
          : " · Tap ♡ to add to Favourites"}
        <span className="hidden sm:inline"> · Drag &amp; drop photos anywhere</span>
      </p>

      {/* Image grid */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        {loading && images.length === 0 ? (
          <>
            <div className="aspect-[3/4] rounded-[12px] bg-card border border-border animate-pulse" />
            <div className="aspect-[3/4] rounded-[12px] bg-card border border-border animate-pulse" />
          </>
        ) : images.length === 0 ? (
          <div className="col-span-2 py-10 text-center">
            <p className="text-3xl mb-2">{board.emoji}</p>
            {board.is_favourites ? (
              <p className="text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                No favourites yet. Tap ♡ on any image in your mood boards to save it here.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No images yet</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Add one below to start your board.
                </p>
              </>
            )}
          </div>
        ) : (
          images.map((img) => (
            <div
              key={img.id}
              className="relative aspect-[3/4] rounded-[12px] bg-secondary overflow-hidden group"
            >
              {img.signedUrl ? (
                <img
                  src={img.signedUrl}
                  alt={img.caption ?? "Mood board image"}
                  className="absolute inset-0 size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
              <button
                onClick={() => handleFav(img)}
                aria-label="Favourite"
                className={cn(
                  "absolute top-2 right-2 size-9 rounded-full flex items-center justify-center transition-colors",
                  img.is_favourite
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/85 text-foreground/70 hover:bg-white",
                )}
              >
                <Heart className={cn("size-4", img.is_favourite && "fill-current")} />
              </button>
              <button
                onClick={() => handleDelete(img)}
                aria-label="Delete image"
                className="absolute top-2 left-2 size-9 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
              <button
                onClick={() => setSharing(img)}
                aria-label="Share image"
                className="absolute bottom-2 right-2 size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
              >
                <Share2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Upload tiles */}
      <div className="px-5 pb-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="p-3 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center min-h-[88px] disabled:opacity-50"
        >
          <Camera className="size-5 mx-auto mb-1 text-primary" />
          <p className="text-[11px] font-medium leading-tight">Take Photo</p>
          <p className="text-[9px] text-muted-foreground">Camera</p>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-3 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center min-h-[88px] disabled:opacity-50"
        >
          <ImagePlus className="size-5 mx-auto mb-1 text-primary" />
          <p className="text-[11px] font-medium leading-tight">Upload</p>
          <p className="text-[9px] text-muted-foreground">From device</p>
        </button>
        <button
          onClick={() => board && setLinkDialogOpen(true)}
          disabled={uploading || !board}
          className="p-3 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center min-h-[88px] disabled:opacity-50"
        >
          <LinkIcon className="size-5 mx-auto mb-1 text-primary" />
          <p className="text-[11px] font-medium leading-tight">Add Link</p>
          <p className="text-[9px] text-muted-foreground">Google, Pinterest…</p>
        </button>
      </div>

      {uploading && (
        <p className="text-[11px] text-center text-primary px-5 pb-3 flex items-center justify-center gap-2">
          <Loader2 className="size-3.5 animate-spin" /> Uploading…
        </p>
      )}
      </div>



      <ShareSheet
        open={sharing !== null}
        onOpenChange={(o) => !o && setSharing(null)}
        imageUrl={sharing?.signedUrl ?? null}
        title={`${board.name} mood board`}
        caption={`From my ${board.name} mood board ✨\n\n#STRAND #naturalhair #moodboard`}
        filename={`${board.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`}
      />

      {board && (
        <MoodboardLinkImportDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          boardId={board.id}
          onImported={() => reload()}
        />
      )}
    </ScreenLayout>
  );
};

export default MoodboardBoard;
