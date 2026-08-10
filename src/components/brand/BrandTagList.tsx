import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  type BrandTag,
  type TaggableType,
  promotionIsLive,
  useBrandTags,
  visibleTags,
} from "@/hooks/useBrandTags";

/**
 * The single display component for brand tags, used on every surface.
 *
 * Editorial: brand name only, plain. No promotional styling.
 * Promoted: brand name PLUS the disclosure label as visible text alongside it —
 * never a tooltip, never an icon, never behind a tap, and never toned down to
 * blend into the surrounding card.
 *
 * A promoted tag outside its start/end window is hidden (see visibleTags).
 */

const TagRow = ({ tag, onRemove }: { tag: BrandTag; onRemove?: (tag: BrandTag) => void }) => {
  const nav = useNavigate();
  const promoted = promotionIsLive(tag);

  return (
    <div
      className={cn(
        "rounded-[12px] border px-3 py-2.5 flex items-start gap-2",
        promoted ? "border-primary/50 bg-primary/10" : "border-border bg-card",
      )}
    >
      <div className="flex-1 min-w-0">
        {tag.brand_user_id ? (
          <button
            type="button"
            onClick={() => nav(`/brands/${tag.brand_user_id}`)}
            className="font-display text-[14px] text-primary underline underline-offset-2 decoration-primary/40 text-left [overflow-wrap:anywhere]"
          >
            {tag.brand_name}
          </button>
        ) : (
          <p className="font-display text-[14px] text-foreground [overflow-wrap:anywhere]">
            {tag.brand_name}
          </p>
        )}
        {promoted && (
          <p className="mt-1 font-body text-[12px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {tag.disclosure_label}
          </p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${tag.brand_name} tag`}
          onClick={() => onRemove(tag)}
          className="size-8 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
};

export default function BrandTagList({
  taggableType,
  taggableId,
  tags,
  onRemove,
  className,
}: {
  taggableType: TaggableType;
  taggableId?: string | null;
  /** Pass tags to render them directly; otherwise they're fetched. */
  tags?: BrandTag[];
  /** When set, each row carries a remove control. */
  onRemove?: (tag: BrandTag) => void;
  className?: string;
}) {
  const fetched = useBrandTags(taggableType, tags ? null : taggableId);
  const list = visibleTags(tags ?? fetched.tags);
  if (!list.length) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {list.map((t) => (
        <TagRow key={t.id} tag={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

