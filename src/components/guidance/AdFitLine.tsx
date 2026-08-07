import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  text?: string | null;
  loading?: boolean;
  className?: string;
}

/** The personalised hook on an advert: one line naming something real about
 *  this member's hair and what the product does for it. Renders nothing when
 *  there is no grounded line to show. */
const AdFitLine = ({ text, loading, className }: Props) => {
  if (!text && !loading) return null;
  return (
    <p
      className={`flex items-start gap-1.5 text-[11.5px] leading-snug font-body text-primary ${className ?? ""}`}
    >
      {loading && !text ? (
        <>
          <Loader2 className="size-3 mt-[2px] shrink-0 animate-spin" />
          <span className="text-muted-foreground">Reading this against your hair…</span>
        </>
      ) : (
        <>
          <Sparkles className="size-3 mt-[2px] shrink-0" />
          <span>{text}</span>
        </>
      )}
    </p>
  );
};

export default AdFitLine;
