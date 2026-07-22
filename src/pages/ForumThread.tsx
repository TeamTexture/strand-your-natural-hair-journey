import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, MessageSquare, Flag, Lock, Pin, Trash2, Loader2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { cn } from "@/lib/utils";
import ForumAvatar from "@/components/ForumAvatar";
import MentionTextarea from "@/components/MentionTextarea";
import { renderMentions } from "@/lib/renderMentions";

const ForumThread = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const threadQ = useQuery({
    queryKey: ["forum_thread", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("forum_threads").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const repliesQ = useQuery({
    queryKey: ["forum_replies", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_replies").select("*").eq("thread_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const authorIds = useMemo(() => {
    const set = new Set<string>();
    if (threadQ.data?.author_id) set.add(threadQ.data.author_id);
    (repliesQ.data ?? []).forEach((r) => set.add(r.author_id));
    return Array.from(set);
  }, [threadQ.data, repliesQ.data]);

  type AuthorMeta = {
    display_name: string | null;
    avatar_url: string | null;
    city: string | null;
    goal_title: string | null;
    hair_type: string | null;
    current_style: string | null;
  };
  const authorsQ = useQuery({
    queryKey: ["forum_author_meta_thread", authorIds],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.rpc("forum_author_meta", { _user_ids: authorIds });
      const map = new Map<string, AuthorMeta>();
      (data ?? []).forEach((p) => map.set(p.user_id, p as AuthorMeta));
      return map;
    },
  });

  const upvote = async (kind: "thread" | "reply", targetId: string) => {
    if (!user) return;
    // Toggle: insert if missing, delete if present (unique constraint on user+target).
    const { data: existing } = await supabase
      .from("forum_votes").select("id")
      .eq("user_id", user.id).eq("target_id", targetId).eq("target_kind", kind)
      .maybeSingle();
    if (existing) {
      await supabase.from("forum_votes").delete().eq("id", existing.id);
    } else {
      await supabase.from("forum_votes").insert({ user_id: user.id, target_id: targetId, target_kind: kind });
    }
    if (kind === "thread") qc.invalidateQueries({ queryKey: ["forum_thread", id] });
    else qc.invalidateQueries({ queryKey: ["forum_replies", id] });
  };
  const postReply = async () => {
    if (!user || !id || !reply.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("forum_replies").insert({ thread_id: id, author_id: user.id, body: reply.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setReply("");
    qc.invalidateQueries({ queryKey: ["forum_replies", id] });
    qc.invalidateQueries({ queryKey: ["forum_thread", id] });
  };
  const report = async (kind: "thread" | "reply", targetId: string) => {
    if (!user) return;
    const reason = window.prompt("Reason for reporting?");
    if (!reason) return;
    const { error } = await supabase.from("forum_reports").insert({
      reporter_id: user.id, reason, target_kind: kind, target_id: targetId,
    });
    if (error) toast.error(error.message); else toast.success("Reported. Thanks.");
  };
  const modAction = async (action: "pin" | "lock" | "delete_thread" | "delete_reply", targetId: string) => {
    if (!isAdmin) return;
    if (action === "pin") await supabase.from("forum_threads").update({ is_pinned: !threadQ.data?.is_pinned }).eq("id", targetId);
    if (action === "lock") await supabase.from("forum_threads").update({ is_locked: !threadQ.data?.is_locked }).eq("id", targetId);
    if (action === "delete_thread") { await supabase.from("forum_threads").delete().eq("id", targetId); nav("/forum"); return; }
    if (action === "delete_reply") await supabase.from("forum_replies").delete().eq("id", targetId);
    qc.invalidateQueries({ queryKey: ["forum_thread", id] });
    qc.invalidateQueries({ queryKey: ["forum_replies", id] });
  };

  if (threadQ.isLoading) return <PlusGate title="Thread"><LoadingDot /></PlusGate>;
  const t = threadQ.data;
  if (!t) return <PlusGate title="Thread"><div className="p-8 text-center text-sm">Not found</div></PlusGate>;

  const authorName = (uid: string) => (authorsQ.data?.get(uid)?.display_name ?? "Member").split(" ")[0];
  const authorAvatar = (uid: string) => authorsQ.data?.get(uid)?.avatar_url ?? null;
  const authorMetaLine = (uid: string) => {
    const a = authorsQ.data?.get(uid);
    const parts: string[] = [];
    if (a?.goal_title) parts.push(`Goal: ${a.goal_title}`);
    if (a?.current_style) parts.push(`Current Style: ${a.current_style}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  return (
    <PlusGate title="Thread">
      <ScreenLayout>
        <TitleBar title="Thread" onBack={() => nav("/forum")} />
        <div className="px-4 pb-32 space-y-3">
          <article className="rounded-[14px] border border-border bg-card p-4">
            <PosterRow uid={t.author_id} name={authorName(t.author_id)} avatar={authorAvatar(t.author_id)} createdAt={t.created_at} meta={authorMetaLine(t.author_id)} />
            <h1 className="mt-2 font-display text-[19px] font-semibold leading-tight">{t.title}</h1>
            {t.body && <p className="mt-2 whitespace-pre-wrap font-body text-[13.5px] text-foreground/85 leading-relaxed">{renderMentions(t.body)}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => upvote("thread", t.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold border border-border bg-card hover:bg-primary/10">
                <ArrowUp className="size-3.5" /> {t.vote_count ?? 0}
              </button>
              <button onClick={() => report("thread", t.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold text-foreground/60 hover:text-alert-dark">
                <Flag className="size-3.5" /> Report
              </button>
              {isAdmin && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => modAction("pin", t.id)} className={cn("size-8 rounded-full flex items-center justify-center", t.is_pinned ? "bg-primary text-primary-foreground" : "text-foreground/60 hover:bg-muted")}>
                    <Pin className="size-3.5" />
                  </button>
                  <button onClick={() => modAction("lock", t.id)} className={cn("size-8 rounded-full flex items-center justify-center", t.is_locked ? "bg-brown text-brown-foreground" : "text-foreground/60 hover:bg-muted")}>
                    <Lock className="size-3.5" />
                  </button>
                  <button onClick={() => modAction("delete_thread", t.id)} className="size-8 rounded-full flex items-center justify-center text-alert-dark hover:bg-alert-dark/10">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          </article>

          <div className="text-[11px] font-body font-bold uppercase tracking-wider text-foreground/60 px-1 flex items-center gap-1">
            <MessageSquare className="size-3" /> Replies ({repliesQ.data?.length ?? 0})
          </div>

          {(repliesQ.data ?? []).map((r) => (
            <div key={r.id} className="rounded-[14px] border border-border bg-card p-4">
              <PosterRow uid={r.author_id} name={authorName(r.author_id)} avatar={authorAvatar(r.author_id)} createdAt={r.created_at} meta={authorMetaLine(r.author_id)} />
              <p className="mt-2 whitespace-pre-wrap font-body text-[13px] text-foreground/85 leading-relaxed">{r.body}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => upvote("reply", r.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[10.5px] font-semibold border border-border bg-card hover:bg-primary/10">
                  <ArrowUp className="size-3" /> {r.vote_count ?? 0}
                </button>
                <button onClick={() => report("reply", r.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[10.5px] font-semibold text-foreground/60 hover:text-alert-dark">
                  <Flag className="size-3" /> Report
                </button>
                {isAdmin && (
                  <button onClick={() => modAction("delete_reply", r.id)} className="ml-auto size-7 rounded-full flex items-center justify-center text-alert-dark hover:bg-alert-dark/10">
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {t.is_locked ? (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[350px] w-[calc(100%-32px)] text-center text-[12px] font-body text-foreground/60 rounded-full bg-brown/10 border border-brown/20 py-2">
            This thread is locked.
          </div>
        ) : (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a reply…" className="flex-1 resize-none min-h-[44px]" maxLength={2000} />
              <Button variant="gold" size="icon" className="rounded-full size-11 shrink-0" onClick={postReply} disabled={busy || !reply.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        )}
      </ScreenLayout>
    </PlusGate>
  );
};

const PosterRow = ({ uid, name, avatar, createdAt, meta }: { uid: string; name: string; avatar: string | null; createdAt: string; meta?: string | null }) => (
  <Link to={`/member/${uid}`} className="flex items-start gap-2.5 group">
    <ForumAvatar path={avatar} fallback={name[0]} className="size-9 text-[13px]" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[12.5px] font-body font-semibold text-foreground/85 group-hover:text-primary leading-tight">{name}</span>
        <span className="text-[10.5px] font-body text-foreground/50">· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
      </div>
      {meta && <p className="text-[10.5px] font-body text-foreground/60 leading-tight truncate mt-0.5">{meta}</p>}
    </div>
  </Link>
);

export default ForumThread;

