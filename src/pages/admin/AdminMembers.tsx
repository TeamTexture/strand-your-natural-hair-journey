import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Search, Loader2, ShieldOff, ShieldCheck, Activity, Trash2, Mail, CheckCircle2, Circle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import { useIncompleteMembers, type IncompleteMemberRow } from "@/hooks/useIncompleteMembers";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface MemberRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  complimentary_access: boolean;
  access_restricted: boolean;
  created_at: string;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  session_count: number;
  last_session: string | null;
  sessions_last_30d: number;
}

function statusBadge(row: MemberRow) {
  if (row.access_restricted) return { label: "Restricted", cls: "bg-destructive/15 text-destructive" };
  if (row.complimentary_access) return { label: "Complimentary", cls: "bg-primary/15 text-primary" };
  const s = row.subscription_status;
  if (s === "active" || s === "trialing") return { label: "Active", cls: "bg-good/15 text-good" };
  if (s === "past_due" || s === "unpaid") return { label: "Past due", cls: "bg-warn/20 text-warn" };
  if (s === "canceled") return { label: "Cancelled", cls: "bg-muted text-muted-foreground" };
  return { label: "No sub", cls: "bg-muted text-muted-foreground" };
}

type Filter = "all" | "active" | "complimentary" | "restricted" | "incomplete";
type SortKey = "recent" | "most_active";

function activityLevel(sessions30d: number): "high" | "active" | null {
  if (sessions30d >= 15) return "high";
  if (sessions30d >= 5) return "active";
  return null;
}

const AdminMembers = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [restrictTarget, setRestrictTarget] = useState<MemberRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "members"],
    queryFn: async (): Promise<MemberRow[]> => {
      const [profilesRes, subsRes, emailsRes, activityRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, complimentary_access, access_restricted, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, status, current_period_end, cancel_at_period_end"),
        supabase.rpc("admin_list_member_emails"),
        supabase.rpc("admin_list_member_activity"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      if (emailsRes.error) throw emailsRes.error;
      if (activityRes.error) throw activityRes.error;
      const subMap = new Map(
        (subsRes.data ?? []).map((s) => [
          s.user_id,
          {
            subscription_status: s.status,
            current_period_end: s.current_period_end,
            cancel_at_period_end: s.cancel_at_period_end,
          },
        ]),
      );
      const emailMap = new Map(
        ((emailsRes.data ?? []) as Array<{ user_id: string; email: string | null }>).map((e) => [
          e.user_id,
          e.email,
        ]),
      );
      const activityMap = new Map(
        ((activityRes.data ?? []) as Array<{
          user_id: string;
          session_count: number | string;
          last_session: string | null;
          sessions_last_30d: number | string;
        }>).map((a) => [
          a.user_id,
          {
            session_count: Number(a.session_count) || 0,
            last_session: a.last_session,
            sessions_last_30d: Number(a.sessions_last_30d) || 0,
          },
        ]),
      );
      return (profilesRes.data ?? []).map((p) => {
        const act = activityMap.get(p.user_id);
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          email: emailMap.get(p.user_id) ?? null,
          complimentary_access: !!(p as { complimentary_access?: boolean }).complimentary_access,
          access_restricted: !!(p as { access_restricted?: boolean }).access_restricted,
          created_at: p.created_at,
          subscription_status: subMap.get(p.user_id)?.subscription_status ?? null,
          current_period_end: subMap.get(p.user_id)?.current_period_end ?? null,
          cancel_at_period_end: subMap.get(p.user_id)?.cancel_at_period_end ?? null,
          session_count: act?.session_count ?? 0,
          last_session: act?.last_session ?? null,
          sessions_last_30d: act?.sessions_last_30d ?? 0,
        };
      });
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ complimentary_access: value })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not update");
    },
  });

  const restrict = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-restrict-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        stripe_configured: boolean;
        cancellations?: Array<{ kind: string; ok: boolean; error?: string }>;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      const failed = (data?.cancellations ?? []).filter((c) => !c.ok);
      if (!data?.stripe_configured) {
        toast.success("Access restricted. Stripe not configured — cancel any subscriptions manually.");
      } else if (failed.length > 0) {
        toast.warning(
          `Access restricted, but ${failed.length} Stripe cancellation${failed.length === 1 ? "" : "s"} failed — check logs.`,
        );
      } else {
        toast.success("Access restricted. Subscriptions cancelled and pro records suspended.");
      }
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not restrict");
    },
  });

  const unrestrict = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_unrestrict_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      toast.success("Access restored. They can resubscribe themselves.");
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not unrestrict");
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      return data as { ok: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      toast.success("Member deleted. All their data has been removed.");
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not delete member");
    },
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "restricted" && !r.access_restricted) return false;
      if (filter === "complimentary" && !r.complimentary_access) return false;
      if (filter === "active") {
        const active = r.subscription_status === "active" || r.subscription_status === "trialing";
        if (!active || r.access_restricted) return false;
      }
      if (!t) return true;
      return (
        (r.display_name ?? "").toLowerCase().includes(t) ||
        (r.email ?? "").toLowerCase().includes(t) ||
        r.user_id.includes(t)
      );
    });
    if (sort === "most_active") {
      return [...list].sort((a, b) => {
        if (b.sessions_last_30d !== a.sessions_last_30d) {
          return b.sessions_last_30d - a.sessions_last_30d;
        }
        return b.session_count - a.session_count;
      });
    }
    return list;
  }, [rows, q, filter, sort]);

  const { data: incompleteRows = [], isLoading: incompleteLoading } = useIncompleteMembers();

  const filteredIncomplete = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? incompleteRows.filter(
          (r) =>
            (r.display_name ?? "").toLowerCase().includes(t) ||
            (r.email ?? "").toLowerCase().includes(t) ||
            r.user_id.includes(t),
        )
      : incompleteRows;
    if (sort === "most_active") {
      return [...list].sort((a, b) => {
        if (b.sessions_last_30d !== a.sessions_last_30d) return b.sessions_last_30d - a.sessions_last_30d;
        return b.session_count - a.session_count;
      });
    }
    return list;
  }, [incompleteRows, q, sort]);

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    {
      key: "active",
      label: "Active",
      count: rows.filter(
        (r) => !r.access_restricted && (r.subscription_status === "active" || r.subscription_status === "trialing"),
      ).length,
    },
    { key: "complimentary", label: "Complimentary", count: rows.filter((r) => r.complimentary_access).length },
    { key: "incomplete", label: "Incomplete", count: incompleteRows.length },
    { key: "restricted", label: "Restricted", count: rows.filter((r) => r.access_restricted).length },
  ];

  return (
    <ScreenLayout>
      <TitleBar title="Members" onBack={() => nav("/admin")} />

      <div className="px-5 pb-4">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or id…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="px-5 border-b border-primary/10">
        <div className="flex gap-5">
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "relative pb-2.5 pt-1 text-[13px] font-body whitespace-nowrap transition-colors inline-flex items-center gap-1.5",
                  active ? "text-primary font-semibold" : "text-foreground/45 font-medium hover:text-foreground/70",
                )}
              >
                <span>{t.label}</span>
                {typeof t.count === "number" && t.count > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none",
                      active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                    )}
                  >
                    {t.count > 99 ? "99+" : t.count}
                  </span>
                )}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
          Sort
        </span>
        <div className="inline-flex rounded-pill bg-primary/10 p-0.5">
          {([
            { key: "recent", label: "Newest" },
            { key: "most_active", label: "Most active" },
          ] as { key: SortKey; label: string }[]).map((s) => {
            const active = sort === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "px-3 h-7 rounded-pill text-[11px] font-body transition-colors",
                  active ? "bg-primary text-primary-foreground font-semibold" : "text-primary/70 hover:text-primary",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 pb-8 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-foreground/60 py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading members…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No members match.</p>
        ) : (
          filtered.map((r) => {
            const badge = statusBadge(r);
            const isSelf = user?.id === r.user_id;
            const level = activityLevel(r.sessions_last_30d);
            const hasActivity = r.session_count > 0 && !!r.last_session;
            return (
              <SurfaceCard key={r.user_id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-body font-semibold truncate">
                        {r.display_name ?? "Unnamed member"}
                      </p>
                      {level && (
                        <span
                          title={level === "high" ? "Highly active user" : "Active user"}
                          className={cn(
                            "inline-flex items-center justify-center rounded-full shrink-0",
                            level === "high"
                              ? "size-4 bg-primary/20 text-primary"
                              : "size-4 bg-primary/10 text-primary/80",
                          )}
                        >
                          <Activity
                            className={cn(
                              level === "high" ? "size-2.5" : "size-2.5",
                            )}
                            strokeWidth={level === "high" ? 3 : 2.25}
                          />
                        </span>
                      )}
                    </div>
                    {r.email && (
                      <p className="text-[12px] text-muted-foreground truncate">{r.email}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground truncate">
                      Joined {new Date(r.created_at).toLocaleDateString("en-GB")} · {r.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {hasActivity ? (
                        <>
                          {r.session_count} session{r.session_count === 1 ? "" : "s"} · last active{" "}
                          {formatDistanceToNow(new Date(r.last_session!), { addSuffix: true })}
                        </>
                      ) : (
                        <span className="italic">— New tracking</span>
                      )}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full uppercase ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 rounded-pill text-[12px] font-body"
                    onClick={() => nav(`/admin/members/${r.user_id}/passport`)}
                  >
                    View passport
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-[12px] font-body font-medium">Complimentary access</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Free access. Overrides Stripe status.
                    </p>
                  </div>
                  <Switch
                    checked={r.complimentary_access}
                    disabled={toggle.isPending || r.access_restricted}
                    onCheckedChange={(v) => toggle.mutate({ userId: r.user_id, value: v })}
                  />
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  {r.access_restricted ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-pill text-[12px] font-body"
                      disabled={unrestrict.isPending}
                      onClick={() => unrestrict.mutate(r.user_id)}
                    >
                      <ShieldCheck className="size-3.5 mr-1.5" />
                      Unrestrict access
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-9 rounded-pill text-[12px] font-body text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isSelf || restrict.isPending}
                      onClick={() => setRestrictTarget(r)}
                    >
                      <ShieldOff className="size-3.5 mr-1.5" />
                      {isSelf ? "Cannot restrict yourself" : "Restrict access"}
                    </Button>
                  )}
                </div>
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-9 rounded-pill text-[12px] font-body text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isSelf || deleteUser.isPending}
                    onClick={() => {
                      setDeleteConfirm("");
                      setDeleteTarget(r);
                    }}
                  >
                    <Trash2 className="size-3.5 mr-1.5" />
                    {isSelf ? "Cannot delete yourself" : "Delete account"}
                  </Button>
                </div>
              </SurfaceCard>
            );
          })
        )}
      </div>

      <AlertDialog open={!!restrictTarget} onOpenChange={(o) => !o && setRestrictTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restrict access?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This will block <span className="font-semibold">{restrictTarget?.display_name ?? "this member"}</span> from
                  using the app. They'll only see the "Access restricted" screen.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-foreground/75">
                  <li>Any active Stripe subscription (consumer and/or pro) will be cancelled.</li>
                  <li>If they're a professional, their directory listing is unpublished.</li>
                  <li>All active client passport links they hold as a pro are revoked.</li>
                  <li>Unrestricting later restores access, but does not resubscribe or republish anything.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (restrictTarget) {
                  restrict.mutate(restrictTarget.user_id);
                  setRestrictTarget(null);
                }
              }}
            >
              Restrict
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This permanently deletes{" "}
                  <span className="font-semibold">
                    {deleteTarget?.display_name ?? deleteTarget?.email ?? "this member"}
                  </span>{" "}
                  and every record they own — profile, wash days, journals, products, appointments,
                  moodboards, blood work, subscriptions and role. This cannot be undone.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-foreground/75">
                  <li>Any active Stripe subscription (consumer and/or pro) will be cancelled first.</li>
                  <li>The auth account is removed — they'll need to sign up again to return.</li>
                </ul>
                <p className="pt-2">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm:
                </p>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConfirm !== "DELETE" || deleteUser.isPending}
              onClick={(e) => {
                if (deleteConfirm !== "DELETE") {
                  e.preventDefault();
                  return;
                }
                if (deleteTarget) {
                  deleteUser.mutate(deleteTarget.user_id);
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default AdminMembers;
