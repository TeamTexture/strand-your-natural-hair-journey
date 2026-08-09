import { smartBack } from "@/lib/smartBack";
import { directoryLinkForPro } from "@/lib/directoryLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import {
  BadgeCheck,
  Calendar,
  CalendarPlus,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mic,
  Send,
  Square,
  User2,
  Minus,
} from "lucide-react";
import { normalizeBookingUrl } from "@/lib/bookingUrl";
import { externalLinkProps } from "@/lib/socialLinks";

import DeliveryTicks from "@/components/chat/DeliveryTicks";
import ChatAppointmentPreview from "@/components/chat/ChatAppointmentPreview";
import { useThreadAppointment } from "@/hooks/useThreadAppointment";
import BookingDepartureSheet from "@/components/booking/BookingDepartureSheet";
import { useLogBookingDeparture } from "@/hooks/useBookingDeparture";
import TimePicker12h from "@/components/TimePicker12h";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import MentionTextarea from "@/components/MentionTextarea";
import { renderMentions } from "@/lib/renderMentions";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import {
  messageIsMine,
  mySideRole,
  useBookAppointmentInThread,
  useChatThread,
  useProBookingUrl,
  useSendBookingRequest,
  useMarkThreadRead,
  useSendChatMessage,
  useSendChatImage,
  useSendChatVoice,
  type ChatMessage,
} from "@/hooks/useChat";
import ChatImageBubble from "@/components/chat/ChatImageBubble";
import ChatVoiceBubble from "@/components/chat/ChatVoiceBubble";
import { formatVoiceDuration, useVoiceRecorder } from "@/hooks/useVoiceRecorder";

const dateLabel = (d: Date) => {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
};

const BookAppointmentDialog = ({
  open,
  onCancel,
  onConfirm,
  submitting,
  locationSuggestions,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (v: { date: string; time: string; location: string; notes: string }) => void;
  submitting: boolean;
  locationSuggestions: string[];
}) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!open) { setDate(""); setTime(""); setLocation(""); setNotes(""); }
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-[16px] p-4 w-full max-w-[340px] space-y-3">
        <p className="font-display text-lg font-semibold">Book appointment</p>
        <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Date
          <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60" />
        </label>
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Time
          <div className="mt-1">
            <TimePicker12h value={time} onChange={setTime} />
          </div>
        </div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Location
          <div className="mt-1">
            <LocationAutocomplete value={location} onChange={setLocation} suggestions={locationSuggestions} />
          </div>
        </div>
        <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Notes
          <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="What to bring, prep, etc." className="mt-1 w-full text-sm p-2.5 rounded-[10px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60" />
        </label>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button disabled={!date || submitting} onClick={() => onConfirm({ date, time, location, notes })}>
            {submitting ? "Booking…" : "Book"}
          </Button>
        </div>
      </div>
    </div>
  );
};



const SystemBubble = ({ m, isPro }: { m: ChatMessage; isPro: boolean }) => {
  const nav = useNavigate();
  const apptId = (m.meta as { appointment_id?: string } | null)?.appointment_id;
  if (apptId) {
    const target = isPro ? `/pro/appointments?appt=${apptId}` : `/appointments?appt=${apptId}`;
    return (
      <div className="flex justify-center my-2">
        <button
          type="button"
          onClick={() => nav(target)}
          className="inline-flex items-center gap-1.5 text-[11px] font-body text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-full transition"
        >
          <Calendar className="size-3" />
          <span>{m.body}</span>
          <span className="text-[10px] uppercase tracking-[0.1em] opacity-70">View</span>
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-center my-2">
      <div className="text-[11px] font-body text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full">{m.body}</div>
    </div>
  );
};

/** Structured booking-request card — guidance-card design language. */
const BookingRequestCard = ({ m, mine }: { m: ChatMessage; mine: boolean }) => {
  const meta = (m.meta ?? {}) as { booking_url?: string; pro_name?: string; note?: string | null };
  const url = normalizeBookingUrl(meta.booking_url ?? "");
  const proName = meta.pro_name || "Your professional";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-2`}>
      <div className="w-[85%] rounded-[16px] border border-primary/25 bg-primary/8 p-3.5">
        <div className="flex items-center gap-1.5">
          <CalendarPlus className="size-3.5 text-primary" />
          <span className="text-[9.5px] font-body font-semibold uppercase tracking-[0.14em] text-primary">
            Booking request
          </span>
        </div>
        <p className="mt-1.5 text-sm font-body font-semibold leading-snug text-foreground">
          {proName} invites you to book
        </p>
        {meta.note && (
          <p className="mt-1 text-[12.5px] font-body leading-snug text-foreground/80 whitespace-pre-wrap">
            {meta.note}
          </p>
        )}
        {url && (
          <a
            href={url}
            {...externalLinkProps}
            className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-pill bg-primary px-4 text-[11.5px] font-body font-semibold uppercase tracking-[0.08em] text-primary-foreground"
          >
            Book appointment
            <ExternalLink className="size-3.5" />
          </a>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground">
          <span>{format(new Date(m.created_at), "HH:mm")}</span>
          {mine && <DeliveryTicks readAt={m.read_at} />}
        </div>
      </div>
    </div>
  );
};

const MessageBubble = ({

  m,
  mine,
  senderName,
  showName,
}: {
  m: ChatMessage;
  mine: boolean;
  senderName: string;
  showName: boolean;
}) => (
  <div className={`flex flex-col ${mine ? "items-end" : "items-start"} mb-1.5`}>
    {showName && (
      <span
        className={`text-[10.5px] font-body font-semibold mb-0.5 px-1 ${
          mine ? "text-primary" : "text-brown"
        }`}
      >
        {senderName}
      </span>
    )}
    <div
      className={`max-w-[80%] px-3.5 py-2 rounded-[16px] text-sm font-body leading-snug whitespace-pre-wrap break-words ${
        mine
          ? "bg-primary text-primary-foreground rounded-br-[6px]"
          : "bg-brown text-brown-foreground rounded-bl-[6px]"
      }`}
    >
      {renderMentions(m.body)}
      <div className={`flex items-center justify-end gap-1 text-[9.5px] mt-0.5 ${mine ? "text-primary-foreground/75" : "text-brown-foreground/70"}`}>
        <span>{format(new Date(m.created_at), "HH:mm")}</span>
        {mine && (
          <DeliveryTicks
            readAt={m.read_at}
            className={m.read_at ? "" : "text-primary-foreground/85"}
          />
        )}
      </div>
    </div>
  </div>
);


const ChatThreadPage = () => {
  const nav = useNavigate();
  const { threadId } = useParams();
  const { user, isViewingAs } = useAuth();
  const roleView = useActiveRoleView();
  const { thread, messages } = useChatThread(threadId);
  const send = useSendChatMessage(threadId);
  const sendImage = useSendChatImage(threadId);
  const book = useBookAppointmentInThread();
  const markRead = useMarkThreadRead(threadId);
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Location autocomplete pool: any locations the current user has already
  // used on appointments, plus (for pros) their registered clinic addresses.
  // Purely a UX helper — free-text new locations are still allowed.
  const { data: locationSuggestions = [] } = useQuery({
    queryKey: ["chat_location_suggestions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const set = new Set<string>();
      const { data: appts } = await supabase
        .from("appointments")
        .select("clinic_name")
        .or(`user_id.eq.${user!.id},linked_pro_user_id.eq.${user!.id}`)
        .not("clinic_name", "is", null)
        .limit(50);
      for (const a of appts ?? []) {
        if (a?.clinic_name) set.add(String(a.clinic_name));
      }
      const { data: proRow } = await supabase
        .from("pro_profiles")
        .select("address_line1, address_line2, city, location")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (proRow) {
        const r = proRow as unknown as Record<string, unknown>;
        for (const key of ["address_line1", "address_line2", "city", "location"]) {
          const v = r[key];
          if (typeof v === "string" && v.trim()) set.add(v.trim());
        }
      }
      return Array.from(set);
    },
    staleTime: 5 * 60_000,
  });


  const t = thread.data;
  const isSupport = t?.thread_type === "admin_support";
  // Perspective is decided by the role view I'm browsing in, so a dual-role
  // account (pro + member) reads the same thread correctly from both sides.
  const side = t && user ? mySideRole(t, user.id, roleView) : null;
  const isAdmin = side === "admin";
  const isPro = !isSupport && side === "pro";
  const otherId =
    t && user
      ? t.thread_type === "admin_support"
        ? (isAdmin ? t.subject_user_id : t.admin_user_id)
        : (isPro ? t.consumer_id : t.pro_user_id)
      : null;

  // The professional's booking page link drives the client-facing
  // "Book appointment" button and the pro's own booking-request action.
  const proUserId = !isSupport ? (t?.pro_user_id ?? null) : null;
  const { data: proBooking } = useProBookingUrl(proUserId);
  const bookingUrl = proBooking?.url ? normalizeBookingUrl(proBooking.url) : "";
  const myProName = proBooking?.proName || "Your professional";
  const sendBookingRequest = useSendBookingRequest(threadId);
  // Next booked appointment shared by these two people — pinned above the
  // composer so either side can jump to their own dashboard for the detail.
  const { data: threadAppointment } = useThreadAppointment(
    !isSupport ? t?.consumer_id : null,
    proUserId,
  );
  const [departureOpen, setDepartureOpen] = useState(false);
  const logDeparture = useLogBookingDeparture();

  // Peer thread: the enquiry was explicitly SENT as a professional. Having a
  // pro profile is not enough — multi-role accounts enquire as members too, and
  // the recorded sender_role is the only source of truth.
  const { data: isPeerThread = false } = useQuery({
    queryKey: ["chat_thread_peer", t?.enquiry_id],
    enabled: !isSupport && !!t?.enquiry_id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("pro_enquiries")
        .select("sender_role")
        .eq("id", t!.enquiry_id!)
        .maybeSingle();
      return data?.sender_role === "pro";
    },
  });




  const { data: other } = useQuery({
    queryKey: ["chat_thread_other", otherId, isSupport, isAdmin, isPro],
    enabled: !!otherId,
    queryFn: async () => {
      if (isSupport && !isAdmin) {
        return { name: "STRAND Team", sub: "Support & guidance", avatar_path: null as string | null };
      }
      // For admins viewing support: show the subject user's name.
      if (isSupport && isAdmin) {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, postcode")
          .eq("user_id", otherId!)
          .maybeSingle();
        return { name: data?.display_name ?? "Member", sub: data?.postcode ?? null, avatar_path: null as string | null };
      }
      if (isPro) {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, postcode")
          .eq("user_id", otherId!)
          .maybeSingle();
        return { name: data?.display_name ?? "Client", sub: data?.postcode ?? null, avatar_path: null as string | null };
      }
      const { data } = await supabase
        .from("pro_profiles")
        .select("display_name, discipline, location, avatar_path")
        .eq("user_id", otherId!)
        .maybeSingle();
      return {
        name: data?.display_name ?? "Professional",
        sub: [data?.discipline, data?.location].filter(Boolean).join(" · ") || null,
        avatar_path: data?.avatar_path ?? null,
      };
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data?.length]);

  useEffect(() => {
    if (!threadId || !messages.data || !t || !user) return;
    const hasUnread = messages.data.some(
      (m) => m.sender_id !== null && !m.read_at && !messageIsMine(m, t, user.id, roleView),
    );
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.data?.length, roleView, t?.id]);

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: ChatMessage[] }> = [];
    for (const m of messages.data ?? []) {
      const lbl = dateLabel(new Date(m.created_at));
      const last = out[out.length - 1];
      if (last && last.label === lbl) last.items.push(m);
      else out.push({ label: lbl, items: [m] });
    }
    return out;
  }, [messages.data]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await send.mutateAsync(body);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
      setDraft(body);
    }
  };

  if (!threadId) {
    return (
      <ScreenLayout>
        <TitleBar title="Messages" onBack={smartBack(nav, "/messages")} />
        <EmptyState icon="💬" message="Thread not found" />
      </ScreenLayout>
    );
  }

  const headerTitle = isSupport && !isAdmin ? "STRAND Team" : (other?.name ?? "Conversation");
  const backTarget = isAdmin ? "/admin/messages" : "/messages";
  const roleTag =
    isSupport ? "STRAND Team"
    : isPro ? (isPeerThread ? "Peer professional" : "Member")
    : "Pro";

  return (
    <ScreenLayout>
      <TitleBar
        title={headerTitle}
        onBack={smartBack(nav, backTarget)}
        right={
          <div className="flex items-center gap-2">
            {!isSupport && isPro && !isPeerThread && t && (

              <button
                onClick={() => nav(`/pro/clients/${t.consumer_id}`)}
                className="text-[10.5px] uppercase tracking-[0.08em] text-primary font-medium"
              >
                Passport
              </button>
            )}
            <button
              onClick={smartBack(nav, backTarget)}
              aria-label="Minimise chat"
              className="size-8 rounded-full flex items-center justify-center text-foreground/70 hover:bg-muted"
            >
              <Minus className="size-4" />
            </button>
          </div>
        }
      />

      <div className="px-5 -mt-1 pb-2 flex items-center justify-center gap-1.5 flex-wrap">
        <span className="text-[9.5px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full bg-primary/12 text-primary font-body font-semibold">
          {roleTag}
        </span>
        {isSupport && !isAdmin && (
          <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-primary font-body font-medium">
            <BadgeCheck className="size-3.5" />
            Official STRAND channel
          </span>
        )}
        {/* Deep-link into the anchored directory when the consumer is talking
            to a professional, so they can jump straight to that pro's listing. */}
        {!isSupport && !isPro && otherId && (
          <button
            onClick={() => nav(directoryLinkForPro(otherId))}
            className="text-[10.5px] uppercase tracking-[0.14em] text-primary font-body font-medium underline underline-offset-2"
          >
            View listing
          </button>
        )}
      </div>
      {other?.sub && !isSupport && (
        <p className="px-5 -mt-1 pb-2 text-center text-[11px] text-muted-foreground truncate">{other.sub}</p>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3">
        {thread.isLoading || messages.isLoading ? (
          <LoadingDot label="Loading chat…" fullScreen={false} />
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center">
            <div className="size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <User2 className="size-6" />
            </div>
            <p className="text-sm font-body text-muted-foreground max-w-[240px]">
              Say hello to kick things off.
            </p>
          </div>
        ) : (
          grouped.map((group) => {
            let prevSender: string | null = null;
            return (
            <div key={group.label}>
              <div className="flex justify-center my-3">
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{group.label}</span>
              </div>
              {group.items.map((m) => {
                if (m.kind === "system") {
                  prevSender = null;
                  return <SystemBubble key={m.id} m={m} isPro={isPro} />;
                }
                const mine =
                  !!t && !!user ? messageIsMine(m, t, user.id, roleView) : m.sender_id === user?.id;
                if (m.kind === "booking_request") {
                  prevSender = null;
                  return <BookingRequestCard key={m.id} m={m} mine={mine} />;
                }
                const senderKey = mine ? "me" : (m.sender_id ?? "them");
                const showName = prevSender !== senderKey;
                prevSender = senderKey;
                const senderName = mine ? "You" : (other?.name ?? "Them");
                const meta = (m.meta ?? {}) as Record<string, unknown>;
                if (m.kind === "voice") {
                  return (
                    <ChatVoiceBubble
                      key={m.id}
                      path={typeof meta.audio_path === "string" ? meta.audio_path : null}
                      transcript={
                        typeof meta.transcript === "string" ? meta.transcript : m.body || null
                      }
                      durationMs={
                        typeof meta.duration_ms === "number" ? meta.duration_ms : null
                      }
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      mine={mine}
                      senderName={senderName}
                      showName={showName}
                    />
                  );
                }
                if (m.kind === "image") {
                  return (
                    <ChatImageBubble
                      key={m.id}
                      path={typeof meta.image_path === "string" ? meta.image_path : null}
                      caption={m.body === "Photo" ? null : m.body}
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      mine={mine}
                      senderName={senderName}
                      showName={showName}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    mine={mine}
                    senderName={senderName}
                    showName={showName}
                  />
                );
              })}
            </div>
            );
          })
        )}
      </div>

      {threadAppointment && !isSupport && (
        <ChatAppointmentPreview
          appointment={threadAppointment}
          isPro={isPro}
          clientName={isPro ? other?.name : null}
        />
      )}

      {/* Client side: persistent booking action whenever the pro has a link. */}
      {!isSupport && !isPro && bookingUrl && (
        <div className="px-4 pt-2 pb-2 border-t border-border/60 bg-background">
          <Button
            onClick={() => setDepartureOpen(true)}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-pill px-4 text-[11.5px] font-body font-semibold uppercase tracking-[0.08em]"
          >
            <Calendar className="size-3.5" />
            Book an appointment
          </Button>
        </div>
      )}

      <BookingDepartureSheet
        open={departureOpen}
        onOpenChange={setDepartureOpen}
        target={
          bookingUrl
            ? {
                proName: other?.name || myProName,
                bookingUrl,
                discountCode: proBooking?.discountCode ?? null,
                discountDescription: proBooking?.discountDescription ?? null,
              }
            : null
        }
        onConfirm={async () => {
          // Record the departure BEFORE navigating: a user who never returns to
          // the tab must still be counted.
          if (proUserId) {
            try {
              await logDeparture.mutateAsync({
                professionalId: proUserId,
                bookingUrl,
                discountCodeShown: proBooking?.discountCode ?? null,
              });
            } catch (e) {
              console.error("Booking departure log failed:", e);
            }
          }
          if (threadId) {
            supabase.rpc("note_booking_link_opened", { _thread_id: threadId }).then(({ error }) => {
              if (error) console.error("Booking-open note failed:", error);
            });
          }
          window.open(bookingUrl, "_blank", "noopener,noreferrer");
          setDepartureOpen(false);
        }}
      />


      {isPro && !isSupport && (
        <div className="px-4 pt-1 pb-2 border-t border-border/60 bg-background space-y-2">
          {isViewingAs ? (
            <p className="text-[11.5px] font-body text-muted-foreground">
              Read-only view — sending is disabled while viewing as another user.
            </p>
          ) : bookingUrl ? (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await sendBookingRequest.mutateAsync({
                    bookingUrl,
                    proName: myProName || "Your professional",
                  });
                  toast.success("Booking link sent");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not send link");
                }
              }}
              disabled={sendBookingRequest.isPending}
              className="w-full min-h-[44px] uppercase tracking-[0.08em] text-[11px]"
            >
              <CalendarPlus className="size-3.5 mr-1.5" />
              Send booking link
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => nav("/pro/profile")}
              className="w-full text-left text-[11.5px] font-body text-primary underline underline-offset-2"
            >
              Add your booking link to send it in chat
            </button>
          )}
        </div>
      )}



      <div className="px-3 pb-3 pt-2 border-t border-border/60 bg-background flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            placeholder="Type a message · @ to tag"
            rows={1}
            className="max-h-[120px] text-sm p-2.5 rounded-[14px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60"
          />
        </div>
        <button
          onClick={submit}
          disabled={!draft.trim() || send.isPending || isViewingAs}
          aria-label="Send"
          className="shrink-0 size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>

    </ScreenLayout>
  );
};

export default ChatThreadPage;

