// WhatsApp-style delivery ticks for chat messages the user sent.
// - Single tick: sent (optimistic / not yet persisted)
// - Double ticks: delivered (row exists, recipient hasn't opened)
// - Double BLUE ticks: read (recipient's read_at is set)
import { Check, CheckCheck } from "lucide-react";

interface Props {
  readAt: string | null;
  pending?: boolean;
  className?: string;
}

const DeliveryTicks = ({ readAt, pending = false, className = "" }: Props) => {
  if (pending) {
    return <Check className={`size-3 ${className}`} aria-label="Sent" />;
  }
  if (readAt) {
    return (
      <CheckCheck
        className={`size-3 text-[hsl(var(--tick-read))] ${className}`}
        aria-label="Read"
      />
    );
  }
  return <CheckCheck className={`size-3 ${className}`} aria-label="Delivered" />;
};

export default DeliveryTicks;
export { Check };
