import { useState, useEffect } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Play, FileText, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import VideoPlayerDialog from "@/components/VideoPlayerDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { renderMentions } from "@/lib/renderMentions";

const ITEM_ICON: Record<string, typeof BookOpen> = { video: Play, pdf: BookOpen, text: FileText, url: FileText, article: FileText, audio: Play, post: FileText, image: FileText };

const PlusLibraryCollection = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => { markPlusSurfaceSeen("library"); }, []);
  const { user } = useAuth();
  const [opening, setOpening] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);

  const collectionQ = useQuery({
    queryKey: ["content_collection", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("content_collections").select("*").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const itemsQ = useQuery({
    queryKey: ["content_items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("content_items").select("*").eq("collection_id", id!).order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const progressQ = useQuery({
    queryKey: ["content_progress", id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("content_progress").select("*").eq("user_id", user!.id);
      const map = new Map<string, boolean>();
      (data ?? []).forEach((p) => map.set(p.item_id, !!p.completed_at));
      return map;
    },
  });

  const openItem = async (item: { id: string; kind: string; title: string; external_url: string | null; storage_path: string | null; body_md: string | null }) => {
    setOpening(item.id);
    try {
      let url = item.external_url;
      if (item.storage_path) {
        const { data, error } = await supabase.functions.invoke("library-signed-url", {
          body: { bucket: "strand-plus-library", path: item.storage_path },
        });
        if (error) throw error;
        url = (data?.url as string) ?? null;
      }
      if (!url && item.body_md) { alert(item.body_md); return; }
      if (!url) { toast.error("Nothing to open"); return; }
      const playInline =
        item.kind === "video" ||
        item.kind === "audio" ||
        /\.(mp4|mov|m4v|webm|mp3|m4a|wav|aac|ogg)(\?|$)/i.test(url);
      if (playInline) {
        setPlayer({ url, title: item.title });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Could not open");
    } finally {
      setOpening(null);
    }
  };
  const toggleComplete = async (itemId: string) => {
    if (!user) return;
    const isDone = progressQ.data?.get(itemId);
    if (isDone) {
      await supabase.from("content_progress").delete().eq("user_id", user.id).eq("item_id", itemId);
    } else {
      await supabase.from("content_progress").insert({ user_id: user.id, item_id: itemId });
    }
    qc.invalidateQueries({ queryKey: ["content_progress", id, user.id] });
  };

  const c = collectionQ.data;

  return (
    <PlusGate title="Library">
      <ScreenLayout>
        <TitleBar title={c?.title ?? "Library"} onBack={() => nav("/plus/library")} />
        {collectionQ.isLoading || itemsQ.isLoading ? <LoadingDot /> : (
          <div className="px-4 pb-16 space-y-4">
            {c?.cover_path && (
              <img src={c.cover_path} alt="" className="w-full rounded-[14px] object-cover" />
            )}
            {c?.description && (
              <p className="font-body text-[13px] text-foreground/75 leading-relaxed">{c.description}</p>
            )}
            <ul className="space-y-3">
              {(itemsQ.data ?? []).map((item, i) => {
                const Icon = ITEM_ICON[item.kind] ?? FileText;
                const done = progressQ.data?.get(item.id);

                // Article — full formatted read, no "Open" affordance.
                if (item.kind === "article") {
                  return (
                    <li key={item.id} className="rounded-[14px] border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <button onClick={() => toggleComplete(item.id)} className="shrink-0 mt-1">
                          {done ? <CheckCircle2 className="size-5 text-good" /> : <Circle className="size-5 text-foreground/30" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-body font-bold uppercase tracking-wider text-primary">Article · {String(i + 1).padStart(2, "0")}</p>
                          <h3 className="font-display text-[19px] font-semibold leading-snug mt-0.5">{item.title}</h3>
                        </div>
                      </div>
                      {item.body_md?.trim() && (
                        <div className="font-body text-[14px] text-foreground/85 leading-relaxed space-y-3">
                          {item.body_md.split(/\n\s*\n/).map((para, idx) => (
                            <p key={idx} className="whitespace-pre-wrap">{renderMentions(para)}</p>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                }

                // Post — photo-forward, caption underneath.
                if (item.kind === "post") {
                  return (
                    <li key={item.id} className="rounded-[14px] border border-border bg-card overflow-hidden">
                      <PostPhoto path={(item as any).storage_path as string | null} />
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <button onClick={() => toggleComplete(item.id)} className="shrink-0 mt-0.5">
                            {done ? <CheckCircle2 className="size-5 text-good" /> : <Circle className="size-5 text-foreground/30" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-body font-bold uppercase tracking-wider text-primary">Post · {String(i + 1).padStart(2, "0")}</p>
                            <p className="font-body text-[13.5px] font-semibold leading-tight mt-0.5">{item.title}</p>
                          </div>
                        </div>
                        {item.body_md?.trim() && (
                          <p className="font-body text-[12.5px] text-foreground/75 leading-relaxed whitespace-pre-wrap pl-7">
                            {renderMentions(item.body_md)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.id} className="rounded-[14px] border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleComplete(item.id)} className="shrink-0">
                        {done ? <CheckCircle2 className="size-5 text-good" /> : <Circle className="size-5 text-foreground/30" />}
                      </button>
                      <ItemThumb path={(item as any).thumbnail_path as string | null} fallbackIcon={Icon} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-body font-bold uppercase tracking-wider text-foreground/50">{String(i + 1).padStart(2, "0")}</p>
                        <p className="font-body text-[13px] font-semibold leading-tight truncate flex items-center gap-1.5">
                          <Icon className="size-3.5 text-primary" /> {item.title}
                        </p>
                      </div>
                      <Button variant="goldOutline" size="sm" className="rounded-full h-9 px-3 shrink-0" onClick={() => openItem(item)} disabled={opening === item.id}>
                        {opening === item.id ? <Loader2 className="size-3.5 animate-spin" /> : "Open"}
                      </Button>
                    </div>
                    {item.body_md?.trim() && (
                      <p className="font-body text-[12px] text-foreground/70 leading-relaxed whitespace-pre-wrap pl-8">
                        {renderMentions(item.body_md)}
                      </p>
                    )}
                  </li>
                );
              })}
              {itemsQ.data && itemsQ.data.length === 0 && (
                <p className="text-center text-sm text-foreground/60 py-8">No items yet.</p>
              )}
            </ul>
          </div>
        )}
      </ScreenLayout>
      <VideoPlayerDialog
        url={player?.url ?? null}
        title={player?.title}
        onClose={() => setPlayer(null)}
      />
    </PlusGate>
  );
};

const ItemThumb = ({ path, fallbackIcon: Icon }: { path: string | null; fallbackIcon: typeof BookOpen }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!path) { setUrl(null); return; }
      const { data } = await supabase.functions.invoke("library-signed-url", {
        body: { bucket: "strand-plus-library", path },
      });
      if (!cancelled) setUrl((data?.url as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  return (
    <div className="w-20 h-14 rounded-md overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <Icon className="size-4 text-foreground/40" />}
    </div>
  );
};

const PostPhoto = ({ path }: { path: string | null }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!path) { setUrl(null); return; }
      const { data } = await supabase.functions.invoke("library-signed-url", {
        body: { bucket: "strand-plus-library", path },
      });
      if (!cancelled) setUrl((data?.url as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  if (!url) {
    return <div className="w-full aspect-square bg-muted flex items-center justify-center"><FileText className="size-6 text-foreground/30" /></div>;
  }
  return <img src={url} alt="" className="w-full max-h-[520px] object-cover" />;
};

export default PlusLibraryCollection;
