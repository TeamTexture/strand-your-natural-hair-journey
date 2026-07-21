import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { buildCountdown, formatCountdown, getOfferExpiry, type WithPlacements } from "@/lib/offerExpiry";

interface Props {
  offer: WithPlacements;
  /** Visual weight — inline chip (default) or a larger block. */
  variant?: "chip" | "block";
  className?: string;
}

/** Live "X left" clock ticking every second, driven by placement dates.
 *  Highlights urgency once ≤3h remains. */
const CountdownClock = ({ offer, variant = "chip", className = "" }: Props) => {
  const expiry = getOfferExpiry(offer);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!expiry) return;
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiry?.getTime()]);

  if (!expiry) return null;
  const c = buildCountdown(expiry, now);
  if (!c) return null;
  const label = formatCountdown(c);
  const urgent = c.soon;
  const expired = c.expired;

  const tone = expired
    ? "bg-muted text-muted-foreground"
    : urgent
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary";

  if (variant === "block") {
    return (
      <div className={`rounded-[10px] border ${expired ? "border-border" : urgent ? "border-destructive/40" : "border-primary/30"} bg-card px-3 py-2.5 ${className}`}>
        <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-body">
          {expired ? "Offer ended" : "Time left"}
        </p>
        <p className={`font-display text-[16px] mt-0.5 inline-flex items-center gap-1.5 ${expired ? "text-muted-foreground" : urgent ? "text-destructive" : ""}`}>
          <Clock className="size-3.5" /> {label}
        </p>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-body font-medium px-2 py-0.5 rounded-full ${tone} ${className}`}>
      <Clock className="size-3" /> {label}
    </span>
  );
};

export default CountdownClock;
