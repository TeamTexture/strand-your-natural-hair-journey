import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSetBrandOfferHidden } from "@/hooks/useBrandOffers";

interface Props {
  offerId: string;
  hiddenAt: string | null | undefined;
  /** Admin copy names the brand page explicitly; brands see their own page. */
  audience?: "brand" | "admin";
  className?: string;
}

/** Hide / unhide an offer from the public brand page. Reversible and entirely
 *  separate from "Delete offer" — nothing is removed, so stats, revision
 *  history and the discount code all stay intact. Either the brand or a STRAND
 *  admin can toggle it; the last person to do so is recorded. */
const OfferVisibilityToggle = ({ offerId, hiddenAt, audience = "brand", className }: Props) => {
  const setHidden = useSetBrandOfferHidden();
  const hidden = !!hiddenAt;

  const toggle = () =>
    setHidden.mutate(
      { id: offerId, hidden: !hidden },
      {
        onSuccess: () =>
          toast.success(
            hidden
              ? "Back on the brand page"
              : audience === "admin"
                ? "Hidden from the brand's public page"
                : "Hidden from your public page",
          ),
        onError: (e: unknown) => toast.error((e as { message?: string })?.message ?? "Could not update"),
      },
    );

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="pill"
        onClick={toggle}
        disabled={setHidden.isPending}
        className="w-full"
      >
        {setHidden.isPending ? (
          <Loader2 className="size-4 mr-1.5 animate-spin" />
        ) : hidden ? (
          <Eye className="size-4 mr-1.5" />
        ) : (
          <EyeOff className="size-4 mr-1.5" />
        )}
        {hidden ? "Unhide" : "Hide from page"}
      </Button>
      <p className="mt-1.5 text-[11px] font-body text-muted-foreground leading-snug">
        {hidden
          ? "Members can't see this offer on the brand page. Nothing has been deleted — stats, revision history and the discount code are all still here."
          : "Takes it off the public brand page without deleting anything. You can unhide it at any time."}
      </p>
    </div>
  );
};

/** Small "Hidden" chip for lists. */
export const HiddenOfferBadge = ({ hiddenAt }: { hiddenAt: string | null | undefined }) => {
  if (!hiddenAt) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-body font-medium">
      <EyeOff className="size-2.5" /> Hidden
    </span>
  );
};

export default OfferVisibilityToggle;
