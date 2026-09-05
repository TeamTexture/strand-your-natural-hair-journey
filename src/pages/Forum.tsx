import { useEffect, useMemo } from "react";
import { useState } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, MessageSquare, ArrowUp, ArrowDown, Pin, Lock, Flame } from "lucide-react";
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

/** Community feed category palette — keyed by lowercased category name. */
const CATEGORY_STYLE: Record<string, { solid: string; tint: string }> = {
  general: { solid: "hsl(var(--forum-terracotta))", tint: "hsl(var(--forum-terracotta-tint))" },
  "wash day": { solid: "hsl(var(--forum-moss))", tint: "hsl(var(--forum-moss-tint))" },
  "wash-day": { solid: "hsl(var(--forum-moss))", tint: "hsl(var(--forum-moss-tint))" },
  washday: { solid: "hsl(var(--forum-moss))", tint: "hsl(var(--forum-moss-tint))" },
  "products & reviews": { solid: "hsl(var(--forum-wine))", tint: "hsl(var(--forum-wine-tint))" },
  products: { solid: "hsl(var(--forum-wine))", tint: "hsl(var(--forum-wine-tint))" },
  reviews: { solid: "hsl(var(--forum-wine))", tint: "hsl(var(--forum-wine-tint))" },
};
const FALLBACK_STYLE = { solid: "hsl(var(--forum-espresso))", tint: "hsl(var(--forum-ivory))" };
const catStyle = (name: string) => CATEGORY_STYLE[name.trim().toLowerCase()] ?? FALLBACK_STYLE;

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

  /** Trending = whichever loaded thread currently has the most net upvotes. */
  const trendingId = useMemo(() => {
    const list = threadsQ.data ?? [];
    let best: { id: string; votes: number } | null = null;
    for (const t of list) {
      const v = t.vote_count ?? 0;
      if (!best || v > best.votes) best = { id: t.id, votes: v };
    }
    return best && best.votes > 0 ? best.id : null;
  }, [threadsQ.data]);

  return (
    <PlusGate title="Forum">
      <ScreenLayout>
        <TitleBar
          title="Community"
          right={
            <Link to="/forum/new">
              <Button
                size="sm"
                className="rounded-full h-9 px-3 bg-[hsl(var(--forum-espresso))] text-[hsl(var(--forum-ivory))] hover:bg-[hsl(var(--forum-espresso))]/90"
              >
                <Plus className="size-4 mr-1" /> New
              </Button>
            </Link>
          }
        />
        <div className="px-4 pb-16 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-1.5 strand-hscroll">
              <Chip
                active={!categoryId}
                onClick={() => setCategoryId(null)}
                activeStyle={{ background: "hsl(var(--forum-espresso))", color: "hsl(var(--forum-ivory))" }}
              >
                All
              </Chip>
              {catsQ.data?.map((c) => {
                const s = catStyle(c.name);
                return (
                  <Chip
                    key={c.id}
                    active={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                    activeStyle={{ background: s.solid, color: "hsl(var(--forum-ivory))" }}
                    idleStyle={{ background: s.tint, color: s.solid }}
                  >
                    {c.name}
                  </Chip>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-body">
            <SortBtn active={sort === "new"} onClick={() => setSort("new")}>New</SortBtn>
            <SortBtn active={sort === "top"} onClick={() => setSort("top")}>Top</SortBtn>
          </div>

          {threadsQ.isLoading ? (
            <LoadingDot />
          ) : threadsQ.data && threadsQ.data.length > 0 ? (
            <ul className="space-y-2.5">
              {threadsQ.data.map((t) => {
                const author = authorsQ.data?.get(t.author_id);
                const firstName = (author?.display_name ?? "Member").split(" ")[0];
                const metaLine = authorMetaLine(author);
                const isTrending = t.id === trendingId;
                const cName = catName(t.category_id);
                const cStyle = catStyle(cName);
                const votes = t.vote_count ?? 0;
                const replies = t.reply_count ?? 0;
                return (
                  <li key={t.id}>
                    <Link
                      to={`/forum/${t.id}`}
                      className={cn(
                        "block rounded-2xl border p-4 transition-colors",
                        isTrending
                          ? "border-[hsl(var(--forum-espresso))] text-[hsl(var(--forum-ivory))] bg-[linear-gradient(135deg,hsl(var(--forum-espresso)),hsl(var(--forum-espresso-light)))]"
                          : "border-border bg-[hsl(var(--surface-raised))] hover:bg-[hsl(var(--forum-ivory))]",
                      )}
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <ForumAvatar
                          path={author?.avatar_url}
                          fallback={author?.display_name ?? "Member"}
                          className="size-9 text-[12px]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "text-[12px] font-body font-semibold leading-tight whitespace-nowrap truncate min-w-[52px] max-w-[120px]",
                                isTrending ? "text-[hsl(var(--forum-ivory))]" : "text-[hsl(var(--forum-charcoal))]",
                              )}
                            >
                              {firstName}
                            </span>
                            {isTrending ? (
                              <span className="shrink-0 inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] font-body font-bold uppercase tracking-wider text-[hsl(var(--forum-espresso))] bg-[hsl(var(--forum-ivory))] rounded-full px-1.5 py-0.5 leading-none">
                                <TrendingUp className="size-2.5" /> Trending
                              </span>
                            ) : (
                              t.category_id && (
                                <span
                                  className="shrink-0 whitespace-nowrap text-[9px] font-body font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 leading-none"
                                  style={{ background: cStyle.tint, color: cStyle.solid }}
                                >
                                  {cName}
                                </span>
                              )
                            )}
                            {t.is_pinned && <Pin className={cn("size-3 shrink-0", isTrending ? "text-[hsl(var(--forum-ivory))]" : "text-[hsl(var(--forum-espresso))]")} />}
                            {t.is_locked && <Lock className={cn("size-3 shrink-0", isTrending ? "text-[hsl(var(--forum-ivory))]/70" : "text-muted-foreground")} />}
                            <span
                              className={cn(
                                "shrink-0 text-[10.5px] font-body whitespace-nowrap",
                                isTrending ? "text-[hsl(var(--forum-ivory))]/80" : "text-foreground/55",
                              )}
                            >
                              · {relativeTime(t.created_at)}
                            </span>
                          </div>
                          {metaLine && (
                            <p
                              className={cn(
                                "text-[10.5px] font-body leading-tight truncate mt-1.5",
                                isTrending ? "text-[hsl(var(--forum-ivory))]/80" : "text-foreground/60",
                              )}
                            >
                              {metaLine}
                            </p>
                          )}
                        </div>
                      </div>
                      <h3
                        className={cn(
                          "font-display text-[15.5px] font-semibold leading-tight break-words",
                          isTrending ? "text-[hsl(var(--forum-ivory))]" : "text-[hsl(var(--forum-charcoal))]",
                        )}
                      >
                        {t.title}
                      </h3>
                      {t.body && (
                        <p
                          className={cn(
                            "mt-1 font-body text-[12px] line-clamp-2 break-words",
                            isTrending ? "text-[hsl(var(--forum-ivory))]" : "text-foreground/70",
                          )}
                        >
                          {renderMentions(t.body)}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center gap-3 text-[11px] font-body">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-1",
                            isTrending
                              ? votes > 0
                                ? "bg-[hsl(var(--forum-ivory))]/15 text-[hsl(var(--forum-ivory))]"
                                : "bg-[hsl(var(--forum-ivory))]/10 text-[hsl(var(--forum-ivory))]/55"
                              : votes > 0
                                ? "bg-primary/12 text-[hsl(var(--gold-deep))]"
                                : "bg-[hsl(var(--forum-ivory))] text-foreground/40",
                          )}
                        >
                          <ArrowUp className="size-3" />
                          <span className="font-semibold">{votes}</span>
                          <ArrowDown className="size-3 opacity-60" />
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            isTrending
                              ? replies > 0 ? "text-[hsl(var(--forum-ivory))]/85" : "text-[hsl(var(--forum-ivory))]/55"
                              : replies > 0 ? "text-muted-foreground" : "text-foreground/40",
                          )}
                        >
                          <MessageSquare className="size-3" /> {replies}
                        </span>
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

const Chip = ({
  active,
  onClick,
  children,
  activeStyle,
  idleStyle,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeStyle: React.CSSProperties;
  idleStyle?: React.CSSProperties;
}) => (
  <button
    onClick={onClick}
    style={active ? activeStyle : idleStyle}
    className={cn(
      "shrink-0 h-8 px-3 rounded-full text-[11.5px] font-body font-semibold border transition-colors",
      active ? "border-transparent" : "border-transparent",
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
      active ? "bg-[hsl(var(--forum-espresso))] text-[hsl(var(--forum-ivory))]" : "text-foreground/60",
    )}
  >
    {children}
  </button>
);

export default Forum;
