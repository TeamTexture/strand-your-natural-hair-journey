import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldCheck, Check, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { smartBack } from "@/lib/smartBack";
import {
  ACK_WINDOW_DAYS,
  COMPLAINT_STATUS_LABEL,
  DataProtectionComplaint,
  daysElapsed,
  isOverdue,
  useAdminComplaints,
  useUpdateComplaint,
} from "@/hooks/useDataProtectionComplaints";
import { useMarkAdminEntityRead } from "@/hooks/useAdminNotifications";

const AdminDataProtection = () => {
  const nav = useNavigate();
  const [openOnly, setOpenOnly] = useState(true);
  const { data: complaints = [], isLoading } = useAdminComplaints(openOnly);
  const update = useUpdateComplaint();
  const markEntityRead = useMarkAdminEntityRead();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const acknowledge = async (c: DataProtectionComplaint) => {
    try {
      await update.mutateAsync({
        id: c.id,
        patch: { status: "acknowledged", acknowledged_at: new Date().toISOString() },
      });
      await markEntityRead("data_protection_complaint", c.id);
      toast.success("Acknowledged — the 30-day clock is met.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not acknowledge.");
    }
  };

  const close = async (c: DataProtectionComplaint, status: "resolved" | "rejected") => {
    const summary = (drafts[c.id] ?? "").trim();
    if (summary.length < 10)
      return toast.error("Add a short outcome summary for the complainant.");
    try {
      await update.mutateAsync({
        id: c.id,
        patch: {
          status,
          resolution_summary: summary,
          resolved_at: new Date().toISOString(),
          acknowledged_at: c.acknowledged_at ?? new Date().toISOString(),
        },
      });
      await markEntityRead("data_protection_complaint", c.id);
      toast.success(status === "resolved" ? "Marked resolved." : "Marked not upheld.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Data protection" onBack={smartBack(nav, "/admin")} />

      <div className="px-5 pb-8 space-y-3">
        <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
          Complaints about how personal data is handled. Oldest first — each must be
          acknowledged within {ACK_WINDOW_DAYS} days of arriving.
        </p>

        <div className="flex gap-2">
          <Button
            variant={openOnly ? "gold" : "outline"}
            size="sm"
            onClick={() => setOpenOnly(true)}
          >
            Open
          </Button>
          <Button
            variant={openOnly ? "outline" : "gold"}
            size="sm"
            onClick={() => setOpenOnly(false)}
          >
            All
          </Button>
        </div>

        {isLoading ? (
          <LoadingDot label="Loading complaints…" fullScreen={false} />
        ) : complaints.length === 0 ? (
          <EmptyState icon="✦" message="No complaints to handle." tone="card" />
        ) : (
          <div className="space-y-2.5">
            {complaints.map((c) => {
              const overdue = isOverdue(c);
              const days = daysElapsed(c.submitted_at);
              return (
                <SurfaceCard
                  key={c.id}
                  className={`py-3.5 ${overdue ? "border-destructive/60 ring-1 ring-destructive/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-[15px] leading-tight flex-1">{c.subject}</p>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-body font-medium">
                        {COMPLAINT_STATUS_LABEL[c.status]}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-body font-medium">
                          <AlertTriangle className="size-3" /> Overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground font-body mt-1">
                    {format(new Date(c.submitted_at), "d MMM yyyy")} · {days} day
                    {days === 1 ? "" : "s"} elapsed · {c.contact_email}
                    {c.user_id ? " · member" : " · not signed in"}
                  </p>

                  <p className="text-[12.5px] font-body text-foreground/85 mt-2 whitespace-pre-wrap leading-snug">
                    {c.details}
                  </p>

                  {c.acknowledged_at && (
                    <p className="text-[11px] font-body text-good mt-2 inline-flex items-center gap-1">
                      <ShieldCheck className="size-3" /> Acknowledged{" "}
                      {format(new Date(c.acknowledged_at), "d MMM yyyy")}
                    </p>
                  )}

                  {c.resolution_summary && (
                    <p className="text-[12px] font-body text-foreground/75 mt-2 leading-snug">
                      Outcome: {c.resolution_summary}
                    </p>
                  )}

                  {(c.status === "received" || c.status === "acknowledged") && (
                    <div className="mt-3 space-y-2">
                      {!c.acknowledged_at && (
                        <Button
                          variant="gold"
                          size="pill"
                          className="w-full"
                          onClick={() => acknowledge(c)}
                          disabled={update.isPending}
                        >
                          Acknowledge receipt
                        </Button>
                      )}
                      <Textarea
                        value={drafts[c.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [c.id]: e.target.value.slice(0, 2000) }))
                        }
                        placeholder="Outcome summary sent to the complainant…"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="gold"
                          size="pill"
                          className="flex-1"
                          onClick={() => close(c, "resolved")}
                          disabled={update.isPending}
                        >
                          <Check className="size-4 mr-1" /> Resolved
                        </Button>
                        <Button
                          variant="outline"
                          size="pill"
                          className="flex-1"
                          onClick={() => close(c, "rejected")}
                          disabled={update.isPending}
                        >
                          <X className="size-4 mr-1" /> Not upheld
                        </Button>
                      </div>
                    </div>
                  )}
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminDataProtection;
