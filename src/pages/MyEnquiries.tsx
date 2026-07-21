import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMyEnquiries, useWithdrawEnquiry, type EnquiryStatus } from "@/hooks/useEnquiries";

const STATUS_STYLE: Record<EnquiryStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warn/15 text-warn" },
  accepted: { label: "Accepted", cls: "bg-good/15 text-good" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground" },
};

const MyEnquiries = () => {
  const nav = useNavigate();
  const { data, isLoading } = useMyEnquiries();
  const withdraw = useWithdrawEnquiry();

  return (
    <ScreenLayout>
      <TitleBar title="My enquiries" onBack={() => nav("/profile")} />

      <div className="px-5 pb-8 space-y-3">
        {isLoading ? (
          <LoadingDot label="Loading enquiries…" fullScreen={false} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon="✉️"
            message="No enquiries yet"
            hint="Send one from the Professionals directory."
          />
        ) : (
          data.map((e) => {
            const s = STATUS_STYLE[e.status];
            return (
              <SurfaceCard key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      Sent {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </p>
                    {e.note && (
                      <p className="text-sm font-body mt-1 leading-snug">{e.note}</p>
                    )}
                    {e.status === "declined" && e.decline_reason && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Reason: {e.decline_reason}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${s.cls}`}>
                    {s.label}
                  </span>
                </div>

                {e.status === "pending" && (
                  <div className="mt-3 flex justify-end">
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
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default MyEnquiries;
