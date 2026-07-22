import { useEffect, useMemo, useState } from "react";
import { markPlusSurfaceSeen } from "@/hooks/usePlusAlerts";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  MapPin,
  Wifi,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Ticket,
  Loader2,
  Users,
  ExternalLink,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  format,
  isBefore,
  startOfDay,
} from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  cover_path: string | null;
  cancelled_at: string | null;
  venue: string | null;
  address: string | null;
  join_url: string | null;
  capacity: number | null;
};

const PlusEvents = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fetch a wide window to cover calendar + upcoming/past sections in one go.
  const eventsQ = useQuery({
    queryKey: ["plus_events_all"],
    queryFn: async () => {
      const from = subMonths(startOfMonth(new Date()), 3).toISOString();
      const to = addMonths(endOfMonth(new Date()), 12).toISOString();
      const { data, error } = await supabase
        .from("events")
        .select("id,title,description,kind,starts_at,ends_at,cover_path,cancelled_at,venue,address,join_url,capacity")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as EventRow[]) ?? [];
    },
  });

  const rsvpQ = useQuery({
    queryKey: ["plus_events_rsvps_mine", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("event_id,cancelled_at")
        .eq("user_id", user!.id)
        .is("cancelled_at", null);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r) => set.add(r.event_id));
      return set;
    },
  });

  // Calendar month grid (Mon-start, 6 weeks).
  const monthDays = useMemo(() => {
    const from = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const to = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: from, end: to });
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    (eventsQ.data ?? []).forEach((e) => {
      if (e.cancelled_at) return;
      const key = format(new Date(e.starts_at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [eventsQ.data]);

  const todayStart = startOfDay(new Date());
  const upcoming = useMemo(
    () => (eventsQ.data ?? []).filter((e) => !e.cancelled_at && !isBefore(new Date(e.starts_at), todayStart)),
    [eventsQ.data, todayStart],
  );
  const visibleList = useMemo(() => {
    if (!selectedDay) return upcoming;
    return upcoming.filter((e) => isSameDay(new Date(e.starts_at), selectedDay));
  }, [upcoming, selectedDay]);

  const toggleRsvp = async (event: EventRow) => {
    if (!user) return;
    setBusyId(event.id);
    try {
      const going = rsvpQ.data?.has(event.id);
      if (going) {
        await supabase.from("event_rsvps").update({ cancelled_at: new Date().toISOString() })
          .eq("event_id", event.id).eq("user_id", user.id);
        toast("RSVP cancelled");
      } else {
        const { error } = await supabase.from("event_rsvps").insert({ event_id: event.id, user_id: user.id });
        if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;
        toast.success(event.kind === "in_person" ? "You're on the list — grab your ticket" : "RSVP confirmed");
      }
      await qc.invalidateQueries({ queryKey: ["plus_events_rsvps_mine", user.id] });
      await qc.invalidateQueries({ queryKey: ["plus_tickets", user.id] });
    } catch (e) {
      toast.error((e as Error).message ?? "Could not update RSVP");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PlusGate title="Events">
      <ScreenLayout>
        <TitleBar
          title="Events"
          right={
            <Link to="/plus/tickets">
              <Button variant="goldOutline" size="sm" className="rounded-full h-9 px-3 gap-1">
                <Ticket className="size-3.5" /> Tickets
              </Button>
            </Link>
          }
        />

        <div className="px-4 pb-16 space-y-5">
          {/* Calendar */}
          <section className="rounded-[14px] border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                aria-label="Previous month"
                onClick={() => { setMonthCursor((m) => subMonths(m, 1)); setSelectedDay(null); }}
                className="size-8 rounded-full flex items-center justify-center hover:bg-muted/60"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="font-display text-[15px] font-semibold">{format(monthCursor, "MMMM yyyy")}</p>
              <button
                aria-label="Next month"
                onClick={() => { setMonthCursor((m) => addMonths(m, 1)); setSelectedDay(null); }}
                className="size-8 rounded-full flex items-center justify-center hover:bg-muted/60"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
                <div key={d} className="text-center text-[9px] font-body font-bold uppercase tracking-wider text-foreground/50">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthDays.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDay.get(key) ?? [];
                const hasDigital = dayEvents.some((e) => e.kind === "digital");
                const hasPhysical = dayEvents.some((e) => e.kind === "in_person");
                const inMonth = isSameMonth(day, monthCursor);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    disabled={dayEvents.length === 0 && !inMonth}
                    className={cn(
                      "aspect-square rounded-[10px] flex flex-col items-center justify-center gap-0.5 transition-colors relative",
                      inMonth ? "text-foreground" : "text-foreground/25",
                      dayEvents.length > 0 && !isSelected && "hover:bg-muted/60 cursor-pointer",
                      isSelected && "bg-brown text-brown-foreground",
                      isToday && !isSelected && "ring-1 ring-primary/60",
                    )}
                  >
                    <span className="text-[12px] font-body font-semibold leading-none">{format(day, "d")}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 h-1.5">
                        {hasDigital && <span className={cn("size-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} />}
                        {hasPhysical && <span className={cn("size-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-brown")} />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 text-[10px] font-body text-foreground/60">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> Digital</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-brown" /> In person</span>
            </div>
          </section>

          {/* List */}
          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[10px] font-body font-bold uppercase tracking-wider text-foreground/60">
                {selectedDay ? format(selectedDay, "EEEE d MMMM") : "Upcoming"}
              </h2>
              {selectedDay && (
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-[10.5px] font-body font-semibold text-primary uppercase tracking-wider"
                >
                  Show all
                </button>
              )}
            </div>

            {eventsQ.isLoading ? (
              <LoadingDot />
            ) : visibleList.length > 0 ? (
              <ul className="space-y-2">
                {visibleList.map((event) => {
                  const isOpen = expanded === event.id;
                  const going = rsvpQ.data?.has(event.id) ?? false;
                  return (
                    <li key={event.id} className="rounded-[14px] border border-border bg-card overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : event.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className={cn(
                          "size-11 shrink-0 rounded-[10px] flex flex-col items-center justify-center",
                          event.kind === "digital" ? "bg-primary/12 text-primary" : "bg-brown/12 text-brown",
                        )}>
                          <span className="text-[9px] font-body font-bold uppercase tracking-wider leading-none">
                            {format(new Date(event.starts_at), "MMM")}
                          </span>
                          <span className="font-display text-[16px] font-semibold leading-none mt-0.5">
                            {format(new Date(event.starts_at), "d")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[10px] font-body font-bold uppercase tracking-wider text-foreground/60">
                            {event.kind === "digital" ? <Wifi className="size-3 text-primary" /> : <MapPin className="size-3 text-brown" />}
                            {event.kind === "digital" ? "Digital" : "In person"}
                            <span>· {format(new Date(event.starts_at), "HH:mm")}</span>
                            {going && (
                              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-good/15 text-good px-1.5 py-0.5 text-[9px] font-bold">
                                <Ticket className="size-2.5" /> Going
                              </span>
                            )}
                          </div>
                          <p className="font-display text-[14px] font-semibold leading-tight truncate">{event.title}</p>
                        </div>
                        <ChevronDown className={cn("size-4 text-foreground/50 shrink-0 transition-transform", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="border-t border-border p-4 space-y-3 bg-muted/20">
                          {event.cover_path && (
                            <img src={event.cover_path} alt="" className="w-full aspect-[16/9] object-cover rounded-[10px]" />
                          )}
                          {event.kind === "in_person" && (event.venue || event.address) && (
                            <p className="font-body text-[12px] text-foreground/75 flex items-start gap-1.5">
                              <MapPin className="size-3.5 text-brown shrink-0 mt-0.5" />
                              <span>{[event.venue, event.address].filter(Boolean).join(", ")}</span>
                            </p>
                          )}
                          {event.capacity && (
                            <p className="font-body text-[11px] text-foreground/60 flex items-center gap-1">
                              <Users className="size-3" /> Capacity {event.capacity}
                            </p>
                          )}
                          {event.description && (
                            <p className="font-body text-[12.5px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                              {event.description}
                            </p>
                          )}
                          <div className="flex flex-col gap-2 pt-1">
                            {going && event.kind === "digital" && event.join_url && (
                              <a href={event.join_url} target="_blank" rel="noopener noreferrer">
                                <Button variant="gold" size="pill" className="w-full">
                                  <ExternalLink className="size-4 mr-2" /> Join event
                                </Button>
                              </a>
                            )}
                            {going && event.kind === "in_person" && (
                              <Link to="/plus/tickets">
                                <Button variant="gold" size="pill" className="w-full">
                                  <Ticket className="size-4 mr-2" /> View my ticket
                                </Button>
                              </Link>
                            )}
                            {going ? (
                              <Button variant="goldOutline" size="pill" className="w-full" onClick={() => toggleRsvp(event)} disabled={busyId === event.id}>
                                {busyId === event.id ? <Loader2 className="size-4 animate-spin" /> : "Cancel my place"}
                              </Button>
                            ) : (
                              <Button variant="gold" size="pill" className="w-full" onClick={() => toggleRsvp(event)} disabled={busyId === event.id}>
                                {busyId === event.id ? <Loader2 className="size-4 animate-spin" /> : "Confirm my place"}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-10 text-sm text-foreground/60 font-body flex flex-col items-center gap-2">
                <CalendarIcon className="size-6 text-foreground/40" />
                {selectedDay ? "Nothing on this day." : "No upcoming events. Watch this space."}
              </div>
            )}
          </section>
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

export default PlusEvents;
