// Compact in-list conversation preview. Used on the Messages screen so a
// member (or admin) can read the last few messages and reply without leaving
// the list, then expand into the full chat window if they want the history.
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { renderMentions } from "@/lib/renderMentions";
import { useAuth } from "@/hooks/useAuth";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import DeliveryTicks from "@/components/chat/DeliveryTicks";
import ChatVoiceBubble from "@/components/chat/ChatVoiceBubble";
import ChatUpgradeNotice from "@/components/chat/ChatUpgradeNotice";
import { isChatLockError, useCanSendChatMessage } from "@/hooks/useCanSendChatMessage";
import {
  messageIsMine,
  useChatThread,
  useMarkThreadRead,
  useSendChatMessage,
  type ChatThread,
} from "@/hooks/useChat";

interface Props {
  thread: ChatThread;
  /** Label for the person on the other side, e.g. "STRAND Team". */
  otherName: string;
}

const InlineThreadChat = ({ thread, otherName }: Props) => {
  const nav = useNavigate();
  const { user } = useAuth();
  const view = useActiveRoleView();
  const { messages } = useChatThread(thread.id);
  const send = useSendChatMessage(thread.id);
  const markRead = useMarkThreadRead(thread.id);
  const [draft, setDraft] = useState("");
  // STRAND+ chat lock — mirrors the RLS rule for instant feedback.
  const chatLock = useCanSendChatMessage(thread);
  const [lockedByRls, setLockedByRls] = useState(false);
  const chatLocked = chatLock.locked || (chatLock.lockRelevant && lockedByRls);
  const endRef = useRef<HTMLDivElement | null>(null);

  const unreadHere = (messages.data ?? []).some(
    (m) => !m.read_at && m.sender_id !== user?.id,
  );
  useEffect(() => {
    if (unreadHere) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, unreadHere]);

  const recent = (messages.data ?? []).slice(-5);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [recent.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || send.isPending || chatLocked) return;
    setDraft("");
    try {
      await send.mutateAsync(text);
    } catch (err) {
      if (chatLock.lockRelevant && isChatLockError(err)) setLockedByRls(true);
      setDraft(text);
      console.error("inline reply failed", err);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
      <div className="max-h-[168px] overflow-y-auto space-y-1.5 pr-0.5">
        {messages.isLoading ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">
            No messages yet — say hello.
          </p>
        ) : (
          recent.map((m) => {
            const mine = user ? messageIsMine(m, thread, user.id, view) : false;
            if (m.kind === "system") {
              return (
                <p
                  key={m.id}
                  className="text-[10.5px] text-muted-foreground text-center italic px-4"
                >
                  {m.body}
                </p>
              );
            }
            if (m.kind === "voice") {
              const vm = m.meta ?? {};
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[82%]">
                    <ChatVoiceBubble
                      path={typeof vm.audio_path === "string" ? vm.audio_path : null}
                      transcript={typeof vm.transcript === "string" ? vm.transcript : m.body || null}
                      durationMs={typeof vm.duration_ms === "number" ? vm.duration_ms : null}
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      mine={mine}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-1.5 ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="text-[11.5px] font-body leading-snug whitespace-pre-wrap break-words">
                    {renderMentions(m.body)}
                  </p>
                  {mine && (
                    <span className="flex justify-end mt-0.5">
                      <DeliveryTicks readAt={m.read_at} />
                    </span>
                  )}
                </div>
              </div>
            );

          })
        )}
        <div ref={endRef} />
      </div>

      {chatLocked && (
        <div className="mt-2.5">
          <ChatUpgradeNotice compact />
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          disabled={chatLocked}
          placeholder={
            chatLocked
              ? "Upgrade to STRAND+ to keep chatting with your pro"
              : `Reply to ${otherName}…`
          }
          className="flex-1 min-w-0 h-9 rounded-pill bg-muted/60 border border-border/60 px-3 text-[12px] font-body outline-none focus:border-primary/60 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || send.isPending || chatLocked}
          aria-label="Send reply"
          className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => nav(`/messages/${thread.id}`)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-body font-semibold text-primary hover:underline"
      >
        Open full chat <ArrowUpRight className="size-3.5" />
      </button>
    </div>
  );
};

export default InlineThreadChat;
