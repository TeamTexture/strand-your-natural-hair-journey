import { smartBack } from "@/lib/smartBack";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyPassportSharing, useSetPassportAccess } from "@/hooks/useEnquiries";

const friendlyDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

const ENQUIRY_LABEL: Record<string, string> = {
  pending: "Enquiry awaiting their reply",
  accepted: "Enquiry accepted",
  declined: "Enquiry declined",
};

const DataAccess = () => {
  const nav = useNavigate();
  const { data: rows, isLoading } = useMyPassportSharing();
  const setAccess = useSetPassportAccess();
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirmProId, setConfirmProId] = useState<string | null>(null);

  const proIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.pro_user_id))),
    [rows],
  );

  useEffect(() => {
    if (proIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pro_profiles")
        .select("user_id, display_name")
        .in("user_id", proIds);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data) map[row.user_id] = row.display_name;
      setNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [proIds]);

  const targetName = confirmProId ? names[confirmProId] ?? "This professional" : "";

  const grant = async (proUserId: string) => {
    try {
      await setAccess.mutateAsync({ proUserId, grant: true });
      toast("Access granted — they can see your passport now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant access");
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Data access" onBack={smartBack(nav, "/profile")} />

      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs font-body text-muted-foreground leading-snug">
          You control who sees your Strand passport. Turn a professional on to share it —
          even before they've accepted your enquiry — and off to withdraw it. Changes take
          effect immediately.
        </p>

        {isLoading ? (
          <LoadingDot label="Loading…" fullScreen={false} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState
            icon="🔒"
            message="Nobody has access"
            hint="Once you enquire with a professional, they'll appear here so you can share or withdraw your passport."
          />
        ) : (
          rows.map((r) => {
            const name = names[r.pro_user_id] ?? "Professional";
            const status = r.granted
              ? r.access_id && !r.revoked_at
                ? `Access on${friendlyDate(r.granted_at) ? ` · since ${friendlyDate(r.granted_at)}` : ""}`
                : "Sharing on — visible once they accept your enquiry"
              : r.revoked_at
                ? `Access revoked${friendlyDate(r.revoked_at) ? ` · ${friendlyDate(r.revoked_at)}` : ""}`
                : "No access — passport not shared";

            const enquiryLine = r.enquiry_status ? ENQUIRY_LABEL[r.enquiry_status] : null;
            return (
              <SurfaceCard key={r.pro_user_id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-base font-semibold leading-tight truncate">
                      {name}
                    </p>
                    <p
                      className={`text-[12px] mt-0.5 font-body ${
                        r.granted ? "text-good" : "text-alert-dark"
                      }`}
                    >
                      {status}
                    </p>
                    {enquiryLine && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{enquiryLine}</p>
                    )}
                  </div>
                  <Switch
                    checked={r.granted}
                    disabled={setAccess.isPending}
                    aria-label={r.granted ? `Withdraw access for ${name}` : `Give ${name} access`}
                    onCheckedChange={(next) => {
                      if (next) void grant(r.pro_user_id);
                      else setConfirmProId(r.pro_user_id);
                    }}
                  />
                </div>
              </SurfaceCard>
            );
          })
        )}
      </div>

      {/* Statutory route to complain about how we handle personal data. */}
      <div className="px-5 pb-8">
        <button
          type="button"
          onClick={() => nav("/data-protection-complaint")}
          className="w-full text-left"
        >
          <SurfaceCard className="py-3.5 flex items-center gap-3">
            <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <ShieldAlert className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-[13px] font-semibold leading-tight">
                Raise a data protection complaint
              </p>
              <p className="text-[11px] text-muted-foreground font-body leading-snug mt-0.5">
                Acknowledged within 30 days
              </p>
            </div>
            <span className="text-[11px] text-primary font-body shrink-0">Open →</span>
          </SurfaceCard>
        </button>
      </div>



      <AlertDialog open={!!confirmProId} onOpenChange={(o) => !o && setConfirmProId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw access?</AlertDialogTitle>
            <AlertDialogDescription>
              {targetName} will lose access to your Strand passport immediately. You can
              switch it back on whenever you like.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmProId) return;
                try {
                  await setAccess.mutateAsync({ proUserId: confirmProId, grant: false });
                  toast("Access revoked");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not revoke");
                }
                setConfirmProId(null);
              }}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default DataAccess;
