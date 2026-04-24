import { cn } from "@/lib/utils";

interface Props {
  /** Full professional name — used to derive initials. */
  name: string;
  /** Optional photo URL — when present, renders the image instead of initials. */
  photoUrl?: string | null;
  /** Tailwind size class shorthand (e.g. "size-12", "size-14"). Defaults to size-12. */
  size?: string;
  className?: string;
}

const initialsFor = (name: string): string => {
  const parts = name
    .replace(/^(Dr|Dr\.|Mr|Mrs|Ms|Mx)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Circular/rounded avatar for professionals. Shows the photo when available,
 * otherwise their initials on a soft primary tint.
 */
const ProAvatar = ({ name, photoUrl, size = "size-12", className }: Props) => {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(size, "rounded-[12px] object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        size,
        "rounded-[12px] bg-primary/15 text-primary flex items-center justify-center shrink-0 font-display font-semibold",
        className,
      )}
      aria-label={name}
    >
      <span className="text-sm tracking-wide">{initialsFor(name)}</span>
    </div>
  );
};

export default ProAvatar;
