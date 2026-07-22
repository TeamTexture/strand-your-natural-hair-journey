import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { useStartAdminSupportThread } from "@/hooks/useChat";

/** Reusable "Message" button that opens or reuses an admin↔user support thread. */
const MessageButton = ({ userId, label = "Message as STRAND Team" }: { userId: string; label?: string }) => {
  const nav = useNavigate();
  const start = useStartAdminSupportThread();
  const onClick = async () => {
    try {
      const id = await start.mutateAsync(userId);
      nav(`/messages/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open chat");
    }
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full h-9 rounded-pill text-[11px] font-body"
      onClick={onClick}
      disabled={start.isPending}
    >
      <MessageSquarePlus className="size-3.5 mr-1.5" /> {label}
    </Button>
  );
};

export default MessageButton;
