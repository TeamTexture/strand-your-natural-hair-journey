import { useState } from "react";
import { AlertTriangle, History, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
import { erasureDate, formatLongDate } from "@/hooks/useAccountLifecycle";
import {
  useAdminDeletionHistory,
  useAdminRequestAccountDeletion,
  useMemberDeletionState,
} from "@/hooks/useAdminAccountDeletion";
import type { AccountType } from "@/hooks/useAccountTypes";

interface Props {
  userId: string;
  name: string | null;
  /** Only ever rendered for professional accounts. */
  currentType: AccountType;
  isSelf?: boolean;
}

/**
 * Admin-only deletion of a PROFESSIONAL account. Mirrors the member's own
 * two-stage flow exactly: it starts the 30-day grace period, cancels billing,
 * and emails them the date — it does not erase anything today.
 */
const AccountDeletionControl = ({ userId, name, currentType, isSelf }: Props) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { data: state } = useMemberDeletionState(userId);
  const { data: history = [], isLoading: historyLoading } = useAdminDeletionHistory(
    userId,
    showHistory,
  );
  const request = useAdminRequestAccountDeletion();

  if (currentType !== "professional") return null;

  const requestedAt = state?.deletion_requested_at ?? null;
  const eraseOn = formatLongDate(erasureDate(requestedAt));
  const who = name ?? "This professional";

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[12px] font-body font-medium">Delete this account</p>

      {requestedAt ? (
        <p className="mt-1 text-[11px] font-body text-destructive leading-snug">
          Scheduled for deletion{eraseOn ? ` on ${eraseOn}` : ""}. Nothing has been erased yet —
          they can cancel the request themselves from their own account settings at any point
          before that date.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
            You are acting on someone else's account. This starts the same 30-day grace period a
            member starts for herself — it does not erase anything today.
          </p>
          {isSelf ? (
            <p className="mt-2 text-[11px] text-muted-foreground italic leading-snug">
              You cannot delete your own account from here.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 w-full h-8 rounded-pill text-[11px] font-body text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setTyped("");
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="size-3.5 mr-1.5 shrink-0" /> Delete this account
            </Button>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-body text-primary"
      >
        <History className="size-3" />
        {showHistory ? "Hide deletion history" : "Deletion history"}
      </button>

      {showHistory && (
        <div className="mt-2 space-y-1.5">
          {historyLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No changes recorded — no admin has requested deletion of this account.
            </p>
          ) : (
            history.map((h) => (
              <p key={h.id} className="text-[11px] text-muted-foreground leading-snug">
                Deletion {h.action === "requested" ? "requested" : h.action} by{" "}
                <span className="text-foreground font-medium">
                  {h.performed_by_name ?? "STRAND Team"}
                </span>{" "}
                · {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                {h.erase_on
                  ? ` · erases ${new Date(h.erase_on).toLocaleDateString("en-GB")}`
                  : ""}
              </p>
            ))
          )}
        </div>
      )}

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
              <AlertTriangle className="size-4 text-destructive" /> Delete {who}'s account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is an admin action on someone else's account. Their subscription will be
              cancelled, the app will close for them today, and they will be emailed the exact
              erasure date. Their data stays intact for 30 days — they can sign in and cancel the
              request any time before then, exactly as if they had asked themselves. After that it
              is erased and cannot be recovered.
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
            <AlertDialogCancel>Keep this account</AlertDialogCancel>
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              disabled={typed.trim().toUpperCase() !== "DELETE" || request.isPending}
              onClick={() =>
                request.mutate(
                  { userId },
                  {
                    onSuccess: () => {
                      setConfirmOpen(false);
                      setTyped("");
                      toast.success("Deletion requested — they have been emailed the date.");
                    },
                    onError: (e) =>
                      toast.error(
                        e instanceof Error ? e.message : "Could not request deletion",
                      ),
                  },
                )
              }
            >
              {request.isPending ? "Requesting…" : "Delete this account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountDeletionControl;
