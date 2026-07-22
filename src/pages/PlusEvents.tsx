import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calendar, MapPin, Wifi } from "lucide-react";
import { format } from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

type EventRow = {
  id: string; title: string; kind: string; starts_at: string;
  cover_path: string | null; cancelled_at: string | null;
};

const PlusEvents = () => {
  const upcomingQ = useQuery({
    queryKey: ["events", "upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events").select("id,title,kind,starts_at,cover_path,cancelled_at")
        .is("cancelled_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as EventRow[]) ?? [];
    },
  });
  const pastQ = useQuery({
    queryKey: ["events", "past"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events").select("id,title,kind,starts_at,cover_path,cancelled_at")
        .lt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data as EventRow[]) ?? [];
    },
  });

  return (
    <PlusGate title="Events">
      <ScreenLayout>
        <TitleBar title="Events" />
        <div className="px-4 pb-16 space-y-6">
          <section>
            <h2 className="text-[10px] font-body font-bold uppercase tracking-wider text-foreground/60 px-1 mb-2">Upcoming</h2>
            {upcomingQ.isLoading ? <LoadingDot /> : upcomingQ.data && upcomingQ.data.length > 0 ? (
              <ul className="space-y-2">
                {upcomingQ.data.map((e) => <EventCard key={e.id} event={e} />)}
              </ul>
            ) : (
              <div className="text-center text-sm text-foreground/60 py-6 font-body">
                No upcoming events. Watch this space.
              </div>
            )}
          </section>
          {pastQ.data && pastQ.data.length > 0 && (
            <section>
              <h2 className="text-[10px] font-body font-bold uppercase tracking-wider text-foreground/60 px-1 mb-2">Past</h2>
              <ul className="space-y-2 opacity-70">
                {pastQ.data.map((e) => <EventCard key={e.id} event={e} />)}
              </ul>
            </section>
          )}
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

const EventCard = ({ event }: { event: EventRow }) => (
  <li>
    <Link to={`/plus/events/${event.id}`} className="block rounded-[14px] border border-border bg-card overflow-hidden hover:bg-muted/30 transition-colors">
      {event.cover_path && <img src={event.cover_path} alt="" className="w-full aspect-[16/9] object-cover" />}
      <div className="p-4">
        <div className="flex items-center gap-2 text-[10px] font-body font-bold uppercase tracking-wider text-primary">
          {event.kind === "digital" ? <Wifi className="size-3" /> : <MapPin className="size-3" />}
          {event.kind === "digital" ? "Digital" : "In person"}
        </div>
        <h3 className="mt-1 font-display text-[15px] font-semibold leading-tight">{event.title}</h3>
        <p className="mt-1 font-body text-[11.5px] text-foreground/70 flex items-center gap-1">
          <Calendar className="size-3" /> {format(new Date(event.starts_at), "EEE d MMM · HH:mm")}
        </p>
      </div>
    </Link>
  </li>
);

export default PlusEvents;
