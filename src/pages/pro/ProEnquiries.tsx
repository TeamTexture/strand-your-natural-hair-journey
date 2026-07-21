import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { CreditCard, Inbox } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useRoles } from "@/hooks/useRoles";
import {
  useProInbox,
  useAcceptEnquiry,
  useDeclineEnquiry,
  type Enquiry,
  type EnquiryStatus,
} from "@/hooks/useEnquiries";

type Tab = "pending" | "accepted" | "declined";

interface PassportPreview {
  firstName: string;
  hairSummary: string;
  flaggedMarkers: number;
  goals: string[];
  phone: string | null;
  location: string | null;
}

const usePassportPreviews = (enquiries: Enquiry[]) => {
  const [map, setMap] = useState<Record<string, PassportPreview>>({});

  const ids = useMemo(
    () => Array.from(new Set(enquiries.map((e) => e.consumer_id))),
    [enquiries],
  );

  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      // Preview only — no full passport data. RLS lets us read these because
      // profiles/hair_profile/user_goals will be gated in Phase F; for now the
      // preview relies on the pro's read access which exists via consent-based
      // policies added later. Until then we surface only the enquiry's own
      // fields plus counts pulled by lightweight RPC-style selects. If those
      // return nothing (Phase F not yet live) we degrade gracefully.
      const [profiles, hair, blood, goals] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, phone_number, postcode, country")
          .in("user_id", ids),
        supabase
          .from("user_hair_profile")
          .select("user_id, surface_texture, density, porosity")
          .in("user_id", ids),
        supabase
          .from("blood_results")
          .select("user_id, status")
          .in("user_id", ids)
          .in("status", ["low", "high", "borderline"]),
        supabase
          .from("user_goals")
          .select("user_id, title, status")
          .in("user_id", ids)
          .neq("status", "complete"),
      ]);

      if (cancelled) return;

      const out: Record<string, PassportPreview> = {};
      for (const id of ids) {
        const p = profiles.data?.find((r) => r.user_id === id);
        const h = hair.data?.find((r) => r.user_id === id);
        const flagged = (blood.data ?? []).filter((r) => r.user_id === id).length;
        const gs = (goals.data ?? [])
          .filter((r) => r.user_id === id)
          .map((r) => r.title as string)
          .filter(Boolean)
          .slice(0, 3);

        const rawName = p?.display_name ?? "";
        const firstName = rawName ? rawName.split(" ")[0] : "Client";

        const hairBits: string[] = [];
        const one = (v: unknown) => {
          if (Array.isArray(v)) return v[0];
          return typeof v === "string" ? v : null;
        };
        const tx = one(h?.surface_texture);
        const den = one(h?.density);
        const por = one(h?.porosity);
        if (tx) hairBits.push(String(tx));
        if (den) hairBits.push(`${den} density`);
        if (por) hairBits.push(`${por} porosity`);

        const locBits = [p?.postcode, p?.country].filter(Boolean) as string[];
        out[id] = {
          firstName,
          hairSummary: hairBits.length ? hairBits.join(" · ") : "Hair profile pending",
          flaggedMarkers: flagged,
          goals: gs,
          phone: (p?.phone_number as string | null) ?? null,
          location: locBits.length ? locBits.join(" · ") : null,
        };
      }

      setMap(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return map;
};

const EnquiryCard = ({
  enquiry,
  preview,
  onAccept,
  onDecline,
  onOpenPassport,
  onBookAppointment,
}: {
  enquiry: Enquiry;
  preview?: PassportPreview;
  onAccept: () => void;
  onDecline: () => void;
  onOpenPassport?: () => void;
  onBookAppointment?: () => void;
}) => {
  const first = preview?.firstName ?? "Client";
  const phone = preview?.phone ?? enquiry.contact_phone ?? null;
  const contactMethod = enquiry.contact_method ?? null;
  const location = preview?.location ?? enquiry.location_preference ?? null;
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-semibold leading-tight">{first}</p>
          {(phone || contactMethod) && (
            <p className="text-[11.5px] font-body text-foreground/85 mt-0.5 leading-snug truncate">
              {phone ? phone : contactMethod}
              {phone && contactMethod ? ` · ${contactMethod}` : ""}
            </p>
          )}
          {location && (
            <p className="text-[11px] font-body text-muted-foreground leading-snug truncate">
              {location}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatDistanceToNow(new Date(enquiry.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {(enquiry.service_interest ||
        enquiry.preferred_timeframe ||
        enquiry.location_preference ||
        enquiry.budget_range) && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {enquiry.service_interest && (
            <div className="rounded-[8px] bg-card border border-border/60 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Looking for
              </p>
              <p className="text-[12px] font-body leading-tight mt-0.5">
                {enquiry.service_interest}
              </p>
            </div>
          )}
          {enquiry.preferred_timeframe && (
            <div className="rounded-[8px] bg-card border border-border/60 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Timing
              </p>
              <p className="text-[12px] font-body leading-tight mt-0.5">
                {enquiry.preferred_timeframe}
              </p>
            </div>
          )}
          {enquiry.location_preference && (
            <div className="rounded-[8px] bg-card border border-border/60 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Location
              </p>
              <p className="text-[12px] font-body leading-tight mt-0.5">
                {enquiry.location_preference}
              </p>
            </div>
          )}
          {enquiry.budget_range && (
            <div className="rounded-[8px] bg-card border border-border/60 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Budget
              </p>
              <p className="text-[12px] font-body leading-tight mt-0.5">
                {enquiry.budget_range}
              </p>
            </div>
          )}
        </div>
      )}

      {enquiry.note && (
        <p className="text-sm font-body mt-2 leading-snug border-l-2 border-primary/40 pl-2">
          "{enquiry.note}"
        </p>
      )}

      {enquiry.note && (
        <p className="text-sm font-body mt-2 leading-snug border-l-2 border-primary/40 pl-2">
          "{enquiry.note}"
        </p>
      )}

      {preview && (
        <div className="mt-3 rounded-[10px] bg-secondary/50 p-3 space-y-1.5">
          <p className="text-[9px] uppercase tracking-[0.15em] text-primary font-medium">
            Passport preview
          </p>
          <p className="text-[12px] font-body leading-snug">{preview.hairSummary}</p>
          <p className="text-[12px] font-body leading-snug">
            {preview.flaggedMarkers > 0
              ? `${preview.flaggedMarkers} flagged blood marker${preview.flaggedMarkers > 1 ? "s" : ""}`
              : "No flagged blood markers"}
          </p>
          {preview.goals.length > 0 && (
            <p className="text-[12px] font-body leading-snug">
              Goals: {preview.goals.join(", ")}
            </p>
          )}
        </div>
      )}

      {enquiry.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={onDecline} className="flex-1">
            Decline
          </Button>
          <Button size="sm" onClick={onAccept} className="flex-1">
            Accept
          </Button>
        </div>
      )}

      {enquiry.status === "accepted" && onOpenPassport && (
        <div className="mt-3">
          <Button size="sm" onClick={onOpenPassport} className="w-full">
            Open client passport
          </Button>
        </div>
      )}

      {enquiry.status === "declined" && enquiry.decline_reason && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          You said: {enquiry.decline_reason}
        </p>
      )}
    </SurfaceCard>
  );
};

const DeclineDialog = ({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-[16px] p-4 w-full max-w-[340px] space-y-3">
        <p className="font-display text-lg font-semibold">Decline enquiry</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional — shared with the client)"
          rows={3}
          className="w-full text-sm p-3 rounded-[10px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason.trim())}>Decline</Button>
        </div>
      </div>
    </div>
  );
};

const ProEnquiries = () => {
  const nav = useNavigate();
  const { isActive, isLoading: subLoading } = useProSubscription();
  const { isAdmin } = useRoles();
  const { data, isLoading } = useProInbox();
  const accept = useAcceptEnquiry();
  const decline = useDeclineEnquiry();
  const [tab, setTab] = useState<Tab>("pending");
  const [declineId, setDeclineId] = useState<string | null>(null);

  const enquiries = data ?? [];
  const previews = usePassportPreviews(enquiries);

  const filtered = enquiries.filter((e) => e.status === tab);

  if (!subLoading && !isActive && !isAdmin) {
    return (
      <ScreenLayout>
        <TitleBar title="Enquiries" onBack={() => nav("/pro")} />
        <div className="px-5 pb-8">
          <SurfaceCard tone="gold">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <CreditCard className="size-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-base font-semibold leading-tight">
                  Subscribe to receive client enquiries
                </p>
                <p className="text-xs font-body text-muted-foreground mt-1 leading-snug">
                  A STRAND Pro subscription unlocks your inbox and, once live, full
                  passport access from clients who consent.
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => nav("/pro/billing")}
                >
                  Go to billing
                </Button>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  const counts: Record<Tab, number> = {
    pending: enquiries.filter((e) => e.status === "pending").length,
    accepted: enquiries.filter((e) => e.status === "accepted").length,
    declined: enquiries.filter((e) => e.status === "declined").length,
  };

  return (
    <ScreenLayout>
      <TitleBar title="Enquiries" onBack={() => nav("/pro")} />

      <div className="px-5 pb-3">
        <div className="flex gap-2">
          {(["pending", "accepted", "declined"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px] capitalize",
                tab === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground",
              )}
            >
              {t}
              <span className="ml-1.5 opacity-70">{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8 space-y-3">
        {tab === "accepted" && filtered.length > 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            Tap a client to view their passport. They can revoke access at any time.
          </p>
        )}


        {isLoading ? (
          <LoadingDot label="Loading enquiries…" fullScreen={false} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={tab === "pending" ? "📨" : "📁"}
            message={`No ${tab} enquiries`}
            hint={tab === "pending" ? "New client requests will land here." : undefined}
          />
        ) : (
          filtered.map((e) => (
            <EnquiryCard
              key={e.id}
              enquiry={e}
              preview={previews[e.consumer_id]}
              onAccept={async () => {
                try {
                  await accept.mutateAsync(e.id);
                  toast.success("Enquiry accepted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not accept");
                }
              }}
              onDecline={() => setDeclineId(e.id)}
              onOpenPassport={
                e.status === "accepted"
                  ? () => nav(`/pro/clients/${e.consumer_id}`)
                  : undefined
              }
            />
          ))
        )}
      </div>

      <DeclineDialog
        open={!!declineId}
        onCancel={() => setDeclineId(null)}
        onConfirm={async (reason) => {
          if (!declineId) return;
          const id = declineId;
          setDeclineId(null);
          try {
            await decline.mutateAsync({ id, reason: reason || undefined });
            toast("Enquiry declined");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not decline");
          }
        }}
      />
    </ScreenLayout>
  );
};

export default ProEnquiries;
