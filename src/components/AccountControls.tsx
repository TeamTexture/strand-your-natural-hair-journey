import { useState } from "react";
import { AlertTriangle, CreditCard, PauseCircle, PlayCircle, Trash2, Undo2 } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import {
  useBillingPortal,
  useCancelAccountDeletion,
  usePauseMembership,
  useRequestAccountDeletion,
  useResumeMembership,
  erasureDate,
  formatLongDate,
} from "@/hooks/useAccountLifecycle";

/**
 * Membership and account controls: pause, resume, manage billing in Stripe, and
 * the member's own right to erasure.
 *
 * Deletion is deliberately two-stage. Requesting it stamps a date and closes
 * access; nothing is erased for 30 days, and cancelling inside that window
 * restores everything.
 */
const AccountControls = () => {
  const { subscription, paused, deletionRequestedAt } = useConsumerSubscription();
  const pause = usePauseMembership();
  const resume = useResumeMembership();
  const portal = useBillingPortal();
  const requestDeletion = useRequestAccountDeletion();
  const cancelDeletion = useCancelAccountDeletion();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const hasStripe = !!subscription?.stripe_customer_id;
  const eraseOn = formatLongDate(erasureDate(deletionRequestedAt));

  const runDeletion = () => {
    requestDeletion.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        setTyped("");
        toast("Deletion requested — check your email for the date and how to cancel");
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Could not request deletion"),
    });
  };

  return (
    <div className="space-y-3">
      {/* ---- Membership ---- */}
      <SurfaceCard className="space-y-3">
        <h2 className="font-display text-[16px] leading-tight">Your membership</h2>
        <p className="font-body text-[12px] text-muted-foreground leading-snug">
          {paused
            ? "Your membership is paused. We are not taking payment and the app is on hold — nothing is deleted."
            : "Pause when life gets busy, or manage payment, invoices and cancellation in the billing portal."}
        </p>

        {paused ? (
          <Button
            variant="gold"
            size="pill"
            className="w-full gap-2"
            disabled={resume.isPending}
            onClick={() =>
              resume.mutate(undefined, {
                onSuccess: () => toast("Membership resumed"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Could not resume"),
              })
            }
          >
            <PlayCircle className="size-4" />
            {resume.isPending ? "Resuming…" : "Resume my membership"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="pill"
            className="w-full gap-2"
            disabled={pause.isPending || !hasStripe}
            onClick={() =>
              pause.mutate(undefined, {
                onSuccess: () => toast("Membership paused — resume whenever you like"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Could not pause"),
              })
            }
          >
            <PauseCircle className="size-4" />
            {pause.isPending ? "Pausing…" : "Pause my membership"}
          </Button>
        )}

        <Button
          variant="ghost"
          size="pill"
          className="w-full gap-2"
          disabled={portal.isPending || !hasStripe}
          onClick={() =>
            portal.mutate("/profile/data-access", {
              onError: (e) =>
                toast.error(e instanceof Error ? e.message : "Could not open the portal"),
            })
          }
        >
          <CreditCard className="size-4" />
          {portal.isPending ? "Opening…" : "Manage subscription"}
        </Button>

        {!hasStripe && (
          <p className="font-body text-[11px] text-muted-foreground">
            These options appear once you have a paid membership on file.
          </p>
        )}
      </SurfaceCard>

      {/* ---- Deletion ---- */}
      <SurfaceCard className="space-y-3">
        <h2 className="font-display text-[16px] leading-tight">Delete your account</h2>

        {deletionRequestedAt ? (
          <>
            <p className="font-body text-[12.5px] leading-relaxed text-foreground/80">
              Your account is scheduled for deletion
              {eraseOn ? ` on ${eraseOn}` : ""}. Nothing has been erased yet.
            </p>
            <Button
              variant="gold"
              size="pill"
              className="w-full gap-2"
              disabled={cancelDeletion.isPending}
              onClick={() =>
                cancelDeletion.mutate(undefined, {
                  onSuccess: () => toast("Deletion cancelled — your account is back"),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Could not cancel"),
                })
              }
            >
              <Undo2 className="size-4" />
              {cancelDeletion.isPending ? "Cancelling…" : "Cancel my deletion request"}
            </Button>
          </>
        ) : (
          <>
            <p className="font-body text-[12.5px] leading-relaxed text-foreground/80">
              You can ask us to delete your account at any time. We hold your data for 30 days
              first, so you can change your mind, then erase it.
            </p>
            <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
              <p className="font-body text-[11.5px] font-semibold">What gets erased</p>
              <p className="font-body text-[11.5px] text-foreground/75 leading-snug">
                Your profile, hair and health records, blood results, shelf and wishlist,
                journal, treatment plans, moodboards, appointments, forum posts, messages, and
                every photograph, video and voice note you have uploaded.
              </p>
              <p className="font-body text-[11.5px] font-semibold pt-1">What we have to keep</p>
              <p className="font-body text-[11.5px] text-foreground/75 leading-snug">
                Payment records for six years, as tax law requires, and records of any data
                protection complaint for six years so we can show we handled it properly. Both
                are set out in our Privacy Policy.
              </p>
            </div>
            <Button
              variant="outline"
              size="pill"
              className="w-full gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => {
                setTyped("");
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="size-4" /> Delete my account
            </Button>
          </>
        )}
      </SurfaceCard>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmOpen(false);
            setTyped("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your membership will be cancelled and the app will close today. Your data stays
              intact for 30 days — sign in and cancel the request any time before then. After
              that it is erased and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <p className="font-body text-[12px] text-foreground/80">
              Type <span className="font-semibold">DELETE</span> to confirm.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={typed.trim().toUpperCase() !== "DELETE" || requestDeletion.isPending}
              onClick={runDeletion}
            >
              {requestDeletion.isPending ? "Requesting…" : "Delete my account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountControls;
