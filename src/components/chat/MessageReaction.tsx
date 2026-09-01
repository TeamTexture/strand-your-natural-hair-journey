// Heart reaction affordance shared by every reactable chat bubble.
//
// `ReactableBubble` wraps the coloured bubble body: it owns the double-tap
// gesture (pointer based, because onDoubleClick alone is unreliable on mobile
// Safari) and hangs a `ReactionPill` off the bubble's outer bottom corner.
//
// Controls inside the bubble that own their own gesture — the voice player's
// play button and seek bar, images, links — must stop propagation so a double
// tap on them never toggles a heart. `stopBubbleGesture` does that.

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { ReactionState } from "@/hooks/useMessageReactions";

const TAP_WINDOW_MS = 280;
const MOVE_TOLERANCE_PX = 10;

/** Spread onto any interactive child that must keep its own tap gesture. */
export const stopBubbleGesture = {
  onPointerUp: (e: PointerEvent) => e.stopPropagation(),
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

export const ReactionPill = ({
  reaction,
  mine,
  onToggle,
  disabled,
}: {
  reaction: ReactionState | undefined;
  mine: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) => {
  const total = reaction?.total ?? 0;
  const iReacted = !!reaction?.mine;
  const [pop, setPop] = useState(false);
  const wasMine = useRef(iReacted);

  useEffect(() => {
    if (iReacted && !wasMine.current) {
      setPop(true);
      const timer = window.setTimeout(() => setPop(false), 260);
      wasMine.current = iReacted;
      return () => window.clearTimeout(timer);
    }
    wasMine.current = iReacted;
  }, [iReacted]);

  return (
    <button
      type="button"
      aria-label={iReacted ? "Remove your heart" : "React with a heart"}
      aria-pressed={iReacted}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      {...stopBubbleGesture}
      className={`absolute -bottom-[11px] ${mine ? "-right-[6px]" : "-left-[6px]"} z-10 inline-flex items-center gap-0.5 rounded-pill border bg-card px-1.5 py-[2px] shadow-sm transition-opacity ${
        iReacted ? "border-primary" : "border-secondary"
      } ${
        total === 0
          ? "opacity-0 focus-visible:opacity-100"
          : "opacity-100"
      } ${pop ? "animate-reaction-pop" : ""}`}
    >
      <span className="text-[11px] leading-none">❤️</span>
      {total >= 2 && (
        <span className="text-[10px] font-body leading-none text-foreground/80">{total}</span>
      )}
    </button>
  );
};

const ReactableBubble = ({
  mine,
  reaction,
  onToggle,
  disabled,
  className,
  children,
}: {
  mine: boolean;
  reaction: ReactionState | undefined;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => {
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const from = start.current;
    start.current = null;
    // A scroll, a drag or a long-press must never register as a tap.
    if (
      !from ||
      Math.abs(e.clientX - from.x) > MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - from.y) > MOVE_TOLERANCE_PX
    ) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    if (
      prev &&
      now - prev.t <= TAP_WINDOW_MS &&
      Math.abs(e.clientX - prev.x) <= MOVE_TOLERANCE_PX &&
      Math.abs(e.clientY - prev.y) <= MOVE_TOLERANCE_PX
    ) {
      lastTap.current = null;
      if (!disabled) onToggle();
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ touchAction: "manipulation" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => {
        if (!disabled) onToggle();
      }}
    >
      {children}
      <ReactionPill
        reaction={reaction}
        mine={mine}
        disabled={disabled}
        // Tapping the pill removes my own heart; keyboard users can add one
        // the same way, so the gesture is not the only route in.
        onToggle={onToggle}
      />
    </div>
  );
};

export default ReactableBubble;
