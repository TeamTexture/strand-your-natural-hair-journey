import { smartBack } from "@/lib/smartBack";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardCheck,
  Users,
  ScrollText,
  Settings as SettingsIcon,
  Eye,
  Sparkles,
  Megaphone,
  Store,
  MessageSquare,
  Library,
  ShieldAlert,
} from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import UnifiedCampaignCalendar from "@/components/admin/UnifiedCampaignCalendar";
import { supabase } from "@/integrations/supabase/client";
import { useAdminDropOffCounts } from "@/hooks/useAdminDropOffCounts";
import { useAllPendingRevisions, deriveBrandOfferStatus, londonToday } from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

interface CampaignCounts {
  live: number;
  requested: number;
  scheduled: number;
  expired: number;
}

interface Stats {
  pendingApplications: number;
  livePros: number;
  activeProSubs: number;
  membersTotal: number;
  activePaidMembers: number;
  plusMembers: number;
  complimentaryMembers: number;
  viewsLast7d: number;
  liveBrands: number;
  brand: CampaignCounts;
  pro: CampaignCounts;
  totalRequests: number;
  totalLive: number;
}



const useAdminStats = () =>
  useQuery({
    queryKey: ["admin", "hub", "stats"],
    staleTime: 30_000,
    queryFn: async (): Promise<Stats> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = londonToday();

      const [pending, live, proSubs, profiles, comps, views, liveBrandsQ, allOffersQ] = await Promise.all([
        supabase
          .from("pro_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .not("payment_confirmed_at", "is", null),
        supabase.from("pro_profiles").select("user_id", { count: "exact", head: true }).eq("is_published", true),
        supabase
          .from("pro_subscriptions")
          .select("pro_user_id", { count: "exact", head: true })
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
          .from("brand_profiles")
          .select("user_id", { count: "exact", head: true }),
        supabase
          .from("brand_offers")
          .select("id, owner_type, status, starts_on, ends_on")
          .in("status", ["under_review", "approved_unpaid", "paid_scheduled", "live", "ended"]),
      ]);
      const offers = (allOffersQ.data ?? []) as {
        owner_type: string | null;
        status: string;
        starts_on: string | null;
        ends_on: string | null;
      }[];
      const empty = (): CampaignCounts => ({ live: 0, requested: 0, scheduled: 0, expired: 0 });
      const brand = empty();
      const pro = empty();
      offers.forEach((o) => {
        const bucket = o.owner_type === "pro" ? pro : brand;
        // "Requested" = still awaiting review or approved and awaiting payment.
        if (o.status === "under_review" || o.status === "approved_unpaid") {
          bucket.requested += 1;
          return;
        }
        const derived = deriveBrandOfferStatus(
          { status: o.status, starts_on: o.starts_on, ends_on: o.ends_on },
          today,
        );
        if (derived === "live") bucket.live += 1;
        else if (derived === "upcoming") bucket.scheduled += 1;
        else if (derived === "ended") bucket.expired += 1;
      });
      const activePaid = await supabase
        .from("consumer_subscriptions")
        .select("user_id", { count: "exact", head: true })
        .in("status", ["active", "trialing"]);
      const plusCountQ = await supabase
        .from("consumer_subscriptions")
        .select("user_id", { count: "exact", head: true })
        .in("status", ["active", "trialing"])
        .eq("tier", "plus");
      return {
        pendingApplications: pending.count ?? 0,
        livePros: live.count ?? 0,
        activeProSubs: proSubs.count ?? 0,
        membersTotal: profiles.count ?? 0,
        activePaidMembers: activePaid.count ?? 0,
        plusMembers: plusCountQ.count ?? 0,
        complimentaryMembers: comps.count ?? 0,
        viewsLast7d: views.count ?? 0,
        liveBrands: liveBrandsQ.count ?? 0,
        brand,
        pro,
        totalRequests: brand.requested + pro.requested,
        totalLive: brand.live + pro.live,
      };
    },
  });



const StatCard = ({
  label,
  value,
  tone,
  sublabel,
  onClick,
  compact = false,
}: {
  label: string;
  value: number | string;
  tone?: "warn" | "urgent" | "default";
  sublabel?: string;
  onClick?: () => void;
  compact?: boolean;
}) => {
  const content = (
    <SurfaceCard
      className={cn(
        "relative h-full",
        compact ? "py-2 px-2.5" : "py-3",
        tone === "urgent" && "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/40",
      )}
    >
      <p
        className={cn(
          "uppercase tracking-[0.14em] text-muted-foreground font-body font-medium",
          compact ? "text-[8.5px] leading-tight" : "text-[10px] pr-4 tracking-[0.18em]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-display leading-none",
          compact ? "text-[19px] mt-1" : "text-[26px] mt-1.5",
          tone === "warn" ? "text-warn" : tone === "urgent" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sublabel && (
        <p className={cn("font-body text-muted-foreground leading-tight", compact ? "text-[9px] mt-0.5" : "text-[9.5px] mt-1")}>
          {sublabel}
        </p>
      )}
      {onClick && !compact && (
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
  badgeTone,
  context,
}: {
  icon: typeof ClipboardCheck;
  title: string;
  description: string;
  onClick: () => void;
  badge?: number;
  badgeTone?: "urgent" | "default";
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
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-body font-semibold leading-none",
                badgeTone === "urgent"
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground font-body leading-snug">
          {description}
        </p>
        {context && (
          <p
            className={cn(
              "text-[11px] font-body mt-0.5",
              badgeTone === "urgent" ? "text-destructive" : "text-primary/80",
            )}
          >
            {context}
          </p>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </SurfaceCard>
  </button>
);

const CampaignSection = ({
  title,
  counts,
  type,
  nav,
}: {
  title: string;
  counts: CampaignCounts;
  type: "brand" | "pro";
  nav: (path: string) => void;
}) => {
  const go = (filter: string) => nav(`/admin/brand-offers?filter=${filter}&type=${type}`);
  return (
    <div>
      <SectionLabel className="!px-0">{title}</SectionLabel>
      <div className="grid grid-cols-4 gap-1.5">
        <StatCard compact label="Live" value={counts.live} onClick={() => go("live")} />
        <StatCard
          compact
          label="Requested"
          value={counts.requested}
          tone={counts.requested > 0 ? "warn" : "default"}
          onClick={() => go("pending")}
        />
        <StatCard compact label="Scheduled" value={counts.scheduled} onClick={() => go("scheduled")} />
        <StatCard compact label="Expired" value={counts.expired} onClick={() => go("expired")} />
      </div>
    </div>
  );
};



const AdminHub = () => {
  const nav = useNavigate();
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: dropoff } = useAdminDropOffCounts();
  const { data: pendingRevisions = [] } = useAllPendingRevisions();
  const revisionCount = pendingRevisions.length;

  return (
    <ScreenLayout>
      <TitleBar title="Admin" onBack={smartBack(nav, "/")} />

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
                label="Live brands"
                value={stats.liveBrands}
                onClick={() => nav("/admin/brands")}
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
                label="STRAND+"
                value={stats.plusMembers}
                sublabel="Premium tier"
                onClick={() => nav("/admin/members?filter=plus")}
              />
              <StatCard
                label="Complimentary"
                value={stats.complimentaryMembers}
                onClick={() => nav("/admin/members?filter=complimentary")}
              />

            </div>

            <SectionLabel className="!px-0">Campaign calendar</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-2 leading-snug">
              Brand and pro campaigns across every placement — tap a day to see who's running.
            </p>
            <UnifiedCampaignCalendar onOpenSlotView={() => nav("/admin/brand-calendar")} />

            <CampaignSection
              title="Brand campaigns"
              counts={stats.brand}
              type="brand"
              nav={nav}
            />
            <CampaignSection
              title="Pro campaigns"
              counts={stats.pro}
              type="pro"
              nav={nav}
            />

            <button
              type="button"
              onClick={() => nav("/admin/brand-offers?filter=pending")}
              className="w-full text-left transition-transform active:scale-[0.99]"
            >
              <SurfaceCard
                className={`py-3 flex items-center gap-3 ${
                  revisionCount > 0
                    ? "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/40"
                    : ""
                }`}
              >
                {revisionCount > 0 ? (
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70 animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                  </span>
                ) : (
                  <span className="inline-flex size-2 rounded-full bg-muted-foreground/40 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-display text-[13.5px] leading-tight ${
                      revisionCount > 0 ? "text-destructive" : ""
                    }`}
                  >
                    Offer revisions{revisionCount > 0 ? ` · ${revisionCount} awaiting review` : ""}
                  </p>
                  <p
                    className={`text-[11px] font-body leading-snug ${
                      revisionCount > 0 ? "text-destructive/80" : "text-muted-foreground"
                    }`}
                  >
                    {revisionCount > 0
                      ? "Edits to already-live campaigns — approve or reject now."
                      : "No pending edits to live campaigns."}
                  </p>
                </div>
                <ChevronRight
                  className={`size-4 shrink-0 ${
                    revisionCount > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                />
              </SurfaceCard>
            </button>

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
            badge={(stats?.totalRequests ?? 0) + revisionCount}
            badgeTone={revisionCount > 0 ? "urgent" : "default"}
            context={
              stats
                ? `${stats.totalLive} live · ${stats.totalRequests} awaiting review${
                    revisionCount > 0 ? ` · ${revisionCount} urgent revision${revisionCount === 1 ? "" : "s"}` : ""
                  }`
                : undefined
            }

            onClick={() => nav("/admin/brand-offers")}
          />

          <NavCard
            icon={Store}
            title="Brands"
            description="Registered brands, contacts and category"
            context={stats ? `${stats.liveBrands} brand${stats.liveBrands === 1 ? "" : "s"}` : undefined}
            onClick={() => nav("/admin/brands")}
          />

          <NavCard
            icon={MessageSquare}
            title="STRAND Team messages"
            description="Direct chat with any member, pro or brand"
            onClick={() => nav("/admin/messages")}
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
            icon={Library}
            title="STRAND+ Library"
            description="Upload courses, ebooks, videos and articles"
            onClick={() => nav("/admin/library")}
          />
          <NavCard
            icon={ShieldAlert}
            title="Forum moderation"
            description="Hide, delete, lock or reply as STRAND Team"
            onClick={() => nav("/admin/moderation")}
          />
          <NavCard
            icon={Eye}
            title="View as user"
            description="Shadow any account to see their app view"
            onClick={() => nav("/admin/view-as")}
          />

          <NavCard
            icon={SettingsIcon}
            title="Settings"
            description="Pricing and Stripe configuration"
            onClick={() => nav("/admin/settings")}
          />
        </div>
      </div>
    </ScreenLayout>
  );
};

export default AdminHub;
