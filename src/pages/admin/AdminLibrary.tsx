import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Upload, Link as LinkIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const KINDS = ["course", "ebook", "video", "article"] as const;
const ITEM_KINDS = ["video", "pdf", "text", "audio", "image"] as const;
type ItemKind = typeof ITEM_KINDS[number];

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
    setItemTitle(""); setItemBody(""); setItemUrl(""); setFile(null); setShowAdd(false);
  };

  const addItem = async () => {
    if (!itemTitle.trim()) { toast.error("Title required"); return; }
    if (itemKind !== "text" && !file && !itemUrl.trim()) {
      toast.error("Upload a file or provide an external URL");
      return;
    }
    setBusy(true);
    try {
      let storagePath: string | null = null;
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${collectionId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from("strand-plus-library")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        storagePath = path;
      }
      const { error } = await supabase.from("content_items").insert({
        collection_id: collectionId,
        kind: itemKind,
        title: itemTitle.trim(),
        body_md: itemBody.trim() || null,
        storage_path: storagePath,
        external_url: itemUrl.trim() || null,
      });
      if (error) throw error;
      toast.success("Item added");
      reset();
      qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id: string, path: string | null) => {
    if (!window.confirm("Delete this item?")) return;
    if (path) await supabase.storage.from("strand-plus-library").remove([path]);
    const { error } = await supabase.from("content_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin_content_items", collectionId] });
  };

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-2">
      {q.isLoading ? (
        <LoadingDot />
      ) : (
        <ul className="space-y-1.5">
          {(q.data ?? []).map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-body font-bold tracking-wider text-primary">{it.kind}</p>
                <p className="text-[12.5px] font-body font-semibold truncate">{it.title}</p>
                {it.storage_path && (
                  <p className="text-[10px] text-foreground/50 truncate flex items-center gap-1">
                    <Upload className="size-2.5" /> {it.storage_path}
                  </p>
                )}
                {it.external_url && (
                  <a
                    href={it.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary truncate flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="size-2.5" /> {it.external_url}
                  </a>
                )}
              </div>
              <button
                onClick={() => removeItem(it.id, it.storage_path)}
                className="text-alert-dark p-1"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
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
                {file && <p className="text-[10px] text-foreground/60 truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
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
    </div>
  );
};

export default AdminLibrary;
