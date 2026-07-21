import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import {
  Search, Loader2, ChevronDown, ChevronUp, Eye, EyeOff, ShieldOff, ExternalLink,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProUsageRow {
  user_id: string;
  display_name: string | null;
  discipline: string | null;
  contact_email: string | null;
  email: string | null;
  is_published: boolean;
  suspended_at: string | null;
  access_restricted: boolean;
  application_status: string | null;
  application_created_at: string | null;
  sub_status: string | null;
  sub_current_period_end: string | null;
  sub_cancel_at_period_end: boolean | null;
  session_count: number;
  last_session: string | null;
  sessions_last_30d: number;
  enquiries_total: number;
  enquiries_pending: number;
  enquiries_accepted: number;
  enquiries_declined: number;
  active_clients: number;
  views_last_30d: number;
  offers_live: number;
  created_at: string;
}

interface ProDetail {
  recent_views: Array<{ consumer_id: string; consumer_name: string | null; section: string | null; viewed_at: string }>;
  response_stats: { total: number; responded: number; pending: number; avg_response_hours: number | null };
  live_offers: Array<{ id: string; title: string; code: string | null; starts_at: string | null; ends_at: string | null }>;
  profile: Record<string, unknown> | null;
}

const toNum = (v: unknown) => Number(v ?? 0) || 0;

const subLabel = (r: ProUsageRow) => {
  const s = r.sub_status;
  if (s === "active" || s === "trialing") {
    return {
      label: r.sub_cancel_at_period_end ? "Cancelling" : "Active",
      cls: r.sub_cancel_at_period_end ? "bg-warn/20 text-warn" : "bg-good/15 text-good",
    };
  }
  if (s === "past_due" || s === "unpaid") return { label: "Past due", cls: "bg-warn/20 text-warn" };
  if (s === "canceled") return { label: "Cancelled", cls: "bg-muted text-muted-foreground" };
  return { label: "No sub", cls: "bg-muted text-muted-foreground" };
};

type Filter = "all" | "published" | "unpublished" | "subscribed" | "suspended";
type SortKey = "most_active" | "most_clients" | "recent" | "sub_status";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Live" },
  { key: "unpublished", label: "Draft" },
  { key: "subscribed", label: "Subscribed" },
  { key: "suspended", label: "Suspended" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "most_active", label: "Most active" },
  { key: "most_clients", label: "Most clients" },
  { key: "recent", label: "Newest" },
  { key: "sub_status", label: "Subscription" },
];

const completeness = (profile: Record<string, unknown> | null) => {
  if (!profile) return 0;
  const fields = ["bio", "location", "website_url", "instagram_handle", "avatar_path", "business_phone", "business_email", "opening_hours"];
  const filled = fields.filter((f) => {
    const v = profile[f];
    if (v == null || v === "") return false;
    if (typeof v === "object" && v !== null && Object.keys(v).length === 0) return false;
    return true;
  }).length;
  const hasServices = Array.isArray(profile.services) && (profile.services as unknown[]).length > 0;
  return Math.round(((filled + (hasServices ? 1 : 0)) / (fields.length + 1)) * 100);
};

const ProDetailPanel = ({ userId }: { userId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "pro-usage", "detail", userId],
    queryFn: async (): Promise<ProDetail> => {
      const { data, error } = await supabase.rpc("admin_pro_usage_detail" as never, { _pro: userId } as never);
      if (error) throw error;
      return data as unknown as ProDetail;
    },
  });
  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3 justify-center">
        <Loader2 className="size-3.5 animate-spin" /> Loading detail…
      </div>
    );
  }
  const avg = data.response_stats.avg_response_hours;
  const score = completeness(data.profile);
  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">Response behaviour</p>
        <p className="text-[12px] font-body mt-0.5">
          {data.response_stats.responded}/{data.response_stats.total} responded
          {avg != null && ` · avg ${avg < 1 ? `${Math.round(avg * 60)}m` : `${avg.toFixed(1)}h`}`}
          {data.response_stats.pending > 0 && ` · ${data.response_stats.pending} pending`}
        </p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
          Profile completeness
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-primary/10 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", score < 50 ? "bg-warn" : "bg-primary")} style={{ width: `${score}%` }} />
          </div>
          <span className="text-[11px] font-body font-medium text-muted-foreground w-9 text-right">{score}%</span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
          Live offers ({data.live_offers.length})
        </p>
        {data.live_offers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic mt-0.5">None currently live.</p>
        ) : (
          <div className="mt-1 space-y-1">
            {data.live_offers.map((o) => (
              <div key={o.id} className="text-[12px] flex justify-between gap-2">
                <span className="truncate flex-1">{o.title}{o.code ? ` · ${o.code}` : ""}</span>
                {o.ends_at && <span className="text-muted-foreground text-[11px] shrink-0">until {format(new Date(o.ends_at), "d MMM")}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
          Recent passport views ({data.recent_views.length})
        </p>
        {data.recent_views.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic mt-0.5">No client passport views yet.</p>
        ) : (
          <div className="mt-1 space-y-1 max-h-56 overflow-y-auto">
            {data.recent_views.map((v, i) => (
              <div key={i} className="text-[11px] flex justify-between gap-2 border-l-2 border-primary/20 pl-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{v.consumer_name ?? v.consumer_id.slice(0, 8)}</p>
                  <p className="text-muted-foreground">{v.section ?? "—"}</p>
                </div>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AdminProfessionals = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("most_active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restrictTarget, setRestrictTarget] = useState<ProUsageRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "pro-usage"],
    queryFn: async (): Promise<ProUsageRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_pro_usage" as never);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        user_id: r.user_id as string,
        display_name: (r.display_name as string) ?? null,
        discipline: (r.discipline as string) ?? null,
        contact_email: (r.contact_email as string) ?? null,
        email: (r.email as string) ?? null,
        is_published: !!r.is_published,
        suspended_at: (r.suspended_at as string) ?? null,
        access_restricted: !!r.access_restricted,
        application_status: (r.application_status as string) ?? null,
        application_created_at: (r.application_created_at as string) ?? null,
        sub_status: (r.sub_status as string) ?? null,
        sub_current_period_end: (r.sub_current_period_end as string) ?? null,
        sub_cancel_at_period_end: (r.sub_cancel_at_period_end as boolean) ?? null,
        session_count: toNum(r.session_count),
        last_session: (r.last_session as string) ?? null,
        sessions_last_30d: toNum(r.sessions_last_30d),
        enquiries_total: toNum(r.enquiries_total),
        enquiries_pending: toNum(r.enquiries_pending),
        enquiries_accepted: toNum(r.enquiries_accepted),
        enquiries_declined: toNum(r.enquiries_declined),
        active_clients: toNum(r.active_clients),
        views_last_30d: toNum(r.views_last_30d),
        offers_live: toNum(r.offers_live),
        created_at: r.created_at as string,
      }));
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ userId, publish }: { userId: string; publish: boolean }) => {
      const { error } = await supabase
        .from("pro_profiles")
        .update({ is_published: publish, ...(publish ? { suspended_at: null } : {}) })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "pro-usage"] });
      toast.success(v.publish ? "Directory profile published." : "Directory profile unpublished.");
    },
    onError: (err) => toast.error((err as Error).message ?? "Could not update"),
  });

  const restrict = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-restrict-user", { body: { user_id: userId } });
      if (error) throw error;
      return data as { ok: boolean; stripe_configured?: boolean; cancellations?: Array<{ ok: boolean }> };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pro-usage"] });
      toast.success("Professional restricted. Subscription cancelled, directory unpublished, client access revoked.");
    },
    onError: (err) => toast.error((err as Error).message ?? "Could not restrict"),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "published" && !r.is_published) return false;
      if (filter === "unpublished" && r.is_published) return false;
      if (filter === "subscribed" && !(r.sub_status === "active" || r.sub_status === "trialing")) return false;
      if (filter === "suspended" && !r.suspended_at && !r.access_restricted) return false;
      if (!t) return true;
      return (
        (r.display_name ?? "").toLowerCase().includes(t) ||
        (r.email ?? "").toLowerCase().includes(t) ||
        (r.discipline ?? "").toLowerCase().includes(t)
      );
    });
    return [...list].sort((a, b) => {
      if (sort === "most_active") {
        return (b.sessions_last_30d - a.sessions_last_30d) || (b.session_count - a.session_count);
      }
      if (sort === "most_clients") {
        return (b.active_clients - a.active_clients) || (b.enquiries_accepted - a.enquiries_accepted);
      }
      if (sort === "sub_status") {
        const rank = (s: string | null) => (s === "active" || s === "trialing" ? 0 : s === "past_due" || s === "unpaid" ? 1 : s === "canceled" ? 2 : 3);
        return rank(a.sub_status) - rank(b.sub_status);
      }
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [rows, q, filter, sort]);

  const counts = useMemo(() => ({
    live: rows.filter((r) => r.is_published).length,
    subscribed: rows.filter((r) => r.sub_status === "active" || r.sub_status === "trialing").length,
    suspended: rows.filter((r) => r.suspended_at || r.access_restricted).length,
  }), [rows]);

  return (
    <ScreenLayout>
      <TitleBar title="Professionals" onBack={() => nav("/admin")} />

      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <SurfaceCard className="py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-body font-medium">Live</p>
            <p className="font-display text-[20px] leading-none mt-1">{counts.live}</p>
          </SurfaceCard>
          <SurfaceCard className="py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-body font-medium">Subscribed</p>
            <p className="font-display text-[20px] leading-none mt-1">{counts.subscribed}</p>
          </SurfaceCard>
          <SurfaceCard className="py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-body font-medium">Suspended</p>
            <p className={cn("font-display text-[20px] leading-none mt-1", counts.suspended > 0 && "text-warn")}>{counts.suspended}</p>
          </SurfaceCard>
        </div>
      </div>

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or discipline…" className="pl-9" />
        </div>
      </div>

      <div className="px-5 border-b border-primary/10">
        <div className="flex gap-5 overflow-x-auto scrollbar-hide">
          {FILTERS.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
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

      <div className="px-5 pt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">Sort</span>
        <div className="inline-flex rounded-pill bg-primary/10 p-0.5 overflow-x-auto scrollbar-hide">
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "px-3 h-7 rounded-pill text-[11px] font-body transition-colors whitespace-nowrap",
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
            <Loader2 className="size-4 animate-spin" /> Loading professionals…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No professionals match.</p>
        ) : (
          filtered.map((r) => {
            const sub = subLabel(r);
            const isExpanded = expanded === r.user_id;
            const renews = r.sub_current_period_end
              ? format(new Date(r.sub_current_period_end), "d MMM yyyy")
              : null;
            return (
              <SurfaceCard key={r.user_id}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpanded((cur) => (cur === r.user_id ? null : r.user_id))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-body font-semibold truncate">
                          {r.display_name ?? "Unnamed"}
                        </p>
                        <span className={cn(
                          "text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                          r.is_published ? "bg-good/15 text-good" : "bg-muted text-muted-foreground",
                        )}>
                          {r.is_published ? "Live" : "Draft"}
                        </span>
                        {(r.suspended_at || r.access_restricted) && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-destructive/15 text-destructive">
                            Suspended
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {r.discipline ?? "—"}{r.email ? ` · ${r.email}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn("text-[9px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider", sub.cls)}>
                        {sub.label}
                      </span>
                      {renews && <span className="text-[10px] text-muted-foreground">{r.sub_cancel_at_period_end ? "ends" : "renews"} {renews}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mt-3">
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Clients</p>
                      <p className="text-[13px] font-display leading-none mt-1">{r.active_clients}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Enquiries</p>
                      <p className="text-[13px] font-display leading-none mt-1">
                        {r.enquiries_accepted}<span className="text-muted-foreground text-[10px]">/{r.enquiries_total}</span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Views 30d</p>
                      <p className="text-[13px] font-display leading-none mt-1">{r.views_last_30d}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sessions</p>
                      <p className="text-[13px] font-display leading-none mt-1">{r.sessions_last_30d}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2.5 text-[10px] text-muted-foreground">
                    <span>
                      {r.last_session
                        ? `Last active ${formatDistanceToNow(new Date(r.last_session), { addSuffix: true })}`
                        : "No activity"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      {isExpanded ? <>Hide detail <ChevronUp className="size-3" /></> : <>Show detail <ChevronDown className="size-3" /></>}
                    </span>
                  </div>
                </button>

                {isExpanded && <ProDetailPanel userId={r.user_id} />}

                <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-pill text-[11px] font-body"
                    onClick={() => nav(`/admin/members/${r.user_id}/passport`)}
                  >
                    <ExternalLink className="size-3.5 mr-1" /> Passport
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-pill text-[11px] font-body"
                    disabled={togglePublish.isPending || r.access_restricted}
                    onClick={() => togglePublish.mutate({ userId: r.user_id, publish: !r.is_published })}
                  >
                    {r.is_published ? <><EyeOff className="size-3.5 mr-1" /> Unpublish</> : <><Eye className="size-3.5 mr-1" /> Publish</>}
                  </Button>
                </div>
                {!r.access_restricted && (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-9 rounded-pill text-[11px] font-body text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={restrict.isPending}
                      onClick={() => setRestrictTarget(r)}
                    >
                      <ShieldOff className="size-3.5 mr-1" /> Suspend &amp; restrict
                    </Button>
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>

      {restrictTarget && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setRestrictTarget(null)}>
          <SurfaceCard className="max-w-sm w-full" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <p className="font-display text-lg leading-tight">Suspend &amp; restrict?</p>
            <p className="text-[12px] text-muted-foreground mt-2 leading-snug">
              This will unpublish {restrictTarget.display_name ?? "this professional"}'s directory profile,
              cancel their Stripe subscription and revoke all active client access. They will see a
              restricted-access screen until you unrestrict them from Members.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1 h-9" onClick={() => setRestrictTarget(null)}>Cancel</Button>
              <Button
                className="flex-1 h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={restrict.isPending}
                onClick={() => {
                  restrict.mutate(restrictTarget.user_id, {
                    onSettled: () => setRestrictTarget(null),
                  });
                }}
              >
                {restrict.isPending ? "Working…" : "Restrict"}
              </Button>
            </div>
          </SurfaceCard>
        </div>
      )}
    </ScreenLayout>
  );
};

export default AdminProfessionals;
