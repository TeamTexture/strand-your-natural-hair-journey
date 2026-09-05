// "Speak to STRAND" — prominent home-screen entry into the member's direct
// conversation with the STRAND team. Opens in place as a bottom drawer, never a
// page navigation, and reuses the shared InlineThreadChat so realtime, read
// receipts and delivery ticks behave exactly as they do on Messages.
import { useEffect, useState } from "react";
import { MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import InlineThreadChat from "@/components/chat/InlineThreadChat";
import {
  useMySupportThread,
  useMySupportUnread,
  useOpenMySupportThread,
} from "@/hooks/useSupportChat";

const SpeakToStrandCard = () => {
  const [open, setOpen] = useState(false);
  const { data: thread, isLoading } = useMySupportThread();
  const { data: unread = 0 } = useMySupportUnread(thread?.id);
  const start = useOpenMySupportThread();

  // The thread is created lazily — the first time she opens the drawer.
  useEffect(() => {
    if (!open || thread || isLoading || start.isPending) return;
    start.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not open the chat"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thread, isLoading]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="speak-to-strand"
        className="w-full text-left transition-transform active:scale-[0.99]"
      >
        <SurfaceCard className="py-3.5 flex items-center gap-3 border-2 border-primary/60 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent">
          <span className="size-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <MessageSquareHeart className="size-5 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="card-title font-display text-[14.5px] leading-tight">Speak to STRAND</p>
              {unread > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground font-body leading-snug">
              {unread > 0
                ? "The STRAND team has replied — tap to read."
                : "Any question or issue — message the team directly."}
            </p>
          </div>
        </SurfaceCard>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-base">Speak to STRAND</SheetTitle>
            <SheetDescription className="text-[11.5px]">
              Messages go straight to the STRAND team. We reply here.
            </SheetDescription>
          </SheetHeader>

          {thread ? (
            <InlineThreadChat thread={thread} otherName="STRAND Team" />
          ) : (
            <div className="py-8">
              <LoadingDot label="Opening your chat…" fullScreen={false} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SpeakToStrandCard;
