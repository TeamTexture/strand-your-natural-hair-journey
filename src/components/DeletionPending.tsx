import { Link } from "react-router-dom";
import { Clock, Undo2, HelpCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import {
  useCancelAccountDeletion,
  erasureDate,
  formatLongDate,
} from "@/hooks/useAccountLifecycle";

/**
 * What a member sees while their own deletion request is running down.
 *
 * Nothing has been erased yet. Cancelling here clears the request and restores
 * full access immediately.
 */
const DeletionPending = () => {
  const { deletionRequestedAt } = useConsumerSubscription();
  const cancel = useCancelAccountDeletion();
  const eraseOn = formatLongDate(erasureDate(deletionRequestedAt));

  return (
    <ScreenLayout>
      <TitleBar title="Account" />
      <div className="px-5 pb-12 space-y-4">
        <SurfaceCard className="space-y-3">
          <div className="size-11 rounded-full bg-primary/12 text-primary flex items-center justify-center">
            <Clock className="size-5" />
          </div>
          <h1 className="font-display text-[22px] leading-tight">
            Your account is scheduled for deletion
          </h1>
          <p className="font-body text-[13px] leading-relaxed text-foreground/80">
            You asked us to delete your STRAND account, so the app is closed for now.
            {eraseOn ? ` Your data will be erased on ${eraseOn}.` : ""} Until then nothing has
            been touched, and you can change your mind.
          </p>
          <Button
            variant="gold"
            size="pill"
            className="w-full gap-2"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () => toast("Deletion cancelled — your account is back"),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : "Could not cancel"),
              })
            }
          >
            <Undo2 className="size-4" />
            {cancel.isPending ? "Cancelling…" : "Keep my account"}
          </Button>
        </SurfaceCard>

        <SurfaceCard className="space-y-2">
          <h2 className="font-display text-[16px] leading-tight">What we have to keep</h2>
          <p className="font-body text-[12.5px] leading-relaxed text-foreground/75">
            Payment records are kept for six years because tax law requires it, and records of
            any data protection complaint are kept for six years so we can show we handled it
            properly. Everything else, including your photographs, voice notes and blood
            records, is erased.
          </p>
          <Link to="/help" className="block pt-1">
            <Button variant="ghost" size="pill" className="w-full gap-2">
              <HelpCircle className="size-4" /> Get help
            </Button>
          </Link>
        </SurfaceCard>

        <p className="font-body text-[11px] text-center text-muted-foreground">
          Need to talk to someone first? Email info@teamtexture.co.uk.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default DeletionPending;
