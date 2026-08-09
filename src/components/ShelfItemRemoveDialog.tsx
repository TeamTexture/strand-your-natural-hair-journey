import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * ShelfItemRemoveDialog — the warning shown when a member taps the bin on a
 * product or tool inside a picker.
 *
 * Deleting here is destructive: it removes the item from the app entirely, not
 * just from this step. So the member is always offered the softer option first —
 * take it off the shelf (or wishlist) and keep it in the app — and the delete is
 * a clearly-marked second choice.
 */
export interface ShelfItemRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Item name, shown so she knows exactly what she's removing. */
  name: string;
  /** "product" | "tool" — drives the copy. */
  kind: "product" | "tool";
  /** Which list the item currently sits in. */
  list: "shelf" | "wishlist";
  busy?: boolean;
  /** Keep it in the app, just take it off the shelf/wishlist. */
  onTakeOff: () => void;
  /** Delete it from the app completely. */
  onDelete: () => void;
}

const ShelfItemRemoveDialog = ({
  open,
  onOpenChange,
  name,
  kind,
  list,
  busy,
  onTakeOff,
  onDelete,
}: ShelfItemRemoveDialogProps) => {
  const where = list === "wishlist" ? "wishlist" : kind === "tool" ? "My Tools" : "shelf";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[330px] rounded-[16px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-base">Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Deleting here removes this {kind} from your {where} <em>and</em> from the app
            completely — its notes, rating and analysis go with it. You can keep it in the app and
            simply take it off your {where} instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Button
            variant="goldGhost"
            className="w-full"
            disabled={busy}
            onClick={onTakeOff}
          >
            Take off {where} — keep in app
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            disabled={busy}
            onClick={onDelete}
          >
            Delete from app
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ShelfItemRemoveDialog;
