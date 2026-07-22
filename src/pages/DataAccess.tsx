import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
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
import { useMyClientAccess, useRevokeAccess } from "@/hooks/useEnquiries";
import { smartBack } from "@/lib/smartBack";

const DataAccess = () => {
  const nav = useNavigate();
  const { data: access, isLoading } = useMyClientAccess();
  const revoke = useRevokeAccess();
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const proIds = useMemo(
    () => Array.from(new Set((access ?? []).map((a) => a.pro_user_id))),
    [access],
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

  const target = access?.find((a) => a.id === confirmId);
  const targetName = target ? names[target.pro_user_id] ?? "this professional" : "";

  return (
    <ScreenLayout>
      <TitleBar title="Data access" onBack={smartBack(nav, "/profile")} />

      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs font-body text-muted-foreground leading-snug">
          These professionals currently have access to your Strand passport. Revoking is
          immediate — they lose access to your data at once.
        </p>

        {isLoading ? (
          <LoadingDot label="Loading…" fullScreen={false} />
        ) : !access || access.length === 0 ? (
          <EmptyState
            icon="🔒"
            message="No active access"
            hint="No professional currently has access to your data."
          />
        ) : (
          access.map((a) => (
            <SurfaceCard key={a.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold leading-tight">
                    {names[a.pro_user_id] ?? "Professional"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Granted {new Date(a.granted_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-alert-dark border-alert-dark/40"
                  onClick={() => setConfirmId(a.id)}
                >
                  Revoke
                </Button>
              </div>
            </SurfaceCard>
          ))
        )}
      </div>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {targetName} will lose access to your Strand passport immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmId) return;
                try {
                  await revoke.mutateAsync(confirmId);
                  toast("Access revoked");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not revoke");
                }
                setConfirmId(null);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default DataAccess;
