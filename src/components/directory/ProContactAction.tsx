import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProContactState } from "@/hooks/useProContactState";

/**
 * The single per-user enquiry/chat action for a professional. Used on the
 * directory card AND the professional's full profile so both surfaces always
 * agree: Enquire → awaiting response → Chat now (permanent once a thread
 * exists) → Enquire again after a decline/withdrawal.
 */
export default function ProContactAction({
  state,
  onEnquire,
  className,
}: {
  state: ProContactState;
  onEnquire: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const base =
    "py-2 text-[11px] uppercase tracking-[0.1em] rounded-md font-medium min-h-[44px] flex items-center justify-center gap-1.5 text-center";

  // ACCEPTED — an open thread exists, so chat is always reachable.
  if (state.threadId) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/messages/${state.threadId}`)}
        className={cn(base, "bg-primary text-primary-foreground", className)}
      >
        <MessageCircle className="size-3.5" />
        Chat now
        {state.unread > 0 && (
          <span
            className="ml-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-semibold text-primary"
            aria-label={`${state.unread} unread messages`}
          >
            {state.unread > 9 ? "9+" : state.unread}
          </span>
        )}
      </button>
    );
  }

  // PENDING — enquiry sent, no thread yet. No new enquiry allowed.
  if (state.kind === "pending") {
    return (
      <button
        type="button"
        onClick={() => navigate("/profile/enquiries")}
        className={cn(
          base,
          "bg-secondary text-foreground border border-primary/40",
          className,
        )}
      >
        Awaiting response
      </button>
    );
  }

  // NONE / DECLINED / WITHDRAWN — enquiry allowed (immediately after a close).
  return (
    <button
      type="button"
      onClick={onEnquire}
      className={cn(base, "bg-primary text-primary-foreground", className)}
    >
      {state.kind === "none" ? "Enquire Now" : "Enquire again"}
    </button>
  );
}
