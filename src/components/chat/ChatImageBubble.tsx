// Renders an image attached to a chat message.
//
// Images live in the private `chat-images` bucket, so the browser can only
// display them through a short-lived signed URL. The URL is fetched per bubble
// and cached by React Query for the life of the signed link.

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import DeliveryTicks from "@/components/chat/DeliveryTicks";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const SIGN_SECONDS = 60 * 60;

export const useChatImageUrl = (path: string | null | undefined) =>
  useQuery({
    queryKey: ["chat-image-url", path],
    enabled: !!path,
    staleTime: (SIGN_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("chat-images")
        .createSignedUrl(path as string, SIGN_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });

interface Props {
  path: string | null | undefined;
  caption?: string | null;
  createdAt: string;
  readAt?: string | null;
  mine: boolean;
  senderName?: string;
  showName?: boolean;
}

const ChatImageBubble = ({
  path,
  caption,
  createdAt,
  readAt,
  mine,
  senderName,
  showName,
}: Props) => {
  const { data: url, isLoading } = useChatImageUrl(path);
  const [open, setOpen] = useState(false);

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} mb-1.5`}>
      {showName && senderName && (
        <span
          className={`text-[10.5px] font-body font-semibold mb-0.5 px-1 ${
            mine ? "text-primary" : "text-brown"
          }`}
        >
          {senderName}
        </span>
      )}
      <div
        className={`max-w-[80%] p-1.5 rounded-[16px] ${
          mine
            ? "bg-primary text-primary-foreground rounded-br-[6px]"
            : "bg-brown text-brown-foreground rounded-bl-[6px]"
        }`}
      >
        {url ? (
          <button type="button" onClick={() => setOpen(true)} className="block">
            <img
              src={url}
              alt={caption?.trim() ? caption : "Image sent in this conversation"}
              loading="lazy"
              className="max-h-[260px] w-auto max-w-full rounded-[11px] object-cover"
            />
          </button>
        ) : (
          <div className="flex h-[140px] w-[180px] items-center justify-center rounded-[11px] bg-background/20">
            <ImageIcon className="size-5 opacity-70" />
            <span className="sr-only">{isLoading ? "Loading image" : "Image unavailable"}</span>
          </div>
        )}
        {caption?.trim() && (
          <p className="px-2 pt-1.5 text-sm font-body leading-snug whitespace-pre-wrap break-words">
            {caption}
          </p>
        )}
        <div
          className={`flex items-center justify-end gap-1 px-2 pt-1 pb-0.5 text-[9.5px] ${
            mine ? "text-primary-foreground/75" : "text-brown-foreground/70"
          }`}
        >
          <span>{format(new Date(createdAt), "HH:mm")}</span>
          {mine && (
            <DeliveryTicks readAt={readAt ?? null} className={readAt ? "" : "text-primary-foreground/85"} />
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px] p-2">
          {url && (
            <img
              src={url}
              alt={caption?.trim() ? caption : "Image sent in this conversation"}
              className="w-full rounded-[12px]"
            />
          )}
          {caption?.trim() && (
            <p className="px-1 pb-1 text-[12.5px] font-body leading-snug whitespace-pre-wrap">{caption}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatImageBubble;
