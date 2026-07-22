import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Lock, Pin, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

const AdminModeration = () => {
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

  return (
    <ScreenLayout>
      <TitleBar title="Moderation" />
      <div className="px-4 pb-10 space-y-3">
        {q.isLoading ? <LoadingDot /> : q.data && q.data.length > 0 ? (
          q.data.map((r) => (
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
          ))
        ) : (
          <div className="text-center py-16 text-sm font-body text-foreground/60">No open reports.</div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminModeration;
