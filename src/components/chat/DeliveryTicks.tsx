// WhatsApp-style delivery ticks for chat messages the user sent.
// - single grey tick: sent (delivered — we don't distinguish server-side yet)
// - double grey ticks: delivered
// - double accent ticks: read (read_at is set)
// Because chat_messages persists via a Postgres INSERT the message is
// considered "delivered" once it exists, so we render two ticks whenever
// the row is present, and swap to accent once read_at fills in.
import { Check, CheckCheck } from "lucide-react";

interface Props {
  readAt: string | null;
  className?: string;
}

const DeliveryTicks = ({ readAt, className = "" }: Props) => {
  const read = !!readAt;
  return read ? (
    <CheckCheck className={`size-3 text-primary ${className}`} aria-label="Read" />
  ) : (
    <CheckCheck className={`size-3 text-muted-foreground/70 ${className}`} aria-label="Delivered" />
  );
};

export default DeliveryTicks;
export { Check };
