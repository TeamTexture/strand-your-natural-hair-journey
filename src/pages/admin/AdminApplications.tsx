import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { MapPin, Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePendingApplicationsCount } from "@/hooks/usePendingApplicationsCount";
import type { Database } from "@/integrations/supabase/types";

type Application = Database["public"]["Tables"]["pro_applications"]["Row"];
type Status = Database["public"]["Enums"]["pro_application_status"];

const tabs: { key: Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];

const STATUS_CHIP: Record<Status, string> = {
  pending: "Reviewing",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

const AdminApplications = () => {
  const [tab, setTab] = useState<Status>("pending");
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: pendingCount = 0 } = usePendingApplicationsCount();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["admin", "pro_applications", tab],
    queryFn: async () => {
      // Only surface applications where payment has been confirmed —
      // unpaid drafts stay hidden from admins until the applicant pays.
      const { data, error } = await supabase
        .from("pro_applications")
        .select("*")
        .eq("status", tab)
        .not("payment_confirmed_at", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    const base = t
      ? apps.filter((a) =>
          [a.full_name, a.discipline, a.business_name, a.location, a.email]
            .filter(Boolean)
            .some((s) => (s as string).toLowerCase().includes(t)),
        )
      : apps;
    return [...base].sort((a, b) => {
      const av = new Date(a.created_at).valueOf();
      const bv = new Date(b.created_at).valueOf();
      return sortDesc ? bv - av : av - bv;
    });
  }, [apps, query, sortDesc]);

  const decide = useMutation({
    mutationFn: async ({
      id,
      status,
      admin_notes,
    }: {
      id: string;
      status: Status;
      admin_notes?: string;
    }) => {
      if (status === "approved") {
        const { error } = await supabase.rpc("approve_pro_application", {
          _application_id: id,
          _admin_notes: admin_notes ?? null,
        });
        if (error) throw error;
        return;
      }
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase
      const { data: me } = await supabase.auth.getUser();
      const { data: appRow } = await supabase
        .from("pro_applications")
        .select("user_id")
        .eq("id", id)
        .maybeSingle();
      const { error } = await supabase
        .from("pro_applications")
        .update({
          status,
          admin_notes: admin_notes ?? null,
          reviewed_by: me.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      // On rejection, auto-cancel the applicant's Stripe subscription so
      // they don't keep paying after being declined. Fire-and-forget: if
      // it fails we still complete the rejection.
      if (status === "rejected" && appRow?.user_id) {
        try {
          await supabase.functions.invoke("pro-cancel-subscription", {
            body: { user_id: appRow.user_id, immediate: false },
          });
        } catch (err) {
          console.error("pro-cancel-subscription on reject failed", err);
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(`Application ${vars.status}.`);
      qc.invalidateQueries({ queryKey: ["admin", "pro_applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-applications-count"] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-applications-count"] });
    },
    onError: (err) => {
      console.error(err);
      toast.error("Update failed.");
    },
  });

  return (
    <ScreenLayout>
      <TitleBar
        title="Applications"
        onBack={() => nav("/admin")}
        right={
          pendingCount > 0 ? (
            <span
              aria-label={`${pendingCount} pending`}
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none"
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          ) : null
        }
      />

      {/* Search + sort */}
      <div className="px-5 pt-1 pb-3">
        <div className="relative">
          <Search className="size-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search queue…"
            className="w-full h-9 pl-9 pr-3 rounded-full bg-card border border-primary/20 shadow-sm text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Underline filter tabs */}
      <div className="px-5 border-b border-primary/10">
        <div className="flex gap-5 overflow-x-auto no-scrollbar">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative pb-2.5 pt-1 text-[13px] font-body whitespace-nowrap transition-colors inline-flex items-center gap-1.5",
                  active
                    ? "text-primary font-semibold"
                    : "text-foreground/45 font-medium hover:text-foreground/70",
                )}
              >
                <span>{t.label}</span>
                {t.key === "pending" && pendingCount > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none",
                      active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                    )}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
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

      <div className="px-5 pt-4 space-y-3 pb-8">
        {isLoading ? (
          <LoadingDot label="Loading applications…" fullScreen={false} />
        ) : filtered.length === 0 ? (
          query.trim() ? (
            <EmptyState
              icon="✦"
              message="No matches"
              hint={`Nothing in ${tab} matches "${query.trim()}".`}
              tone="card"
            />
          ) : (
            <div className="pt-6 flex flex-col items-center opacity-60">
              <span className="block w-16 h-px bg-primary mb-5" />
              <p className="font-display italic text-[15px] text-foreground text-center">
                No {tab} applications
              </p>
              <p className="text-[10px] font-body font-medium uppercase tracking-[0.2em] mt-2 text-muted-foreground">
                Queue cleared
              </p>
            </div>
          )
        ) : (
          filtered.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              onDecide={(status, notes) =>
                decide.mutate({ id: a.id, status, admin_notes: notes })
              }
              busy={decide.isPending}
            />
          ))
        )}
      </div>
    </ScreenLayout>
  );
};

const ApplicationCard = ({
  app,
  onDecide,
  busy,
}: {
  app: Application;
  onDecide: (status: Status, notes?: string) => void;
  busy: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(app.admin_notes ?? "");

  const initials =
    app.full_name
      ?.split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•";

  const timeAgo = (() => {
    try {
      return formatDistanceToNowStrict(new Date(app.created_at), { addSuffix: false }) + " ago";
    } catch {
      return "";
    }
  })();

  const locationLine = [app.location, app.postcode].filter(Boolean).join(" · ");

  return (
    <SurfaceCard className="!p-5">
      <div className="min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 shrink-0 rounded-full bg-background border border-primary/30 flex items-center justify-center">
              <span className="font-display font-bold text-lg text-primary">{initials}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-[17px] leading-tight text-foreground truncate">
                {app.full_name}
              </h3>
              <p className="text-[11px] font-body font-medium uppercase tracking-[0.12em] text-muted-foreground truncate mt-0.5">
                {app.discipline}
                {app.business_name ? ` · ${app.business_name}` : ""}
              </p>
            </div>
          </div>
          {timeAgo && (
            <span className="shrink-0 text-[10px] font-body font-semibold uppercase tracking-tight text-primary">
              {timeAgo}
            </span>
          )}
        </div>

        {/* Footer row */}
        <div className="mt-4 pt-3 border-t border-background flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="size-3 text-primary shrink-0" />
            <span className="text-[11px] font-body font-medium text-foreground/70 truncate">
              {locationLine || app.email || "—"}
            </span>
          </div>
          <div className="shrink-0 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
            <span className="text-[9px] font-body font-bold uppercase tracking-[0.15em] text-primary">
              {STATUS_CHIP[app.status as Status]}
            </span>
          </div>
        </div>

        {/* Details toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[10px] font-body font-semibold uppercase tracking-[0.15em] text-primary"
        >
          {expanded ? "Hide details" : "View details"}
        </button>

        {expanded && (
          <div className="pt-3 mt-2 space-y-2.5 text-xs font-body leading-relaxed border-t border-background min-w-0">
            {app.email && <Row label="Email">{app.email}</Row>}
            {app.qualifications && <Row label="Qualifications">{app.qualifications}</Row>}
            {(app.insurance_provider || app.insurance_policy_no) && (
              <Row label="Insurance">
                {[app.insurance_provider, app.insurance_policy_no, app.insurance_expiry]
                  .filter(Boolean)
                  .join(" · ")}
              </Row>
            )}
            {app.website_url && <Row label="Website">{app.website_url}</Row>}
            {app.instagram_handle && <Row label="Instagram">{app.instagram_handle}</Row>}
            {app.why_strand && <Row label="Why STRAND">{app.why_strand}</Row>}

            <div className="pt-1 space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Admin notes
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes (optional)"
                className="text-xs"
              />
            </div>
          </div>
        )}

        {app.status === "pending" && (
          <div className="flex gap-2 pt-3">
            <Button
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => onDecide("approved", notes || undefined)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => onDecide("rejected", notes || undefined)}
            >
              Reject
            </Button>
          </div>
        )}

        {app.status === "approved" && (
          <div className="pt-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => onDecide("suspended", notes || undefined)}
            >
              Suspend
            </Button>
          </div>
        )}

        {app.status === "suspended" && (
          <div className="pt-3">
            <Button
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => onDecide("approved", notes || undefined)}
            >
              Reinstate
            </Button>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-0.5">
      {label}
    </p>
    <p className="text-foreground break-words">{children}</p>
  </div>
);

export default AdminApplications;
