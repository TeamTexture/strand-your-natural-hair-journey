import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only star display. Renders filled gold stars against muted outlines.
 */
const StarRating = ({
  value,
  size = "size-3.5",
  className,
}: {
  value: number;
  size?: string;
  className?: string;
}) => {
  const rounded = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(size, i <= rounded ? "text-primary" : "text-muted-foreground/35")}
          fill={i <= rounded ? "currentColor" : "none"}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
};

export default StarRating;
