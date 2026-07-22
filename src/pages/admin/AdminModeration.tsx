import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Lock, Pin, Check, MessageSquare, Loader2, EyeOff, Eye, Unlock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tab = "reports" | "threads";

const AdminModeration = () => {
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <ScreenLayout>
      <TitleBar title="Forum moderation" />
      <div className="px-5 border-b border-primary/10">
        <div className="flex gap-5">
          {(
            [
              { key: "reports", label: "Reports" },
              { key: "threads", label: "All threads" },
            ] as { key: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative pb-2.5 pt-1 text-[13px] font-body whitespace-nowrap transition-colors",
                  active ? "text-primary font-semibold" : "text-foreground/45 font-medium hover:text-foreground/70",
                )}
              >
                {t.label}
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-10 space-y-3 pt-3">
        {tab === "reports" ? <ReportsList /> : <ThreadsList />}
      </div>
    </ScreenLayout>
  );
};

const ReportsList = () => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["forum_reports_open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_reports").select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const resolve = async (id: string) => {
    const { error } = await supabase.from("forum_reports").update({
      status: "resolved", reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["forum_reports_open"] });
  };
  const deleteContent = async (report: { id: string; target_kind: string; target_id: string }) => {
    if (report.target_kind === "thread") await supabase.from("forum_threads").delete().eq("id", report.target_id);
    if (report.target_kind === "reply") await supabase.from("forum_replies").delete().eq("id", report.target_id);
    await resolve(report.id);
  };
  const lockThread = async (targetId: string, reportId: string) => {
    await supabase.from("forum_threads").update({ is_locked: true }).eq("id", targetId);
    await resolve(reportId);
  };
  const pinThread = async (targetId: string, reportId: string) => {
    await supabase.from("forum_threads").update({ is_pinned: true }).eq("id", targetId);
    await resolve(reportId);
  };

  if (q.isLoading) return <LoadingDot />;
  if (!q.data?.length) return <div className="text-center py-16 text-sm font-body text-foreground/60">No open reports.</div>;

  return (
    <>
      {q.data.map((r) => (
        <div key={r.id} className="rounded-[14px] border border-border bg-card p-4 space-y-2">
          <div className="text-[10px] font-body font-bold uppercase tracking-wider text-alert-dark">
            {r.target_kind.toUpperCase()} report · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
          </div>
          <p className="font-body text-[12.5px] text-foreground/85"><span className="font-semibold">Reason:</span> {r.reason}</p>
          {r.target_kind === "thread" && (
            <Link to={`/forum/${r.target_id}`} className="text-primary text-[12px] font-semibold font-body underline">
              View thread
            </Link>
          )}
          {r.target_kind === "reply" && (
            <p className="text-[12px] text-foreground/60 font-body">Reply id: {r.target_id}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button onClick={() => resolve(r.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold border border-border bg-card hover:bg-muted/40">
              <Check className="size-3" /> Dismiss
            </button>
            <button onClick={() => deleteContent(r)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold bg-alert-dark text-alert-dark-foreground">
              <Trash2 className="size-3" /> Delete
            </button>
            {r.target_kind === "thread" && (
              <>
                <button onClick={() => lockThread(r.target_id, r.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold border border-border bg-card">
                  <Lock className="size-3" /> Lock
                </button>
                <button onClick={() => pinThread(r.target_id, r.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-semibold border border-border bg-card">
                  <Pin className="size-3" /> Pin
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
};

const ThreadsList = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin_all_threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_threads")
        .select("id, title, body, is_pinned, is_locked, reply_count, vote_count, created_at, author_id, category_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const authorIds = Array.from(new Set((data ?? []).map((t) => t.author_id)));
      const [{ data: authors }, { data: cats }] = await Promise.all([
        authorIds.length
          ? supabase.rpc("forum_author_info", { _user_ids: authorIds })
          : Promise.resolve({ data: [] as { user_id: string; first_name: string | null }[] }),
        supabase.from("forum_categories").select("id, name"),
      ]);
      const authorMap = new Map((authors ?? []).map((a: { user_id: string; first_name: string | null }) => [a.user_id, a.first_name]));
      const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
      return (data ?? []).map((t) => ({
        ...t,
        author_name: authorMap.get(t.author_id) ?? "Member",
        category_name: catMap.get(t.category_id) ?? "",
      }));
    },
  });

  const setBusy = (id: string, run: () => Promise<void>) => async () => {
    setBusyId(id);
    try { await run(); } finally { setBusyId(null); }
  };

  const del = (id: string) => setBusy(id, async () => {
    if (!window.confirm("Delete this thread and all its replies?")) return;
    const { error } = await supabase.from("forum_threads").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Thread deleted");
    qc.invalidateQueries({ queryKey: ["admin_all_threads"] });
  });

  const toggleLock = (id: string, next: boolean) => setBusy(id, async () => {
    const { error } = await supabase.from("forum_threads").update({ is_locked: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Thread locked" : "Thread unlocked");
    qc.invalidateQueries({ queryKey: ["admin_all_threads"] });
  });

  const togglePin = (id: string, next: boolean) => setBusy(id, async () => {
    const { error } = await supabase.from("forum_threads").update({ is_pinned: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Thread pinned" : "Thread unpinned");
    qc.invalidateQueries({ queryKey: ["admin_all_threads"] });
  });

  const postReply = async (threadId: string) => {
    if (!user?.id) return;
    if (!replyBody.trim()) { toast.error("Reply body required"); return; }
    setBusyId(threadId);
    const { error } = await supabase.from("forum_replies").insert({
      thread_id: threadId, author_id: user.id, body: replyBody.trim(),
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Reply posted as STRAND Team");
    setReplyFor(null); setReplyBody("");
    qc.invalidateQueries({ queryKey: ["admin_all_threads"] });
  };

  if (q.isLoading) return <LoadingDot />;
  if (!q.data?.length) return <div className="text-center py-16 text-sm font-body text-foreground/60">No threads yet.</div>;

  return (
    <>
      {q.data.map((t) => {
        const busy = busyId === t.id;
        return (
          <div key={t.id} className="rounded-[14px] border border-border bg-card p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {t.is_pinned && <Pin className="size-3 text-primary" />}
                  {t.is_locked && <Lock className="size-3 text-alert-dark" />}
                  <p className="text-[10px] uppercase tracking-wider font-body font-bold text-primary">{t.category_name}</p>
                </div>
                <Link to={`/forum/${t.id}`} className="block font-body font-semibold text-[13.5px] leading-snug hover:text-primary">
                  {t.title}
                </Link>
                <p className="text-[11px] text-foreground/60 font-body">
                  {t.author_name} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })} · {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
                </p>
                {t.body && <p className="text-[12px] text-foreground/75 font-body line-clamp-2 pt-0.5">{t.body}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                onClick={togglePin(t.id, !t.is_pinned)}
                disabled={busy}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border border-border bg-card disabled:opacity-50"
              >
                <Pin className="size-3" /> {t.is_pinned ? "Unpin" : "Pin"}
              </button>
              <button
                onClick={toggleLock(t.id, !t.is_locked)}
                disabled={busy}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border border-border bg-card disabled:opacity-50"
              >
                {t.is_locked ? <><Unlock className="size-3" /> Unlock</> : <><Lock className="size-3" /> Lock (hide replies)</>}
              </button>
              <button
                onClick={() => { setReplyFor(replyFor === t.id ? null : t.id); setReplyBody(""); }}
                disabled={busy}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-primary text-primary-foreground disabled:opacity-50"
              >
                <MessageSquare className="size-3" /> Reply
              </button>
              <button
                onClick={del(t.id)}
                disabled={busy}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-alert-dark text-alert-dark-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete
              </button>
            </div>

            {replyFor === t.id && (
              <div className="pt-2 space-y-2">
                <Textarea
                  rows={3}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Reply as STRAND Team…"
                  className="text-[12px]"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 h-8 rounded-pill text-[11px]" onClick={() => setReplyFor(null)}>Cancel</Button>
                  <Button variant="gold" size="sm" className="flex-1 h-8 rounded-pill text-[11px]" onClick={() => postReply(t.id)} disabled={busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Post reply"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export default AdminModeration;
