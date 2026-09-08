import { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Image URL. A missing/empty value renders the fallback, never an empty <img src>. */
  src?: string | null;
  /** Required so a photo is never announced as decorative by accident. */
  alt: string;
  /** Optional custom fallback. Defaults to a calm muted tile with an icon. */
  fallback?: ReactNode;
}

/**
 * SafeImage — the single <img> wrapper for anything whose URL can fail.
 *
 * Stored photos reach the app through signed URLs that can expire or 403. A bare
 * <img> shows the browser's broken-image glyph in that case; this component
 * swaps in a quiet placeholder instead, and never renders an empty src.
 */
const SafeImage = ({ src, alt, className, fallback, ...rest }: Props) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <>
        {fallback ?? (
          <span
            role="img"
            aria-label={alt}
            className={cn(
              "flex items-center justify-center bg-muted text-muted-foreground",
              className,
            )}
          >
            <ImageOff className="size-4 shrink-0" aria-hidden />
          </span>
        )}
      </>
    );
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

export default SafeImage;
