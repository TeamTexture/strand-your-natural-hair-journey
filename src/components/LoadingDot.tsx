import { cn } from "@/lib/utils";

interface Props {
  /** Optional message shown below the dot. */
  label?: string;
  /** Fill the parent screen. Default true. */
  fullScreen?: boolean;
  className?: string;
}

/**
 * STRAND loading state — a single gold pulsing dot on the sand background.
 * Drop into any screen that's awaiting data so the user never sees a blank surface.
 */
const LoadingDot = ({ label, fullScreen = true, className }: Props) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      "flex flex-col items-center justify-center gap-3 bg-background",
      fullScreen ? "h-full w-full" : "py-12",
      className,
    )}
  >
    <span
      className="block size-3 rounded-full bg-primary animate-pulse"
      aria-hidden="true"
    />
    {label && (
      <span className="font-script italic text-sm text-muted-foreground">{label}</span>
    )}
    <span className="sr-only">{label ?? "Loading"}</span>
  </div>
);

export default LoadingDot;
