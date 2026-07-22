import { smartBack } from "@/lib/smartBack";
import { directoryLinkForPro } from "@/lib/directoryLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { BadgeCheck, Calendar, Send, User2, Minus } from "lucide-react";
import DeliveryTicks from "@/components/chat/DeliveryTicks";
import TimePicker12h from "@/components/TimePicker12h";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {
  otherParticipantId,
  useBookAppointmentInThread,
  useChatThread,
  useMarkThreadRead,
  useSendChatMessage,
  type ChatMessage,
} from "@/hooks/useChat";

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

const MessageBubble = ({ m, mine }: { m: ChatMessage; mine: boolean }) => (
  <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1.5`}>
    <div
      className={`max-w-[80%] px-3.5 py-2 rounded-[16px] text-sm font-body leading-snug whitespace-pre-wrap break-words ${
        mine
          ? "bg-primary text-primary-foreground rounded-br-[6px]"
          : "bg-brown text-brown-foreground rounded-bl-[6px]"
      }`}
    >
      {m.body}
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
  const { user } = useAuth();
  const { thread, messages } = useChatThread(threadId);
  const send = useSendChatMessage(threadId);
  const book = useBookAppointmentInThread();
  const markRead = useMarkThreadRead(threadId);
  const [draft, setDraft] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
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
  const isAdmin = !!t && !!user && t.admin_user_id === user.id;
  const isPro = !!t && !!user && !isSupport && t.pro_user_id === user.id;
  const otherId = t && user ? otherParticipantId(t, user.id) : null;

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
    if (!threadId || !messages.data) return;
    const hasUnread = messages.data.some((m) => m.sender_id !== user?.id && m.sender_id !== null && !m.read_at);
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.data?.length]);

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
    : isPro ? "Member"
    : "Pro";

  return (
    <ScreenLayout>
      <TitleBar
        title={headerTitle}
        onBack={smartBack(nav, backTarget)}
        right={
          <div className="flex items-center gap-2">
            {!isSupport && isPro && t && (
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
          grouped.map((group) => (
            <div key={group.label}>
              <div className="flex justify-center my-3">
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{group.label}</span>
              </div>
              {group.items.map((m) =>
                m.kind === "system" ? (
                  <SystemBubble key={m.id} text={m.body} />
                ) : (
                  <MessageBubble key={m.id} m={m} mine={m.sender_id === user?.id} />
                ),
              )}
            </div>
          ))
        )}
      </div>

      {isPro && !isSupport && (
        <div className="px-4 pt-1 pb-2 border-t border-border/60 bg-background">
          <Button size="sm" variant="outline" onClick={() => setBookingOpen(true)} className="w-full uppercase tracking-[0.08em] text-[11px]">
            <Calendar className="size-3.5 mr-1.5" />
            Book appointment
          </Button>
        </div>
      )}

      <div className="px-3 pb-3 pt-2 border-t border-border/60 bg-background flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder="Type a message"
          rows={1}
          className="flex-1 max-h-[120px] text-sm p-2.5 rounded-[14px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || send.isPending}
          aria-label="Send"
          className="shrink-0 size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>

      <BookAppointmentDialog
        open={bookingOpen}
        submitting={book.isPending}
        locationSuggestions={locationSuggestions}
        onCancel={() => setBookingOpen(false)}
        onConfirm={async ({ date, time, location, notes }) => {
          if (!threadId) return;
          try {
            await book.mutateAsync({
              thread_id: threadId,
              appointment_date: date,
              appointment_time: time || undefined,
              location: location || undefined,
              notes: notes || undefined,
            });
            setBookingOpen(false);
            // Pros get a confirmation with a shortcut to their appointments hub.
            if (isPro) {
              toast.success("Appointment booked", {
                action: {
                  label: "View in appointments",
                  onClick: () => nav("/pro/appointments"),
                },
              });
            } else {
              toast.success("Appointment booked");
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not book");
          }
        }}
      />
    </ScreenLayout>
  );
};

export default ChatThreadPage;

