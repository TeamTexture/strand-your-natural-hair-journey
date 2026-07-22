import { cn } from "@/lib/utils";

/** Gold "+" badge shown next to a STRAND+ member's name across the app. */
const PlusBadge = ({ className, size = "sm" }: { className?: string; size?: "xs" | "sm" | "md" }) => {
  const dims =
    size === "xs" ? "h-3.5 min-w-3.5 px-1 text-[8px]" :
    size === "md" ? "h-5 min-w-5 px-1.5 text-[11px]" :
    "h-4 min-w-4 px-1 text-[9px]";
  return (
    <span
      aria-label="STRAND+ member"
      title="STRAND+ member"
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-body font-bold leading-none tracking-tight shadow-sm",
        dims,
        className,
      )}
    >
      +
    </span>
  );
};

export default PlusBadge;
