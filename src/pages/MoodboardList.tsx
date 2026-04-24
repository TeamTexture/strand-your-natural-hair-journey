import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Plus, Camera, ImagePlus, X } from "lucide-react";
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
import { useMoodboards, useMoodboardImages, type Moodboard } from "@/hooks/useMoodboards";
import { convertHeicToJpeg } from "@/lib/imagePrep";

const GRADIENTS = [
  "from-[#C8B89A] to-[#D4B96A]",
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
              className={`relative h-36 rounded-[14px] bg-gradient-to-br ${b.gradient} p-3 flex flex-col justify-between text-left text-foreground overflow-hidden group`}
            >
              {b.coverUrl && (
                <img
                  src={b.coverUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-60"
                />
              )}
              <div className="flex items-start justify-between relative">
                <span className="text-2xl">{b.emoji}</span>
                <button
                  onClick={(e) => handleDelete(b, e)}
                  className="size-7 rounded-full bg-black/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="p-3 rounded-[12px] border-2 border-dashed border-primary/50 bg-card text-center"
                  >
                    <Camera className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-[11px] font-medium">Take a Photo</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-[12px] border-2 border-dashed border-primary/50 bg-card text-center"
                  >
                    <ImagePlus className="size-5 mx-auto mb-1 text-primary" />
                    <p className="text-[11px] font-medium">Upload Photo</p>
                  </button>
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
                      gradient === g ? "border-primary" : "border-transparent"
                    }`}
                    aria-label="Pick colour"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="goldGhost" size="pill" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="gold" size="pill" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

export default MoodboardList;
