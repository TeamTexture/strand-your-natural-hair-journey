// Inline enquiries list used by the Appointments page ("Enquiries sent" tab)
// and the standalone /my-enquiries route. Pure list — no TitleBar / layout —
// so it can be dropped inside a segmented view.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { directoryLinkForPro } from "@/lib/directoryLink";
import {
  useMyEnquiries,
  useWithdrawEnquiry,
  type EnquiryStatus,
} from "@/hooks/useEnquiries";
import { useAuth } from "@/hooks/useAuth";

const STATUS_STYLE: Record<EnquiryStatus, { label: string; cls: string }> = {
  pending: { label: "Awaiting response", cls: "bg-warn/15 text-warn" },
  accepted: { label: "Accepted", cls: "bg-good/15 text-good" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground" },
};

const EnquiriesListInline = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useMyEnquiries();
  const withdraw = useWithdrawEnquiry();

  const proIds = useMemo(
    () => Array.from(new Set((data ?? []).map((e) => e.pro_user_id))),
    [data],
  );

  const { data: proMap } = useQuery({
    queryKey: ["my_enquiry_pros", proIds],
    enabled: proIds.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("pro_profiles")
        .select("user_id, display_name, discipline, location, avatar_path")
        .in("user_id", proIds);
      if (error) throw error;
      const m = new Map<
        string,
        { name: string; discipline: string | null; location: string | null; avatar_path: string | null }
      >();
      for (const r of rows ?? []) {
        m.set(r.user_id, {
          name: r.display_name ?? "Professional",
          discipline: r.discipline ?? null,
          location: r.location ?? null,
          avatar_path: r.avatar_path ?? null,
        });
      }
      return m;
    },
  });

  // Fetch open chat threads to attach a "Chat open" link on accepted enquiries.
  const { data: threadByEnquiry } = useQuery({
    queryKey: ["enquiry_threads", user?.id, (data ?? []).map((e) => e.id).join(",")],
    enabled: !!user?.id && !!data && data.some((e) => e.status === "accepted"),
    queryFn: async () => {
      const ids = (data ?? []).filter((e) => e.status === "accepted").map((e) => e.id);
      if (ids.length === 0) return new Map<string, string>();
      const { data: rows } = await supabase
        .from("chat_threads")
        .select("id, enquiry_id")
        .in("enquiry_id", ids);
      const m = new Map<string, string>();
      for (const r of rows ?? []) if (r.enquiry_id) m.set(r.enquiry_id, r.id);
      return m;
    },
  });

  if (isLoading) return <LoadingDot label="Loading enquiries…" fullScreen={false} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="✉️"
        message="No enquiries sent yet"
        hint="Reach out to a professional from the directory to get started."
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((e) => {
        const s = STATUS_STYLE[e.status];
        const pro = proMap?.get(e.pro_user_id);
        const threadId = threadByEnquiry?.get(e.id);
        return (
          <SurfaceCard key={e.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3 flex-1 min-w-0">
                <ProAvatar
                  name={pro?.name ?? "Professional"}
                  photoUrl={pro?.avatar_path ?? undefined}
                  size="size-11"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-semibold leading-tight truncate">
                    {pro?.name ?? "Professional"}
                  </p>
                  {(pro?.discipline || pro?.location) && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[pro?.discipline, pro?.location].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Sent {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-full ${s.cls}`}>
                {s.label}
              </span>
            </div>

            {(e.service_interest || e.preferred_timeframe || e.location_preference || e.budget_range) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {e.service_interest && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10">{e.service_interest}</span>
                )}
                {e.preferred_timeframe && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10">{e.preferred_timeframe}</span>
                )}
                {e.location_preference && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10">{e.location_preference}</span>
                )}
                {e.budget_range && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10">{e.budget_range}</span>
                )}
              </div>
            )}

            {e.note && (
              <p className="text-sm font-body mt-3 leading-snug whitespace-pre-wrap">{e.note}</p>
            )}

            {e.status === "declined" && e.decline_reason && (
              <p className="text-xs text-muted-foreground mt-2 italic">Reason: {e.decline_reason}</p>
            )}

            <div className="mt-3 flex justify-end gap-2 flex-wrap">
              <Button size="sm" variant="ghost" onClick={() => nav(directoryLinkForPro(e.pro_user_id))}>
                View profile
              </Button>
              {e.status === "accepted" && threadId && (
                <Button size="sm" variant="outline" onClick={() => nav(`/messages/${threadId}`)}>
                  Chat open
                </Button>
              )}
              {e.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await withdraw.mutateAsync(e.id);
                      toast("Enquiry withdrawn");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not withdraw");
                    }
                  }}
                >
                  Withdraw
                </Button>
              )}
            </div>
          </SurfaceCard>
        );
      })}
    </div>
  );
};

export default EnquiriesListInline;
