import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronRight,
  ClipboardCheck,
  Users,
  ScrollText,
  Settings as SettingsIcon,
  FileText,
  Eye,
  Mail,
  Sparkles,
  Megaphone,
} from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAdminDropOffCounts } from "@/hooks/useAdminDropOffCounts";
import { useAllPendingRevisions } from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

interface Stats {
  pendingApplications: number;
  livePros: number;
  activeProSubs: number;
  membersTotal: number;
  activePaidMembers: number;
  complimentaryMembers: number;
  viewsLast7d: number;
  liveBrands: number;
  liveBrandOffers: number;
  brandOfferRequests: number;
}

interface ActivityRow {
  kind: "application" | "enquiry" | "view";
  at: string;
  primary: string;
  secondary?: string;
}

const useAdminStats = () =>
  useQuery({
    queryKey: ["admin", "hub", "stats"],
    staleTime: 30_000,
    queryFn: async (): Promise<Stats> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString().slice(0, 10);
      const [pending, live, proSubs, profiles, comps, views, liveBrandsQ, liveOffersQ, brandReqQ] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .not("payment_confirmed_at", "is", null),
        supabase.from("pro_profiles").select("user_id", { count: "exact", head: true }).eq("is_published", true),
        supabase
          .from("pro_subscriptions")
          .select("user_id", { count: "exact", head: true })
          .in("status", ["active", "trialing"]),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("complimentary_access", true),
        supabase
          .from("pro_passport_views")
          .select("id", { count: "exact", head: true })
          .gte("viewed_at", sevenDaysAgo),
        supabase
          .from("brand_subscriptions")
          .select("brand_user_id", { count: "exact", head: true })
          .in("status", ["active", "trialing"]),
        supabase
          .from("brand_offers")
          .select("id", { count: "exact", head: true })
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today),
        supabase
          .from("brand_offers")
          .select("id", { count: "exact", head: true })
          .eq("status", "under_review"),
      ]);
      const activePaid = await supabase
        .from("consumer_subscriptions")
        .select("user_id", { count: "exact", head: true })
        .in("status", ["active", "trialing"]);
      return {
        pendingApplications: pending.count ?? 0,
        livePros: live.count ?? 0,
        activeProSubs: proSubs.count ?? 0,
        membersTotal: profiles.count ?? 0,
        activePaidMembers: activePaid.count ?? 0,
        complimentaryMembers: comps.count ?? 0,
        viewsLast7d: views.count ?? 0,
        liveBrands: liveBrandsQ.count ?? 0,
        liveBrandOffers: liveOffersQ.count ?? 0,
        brandOfferRequests: brandReqQ.count ?? 0,
      };
    },
  });

const useRecentActivity = () =>
  useQuery({
    queryKey: ["admin", "hub", "activity"],
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const [apps, enq, views] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("id, full_name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("pro_enquiries")
          .select("id, created_at, status")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("pro_passport_views")
          .select("id, viewed_at, section")
          .order("viewed_at", { ascending: false })
          .limit(5),
      ]);
      const rows: ActivityRow[] = [
        ...(apps.data ?? []).map((r) => ({
          kind: "application" as const,
          at: r.created_at,
          primary: `New application — ${r.full_name ?? "unnamed"}`,
        })),
        ...(enq.data ?? []).map((r) => ({
          kind: "enquiry" as const,
          at: r.created_at,
          primary: `New enquiry`,
          secondary: r.status,
        })),
        ...(views.data ?? []).map((r) => ({
          kind: "view" as const,
          at: r.viewed_at,
          primary: `Passport viewed`,
          secondary: r.section ?? undefined,
        })),
      ];
      return rows.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5);
    },
  });

const StatCard = ({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "warn" | "urgent" | "default";
  onClick?: () => void;
}) => {
  const content = (
    <SurfaceCard
      className={cn(
        "py-3 relative h-full",
        tone === "urgent" && "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/40",
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium pr-4">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-[26px] leading-none mt-1.5",
          tone === "warn" ? "text-warn" : tone === "urgent" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      {onClick && (
        <ChevronRight className="size-3.5 text-muted-foreground absolute top-3 right-3" />
      )}
    </SurfaceCard>
  );
  if (!onClick) return content;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full transition-transform active:scale-[0.98]"
    >
      {content}
    </button>
  );
};

const NavCard = ({
  icon: Icon,
  title,
  description,
  onClick,
  badge,
  context,
}: {
  icon: typeof ClipboardCheck;
  title: string;
  description: string;
  onClick: () => void;
  badge?: number;
  context?: string;
}) => (
  <button
    onClick={onClick}
    className="w-full text-left"
  >
    <SurfaceCard className="flex items-center gap-3 py-3.5">
      <span className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="size-4 text-primary" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-display text-[15px] leading-tight text-foreground truncate">
            {title}
          </p>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground font-body leading-snug">
          {description}
        </p>
        {context && (
          <p className="text-[11px] text-primary/80 font-body mt-0.5">{context}</p>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </SurfaceCard>
  </button>
);

const activityIcon = (kind: ActivityRow["kind"]) => {
  if (kind === "application") return FileText;
  if (kind === "enquiry") return Mail;
  return Eye;
};

const AdminHub = () => {
  const nav = useNavigate();
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();
  const { data: dropoff } = useAdminDropOffCounts();
  const { data: pendingRevisions = [] } = useAllPendingRevisions();
  const revisionCount = pendingRevisions.length;

  return (
    <ScreenLayout>
      <TitleBar title="Admin" onBack={() => nav("/")} />

      <div className="px-5 pb-8 space-y-4">
        <SectionLabel className="!px-0 !mt-0">Overview</SectionLabel>


        {statsLoading || !stats ? (
          <LoadingDot label="Loading overview…" fullScreen={false} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="Pending applications"
                value={stats.pendingApplications}
                tone={stats.pendingApplications > 0 ? "warn" : "default"}
                onClick={() => nav("/admin/applications?tab=pending")}
              />
              <StatCard
                label="Live professionals"
                value={stats.livePros}
                onClick={() => nav("/admin/professionals?filter=published")}
              />
              <StatCard
                label="Active pro subs"
                value={stats.activeProSubs}
                onClick={() => nav("/admin/professionals?filter=subscribed")}
              />
              <StatCard
                label="Members total"
                value={stats.membersTotal}
                onClick={() => nav("/admin/members?filter=all")}
              />
              <StatCard
                label="Paid members"
                value={stats.activePaidMembers}
                onClick={() => nav("/admin/members?filter=active")}
              />
              <StatCard
                label="Complimentary"
                value={stats.complimentaryMembers}
                onClick={() => nav("/admin/members?filter=complimentary")}
              />
            </div>

            <SectionLabel className="!px-0">Brands</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-2 leading-snug">
              Paying brand partners — kept separate from consumer members.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              <StatCard
                label="Live brands"
                value={stats.liveBrands}
                onClick={() => nav("/admin/brand-offers?filter=brands")}
              />
              <StatCard
                label="Live offers"
                value={stats.liveBrandOffers}
                onClick={() => nav("/admin/brand-offers?filter=live")}
              />
              <StatCard
                label="Offer requests"
                value={stats.brandOfferRequests}
                tone={stats.brandOfferRequests > 0 ? "warn" : "default"}
                onClick={() => nav("/admin/brand-offers?filter=pending")}
              />
            </div>
            {revisionCount > 0 && (
              <button
                type="button"
                onClick={() => nav("/admin/brand-offers?filter=pending")}
                className="w-full text-left transition-transform active:scale-[0.99]"
              >
                <SurfaceCard className="py-2.5 border-destructive/60 bg-destructive/5 ring-1 ring-destructive/40 flex items-center gap-2.5">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70 animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[13.5px] leading-tight text-destructive">
                      Urgent · {revisionCount} live ad revision{revisionCount === 1 ? "" : "s"} awaiting review
                    </p>
                    <p className="text-[11px] text-destructive/80 font-body leading-snug">
                      Edits to already-live campaigns — approve or reject now.
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-destructive shrink-0" />
                </SurfaceCard>
              </button>
            )}
          </>
        )}

        <SectionLabel className="!px-0">Manage</SectionLabel>
        <div className="space-y-2">
          <NavCard
            icon={ClipboardCheck}
            title="Applications"
            description="Vet and approve Strand Council professionals"
            badge={stats?.pendingApplications}
            context={
              dropoff && dropoff.incompleteApplications > 0
                ? `${dropoff.incompleteApplications} incomplete`
                : undefined
            }
            onClick={() => nav("/admin/applications")}
          />
          <NavCard
            icon={Sparkles}
            title="Professionals"
            description="Usage, enquiries and client access per pro"
            context={
              stats ? `${stats.livePros} live · ${stats.activeProSubs} subscribed` : undefined
            }
            onClick={() => nav("/admin/professionals")}
          />
          <NavCard
            icon={Users}
            title="Members"
            description="Subscriptions and complimentary access"
            context={
              stats
                ? `${stats.activePaidMembers} paid · ${stats.complimentaryMembers} comp${
                    dropoff && dropoff.incompleteMembers > 0
                      ? ` · ${dropoff.incompleteMembers} incomplete`
                      : ""
                  }`
                : undefined
            }
            onClick={() => nav("/admin/members")}
          />


          <NavCard
            icon={Megaphone}
            title="Brand offers"
            description="Review, approve or decline brand campaigns"
            badge={(stats?.brandOfferRequests ?? 0) + revisionCount}
            badgeTone={revisionCount > 0 ? "urgent" : "default"}
            context={
              stats
                ? `${stats.liveBrandOffers} live · ${stats.brandOfferRequests} awaiting review${
                    revisionCount > 0 ? ` · ${revisionCount} urgent revision${revisionCount === 1 ? "" : "s"}` : ""
                  }`
                : undefined
            }
            onClick={() => nav("/admin/brand-offers")}
          />

          <NavCard
            icon={ScrollText}
            title="Audit trail"
            description="Passport views and enquiry history"
            context={
              stats ? `${stats.viewsLast7d} view${stats.viewsLast7d === 1 ? "" : "s"} in last 7 days` : undefined
            }
            onClick={() => nav("/admin/audit")}
          />
          <NavCard
            icon={SettingsIcon}
            title="Settings"
            description="Pricing and Stripe configuration"
            onClick={() => nav("/admin/settings")}
          />
        </div>

        <SectionLabel className="!px-0">Recent activity</SectionLabel>
        {activityLoading ? (
          <LoadingDot label="Loading activity…" fullScreen={false} />
        ) : !activity || activity.length === 0 ? (
          <EmptyState icon="✦" message="No recent activity" tone="card" />
        ) : (
          <SurfaceCard padded={false} className="divide-y divide-border">
            {activity.map((row, i) => {
              const Icon = activityIcon(row.kind);
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="size-3.5 text-primary/70 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-body text-foreground truncate">
                      {row.primary}
                      {row.secondary && (
                        <span className="text-muted-foreground"> · {row.secondary}</span>
                      )}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(row.at), { addSuffix: true })}
                  </p>
                </div>
              );
            })}
          </SurfaceCard>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminHub;
