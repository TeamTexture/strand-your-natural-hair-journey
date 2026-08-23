import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import PassportView from "@/components/passport/PassportView";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import ProUndertakingSheet, {
  UNDERTAKING_CONSEQUENCE,
} from "@/components/pro/ProUndertakingSheet";
import { useAuth } from "@/hooks/useAuth";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useProUndertaking } from "@/hooks/useProUndertaking";
import { useRoles } from "@/hooks/useRoles";

const ProClientPassport = () => {
  const nav = useNavigate();
  const { consumerId } = useParams<{ consumerId: string }>();
  const { user } = useAuth();
  const { isActive, isLoading: subLoading } = useProSubscription();
  const { isAdmin } = useRoles();
  const undertaking = useProUndertaking();
  const [askOpen, setAskOpen] = useState(false);

  if (!consumerId) return null;
  const canView = !!user && (isAdmin || (!subLoading && isActive));

  // The undertaking gates passport access. This is a courtesy prompt — the
  // real block is server-side inside public.has_active_client_access(), so a
  // professional who has not accepted cannot read the records either way.
  if (!isAdmin && !undertaking.isLoading && !undertaking.accepted) {
    return (
      <ScreenLayout>
        <TitleBar title="Client passport" />
        <div className="px-5 pb-10">
          <SurfaceCard className="space-y-3">
            <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <h1 className="font-display text-lg leading-tight text-foreground">
              Accept the client data undertaking to continue
            </h1>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {UNDERTAKING_CONSEQUENCE}
            </p>
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => setAskOpen(true)}
            >
              Read and accept
            </Button>
            <button
              type="button"
              onClick={() => nav("/pro/clients")}
              className="w-full text-center text-[12px] text-muted-foreground underline underline-offset-4"
            >
              Back to your clients
            </button>
          </SurfaceCard>
        </div>
        <ProUndertakingSheet
          open={askOpen}
          onOpenChange={setAskOpen}
          context="passport"
        />
      </ScreenLayout>
    );
  }

  return (
    <PassportView
      userId={consumerId}
      mode="pro"
      backTo="/pro/enquiries"
      active={canView}
      subLoading={subLoading && !isAdmin}
      showAccessEnded={!isAdmin && !subLoading && !isActive}
      accessEndedAction={smartBack(nav, "/pro/enquiries")}
    />
  );
};

export default ProClientPassport;
