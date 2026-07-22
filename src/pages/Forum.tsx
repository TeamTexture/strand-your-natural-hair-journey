import { useEffect, useMemo, useState } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, MessageSquare, ArrowUp, Pin, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ForumAvatar from "@/components/ForumAvatar";
import { renderMentions } from "@/lib/renderMentions";

type Sort = "new" | "top";

const Forum = () => {
  useEffect(() => { markPlusSurfaceSeen("forum"); markPlusSurfaceSeen("threads"); }, []);
  const [sort, setSort] = useState<Sort>("new");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const catsQ = useQuery({
    queryKey: ["forum_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_categories")
        .select("id,name,slug,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const threadsQ = useQuery({
    queryKey: ["forum_threads", sort, categoryId],
    queryFn: async () => {
      let q = supabase
        .from("forum_threads")
        .select("id,title,body,image_path,vote_count,reply_count,is_pinned,is_locked,created_at,author_id,category_id")
        .limit(50);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (sort === "top") q = q.order("is_pinned", { ascending: false }).order("vote_count", { ascending: false });
      else q = q.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const authorIds = useMemo(
    () => Array.from(new Set((threadsQ.data ?? []).map((t) => t.author_id))),
    [threadsQ.data],
  );
  type AuthorMeta = {
    display_name: string | null;
    avatar_url: string | null;
    city: string | null;
    goal_title: string | null;
    hair_type: string | null;
    current_style: string | null;
  };
  const authorsQ = useQuery({
    queryKey: ["forum_author_meta", authorIds],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("forum_author_meta", { _user_ids: authorIds });
      if (error) throw error;
      const map = new Map<string, AuthorMeta>();
      (data ?? []).forEach((p) => map.set(p.user_id, p as AuthorMeta));
      return map;
    },
  });

  const catName = (id: string | null) =>
    catsQ.data?.find((c) => c.id === id)?.name ?? "";

  return (
    <PlusGate title="Forum">
      <ScreenLayout>
        <TitleBar
          title="Community"
          right={
            <Link to="/forum/new">
              <Button variant="gold" size="sm" className="rounded-full h-9 px-3">
                <Plus className="size-4 mr-1" /> New
              </Button>
            </Link>
          }
        />
        <div className="px-4 pb-16 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
              <Chip active={!categoryId} onClick={() => setCategoryId(null)}>All</Chip>
              {catsQ.data?.map((c) => (
                <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-body">
            <SortBtn active={sort === "new"} onClick={() => setSort("new")}>New</SortBtn>
            <SortBtn active={sort === "top"} onClick={() => setSort("top")}>Top</SortBtn>
          </div>

          {threadsQ.isLoading ? (
            <LoadingDot />
          ) : threadsQ.data && threadsQ.data.length > 0 ? (
            <ul className="space-y-2">
              {threadsQ.data.map((t) => {
                const author = authorsQ.data?.get(t.author_id);
                const firstName = (author?.display_name ?? "Member").split(" ")[0];
                const metaParts: string[] = [];
                if (author?.goal_title) metaParts.push(`Goal: ${author.goal_title}`);
                if (author?.current_style) metaParts.push(`Current Style: ${author.current_style}`);
                const metaLine = metaParts.length > 0 ? metaParts.join(" · ") : null;
                return (
                  <li key={t.id}>
                    <Link
                      to={`/forum/${t.id}`}
                      className="block rounded-[14px] border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <ForumAvatar path={author?.avatar_url} fallback={firstName[0]} className="size-9 text-[13px]" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] font-body font-semibold text-foreground/85 leading-tight">{firstName}</span>
                            {t.category_id && (
                              <span className="text-[9.5px] font-body font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
                                {catName(t.category_id)}
                              </span>
                            )}
                            {t.is_pinned && <Pin className="size-3 text-primary" />}
                            {t.is_locked && <Lock className="size-3 text-muted-foreground" />}
                          </div>
                          {metaLine && (
                            <p className="text-[10.5px] font-body text-foreground/60 leading-tight truncate mt-0.5">
                              {metaLine}
                            </p>
                          )}
                        </div>
                      </div>
                      <h3 className="font-display text-[15px] font-semibold leading-tight text-foreground">{t.title}</h3>
                      {t.body && <p className="mt-1 font-body text-[12px] text-foreground/70 line-clamp-2">{renderMentions(t.body)}</p>}
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-foreground/60 font-body">
                        <span className="inline-flex items-center gap-1"><ArrowUp className="size-3" /> {t.vote_count ?? 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {t.reply_count ?? 0}</span>
                        <span>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-12 text-sm text-foreground/60 font-body">
              No threads yet. Start the conversation.
            </div>
          )}
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "shrink-0 h-8 px-3 rounded-full text-[11.5px] font-body font-semibold border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground/75",
    )}
  >
    {children}
  </button>
);
const SortBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 h-7 rounded-full font-semibold uppercase tracking-wider text-[10px]",
      active ? "bg-brown text-brown-foreground" : "text-foreground/60",
    )}
  >
    {children}
  </button>
);

export default Forum;
