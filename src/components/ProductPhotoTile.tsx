import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Existing uploaded image URL (signed). Falls back to emoji when null. */
  imageUrl: string | null;
  /** Emoji to show when no photo is uploaded. */
  fallbackEmoji: string;
  /** Called with the picked file. Should return true on success. */
  onPick: (file: File) => Promise<boolean> | boolean;
  /** Called when user taps the remove button. Optional. */
  onRemove?: () => void;
  /** Disabled while another op is in flight. */
  busy?: boolean;
  /** Tile size class. Defaults to size-12. */
  size?: string;
  /** Additional classes for the outer wrapper. */
  className?: string;
  /** Use camera capture by default (mobile). */
  preferCamera?: boolean;
}

/**
 * Square photo tile for product/wishlist cards. Shows the user's uploaded
 * image when available, otherwise an emoji placeholder. Tapping the tile
 * always opens a file picker so the user can add or replace the photo.
 */
const ProductPhotoTile = ({
  imageUrl,
  fallbackEmoji,
  onPick,
  onRemove,
  busy = false,
  size = "size-12",
  className,
  preferCamera = false,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // A stored photo URL can expire or fail; treat that exactly like "no photo"
  // so the tile shows its placeholder instead of a broken-image glyph.
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [imageUrl]);
  const shownUrl = failed ? null : imageUrl;


  return (
    <div
      className={cn(
        "relative shrink-0 group",
        size,
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        {...(preferCamera ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onPick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={busy}
        aria-label={shownUrl ? "Replace photo" : "Add photo"}
        className={cn(
          "size-full rounded-[10px] overflow-hidden flex items-center justify-center transition-all [container-type:size]",
          shownUrl
            ? "bg-transparent"
            : "bg-primary/15 hover:bg-primary/25 border border-dashed border-primary/40",
        )}
      >
        {shownUrl ? (
          // object-contain so the bottle/jar shows fully without crop, and
          // mix-blend-multiply hides flat white studio backgrounds against
          // the cream app surface for a clean float-on-cream look.
          <img
            src={shownUrl}
            alt=""
            onError={() => setFailed(true)}
            className="size-full object-contain mix-blend-multiply"
          />
        ) : (
          // Scales with the tile so the placeholder is never a tiny glyph
          // floating in a large hero tile.
          <span className="leading-none text-2xl text-[42cqmin]">{fallbackEmoji}</span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-[10px]">
            <Loader2 className="size-4 text-white animate-spin" />
          </span>
        )}
        {!shownUrl && !busy && (
          <span className="absolute bottom-0.5 right-0.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Camera className="size-2.5" />
          </span>
        )}
      </button>

      {shownUrl && onRemove && !busy && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove photo"
          className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 shadow"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
};

export default ProductPhotoTile;
