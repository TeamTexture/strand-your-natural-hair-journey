import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
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

const AdminApplications = () => {
  const [tab, setTab] = useState<Status>("pending");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: pendingCount = 0 } = usePendingApplicationsCount();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["admin", "pro_applications", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pro_applications")
        .select("*")
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });

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
        // Atomic: grants professional role + creates pro_profiles row.
        const { error } = await supabase.rpc("approve_pro_application", {
          _application_id: id,
          _admin_notes: admin_notes ?? null,
        });
        if (error) throw error;
        return;
      }
      const { data: me } = await supabase.auth.getUser();
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
    },
    onSuccess: (_d, vars) => {
      toast.success(`Application ${vars.status}.`);
      qc.invalidateQueries({ queryKey: ["admin", "pro_applications"] });
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
      <div className="px-5 pt-1 pb-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((t) => {
            const active = tab === t.key;
            const showCount = t.key === "pending" && pendingCount > 0;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px] whitespace-nowrap inline-flex items-center gap-1.5",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground",
                )}
              >
                <span>{t.label}</span>
                {showCount && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 space-y-3 pb-6">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
        ) : apps.length === 0 ? (
          <EmptyState message={`No ${tab} applications`} />
        ) : (
          apps.map((a) => (
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

  const initials = app.full_name
    ?.split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SurfaceCard tone={app.status === "pending" ? "gold" : "card"}>
      <div className="space-y-3 min-w-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="font-display text-sm text-primary">{initials || "•"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base leading-tight truncate">{app.full_name}</p>
            <p className="text-xs text-muted-foreground font-body truncate">
              {app.discipline}
              {app.business_name ? ` · ${app.business_name}` : ""}
            </p>
            <p className="text-[11px] text-muted-foreground font-body truncate">
              {app.email}
            </p>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-primary font-body"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </div>

        {expanded && (
          <div className="pt-1 space-y-2.5 text-xs font-body leading-relaxed border-t border-border/60 min-w-0">
            <div className="pt-2.5" />
            {app.qualifications && (
              <Row label="Qualifications">{app.qualifications}</Row>
            )}
            {(app.insurance_provider || app.insurance_policy_no) && (
              <Row label="Insurance">
                {[
                  app.insurance_provider,
                  app.insurance_policy_no,
                  app.insurance_expiry,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Row>
            )}
            {(app.location || app.postcode) && (
              <Row label="Location">
                {[app.location, app.postcode].filter(Boolean).join(" · ")}
              </Row>
            )}
            {app.website_url && <Row label="Website">{app.website_url}</Row>}
            {app.instagram_handle && (
              <Row label="Instagram">{app.instagram_handle}</Row>
            )}
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
          <div className="flex gap-2 pt-1">
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
          <div className="pt-1">
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
          <div className="pt-1">
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
