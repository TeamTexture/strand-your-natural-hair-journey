import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, Wifi, ExternalLink, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PlusEventDetail = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const eventQ = useQuery({
    queryKey: ["event", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const rsvpQ = useQuery({
    queryKey: ["event_rsvp", id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("event_rsvps").select("*")
        .eq("event_id", id!).eq("user_id", user!.id).is("cancelled_at", null).maybeSingle();
      return data;
    },
  });

  const rsvp = async (going: boolean) => {
    if (!user || !id) return;
    setBusy(true);
    try {
      if (going) {
        const { error } = await supabase.from("event_rsvps").insert({ event_id: id, user_id: user.id });
        if (error && !`${error.message}`.includes("duplicate")) throw error;
        toast.success("RSVP confirmed");
      } else {
        await supabase.from("event_rsvps").update({ cancelled_at: new Date().toISOString() })
          .eq("event_id", id).eq("user_id", user.id);
        toast("RSVP cancelled");
      }
      qc.invalidateQueries({ queryKey: ["event_rsvp", id, user.id] });
    } catch (e) {
      toast.error((e as Error).message ?? "Could not update RSVP");
    } finally { setBusy(false); }
  };

  const e = eventQ.data;

  return (
    <PlusGate title="Event">
      <ScreenLayout>
        <TitleBar title="Event" onBack={() => nav("/plus/events")} />
        {eventQ.isLoading ? <LoadingDot /> : !e ? (
          <div className="p-8 text-center text-sm">Not found</div>
        ) : (
          <div className="pb-24">
            {e.cover_path && <img src={e.cover_path} alt="" className="w-full aspect-[16/9] object-cover" />}
            <div className="px-5 pt-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] font-body font-bold uppercase tracking-wider text-primary">
                  {e.kind === "digital" ? <Wifi className="size-3" /> : <MapPin className="size-3" />}
                  {e.kind === "digital" ? "Digital" : "In person"}
                  {e.cancelled_at && <span className="text-alert-dark ml-2">· CANCELLED</span>}
                </div>
                <h1 className="font-display text-[24px] font-semibold leading-tight">{e.title}</h1>
                <p className="font-body text-[12.5px] text-foreground/70 flex items-center gap-1">
                  <Calendar className="size-3.5" /> {format(new Date(e.starts_at), "EEEE d MMMM · HH:mm")}
                  {e.ends_at && ` – ${format(new Date(e.ends_at), "HH:mm")}`}
                </p>
                {e.kind === "in_person" && (e.venue || e.address) && (
                  <p className="font-body text-[12px] text-foreground/70">📍 {[e.venue, e.address].filter(Boolean).join(", ")}</p>
                )}
                {e.capacity && (
                  <p className="font-body text-[11px] text-foreground/60 flex items-center gap-1">
                    <Users className="size-3" /> Capacity {e.capacity}
                  </p>
                )}
              </div>
              {e.description && (
                <p className="font-body text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">{e.description}</p>
              )}
              {rsvpQ.data && e.kind === "digital" && e.join_url && !e.cancelled_at && (
                <a href={e.join_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="gold" size="pill" className="w-full">
                    <ExternalLink className="size-4 mr-2" /> Join event
                  </Button>
                </a>
              )}
              {!e.cancelled_at && (
                rsvpQ.data ? (
                  <Button variant="goldOutline" size="pill" className="w-full" onClick={() => rsvp(false)} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Cancel RSVP"}
                  </Button>
                ) : (
                  <Button variant="gold" size="pill" className="w-full" onClick={() => rsvp(true)} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "RSVP"}
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </ScreenLayout>
    </PlusGate>
  );
};

export default PlusEventDetail;
