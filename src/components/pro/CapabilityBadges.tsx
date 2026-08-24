import { useEdgeClamp } from "@/hooks/useEdgeClamp";
import { useEffect, useRef, useState } from "react";
import { Stethoscope, Droplet } from "lucide-react";
import { cn } from "@/lib/utils";
import { doctorTooltip, bloodsTooltip, type CapabilityVerification } from "@/lib/proCapabilities";

/**
 * Verified-capability badges.
 *
 * These render from the `_verified` columns ONLY — a claimed-but-unverified
 * capability shows nothing here, by design.
 *
 * Mobile-first interaction: the badge is a real <button>, so a TAP reveals the
 * tooltip. Pointer devices also reveal it on hover. The tooltip text is in the
 * accessible name, so a screen reader gets it without hovering at all.
 */

type BadgeTone = "doctor" | "bloods";

const CapabilityBadge = ({
  tone,
  label,
  tip,
  icon: Icon,
}: {
  tone: BadgeTone;
  label: string;
  tip: string;
  icon: typeof Stethoscope;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const clamp = useEdgeClamp();

  // Tap-outside closes it, so an open tooltip never traps the tap target.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        // The whole factual statement is the accessible name.
        aria-label={`${label}. ${tip}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border",
          "text-[10px] font-body font-semibold uppercase tracking-[0.08em]",
          tone === "doctor"
            ? "bg-foreground/[0.08] border-foreground/20 text-foreground"
            : "bg-destructive/[0.08] border-destructive/20 text-destructive",
        )}
      >
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          ref={clamp.ref}
          style={clamp.style}
          className="absolute z-30 top-full left-0 mt-1 w-[170px] max-w-[calc(100vw-2rem)] rounded-[8px] bg-foreground px-2 py-1.5 text-[10px] font-body leading-snug text-background shadow-md"
        >
          {tip}
        </span>
      )}
    </span>
  );
};

const CapabilityBadges = ({
  caps,
  className,
}: {
  caps: Partial<CapabilityVerification> | null | undefined;
  className?: string;
}) => {
  const doctor = caps?.isDoctorVerified === true;
  const bloods = caps?.canTakeBloodsVerified === true;
  if (!doctor && !bloods) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      {doctor && (
        <CapabilityBadge tone="doctor" label="GMC" tip={doctorTooltip()} icon={Stethoscope} />
      )}
      {bloods && (
        <CapabilityBadge
          tone="bloods"
          label="Bloods"
          tip={bloodsTooltip(caps?.bloodsSetting ?? null)}
          icon={Droplet}
        />
      )}
    </span>
  );
};

export default CapabilityBadges;
