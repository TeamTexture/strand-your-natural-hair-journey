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
          .from("brand_profiles")
          .select("user_id", { count: "exact", head: true }),
        supabase
          .from("brand_offers")
          .select("id, owner_type")
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today),
        supabase
          .from("brand_offers")
          .select("id, owner_type")
          .eq("status", "under_review"),
      ]);
      const liveOffersRows = (liveOffersQ.data ?? []) as { owner_type: string | null }[];
      const brandReqRows = (brandReqQ.data ?? []) as { owner_type: string | null }[];
      const isPro = (r: { owner_type: string | null }) => r.owner_type === "pro";
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
        liveBrandOffers: liveOffersRows.length,
        liveBrandOffersPro: liveOffersRows.filter(isPro).length,
        liveBrandOffersBrand: liveOffersRows.filter((r) => !isPro(r)).length,
        brandOfferRequests: brandReqRows.length,
        brandOfferRequestsPro: brandReqRows.filter(isPro).length,
        brandOfferRequestsBrand: brandReqRows.filter((r) => !isPro(r)).length,
      };
    },
  });


const StatCard = ({
  label,
  value,
  tone,
  sublabel,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "warn" | "urgent" | "default";
  sublabel?: string;
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
      {sublabel && (
        <p className="text-[9.5px] font-body text-muted-foreground mt-1 leading-tight">
          {sublabel}
        </p>
      )}
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

            <SectionLabel className="!px-0">Campaigns</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-2 leading-snug">
              Promoted placements from brands and professionals — shared inventory.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              <StatCard
                label="Live brands"
                value={stats.liveBrands}
                onClick={() => nav("/admin/brands")}
              />
              <StatCard
                label="Live campaigns"
                value={stats.liveBrandOffers}
                sublabel={
                  stats.liveBrandOffers > 0
                    ? `${stats.liveBrandOffersBrand} brand · ${stats.liveBrandOffersPro} pro`
                    : undefined
                }
                onClick={() => nav("/admin/brand-offers?filter=live")}
              />
              <StatCard
                label="Requests"
                value={stats.brandOfferRequests}
                tone={stats.brandOfferRequests > 0 ? "warn" : "default"}
                sublabel={
                  stats.brandOfferRequests > 0
                    ? `${stats.brandOfferRequestsBrand} brand · ${stats.brandOfferRequestsPro} pro`
                    : undefined
                }
                onClick={() => nav("/admin/brand-offers?filter=pending")}
              />
            </div>
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
