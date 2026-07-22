import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
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

const AdminLibrary = () => {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<typeof KINDS[number]>("course");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["admin_content_collections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_collections").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    const { error } = await supabase.from("content_collections").insert({
      title: title.trim(), description: description.trim(), kind,
      is_published: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setDescription(""); setShowNew(false);
    qc.invalidateQueries({ queryKey: ["admin_content_collections"] });
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this collection?")) return;
    await supabase.from("content_collections").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin_content_collections"] });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Library"
        right={
          <Button variant="gold" size="sm" className="rounded-full h-9 px-3" onClick={() => setShowNew((s) => !s)}>
            <Plus className="size-4 mr-1" /> New
          </Button>
        }
      />
      <div className="px-4 pb-10 space-y-3">
        {showNew && (
          <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-4 space-y-2.5">
            <div className="space-y-1"><Label>Kind</Label>
              <select className="w-full h-10 rounded-md border border-border bg-card px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof KINDS[number])}>
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
            {(q.data ?? []).map((c) => (
              <li key={c.id} className="rounded-[14px] border border-border bg-card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-body font-bold uppercase tracking-wider text-primary">{c.kind}</p>
                  <p className="font-body text-[13px] font-semibold truncate">{c.title}</p>
                </div>
                <Link to={`/plus/library/${c.id}`} className="text-foreground/60 hover:text-primary">
                  <ChevronRight className="size-5" />
                </Link>
                <button onClick={() => remove(c.id)} className="text-alert-dark p-1"><Trash2 className="size-4" /></button>
              </li>
            ))}
            {q.data?.length === 0 && <p className="text-center py-8 text-sm font-body text-foreground/60">No collections yet.</p>}
          </ul>
        )}
        <p className="text-[11px] text-foreground/55 font-body pt-2">
          Upload files to the <code>strand-plus-library</code> bucket and add items to a collection — a full item editor is coming next.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default AdminLibrary;
