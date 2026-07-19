import { useMemo } from "react";
import { HAIR_LENGTH_BUCKETS, bucketFromInches } from "@/lib/hairLength";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  inches: string;                    // free-text so users can type "6.5"
  bucket: string;                    // matched label ("Chin length" etc.)
  onChange: (next: { inches: string; bucket: string }) => void;
  labelSize?: "sm" | "md";
}

/**
 * Length picker for afro / curly hair. Users pick a stretched-length band by
 * where the hair falls on the body (with a rough inch range), or type an exact
 * pulled-straight measurement. Values stay in sync: picking a band fills a
 * mid-point inches value; typing inches re-classifies the band.
 */
const HairLengthPicker = ({ inches, bucket, onChange, labelSize = "sm" }: Props) => {
  const active = useMemo(() => {
    if (bucket) return bucket;
    const n = Number(inches);
    return Number.isFinite(n) ? (bucketFromInches(n) ?? "") : "";
  }, [inches, bucket]);

  const pickBand = (label: string, minIn: number, maxIn: number) => {
    const mid = Number.isFinite(maxIn)
      ? Math.round(((minIn + Math.min(maxIn, minIn + 6)) / 2) * 10) / 10
      : minIn + 2;
    onChange({ inches: String(mid), bucket: label });
  };

  const handleInches = (raw: string) => {
    const n = Number(raw);
    const nextBucket = Number.isFinite(n) ? (bucketFromInches(n) ?? "") : "";
    onChange({ inches: raw, bucket: nextBucket });
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "uppercase tracking-[0.18em] text-muted-foreground font-body",
          labelSize === "sm" ? "text-[11px] mb-1" : "text-[12px] mb-1.5",
        )}
      >
        Hair length (measured pulled-straight)
      </div>
      <p className="text-[12px] text-muted-foreground leading-snug">
        Coily and curly hair shrinks a lot — pick the band that matches where
        your hair falls when you gently pull a strand straight.
      </p>

      <div className="space-y-1.5">
        {HAIR_LENGTH_BUCKETS.map((b) => {
          const on = active === b.label;
          const range = Number.isFinite(b.maxIn)
            ? `${b.minIn}–${b.maxIn} in`
            : `${b.minIn}+ in`;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => pickBand(b.label, b.minIn, b.maxIn)}
              className={cn(
                "w-full text-left rounded-[12px] border px-3.5 py-2.5 transition-colors",
                on
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium">{b.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium shrink-0",
                    on ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {range}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                {b.guide}
              </p>
            </button>
          );
        })}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
          Exact length (optional)
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={60}
            step={0.5}
            value={inches}
            onChange={(e) => handleInches(e.target.value)}
            placeholder="e.g. 8"
            className="max-w-[140px]"
          />
          <span className="text-[13px] text-muted-foreground">inches, stretched</span>
        </div>
      </div>
    </div>
  );
};

export default HairLengthPicker;
