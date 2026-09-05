import { useEffect, useState, useMemo, useRef } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Flag, Lock, Pin, Trash2, Loader2, Send, Reply as ReplyIcon, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { cn } from "@/lib/utils";
import ForumAvatar from "@/components/ForumAvatar";
import MentionTextarea, { type ResolvedMention } from "@/components/MentionTextarea";
import VoteControl from "@/components/forum/VoteControl";
import { renderMentions } from "@/lib/renderMentions";
import { smartBack } from "@/lib/smartBack";

type ReplyRow = {
  id: string;
  thread_id: string;
  parent_reply_id: string | null;
  depth: number | null;
  author_id: string;
  body: string;
  vote_count: number | null;
  created_at: string;
};

const ForumThread = () => {
  const { id } = useParams<{ id: string }>();
  useEffect(() => { markPlusSurfaceSeen("forum"); markPlusSurfaceSeen("threads"); }, []);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const rootMentions = useRef<ResolvedMention[]>([]);

  const threadQ = useQuery({
    queryKey: ["forum_thread", id],
    enabled: !!id,
    queryFn: async () => {
      // maybeSingle so a deleted/moderated thread renders a friendly
      // "not found" state instead of throwing PGRST116 into an error boundary.
      const { data, error } = await supabase
        .from("forum_threads")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
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
      return (data ?? []) as ReplyRow[];
    },
  });

  /** The member's own votes on this thread and its replies. */
  const myVotesQ = useQuery({
    queryKey: ["forum_my_votes", id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      const ids = [id!, ...(repliesQ.data ?? []).map((r) => r.id)];
      const { data, error } = await supabase
        .from("forum_votes")
        .select("target_id,target_kind,value")
        .eq("user_id", user!.id)
        .in("target_id", ids);
      if (error) throw error;
      const map = new Map<string, -1 | 0 | 1>();
      (data ?? []).forEach((v) => map.set(`${v.target_kind}:${v.target_id}`, (v.value ?? 1) as -1 | 1));
      return map;
    },
  });

  // Re-read votes once replies land so nested rows get their own state.
  useEffect(() => {
    if (repliesQ.data && user?.id) qc.invalidateQueries({ queryKey: ["forum_my_votes", id, user.id] });
  }, [repliesQ.data, user?.id, id, qc]);

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

  /** Two-level tree: top-level replies with their (single-level) children. */
  const tree = useMemo(() => {
    const rows = repliesQ.data ?? [];
    const tops = rows.filter((r) => !r.parent_reply_id);
    const kids = new Map<string, ReplyRow[]>();
    rows.filter((r) => !!r.parent_reply_id).forEach((r) => {
      const list = kids.get(r.parent_reply_id!) ?? [];
      list.push(r);
      kids.set(r.parent_reply_id!, list);
    });
    return tops.map((t) => ({ reply: t, children: kids.get(t.id) ?? [] }));
  }, [repliesQ.data]);

  const myVote = (kind: "thread" | "reply", targetId: string): -1 | 0 | 1 =>
    myVotesQ.data?.get(`${kind}:${targetId}`) ?? 0;

  const setVote = async (kind: "thread" | "reply", targetId: string, next: -1 | 0 | 1) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from("forum_votes").select("id,value")
      .eq("user_id", user.id).eq("target_id", targetId).eq("target_kind", kind)
      .maybeSingle();
    if (next === 0) {
      if (existing) await supabase.from("forum_votes").delete().eq("id", existing.id);
    } else if (existing) {
      if (existing.value !== next) await supabase.from("forum_votes").update({ value: next }).eq("id", existing.id);
    } else {
      const { error } = await supabase.from("forum_votes")
        .insert({ user_id: user.id, target_id: targetId, target_kind: kind, value: next });
      if (error) { toast.error("Could not save your vote"); return; }
    }
    qc.invalidateQueries({ queryKey: ["forum_my_votes", id, user.id] });
    if (kind === "thread") qc.invalidateQueries({ queryKey: ["forum_thread", id] });
    else qc.invalidateQueries({ queryKey: ["forum_replies", id] });
  };

  /** Record picked mentions so the member is notified by id, not by name matching. */
  const recordMentions = async (targetKind: "reply", targetId: string, mentions: ResolvedMention[]) => {
    if (!user || mentions.length === 0 || !id) return;
    const unique = Array.from(new Map(mentions.map((m) => [m.user_id, m])).values());
    await supabase.from("forum_mentions").insert(
      unique.map((m) => ({
        target_kind: targetKind, target_id: targetId, thread_id: id,
        user_id: m.user_id, created_by: user.id,
      })),
    );
  };

  const postReply = async (body: string, parentId: string | null, mentions: ResolvedMention[]) => {
    if (!user || !id || !body.trim()) return false;
    setBusy(true);
    const { data, error } = await supabase
      .from("forum_replies")
      .insert({ thread_id: id, author_id: user.id, body: body.trim(), parent_reply_id: parentId })
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    if (data?.id) await recordMentions("reply", data.id, mentions);
    qc.invalidateQueries({ queryKey: ["forum_replies", id] });
    qc.invalidateQueries({ queryKey: ["forum_thread", id] });
    return true;
  };

  const postRootReply = async () => {
    const ok = await postReply(reply, null, rootMentions.current);
    if (ok) { setReply(""); rootMentions.current = []; }
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

  const commentCount = repliesQ.data?.length ?? 0;

  const renderReply = (r: ReplyRow, nested: boolean) => (
    <div key={r.id} className={cn(nested && "ml-4 pl-3 border-l-2 border-primary/25")}>
      <div className={cn("rounded-[14px] border border-border bg-card", nested ? "p-2.5" : "p-3.5")}>
        <PosterRow
          uid={r.author_id}
          name={authorName(r.author_id)}
          avatar={authorAvatar(r.author_id)}
          createdAt={r.created_at}
          meta={authorMetaLine(authorsQ.data?.get(r.author_id))}
          compact={nested}
        />
        <p
          className={cn(
            "mt-1.5 whitespace-pre-wrap font-body text-foreground/85 leading-relaxed break-words",
            isEmojiOnly(r.body)
              ? "text-[26px] leading-snug"
              : nested ? "text-[12px]" : "text-[13px]",
          )}
        >
          {renderMentions(r.body)}
        </p>
        {/* Actions sit with the comment they belong to — the score no longer
            floats in a rail away from the text. */}
        <div className="mt-2 flex items-center gap-1.5">
          <VoteControl
            size={nested ? "sm" : "md"}
            score={r.vote_count ?? 0}
            myVote={myVote("reply", r.id)}
            onVote={(n) => setVote("reply", r.id, n)}
          />
          {!t.is_locked && (
            <button
              onClick={() => setReplyingTo(replyingTo === r.id ? null : r.id)}
              className={cn(
                "inline-flex items-center h-7 px-2 rounded-full font-body font-semibold text-foreground/65 hover:text-primary",
                nested ? "text-[10.5px]" : "text-[11px]",
              )}
            >
              Reply
            </button>
          )}
          <MessageLink uid={r.author_id} name={authorName(r.author_id)} />
          <button onClick={() => report("reply", r.id)} className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10.5px] font-body font-semibold text-foreground/50 hover:text-alert-dark">
            <Flag className="size-3" /> Report
          </button>
          {isAdmin && (
            <button
              onClick={() => modAction("delete_reply", r.id)}
              aria-label="Delete comment"
              className="ml-auto size-7 rounded-full flex items-center justify-center text-foreground/35 hover:text-alert-dark hover:bg-alert-dark/10"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      {replyingTo === r.id && (
        <InlineComposer
          threadId={t.id}
          replyingToName={authorName(r.author_id)}
          busy={busy}
          onCancel={() => setReplyingTo(null)}
          onSubmit={async (body, mentions) => {
            const ok = await postReply(body, r.id, mentions);
            if (ok) setReplyingTo(null);
            return ok;
          }}
        />
      )}
    </div>
  );



  return (
    <PlusGate title="Thread">
      <ScreenLayout>
        <TitleBar title="Thread" onBack={smartBack(nav, "/forum")} />
        <div className="px-4 pb-32 space-y-3">
          <article className="rounded-[14px] border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <VoteControl
                  orientation="vertical"
                  score={t.vote_count ?? 0}
                  myVote={myVote("thread", t.id)}
                  onVote={(n) => setVote("thread", t.id, n)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <PosterRow uid={t.author_id} name={authorName(t.author_id)} avatar={authorAvatar(t.author_id)} createdAt={t.created_at} meta={authorMetaLine(t.author_id)} />
                <h1 className="mt-2 font-display text-[19px] font-semibold leading-tight">{t.title}</h1>
                {t.body && <p className="mt-2 whitespace-pre-wrap font-body text-[13.5px] text-foreground/85 leading-relaxed">{renderMentions(t.body)}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => report("thread", t.id)} className="inline-flex items-center gap-1 h-8 pr-2 rounded-full text-[11px] font-body font-semibold text-foreground/60 hover:text-alert-dark">
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
              </div>
            </div>
          </article>


          <div className="text-[11px] font-body font-bold uppercase tracking-wider text-foreground/60 px-1 flex items-center gap-1">
            <MessageSquare className="size-3" /> Comments ({commentCount})
          </div>

          {tree.map(({ reply: top, children }) => (
            <div key={top.id} className="space-y-2">
              {renderReply(top, false)}
              {children.map((c) => renderReply(c, true))}
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
              <div className="flex-1">
                <MentionTextarea
                  rows={2}
                  value={reply}
                  onChange={setReply}
                  threadId={t.id}
                  onMention={(m) => { rootMentions.current = [...rootMentions.current, m]; }}
                  placeholder="Add a comment… type @ to tag"
                  maxLength={2000}
                  className="resize-none min-h-[44px]"
                />
              </div>
              <Button variant="gold" size="icon" className="rounded-full size-11 shrink-0" onClick={postRootReply} disabled={busy || !reply.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        )}
      </ScreenLayout>
    </PlusGate>
  );
};

/** Composer scoped to one comment — never creates a top-level comment. */
const InlineComposer = ({
  threadId,
  replyingToName,
  busy,
  onCancel,
  onSubmit,
}: {
  threadId: string;
  replyingToName: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: string, mentions: ResolvedMention[]) => Promise<boolean>;
}) => {
  const [body, setBody] = useState("");
  const mentions = useRef<ResolvedMention[]>([]);

  return (
    <div className="mt-2 ml-4 pl-3 border-l-2 border-primary/50">
      <div className="rounded-[12px] border-2 border-primary/40 bg-muted/40 p-2.5 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <p className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-body font-bold uppercase tracking-wider text-primary">
            <ReplyIcon className="size-3" /> Replying to {replyingToName}
          </p>
          <button onClick={onCancel} aria-label="Cancel reply" className="size-6 rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>

        <MentionTextarea
          rows={2}
          value={body}
          onChange={setBody}
          threadId={threadId}
          onMention={(m) => { mentions.current = [...mentions.current, m]; }}
          placeholder="Write a reply… type @ to tag"
          maxLength={2000}
          className="resize-none min-h-[40px] bg-card"
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="gold"
            size="sm"
            className="rounded-pill h-8 px-4 text-[11px] font-semibold uppercase tracking-wider"
            disabled={busy || !body.trim()}
            onClick={async () => {
              const ok = await onSubmit(body, mentions.current);
              if (ok) { setBody(""); mentions.current = []; }
            }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const PosterRow = ({ uid, name, avatar, createdAt, meta, compact = false }: { uid: string; name: string; avatar: string | null; createdAt: string; meta?: string | null; compact?: boolean }) => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [opening, setOpening] = useState(false);
  const isMe = user?.id === uid;

  const message = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.rpc("start_member_dm", { _other_user: uid });
      if (error) throw error;
      nav(`/messages/${data}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Could not open chat");
      setOpening(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Link to={`/member/${uid}`} className="flex items-center gap-2 min-w-0 flex-1 group">
        <ForumAvatar path={avatar} fallback={name[0]} className={compact ? "size-6 text-[11px]" : "size-8 text-[12px]"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
            <span className={cn("font-body font-semibold text-foreground/85 group-hover:text-primary", compact ? "text-[11.5px]" : "text-[12.5px]")}>{name}</span>
            <span className={cn("font-body text-foreground/45", compact ? "text-[10px]" : "text-[10.5px]")}>· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
            {meta && (
              <span className={cn("font-body text-foreground/45 min-w-0 truncate", compact ? "text-[10px]" : "text-[10.5px]")}>· {meta}</span>
            )}
          </div>
        </div>
      </Link>
      {!isMe && (
        <button
          type="button"
          onClick={message}
          disabled={opening}
          aria-label={`Message ${name}`}
          className={cn(
            "shrink-0 rounded-full border border-border bg-card flex items-center justify-center text-foreground/60 hover:text-primary hover:bg-primary/10 disabled:opacity-50",
            compact ? "size-7" : "size-8",
          )}
        >
          {opening ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
        </button>
      )}
    </div>
  );
};



export default ForumThread;
