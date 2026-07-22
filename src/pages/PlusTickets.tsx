import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Ticket, CalendarDays, ArrowLeft } from "lucide-react";
import { format, startOfDay, subDays } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type TicketRow = {
  rsvp_id: string;
  event_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  cover_path: string | null;
  cancelled_at: string | null;
  attendee_name: string | null;
};

const PlusTickets = () => {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["plus_tickets", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TicketRow[]> => {
      // Only in-person events, active RSVPs, and today-or-later.
      const cutoff = subDays(startOfDay(new Date()), 0).toISOString();
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("id,event_id,events!inner(id,title,description,kind,starts_at,ends_at,venue,address,cover_path,cancelled_at)")
        .eq("user_id", user!.id)
        .is("cancelled_at", null)
        .eq("events.kind", "in_person")
        .gte("events.starts_at", cutoff)
        .order("events(starts_at)", { ascending: true });
      if (error) throw error;

      // Fetch attendee display name once.
      const { data: profile } = await supabase
        .from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle();
      const attendeeName = profile?.display_name ?? null;

      return (data ?? [])
        .filter((row) => !(row.events as { cancelled_at: string | null }).cancelled_at)
        .map((row) => {
          const e = row.events as {
            id: string; title: string; description: string | null; starts_at: string;
            ends_at: string | null; venue: string | null; address: string | null;
            cover_path: string | null; cancelled_at: string | null;
          };
          return {
            rsvp_id: row.id,
            event_id: e.id,
            title: e.title,
            description: e.description,
            starts_at: e.starts_at,
            ends_at: e.ends_at,
            venue: e.venue,
            address: e.address,
            cover_path: e.cover_path,
            cancelled_at: e.cancelled_at,
            attendee_name: attendeeName,
          };
        });
    },
  });

  const tickets = useMemo(() => q.data ?? [], [q.data]);

  return (
    <PlusGate title="Tickets">
      <ScreenLayout>
        <TitleBar title="My tickets" />
        <div className="px-4 pb-14 space-y-4">
          <p className="font-body text-[13px] text-foreground/70 leading-relaxed px-1">
            Show your ticket at the door. Each one is unique to you.
          </p>

          {q.isLoading ? <LoadingDot /> : tickets.length === 0 ? (
            <div className="text-center py-14 space-y-3">
              <div className="mx-auto size-14 rounded-full bg-brown/10 text-brown flex items-center justify-center">
                <Ticket className="size-6" />
              </div>
              <p className="font-body text-[13px] text-foreground/70">You don't have any tickets yet.</p>
              <Link to="/plus/events">
                <Button variant="gold" size="pill">Browse events</Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {tickets.map((t) => <TicketCard key={t.rsvp_id} ticket={t} />)}
            </ul>
          )}

          <div className="pt-3 text-center">
            <Link to="/plus/events" className="inline-flex items-center gap-1 text-[12px] font-body font-semibold text-primary">
              <ArrowLeft className="size-3" /> Back to events
            </Link>
          </div>
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

const TicketCard = ({ ticket }: { ticket: TicketRow }) => {
  const code = ticket.rsvp_id.replace(/-/g, "").slice(-8).toUpperCase();
  return (
    <li className="rounded-[18px] overflow-hidden shadow-sm border border-primary/30 bg-brown text-brown-foreground">
      {/* Cover strip */}
      {ticket.cover_path ? (
        <img src={ticket.cover_path} alt="" className="w-full aspect-[16/6] object-cover" />
      ) : (
        <div className="w-full aspect-[16/6] bg-gradient-to-br from-brown to-brown/70 flex items-center justify-center">
          <Ticket className="size-10 text-primary/60" />
        </div>
      )}
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary px-2.5 py-1 text-[9.5px] font-body font-bold uppercase tracking-[0.18em]">
          <Ticket className="size-3" /> STRAND+ Ticket
        </div>
        <h3 className="mt-2 font-display text-[19px] font-semibold leading-tight">{ticket.title}</h3>
        <p className="mt-1 font-body text-[12px] text-brown-foreground/80 flex items-center gap-1">
          <CalendarDays className="size-3.5" />
          {format(new Date(ticket.starts_at), "EEEE d MMMM · HH:mm")}
          {ticket.ends_at && ` – ${format(new Date(ticket.ends_at), "HH:mm")}`}
        </p>
        {(ticket.venue || ticket.address) && (
          <p className="mt-1 font-body text-[12px] text-brown-foreground/80 flex items-start gap-1">
            <MapPin className="size-3.5 shrink-0 mt-0.5" />
            <span>{[ticket.venue, ticket.address].filter(Boolean).join(", ")}</span>
          </p>
        )}
      </div>

      {/* Perforated divider */}
      <div className="relative h-4">
        <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-brown-foreground/30 -translate-y-1/2" />
        <div className="absolute -left-2 top-1/2 size-4 rounded-full bg-background -translate-y-1/2" />
        <div className="absolute -right-2 top-1/2 size-4 rounded-full bg-background -translate-y-1/2" />
      </div>

      {/* Ticket body */}
      <div className="px-4 pb-5 pt-3 bg-brown text-brown-foreground flex items-center gap-4">
        <div className="bg-white p-2 rounded-lg shrink-0">
          <QRCodeSVG value={ticket.rsvp_id} size={92} bgColor="#ffffff" fgColor="#1a1006" level="M" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-body font-bold uppercase tracking-[0.18em] text-brown-foreground/60">Attendee</p>
          <p className="font-display text-[15px] font-semibold leading-tight truncate">{ticket.attendee_name ?? "STRAND+ member"}</p>
          <p className="mt-2 text-[9.5px] font-body font-bold uppercase tracking-[0.18em] text-brown-foreground/60">Code</p>
          <p className="font-mono text-[18px] font-semibold tracking-[0.16em] leading-none">{code}</p>
        </div>
      </div>
    </li>
  );
};

export default PlusTickets;
