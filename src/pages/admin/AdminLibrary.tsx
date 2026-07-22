import { useState, useRef, useCallback, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Upload, Link as LinkIcon, ExternalLink, Film } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { tusUpload } from "@/lib/tusUpload";
import VideoThumbnailPicker from "@/components/VideoThumbnailPicker";

const KINDS = ["course", "ebook", "video", "article"] as const;
const ITEM_KINDS = ["video", "pdf", "text", "audio", "image"] as const;
type ItemKind = typeof ITEM_KINDS[number];

const guessKindFromFile = (f: File): ItemKind => {
  const t = (f.type || "").toLowerCase();
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  const name = f.name.toLowerCase();
  if (/\.(mp4|mov|m4v|webm|mkv)$/.test(name)) return "video";
  if (/\.(mp3|m4a|wav|aac|ogg)$/.test(name)) return "audio";
  if (/\.pdf$/.test(name)) return "pdf";
  return "video";
};

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const AdminLibrary = () => {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<typeof KINDS[number]>("course");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin_content_collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_collections")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    const { error } = await supabase.from("content_collections").insert({
      title: title.trim(), description: description.trim(), kind, is_published: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setDescription(""); setShowNew(false);
    qc.invalidateQueries({ queryKey: ["admin_content_collections"] });
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this collection and all its items?")) return;
    const { error } = await supabase.from("content_collections").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_content_collections"] });
  };

  const togglePublish = async (id: string, next: boolean) => {
    const { error } = await supabase.from("content_collections").update({ is_published: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_content_collections"] });
  };

  return (
    <ScreenLayout>
      <TitleBar
        title="Library"
        right={
          <Button variant="gold" size="sm" className="rounded-full h-9 px-3" onClick={() => setShowNew((s) => !s)}>
            <Plus className="size-4 mr-1" /> Collection
          </Button>
        }
      />
      <div className="px-4 pb-10 space-y-3">
        {showNew && (
          <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-4 space-y-2.5">
            <div className="space-y-1">
              <Label>Kind</Label>
              <select
                className="w-full h-10 rounded-md border border-border bg-card px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof KINDS[number])}
              >
                {KINDS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <Button variant="gold" size="pill" className="w-full" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Create collection"}
            </Button>
          </div>
        )}

        {q.isLoading ? <LoadingDot /> : (
          <ul className="space-y-2">
            {(q.data ?? []).map((c) => {
              const open = expanded === c.id;
              return (
                <li key={c.id} className="rounded-[14px] border border-border bg-card overflow-hidden">
                  <div className="p-3 flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(open ? null : c.id)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2"
                    >
                      {open ? <ChevronDown className="size-4 text-primary shrink-0" /> : <ChevronRight className="size-4 text-foreground/60 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-body font-bold uppercase tracking-wider text-primary">
                          {c.kind}{!c.is_published && " · hidden"}
                        </p>
                        <p className="font-body text-[13px] font-semibold truncate">{c.title}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => togglePublish(c.id, !c.is_published)}
                      className="text-[10px] font-body font-semibold uppercase tracking-wider text-foreground/60 hover:text-primary px-2 py-1"
                    >
                      {c.is_published ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => remove(c.id)} className="text-alert-dark p-1"><Trash2 className="size-4" /></button>
                  </div>
                  {open && <CollectionItems collectionId={c.id} />}
                </li>
              );
            })}
            {q.data?.length === 0 && (
              <p className="text-center py-8 text-sm font-body text-foreground/60">No collections yet.</p>
            )}
          </ul>
        )}
      </div>
    </ScreenLayout>
  );
};

const CollectionItems = ({ collectionId }: { collectionId: string }) => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [itemKind, setItemKind] = useState<ItemKind>("video");
  const [itemTitle, setItemTitle] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dropInputRef = useRef<HTMLInputElement | null>(null);
  const [savedFiles, setSavedFiles] = useState<string[]>([]);
  const [currentUpload, setCurrentUpload] = useState<string | null>(null);
  const [thumbPending, setThumbPending] = useState<{ itemId: string; file?: File | null; sourceUrl?: string | null } | null>(null);

  const uploadThumbnail = async (itemId: string, blob: Blob) => {
    const path = `${collectionId}/thumbs/${itemId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("strand-plus-library")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) { toast.error(upErr.message); return; }
    const { error } = await supabase
      .from("content_items")
      .update({ thumbnail_path: path })
      .eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    toast.success("Cover saved");
    qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
  };

  const q = useQuery({
    queryKey: ["admin_content_items", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setItemTitle(""); setItemBody(""); setItemUrl(""); setFile(null); setShowAdd(false); setProgress(null);
  };

  const uploadFileToStorage = useCallback(async (f: File): Promise<string> => {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${collectionId}/${Date.now()}_${safe}`;
    setProgress(0);
    await tusUpload({
      bucket: "strand-plus-library",
      path,
      file: f,
      contentType: f.type || undefined,
      onProgress: (p) => setProgress(p.percent),
    });
    setProgress(100);
    return path;
  }, [collectionId]);

  const addItem = async () => {
    if (!itemTitle.trim()) { toast.error("Title required"); return; }
    if (itemKind !== "text" && !file && !itemUrl.trim()) {
      toast.error("Drop a file or provide an external URL");
      return;
    }
    setBusy(true);
    try {
      let storagePath: string | null = null;
      if (file) storagePath = await uploadFileToStorage(file);
      const { data: inserted, error } = await supabase.from("content_items").insert({
        collection_id: collectionId,
        kind: itemKind,
        title: itemTitle.trim(),
        body_md: itemBody.trim() || null,
        storage_path: storagePath,
        external_url: itemUrl.trim() || null,
      }).select("id").single();
      if (error) throw error;
      toast.success("Item added");
      const isVideo = itemKind === "video" && file;
      if (isVideo && inserted?.id) {
        setThumbPending({ itemId: inserted.id, file: file! });
      }
      reset();
      qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // Fast path: drop one or more files directly onto the collection to upload
  // and create items automatically (title = filename, kind = auto).
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        const kind = guessKindFromFile(f);
        const title = f.name.replace(/\.[^.]+$/, "");
        setCurrentUpload(f.name);
        try {
          const path = await uploadFileToStorage(f);
          const { data: inserted, error } = await supabase.from("content_items").insert({
            collection_id: collectionId,
            kind,
            title,
            storage_path: path,
          }).select("id").single();
          if (error) throw error;
          setSavedFiles((prev) => [f.name, ...prev].slice(0, 8));
          toast.success(`Saved ${f.name}`);
          if (kind === "video" && inserted?.id) {
            setThumbPending({ itemId: inserted.id, file: f });
          }
        } catch (e) {
          toast.error(`${f.name}: ${(e as Error).message ?? "upload failed"}`);
        }
      }
      qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
    } finally {
      setBusy(false);
      setProgress(null);
      setCurrentUpload(null);
    }
  }, [collectionId, qc, uploadFileToStorage]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeItem = async (id: string, path: string | null) => {
    if (!window.confirm("Delete this item?")) return;
    if (path) await supabase.storage.from("strand-plus-library").remove([path]);
    const { error } = await supabase.from("content_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
  };

  return (
    <div
      className={`border-t border-border p-3 space-y-2 transition-colors ${
        dragOver ? "bg-primary/15 ring-2 ring-primary/50" : "bg-muted/20"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 flex items-center gap-3">
        <Film className="size-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-body font-semibold leading-tight">
            {dragOver ? "Drop to upload" : "Drag & drop videos, PDFs or audio here"}
          </p>
          <p className="text-[10px] text-foreground/55 leading-tight mt-0.5">
            Large files upload in the background · resumes if interrupted
          </p>
        </div>
        <input
          ref={dropInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Button
          size="sm"
          variant="goldOutline"
          className="rounded-pill h-8 px-3 text-[11px] shrink-0"
          onClick={() => dropInputRef.current?.click()}
          disabled={busy}
        >
          Browse
        </Button>
      </div>

      {progress !== null && (
        <div className="rounded-lg border border-primary/30 bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10.5px] font-body">
            <span className="font-semibold text-primary">
              {progress >= 100 ? "Saving to library…" : "Uploading…"}
              {currentUpload && <span className="text-foreground/60 font-normal"> · {currentUpload}</span>}
            </span>
            <span className="text-foreground/70">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {savedFiles.length > 0 && (
        <div className="rounded-lg border border-good/40 bg-good/10 p-2.5 space-y-1">
          <p className="text-[10.5px] font-body font-bold uppercase tracking-wider text-good flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Saved to library
          </p>
          <ul className="space-y-0.5">
            {savedFiles.map((n, i) => (
              <li key={`${n}-${i}`} className="text-[11px] font-body text-foreground/80 truncate flex items-center gap-1">
                <CheckCircle2 className="size-3 text-good shrink-0" /> {n}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setSavedFiles([])}
            className="text-[10px] font-body text-foreground/50 hover:text-foreground pt-0.5"
          >
            Clear
          </button>
        </div>
      )}

      {q.isLoading ? (
        <LoadingDot />
      ) : (
        <ul className="space-y-1.5">
          {(q.data ?? []).map((it) => (
            <ItemRow
              key={it.id}
              item={it as any}
              onDelete={() => removeItem(it.id, (it as any).storage_path)}
              onCoverUpload={(blob) => uploadThumbnail(it.id, blob)}
              onPickFrame={(url) => setThumbPending({ itemId: it.id, file: null as any, sourceUrl: url } as any)}
            />
          ))}
          {q.data?.length === 0 && (
            <p className="text-[11px] font-body text-foreground/55 text-center py-2">No items yet.</p>
          )}
        </ul>
      )}

      {!showAdd ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 rounded-pill text-[11px] mt-1"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="size-3.5 mr-1" /> Add item
        </Button>
      ) : (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 mt-1">
          <div className="space-y-1">
            <Label className="text-[11px]">Type</Label>
            <select
              className="w-full h-9 rounded-md border border-border bg-card px-3 text-[12px]"
              value={itemKind}
              onChange={(e) => setItemKind(e.target.value as ItemKind)}
            >
              {ITEM_KINDS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Title</Label>
            <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="h-9 text-[12px]" />
          </div>
          {itemKind === "text" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Body (markdown)</Label>
              <Textarea rows={5} value={itemBody} onChange={(e) => setItemBody(e.target.value)} className="text-[12px]" />
            </div>
          )}
          {itemKind !== "text" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1"><Upload className="size-3" /> Upload file</Label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-[11px] file:mr-2 file:h-8 file:px-3 file:rounded-full file:border-0 file:bg-primary file:text-primary-foreground file:text-[11px] file:font-semibold"
                />
                {file && <p className="text-[10px] text-foreground/60 truncate">{file.name} · {fmtSize(file.size)}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1"><LinkIcon className="size-3" /> Or external URL</Label>
                <Input
                  value={itemUrl}
                  onChange={(e) => setItemUrl(e.target.value)}
                  placeholder="https://…"
                  className="h-9 text-[12px]"
                />
              </div>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" className="flex-1 h-8 rounded-pill text-[11px]" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" className="flex-1 h-8 rounded-pill text-[11px]" onClick={addItem} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save item"}
            </Button>
          </div>
        </div>
      )}

      <VideoThumbnailPicker
        open={!!thumbPending}
        file={thumbPending?.file ?? null}
        onClose={() => setThumbPending(null)}
        onSkip={() => setThumbPending(null)}
        onPick={async (blob) => {
          const pending = thumbPending;
          setThumbPending(null);
          if (pending) await uploadThumbnail(pending.itemId, blob);
        }}
      />
    </div>
  );
};

const ItemRow = ({
  item, onDelete, onCoverUpload,
}: {
  item: { id: string; kind: string; title: string; storage_path: string | null; external_url: string | null; thumbnail_path: string | null };
  onDelete: () => void;
  onCoverUpload: (blob: Blob) => void | Promise<void>;
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!item.thumbnail_path) { setThumbUrl(null); return; }
      const { data } = await supabase.functions.invoke("library-signed-url", {
        body: { bucket: "strand-plus-library", path: item.thumbnail_path },
      });
      if (!cancelled) setThumbUrl((data?.url as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [item.thumbnail_path]);

  return (
    <li className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-2">
      <div className="w-14 h-10 rounded-md bg-muted overflow-hidden shrink-0 border border-border flex items-center justify-center">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Film className="size-4 text-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase font-body font-bold tracking-wider text-primary">{item.kind}</p>
        <p className="text-[12.5px] font-body font-semibold truncate">{item.title}</p>
        {item.storage_path && (
          <p className="text-[10px] text-foreground/50 truncate">{item.storage_path}</p>
        )}
      </div>
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCoverUpload(f); e.target.value = ""; }}
      />
      <button
        onClick={() => coverInput.current?.click()}
        className="text-[10px] font-body font-semibold text-primary hover:underline px-1.5 shrink-0"
        title="Set cover photo"
      >
        Cover
      </button>
      <button onClick={onDelete} className="text-alert-dark p-1"><Trash2 className="size-3.5" /></button>
    </li>
  );
};

export default AdminLibrary;
