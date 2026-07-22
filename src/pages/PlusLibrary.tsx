import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Play, FileText, Layers } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = { course: "Course", ebook: "Ebook", video: "Video", article: "Article" };
const KIND_ICON: Record<string, typeof BookOpen> = { course: Layers, ebook: BookOpen, video: Play, article: FileText };

const PlusLibrary = () => {
  useEffect(() => { markPlusSurfaceSeen("library"); }, []);
  const q = useQuery({
    queryKey: ["content_collections_with_thumbs"],
    queryFn: async () => {
      const { data: collections, error } = await supabase
        .from("content_collections")
        .select("*")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const ids = (collections ?? []).map((c) => c.id);
      let firstThumbs = new Map<string, string>();
      if (ids.length) {
        const { data: items } = await supabase
          .from("content_items")
          .select("collection_id,thumbnail_path,sort_order")
          .in("collection_id", ids)
          .not("thumbnail_path", "is", null)
          .order("sort_order", { ascending: true });
        for (const it of items ?? []) {
          if (!firstThumbs.has(it.collection_id) && it.thumbnail_path) {
            firstThumbs.set(it.collection_id, it.thumbnail_path);
          }
        }
      }
      return (collections ?? []).map((c) => ({ ...c, _fallback_thumb: firstThumbs.get(c.id) ?? null }));
    },
  });

  return (
    <PlusGate title="Library">
      <ScreenLayout>
        <TitleBar title="Library" />
        <div className="px-4 pb-16 space-y-4">
          <p className="font-body text-[13px] text-foreground/70 leading-relaxed px-1">
            Courses, ebooks, videos and articles — added to every month.
          </p>
          {q.isLoading ? <LoadingDot /> : q.data && q.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {q.data.map((c) => {
                const Icon = KIND_ICON[c.kind] ?? BookOpen;
                const thumbPath = c.cover_path || c._fallback_thumb;
                return (
                  <Link
                    key={c.id}
                    to={`/plus/library/${c.id}`}
                    className="rounded-[14px] overflow-hidden border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className={cn("aspect-[4/5] bg-primary/8 flex items-center justify-center", thumbPath && "p-0")}>
                      {thumbPath ? (
                        <CoverImage path={thumbPath} />
                      ) : (
                        <Icon className="size-10 text-primary/60" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-[9.5px] font-body font-bold uppercase tracking-wider text-primary">{KIND_LABEL[c.kind] ?? c.kind}</p>
                      <h3 className="mt-0.5 font-display text-[13.5px] font-semibold leading-tight line-clamp-2">{c.title}</h3>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-sm text-foreground/60 font-body">
              New library content coming soon.
            </div>
          )}
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

const CoverImage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
      const { data } = await supabase.functions.invoke("library-signed-url", {
        body: { bucket: "strand-plus-library", path },
      });
      if (!cancelled) setUrl((data?.url as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return null;
  return <img src={url} alt="" className="w-full h-full object-cover" />;
};

export default PlusLibrary;
