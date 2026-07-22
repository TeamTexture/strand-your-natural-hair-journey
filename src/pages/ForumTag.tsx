import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Calendar, BookOpen } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/formatDate";

const ForumTag = () => {
  const { tag = "" } = useParams();
  const nav = useNavigate();
  const cleanTag = useMemo(() => tag.trim().toLowerCase().replace(/^#/, ""), [tag]);
  const like = `%#${cleanTag}%`;

  const q = useQuery({
    queryKey: ["forum_tag", cleanTag],
    enabled: !!cleanTag,
    queryFn: async () => {
      const [threads, events, content] = await Promise.all([
        supabase
          .from("forum_threads")
          .select("id,title,body,created_at,reply_count")
          .or(`title.ilike.${like},body.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("events")
          .select("id,title,description,starts_at,kind")
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order("starts_at", { ascending: false })
          .limit(30),
        supabase
          .from("content_items")
          .select("id,title,body_md,kind,collection_id,created_at")
          .or(`title.ilike.${like},body_md.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      return {
        threads: threads.data ?? [],
        events: events.data ?? [],
        content: content.data ?? [],
      };
    },
  });

  const total = (q.data?.threads.length ?? 0) + (q.data?.events.length ?? 0) + (q.data?.content.length ?? 0);

  return (
    <ScreenLayout>
      <TitleBar title={`#${cleanTag}`} onBack={() => nav(-1)} />
      <div className="px-5 pb-10 space-y-6">
        <p className="text-[12px] font-body text-foreground/60">
          {q.isLoading ? "Searching…" : `${total} result${total === 1 ? "" : "s"} tagged #${cleanTag}`}
        </p>

        {q.isLoading ? (
          <div className="flex justify-center pt-8"><Loader2 className="size-5 animate-spin text-primary" /></div>
        ) : total === 0 ? (
          <p className="text-[13px] font-body text-foreground/60">
            Nothing tagged with <span className="text-primary font-semibold">#{cleanTag}</span> yet.
          </p>
        ) : (
          <>
            {q.data!.threads.length > 0 && (
              <section>
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-foreground/60 mb-2">Forum threads</h2>
                <ul className="space-y-2">
                  {q.data!.threads.map((t) => (
                    <li key={t.id}>
                      <Link to={`/forum/${t.id}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-foreground/50">
                          <MessageSquare className="size-3" /> Thread · {formatDate(t.created_at)}
                        </div>
                        <p className="mt-1 font-display text-[15px] font-semibold">{t.title}</p>
                        {t.body && <p className="mt-1 text-[12px] font-body text-foreground/70 line-clamp-2">{t.body}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {q.data!.events.length > 0 && (
              <section>
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-foreground/60 mb-2">Events</h2>
                <ul className="space-y-2">
                  {q.data!.events.map((e) => (
                    <li key={e.id}>
                      <Link to={`/plus/events/${e.id}`} className="block rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-foreground/50">
                          <Calendar className="size-3" /> {e.kind === "in_person" ? "In-person" : "Digital"} · {formatDate(e.starts_at)}
                        </div>
                        <p className="mt-1 font-display text-[15px] font-semibold">{e.title}</p>
                        {e.description && <p className="mt-1 text-[12px] font-body text-foreground/70 line-clamp-2">{e.description}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {q.data!.content.length > 0 && (
              <section>
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-foreground/60 mb-2">Library</h2>
                <ul className="space-y-2">
                  {q.data!.content.map((c) => (
                    <li key={c.id}>
                      <Link to={c.collection_id ? `/plus/library/${c.collection_id}` : "/plus/library"} className="block rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-foreground/50">
                          <BookOpen className="size-3" /> {String(c.kind).toUpperCase()}
                        </div>
                        <p className="mt-1 font-display text-[15px] font-semibold">{c.title}</p>
                        {c.body_md && <p className="mt-1 text-[12px] font-body text-foreground/70 line-clamp-2">{c.body_md}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ForumTag;
