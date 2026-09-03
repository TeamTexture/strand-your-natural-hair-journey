// "How can we help, sweet?" — the feedback offer that sits inside the
// "Before you cancel" dialog, below the discount card.
//
// Both options open INLINE inside the dialog (no navigation, no redirect):
//  - "Chat with me" reuses the member's existing STRAND Team support thread
//    (same thread as Speak to STRAND / Messages) via InlineThreadChat.
//  - "Book 1:1" reuses the same inline Calendly embed as the Home card.
// Nothing here touches the discount card, the claim call or the cancel path.
import { useEffect, useState } from "react";
import { CalendarHeart, MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";
import LoadingDot from "@/components/LoadingDot";
import InlineThreadChat from "@/components/chat/InlineThreadChat";
import PaigeCalendlyInline from "@/components/booking/PaigeCalendlyInline";
import { useMySupportThread, useOpenMySupportThread } from "@/hooks/useSupportChat";

type Panel = "none" | "chat" | "book";

const OptionButton = ({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex-1 min-w-0 rounded-[14px] border px-3 py-2.5 text-left transition-colors active:scale-[0.99] ${
      active
        ? "border-primary bg-primary/10"
        : "border-border bg-card hover:border-primary/50"
    }`}
  >
    <span className="flex items-center gap-2 min-w-0">
      <span className="size-6 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center">
        {icon}
      </span>
      <span className="font-body text-[12.5px] font-semibold text-foreground break-words">
        {label}
      </span>
    </span>
  </button>
);

const RetentionHelpSection = () => {
  const [panel, setPanel] = useState<Panel>("none");
  const { data: thread, isLoading } = useMySupportThread();
  const start = useOpenMySupportThread();

  // The support thread is created lazily, the first time she opens the chat.
  useEffect(() => {
    if (panel !== "chat" || thread || isLoading || start.isPending) return;
    start.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not open the chat"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, thread, isLoading]);

  return (
    <div className="rounded-[14px] border border-border bg-card/60 px-4 py-3.5 min-w-0">
      <p className="font-display text-[15px] leading-tight text-foreground">
        How can we help, sweet?
      </p>
      <p className="font-body text-[11.5px] leading-snug text-muted-foreground mt-1">
        Every piece of feedback genuinely helps us make STRAND better for the whole community.
        Before you go, book a few minutes with me one to one, or drop me a message in the app —
        tell me what we could&apos;ve done better.
      </p>

      <div className="mt-3 flex gap-2">
        <OptionButton
          active={panel === "chat"}
          icon={<MessageSquareHeart className="size-3.5" />}
          label="Chat with me"
          onClick={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
        />
        <OptionButton
          active={panel === "book"}
          icon={<CalendarHeart className="size-3.5" />}
          label="Book 1:1"
          onClick={() => setPanel((p) => (p === "book" ? "none" : "book"))}
        />
      </div>

      {panel === "chat" && (
        <div className="mt-3">
          {thread ? (
            <InlineThreadChat thread={thread} otherName="STRAND Team" />
          ) : (
            <div className="py-6">
              <LoadingDot label="Opening your chat…" fullScreen={false} />
            </div>
          )}
        </div>
      )}

      {panel === "book" && (
        <div className="mt-3">
          <PaigeCalendlyInline height={480} />
        </div>
      )}
    </div>
  );
};

export default RetentionHelpSection;
