import { uuid } from "@/lib/uuid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, X, Camera, Share2, Loader2, GripVertical, Star, ImagePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import VoiceNoteField from "@/components/VoiceNoteField";
import ShareSheet from "@/components/ShareSheet";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { getJournalEntry } from "@/data/journalEntries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProducts } from "@/hooks/useUserProducts";

const PHOTO_BUCKET = "journal-photos";

interface ReflectionState {
  how: string;
  liked: string;
  next: string;
  /** Optional voicenote storage paths backing each reflection field. The
   *  text in `how` / `liked` / `next` is the source of truth — the audio is
   *  kept alongside it so the user can re-listen later. */
  howAudio?: string | null;
  likedAudio?: string | null;
  nextAudio?: string | null;
  /** Selected product IDs (uuid) from user_products */
  productIds: string[];
  /** Legacy: product keys from the old hardcoded catalog (kept for migration) */
  productKeys?: string[];
}

const emptyReflection = (): ReflectionState => ({
  how: "",
  liked: "",
  next: "",
  howAudio: null,
  likedAudio: null,
  nextAudio: null,
  productIds: [],
});

/** Returns true if the storage path looks like a video (mp4 / mov / webm). */
const isVideoPath = (p: string) => /\.(mp4|mov|m4v|webm|quicktime)$/i.test(p);

interface SortablePhotoProps {
  id: string;
  url: string | undefined;
  isCover: boolean;
  disabled: boolean;
  onRemove: () => void;
}

const SortablePhoto = ({ id, url, isCover, disabled, onRemove }: SortablePhotoProps) => {
  const isVideo = isVideoPath(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative aspect-square rounded-[10px] overflow-hidden border bg-secondary touch-none",
        isCover ? "border-primary ring-2 ring-primary/40" : "border-border",
        isDragging && "shadow-lg",
      )}
    >
      {url ? (
        isVideo ? (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover pointer-events-none"
          />
        ) : (
          <img src={url} alt="" className="size-full object-cover pointer-events-none" />
        )
      ) : (
        <div className="size-full flex items-center justify-center">
          <Loader2 className="size-4 text-muted-foreground animate-spin" />
        </div>
      )}

      {isVideo && (
        <span className="absolute bottom-1 right-1 text-[9px] uppercase tracking-[0.12em] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded pointer-events-none">
          Video
        </span>
      )}

      {isCover && (
        <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-[0.12em] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full z-10">
          <Star className="size-2.5" /> Cover
        </span>
      )}

      {/* Drag handle covers the tile — the whole image is draggable. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {/* Grip indicator */}
      <span className="absolute bottom-1 left-1 size-5 rounded-full bg-black/45 text-white flex items-center justify-center pointer-events-none">
        <GripVertical className="size-3" />
      </span>

      {/* Remove (above drag handle via z-index) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={disabled}
        aria-label="Remove photo"
        className="absolute top-1 right-1 z-10 size-6 rounded-full bg-black/55 text-white flex items-center justify-center disabled:opacity-50 hover:bg-black/75"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};

/** UUID v4-ish detector — used to decide whether to fetch the entry from the
 *  `journal_entries` table or fall back to the local mock catalog. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the structured note body we write on save (lines starting with
 *  "How:", "Liked:", "Next time:") back into the three reflection fields. */
const parseReflectionNote = (note: string | null | undefined) => {
  const out = { how: "", liked: "", next: "" };
  if (!note) return out;
  const blocks = note.split(/\n\n+/);
  for (const block of blocks) {
    const m = block.match(/^(How|Liked|Next time):\s*([\s\S]*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (key === "How") out.how = value;
    else if (key === "Liked") out.liked = value;
    else if (key === "Next time") out.next = value;
  }
  // If we couldn't parse anything structured, fall back to dropping the whole
  // note into "liked" so older free-form entries still render.
  if (!out.how && !out.liked && !out.next) out.liked = note;
  return out;
};

interface DbJournalEntry {
  id: string;
  title: string | null;
  note: string | null;
  entry_date: string;
  photo_paths: string[];
  products_used: string[];
}

const JournalEntry = () => {
  const { id: rawId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Brand-new entries arrive at /journal/entry/new. We mint a stable per-session
  // id so all the localStorage keys (photos, reflection) line up, and synthesize
  // a blank `entry` so the screen renders normally instead of hitting the
  // "Entry not found" fallback below.
  const newEntryIdRef = useRef<string>(`new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const isNew = rawId === "new";
  // A real saved row's id is a UUID coming from the journal_entries table.
  // Anything that is neither "new" nor a UUID is treated as a mock-catalog id.
  const isDbEntry = !isNew && UUID_RE.test(rawId);
  const id = isNew ? newEntryIdRef.current : rawId;
  const catalogEntry = getJournalEntry(rawId);

  // DB-backed entry hydration. When we land on /journal/entry/<uuid>, fetch
  // the row, then synthesise the `entry` shape the rest of the screen expects.
  const [dbEntry, setDbEntry] = useState<DbJournalEntry | null>(null);
  const [dbLoading, setDbLoading] = useState(isDbEntry);
  const [dbMissing, setDbMissing] = useState(false);

  useEffect(() => {
    if (!isDbEntry || !user) return;
    let cancelled = false;
    (async () => {
      setDbLoading(true);
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, title, note, entry_date, photo_paths, products_used")
        .eq("id", rawId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("journal entry load failed", error);
        setDbMissing(true);
      } else if (!data) {
        setDbMissing(true);
      } else {
        setDbEntry(data as DbJournalEntry);
      }
      setDbLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isDbEntry, rawId, user]);

  // Strip the legacy "[id] " title prefix so the user sees a clean title.
  const cleanDbTitle = (t: string | null | undefined) =>
    (t ?? "").replace(/^\[[^\]]+\]\s*/, "").trim() || "Journal entry";

  const entry = catalogEntry ?? (isNew
    ? {
        id,
        gradient: "from-[#C8B89A] to-[#D4B96A]",
        emoji: "",
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        title: "New journal entry",
        note: "",
        productKeys: [] as string[],
      }
    : dbEntry
    ? {
        id: dbEntry.id,
        gradient: "from-[#C8B89A] to-[#D4B96A]",
        emoji: "",
        date: new Date(dbEntry.entry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        title: cleanDbTitle(dbEntry.title),
        note: dbEntry.note ?? "",
        productKeys: [] as string[],
      }
    : undefined);

  const storageKey = `strand_journal_entry_${id}`;
  // Legacy single-photo key (kept in sync with photos[0]) so the Hair Journal list
  // and any older code paths continue to work without changes.
  const photoPathKey = `strand_journal_photo_${id}`;
  // New ordered list of up to 10 photo paths.
  const photosKey = `strand_journal_photos_${id}`;
  const MAX_PHOTOS = 10;

  const [state, setState] = useState<ReflectionState>(emptyReflection);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Photos: ordered list of storage paths + their signed URLs (by path).
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Separate input wired to the device camera so "Take a photo" reliably
  // launches the rear camera on iOS / Android (capture="environment").
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const coverUrl = photoPaths[0] ? photoUrls[photoPaths[0]] ?? null : null;

  // Hydrate the reflection state. For DB entries we use the row's parsed
  // note + products_used. For new / catalog entries we fall back to
  // localStorage so a freshly-saved-but-not-reloaded session still works.
  useEffect(() => {
    if (!id) return;
    if (isDbEntry) {
      if (!dbEntry) return;
      const parsed = parseReflectionNote(dbEntry.note);
      setState({
        how: parsed.how,
        liked: parsed.liked,
        next: parsed.next,
        howAudio: null,
        likedAudio: null,
        nextAudio: null,
        productIds: dbEntry.products_used ?? [],
      });
      setPhotoPaths(dbEntry.photo_paths ?? []);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReflectionState>;
        setState({
          how: parsed.how ?? "",
          liked: parsed.liked ?? "",
          next: parsed.next ?? "",
          howAudio: parsed.howAudio ?? null,
          likedAudio: parsed.likedAudio ?? null,
          nextAudio: parsed.nextAudio ?? null,
          productIds: parsed.productIds ?? [],
          productKeys: parsed.productKeys ?? [],
        });
        return;
      }
    } catch {
      /* ignore */
    }
    setState({
      how: "",
      liked: entry?.note ?? "",
      next: "",
      howAudio: null,
      likedAudio: null,
      nextAudio: null,
      productIds: [],
    });
  }, [id, storageKey, entry, isDbEntry, dbEntry]);

  const { allProducts } = useUserProducts("all");
  const selectedProducts = useMemo(
    () => allProducts.filter((p) => state.productIds.includes(p.id)),
    [allProducts, state.productIds],
  );

  const persist = (next: ReflectionState) => {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleProduct = (productId: string) => {
    const has = state.productIds.includes(productId);
    persist({
      ...state,
      productIds: has
        ? state.productIds.filter((k) => k !== productId)
        : [...state.productIds, productId],
    });
  };

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!user) {
      toast.error("Please sign in");
      return;
    }
    setDeleting(true);
    // For DB-backed entries, delete by row id directly. For legacy
    // catalog/mock entries we still use the "[id] " title tag we wrote
    // on save, since they don't have a known row id.
    const query = supabase.from("journal_entries").delete().eq("user_id", user.id);
    const { error } = dbEntry
      ? await query.eq("id", dbEntry.id)
      : await query.ilike("title", `[${entry?.id}]%`);
    setDeleting(false);
    if (error) {
      console.error("journal delete failed", error);
      toast.error("Could not delete entry");
      return;
    }
    setConfirmDelete(false);
    toast.success("Journal entry deleted.");
    navigate("/journal");
  };

  const onSave = async () => {
    persist(state);
    if (!user) {
      toast.error("Please sign in to save");
      return;
    }
    setSaving(true);
    const noteBody = [
      state.how && `How: ${state.how}`,
      state.liked && `Liked: ${state.liked}`,
      state.next && `Next time: ${state.next}`,
    ].filter(Boolean).join("\n\n");

    // Resolve the existing row. DB entries already know their row id;
    // legacy / new flows look it up by the "[id] " title tag we write below.
    const tag = `[${entry?.id}]`;
    let existingId: string | null = dbEntry?.id ?? null;
    if (!existingId) {
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("user_id", user.id)
        .ilike("title", `${tag}%`)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    const payload = {
      user_id: user.id,
      title: `${tag} ${entry?.title ?? "Journal entry"}`.trim(),
      note: noteBody || null,
      photo_paths: photoPaths,
      products_used: state.productIds,
      entry_date: new Date().toISOString().slice(0, 10),
    };

    const { error } = existingId
      ? await supabase.from("journal_entries").update(payload).eq("id", existingId)
      : await supabase.from("journal_entries").insert(payload);

    setSaving(false);

    if (error) {
      console.error("journal save failed", error);
      toast.error("Could not save entry");
      return;
    }
    toast.success("✓ Journal entry saved");
    navigate("/journal");
  };

  // Persist photo order to localStorage and keep the legacy cover key in sync.
  const persistPhotoPaths = (paths: string[]) => {
    setPhotoPaths(paths);
    try {
      if (paths.length > 0) {
        localStorage.setItem(photosKey, JSON.stringify(paths));
        localStorage.setItem(photoPathKey, paths[0]);
      } else {
        localStorage.removeItem(photosKey);
        localStorage.removeItem(photoPathKey);
      }
    } catch {
      /* ignore */
    }
  };

  // ---- Load existing photo paths and sign URLs ----
  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      // Prefer the new ordered list. Migrate the legacy single-photo key if needed.
      let paths: string[] = [];
      try {
        const raw = localStorage.getItem(photosKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) paths = parsed.filter((p): p is string => typeof p === "string");
        }
      } catch {
        /* ignore */
      }
      if (paths.length === 0) {
        const legacy = localStorage.getItem(photoPathKey);
        if (legacy) paths = [legacy];
      }
      if (cancelled) return;
      setPhotoPaths(paths);
      // Sign URLs in parallel
      const entries = await Promise.all(
        paths.map(async (p) => {
          const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 3600);
          return [p, data?.signedUrl ?? ""] as const;
        }),
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      entries.forEach(([p, url]) => {
        if (url) map[p] = url;
      });
      setPhotoUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, photoPathKey, photosKey]);

  const handlePhotoUpload = async (files: FileList | File[]) => {
    if (!user) {
      toast.error("Please sign in to add photos");
      return;
    }
    const list = Array.from(files);
    if (list.length === 0) return;
    const remaining = MAX_PHOTOS - photoPaths.length;
    if (remaining <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos per entry`);
      return;
    }
    const toUpload = list.slice(0, remaining);
    if (list.length > remaining) {
      toast.error(`Only the first ${remaining} added — limit is ${MAX_PHOTOS}`);
    }

    setPhotoBusy(true);
    try {
      const uploaded: { path: string; url: string }[] = [];
      for (const rawFile of toUpload) {
        const isHeicFile = /\.(heic|heif)$/i.test(rawFile.name) || /heic|heif/i.test(rawFile.type);
        const isVideoFile =
          rawFile.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(rawFile.name);
        if (!rawFile.type.startsWith("image/") && !isHeicFile && !isVideoFile) {
          toast.error(`${rawFile.name}: not an image or video`);
          continue;
        }
        // Videos can be much larger than photos; allow up to 100MB.
        const maxBytes = isVideoFile ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
        const maxLabel = isVideoFile ? "100MB" : "8MB";
        if (rawFile.size > maxBytes) {
          toast.error(`${rawFile.name}: too large (max ${maxLabel})`);
          continue;
        }
        let file: File;
        if (isVideoFile) {
          // Don't run videos through the HEIC->JPEG converter.
          file = rawFile;
        } else {
          try {
            file = await convertHeicToJpeg(rawFile);
          } catch (e) {
            const msg = e instanceof Error ? e.message : `${rawFile.name}: couldn't read photo`;
            toast.error(msg);
            continue;
          }
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || (isVideoFile ? "mp4" : "jpg");
        const path = `${user.id}/${id}/${uuid()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type || (isVideoFile ? "video/mp4" : undefined), upsert: false });
        if (upErr) {
          console.error("Upload failed:", upErr);
          toast.error(`${file.name}: upload failed`);
          continue;
        }
        const { data: sig } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(path, 3600);
        uploaded.push({ path, url: sig?.signedUrl ?? "" });
      }
      if (uploaded.length === 0) return;
      const nextPaths = [...photoPaths, ...uploaded.map((u) => u.path)];
      const nextUrls = { ...photoUrls };
      uploaded.forEach((u) => {
        if (u.url) nextUrls[u.path] = u.url;
      });
      setPhotoUrls(nextUrls);
      persistPhotoPaths(nextPaths);
      toast.success(uploaded.length === 1 ? "Photo added" : `${uploaded.length} photos added`);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async (path: string) => {
    if (!confirm("Remove this photo?")) return;
    setPhotoBusy(true);
    try {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      const nextPaths = photoPaths.filter((p) => p !== path);
      const { [path]: _removed, ...nextUrls } = photoUrls;
      setPhotoUrls(nextUrls);
      persistPhotoPaths(nextPaths);
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photoPaths.indexOf(String(active.id));
    const newIndex = photoPaths.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    persistPhotoPaths(arrayMove(photoPaths, oldIndex, newIndex));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const shareCaption = useMemo(() => {
    if (!entry) return "";
    const products = selectedProducts.map((p) => `${p.brand} ${p.name}`).join(", ");
    const lines = [
      `${entry.title} · ${entry.date}`,
      state.liked || entry.note,
      products ? `Products: ${products}` : null,
      "#STRAND #naturalhair",
    ].filter(Boolean);
    return lines.join("\n\n");
  }, [entry, state.liked, selectedProducts]);

  if (!entry) {
    // While fetching a DB-backed entry, show a soft loader rather than the
    // "not found" fallback (which used to flash for a frame or two).
    if (isDbEntry && dbLoading && !dbMissing) {
      return (
        <ScreenLayout bottomNav>
          <TitleBar title="Journal Entry" back />
          <div className="px-5 py-16 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        </ScreenLayout>
      );
    }
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Journal Entry" />
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">Entry not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal")}>
            Back to Journal
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Journal Entry"
        right={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShareOpen(true)}
              className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px] inline-flex items-center gap-1"
            >
              <Share2 className="size-3.5" /> Share
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Entry menu"
                  className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center text-foreground"
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    // Already on the edit screen — focus the first reflection field for clarity.
                    const ta = document.querySelector<HTMLTextAreaElement>("textarea");
                    ta?.focus();
                  }}
                >
                  <Pencil className="size-4 mr-2" /> Edit entry
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                >
                  <Trash2 className="size-4 mr-2" /> Delete entry
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Hidden file input — supports multi-select photos AND videos (mp4/mov) from the library. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,.heic,.heif,.mp4,.mov,.m4v"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) handlePhotoUpload(fs);
          e.target.value = "";
        }}
      />
      {/* Hidden camera input — opens the device camera directly. The
       * `capture` attribute hints to mobile browsers that the rear camera
       * should be launched instead of the photo picker. Accepts both
       * photos and short videos so users can record from the camera too. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,.heic,.heif,.mp4,.mov,.m4v"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) handlePhotoUpload(fs);
          e.target.value = "";
        }}
      />

      {/* Cover image — first photo is the cover; falls back to entry gradient/emoji. */}
      <div className="px-5 pb-3">
        <SurfaceCard padded={false} className="overflow-hidden">
          <div
            className={`relative h-56 ${
              coverUrl ? "bg-secondary" : `bg-gradient-to-br ${entry.gradient}`
            } flex items-center justify-center`}
          >
            {coverUrl ? (
              isVideoPath(photoPaths[0]) ? (
                <video
                  src={coverUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 size-full object-cover bg-black"
                />
              ) : (
                <img
                  src={coverUrl}
                  alt={entry.title}
                  className="absolute inset-0 size-full object-cover"
                />
              )
            ) : (
              <span className="text-7xl">{entry.emoji}</span>
            )}

            {photoBusy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 text-white animate-spin" />
              </div>
            )}

            {coverUrl && (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold bg-primary text-primary-foreground px-2 py-1 rounded-full">
                <Star className="size-3" /> Cover
              </span>
            )}

            <span className="absolute top-2 right-2 text-[11px] text-white/95 font-body bg-black/40 px-2 py-1 rounded">
              {entry.date}
            </span>

            {!coverUrl && (
              <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={photoBusy}
                  className="text-[11px] uppercase tracking-[0.15em] font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Camera className="size-3.5" /> Take photo
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  className="text-[11px] uppercase tracking-[0.15em] font-medium bg-white/90 text-foreground px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ImagePlus className="size-3.5" /> Library
                </button>
              </div>
            )}
          </div>
          <div className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-semibold leading-tight">{entry.title}</p>
              <p className="text-[11px] uppercase tracking-[0.15em] text-primary mt-1">
                {entry.date}
              </p>
            </div>
            {/* Prominent inline Delete — sits right next to the title so it's
             * obvious which entry the action applies to. Opens the same
             * confirmation sheet used by the dropdown + footer button. */}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              aria-label="Delete journal entry"
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold px-3 py-2 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 min-h-[36px]"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </SurfaceCard>
      </div>

      {/* Photos gallery — Shopify-style sortable grid. First image is the cover. */}
      <SectionLabel>
        Photos & Videos {photoPaths.length > 0 ? `(${photoPaths.length}/${MAX_PHOTOS})` : ""}
      </SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          {photoPaths.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-3">
              Add up to {MAX_PHOTOS} photos or short videos (MP4 / MOV). Drag to reorder — the first item is the cover shown on your Hair Journal.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mb-3">
              Drag to reorder. The first item is the cover.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
            <SortableContext items={photoPaths} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2">
                {photoPaths.map((p, idx) => (
                  <SortablePhoto
                    key={p}
                    id={p}
                    url={photoUrls[p]}
                    isCover={idx === 0}
                    disabled={photoBusy}
                    onRemove={() => handleRemovePhoto(p)}
                  />
                ))}

                {photoPaths.length < MAX_PHOTOS && (
                  <>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={photoBusy}
                      className="aspect-square rounded-[10px] border-2 border-dashed border-primary/50 bg-primary/5 flex flex-col items-center justify-center gap-1 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      aria-label="Take a photo with camera"
                    >
                      <Camera className="size-5" />
                      <span className="text-[10px] uppercase tracking-[0.12em] font-medium leading-tight text-center px-1">
                        Take<br />photo
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                      className="aspect-square rounded-[10px] border-2 border-dashed border-border hover:border-primary/60 bg-card flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      aria-label="Choose from library"
                    >
                      <ImagePlus className="size-5" />
                      <span className="text-[10px] uppercase tracking-[0.12em] font-medium leading-tight text-center px-1">
                        From<br />library
                      </span>
                    </button>
                  </>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </SurfaceCard>
      </div>

      {/* Share sheet */}
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        imageUrl={coverUrl}
        title={entry.title}
        caption={shareCaption}
        filename={`${entry.id}.jpg`}
      />

      {/* Products used — placed ABOVE notes & voicenotes per spec */}
      <SectionLabel>Products Used</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          {selectedProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-3">
              Track which products you used in this style.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedProducts.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-2 bg-primary/10 text-foreground text-xs pl-1 pr-3 py-1 rounded-full border border-primary/30"
                >
                  <span className="size-6 rounded-full overflow-hidden bg-secondary shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="size-full flex items-center justify-center text-[11px] bg-primary/15">🧴</span>
                    )}
                  </span>
                  <span className="font-medium">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className="ml-1 text-muted-foreground hover:text-warn"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button
            variant="goldOutline"
            size="pill"
            onClick={() => setPickerOpen(true)}
            className="gap-2"
          >
            <Plus className="size-4" />
            Add product
          </Button>
        </SurfaceCard>
      </div>

      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={state.productIds}
        onToggle={toggleProduct}
      />

      {/* Reflection prompts — each one supports a voicenote that can be
       *  transcribed straight into the text box below it. */}
      <SectionLabel>Reflection</SectionLabel>
      <p className="px-5 -mt-1 mb-2 text-[11px] text-muted-foreground">
        Tap the mic to record — then "Transcribe to text" drops your words into the box.
      </p>
      <div className="px-5 pb-4 space-y-3">
        <SurfaceCard>
          <VoiceNoteField
            label="How did you do this style?"
            placeholder="Steps, technique, sections, drying method…"
            value={state.how}
            onChange={(v) => persist({ ...state, how: v })}
            audioPath={state.howAudio ?? null}
            onAudioPathChange={(p) => persist({ ...state, howAudio: p })}
            folder={`journal/${entry.id}/how`}
          />
        </SurfaceCard>

        <SurfaceCard>
          <VoiceNoteField
            label="What did you like about it?"
            placeholder="Definition, shine, longevity, how it felt…"
            value={state.liked}
            onChange={(v) => persist({ ...state, liked: v })}
            audioPath={state.likedAudio ?? null}
            onAudioPathChange={(p) => persist({ ...state, likedAudio: p })}
            folder={`journal/${entry.id}/liked`}
          />
        </SurfaceCard>

        <SurfaceCard>
          <VoiceNoteField
            label="What do you want to do differently next time?"
            placeholder="Less product, different parting, sealant…"
            value={state.next}
            onChange={(v) => persist({ ...state, next: v })}
            audioPath={state.nextAudio ?? null}
            onAudioPathChange={(p) => persist({ ...state, nextAudio: p })}
            folder={`journal/${entry.id}/next`}
          />
        </SurfaceCard>
      </div>

      {/* Voicenotes for this entry — reuses ProductVoicenotes keyed by entry id */}
      <SectionLabel>Voicenotes</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          <ProductVoicenotes
            productKey={`journal:${entry.id}`}
            productName={entry.title}
            productBrand="Journal entry"
          />
        </SurfaceCard>
      </div>

      <div className="px-5 pb-6 space-y-3">
        <Button variant="gold" size="pill" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save Reflection"}
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/journal")} disabled={saving}>
          Back to Journal
        </Button>
        <Button
          variant="ghost"
          size="pill"
          onClick={() => setConfirmDelete(true)}
          disabled={saving || deleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4 mr-1.5" /> Delete entry
        </Button>
      </div>

      <Sheet open={confirmDelete} onOpenChange={setConfirmDelete}>
        <SheetContent side="bottom" className="rounded-t-[20px]">
          <SheetHeader className="text-left">
            <SheetTitle>Delete this entry?</SheetTitle>
            <SheetDescription>
              Are you sure you want to delete this entry? This cannot be undone.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
            <Button
              variant="default"
              size="pill"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button
              variant="ghost"
              size="pill"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ScreenLayout>
  );
};

export default JournalEntry;
