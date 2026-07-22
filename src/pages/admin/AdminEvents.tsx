import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const AdminEvents = () => {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"digital" | "in_person">("digital");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["admin_events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    if (!title || !startsAt) { toast.error("Title and start required"); return; }
    setBusy(true);
    const { error } = await supabase.from("events").insert({
      title: title.trim(),
      description: description.trim(),
      kind,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      venue: kind === "in_person" ? (venue || null) : null,
      address: kind === "in_person" ? (address || null) : null,
      join_url: kind === "digital" ? (joinUrl || null) : null,
      capacity: capacity ? Number(capacity) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setDescription(""); setStartsAt(""); setEndsAt(""); setVenue(""); setAddress(""); setJoinUrl(""); setCapacity(""); setShowNew(false);
    qc.invalidateQueries({ queryKey: ["admin_events"] });
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin_events"] });
  };
  const toggleCancel = async (id: string, cancelledAt: string | null) => {
    await supabase.from("events").update({ cancelled_at: cancelledAt ? null : new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin_events"] });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Events"
        right={
          <Button variant="gold" size="sm" className="rounded-full h-9 px-3" onClick={() => setShowNew((s) => !s)}>
            <Plus className="size-4 mr-1" /> New
          </Button>
        }
      />
      <div className="px-4 pb-10 space-y-3">
        {showNew && (
          <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-4 space-y-2.5">
            <div className="space-y-1"><Label>Kind</Label>
              <select className="w-full h-10 rounded-md border border-border bg-card px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "digital" | "in_person")}>
                <option value="digital">Digital</option><option value="in_person">In person</option>
              </select>
            </div>
            <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Starts</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
              <div className="space-y-1"><Label>Ends</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
            </div>
            {kind === "in_person" ? (
              <>
                <div className="space-y-1"><Label>Venue</Label><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
                <div className="space-y-1"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              </>
            ) : (
              <div className="space-y-1"><Label>Join link</Label><Input value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="https://…" /></div>
            )}
            <div className="space-y-1"><Label>Capacity <span className="text-foreground/50">(optional)</span></Label><Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            <Button variant="gold" size="pill" className="w-full" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Create event"}
            </Button>
          </div>
        )}
        {q.isLoading ? <LoadingDot /> : (
          <ul className="space-y-2">
            {(q.data ?? []).map((e) => (
              <RsvpRow key={e.id} event={e} onToggle={() => toggleCancel(e.id, e.cancelled_at)} onDelete={() => remove(e.id)} />
            ))}
            {q.data?.length === 0 && <p className="text-center py-8 text-sm font-body text-foreground/60">No events yet.</p>}
          </ul>
        )}
      </div>
    </ScreenLayout>
  );
};

type EventRow = {
  id: string; title: string; kind: string; starts_at: string; cancelled_at: string | null;
};
const RsvpRow = ({ event, onToggle, onDelete }: { event: EventRow; onToggle: () => void; onDelete: () => void }) => {
  const rsvpsQ = useQuery({
    queryKey: ["event_rsvp_count", event.id],
    queryFn: async () => {
      const { count } = await supabase.from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id).is("cancelled_at", null);
      return count ?? 0;
    },
  });
  return (
    <li className="rounded-[14px] border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-body font-bold uppercase tracking-wider text-primary">
            {event.kind === "digital" ? "Digital" : "In person"}
            {event.cancelled_at && <span className="text-alert-dark ml-2">CANCELLED</span>}
          </p>
          <p className="font-body text-[13px] font-semibold truncate">{event.title}</p>
          <p className="font-body text-[11px] text-foreground/60">{format(new Date(event.starts_at), "EEE d MMM · HH:mm")}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg leading-none">{rsvpsQ.data ?? 0}</p>
          <p className="text-[9px] uppercase tracking-wider font-body text-foreground/50 flex items-center gap-0.5 justify-end"><Users className="size-2.5" /> RSVPs</p>
        </div>
      </div>
      <div className="flex gap-1.5 mt-2">
        <button onClick={onToggle} className="text-[10.5px] font-semibold px-3 h-7 rounded-full border border-border">
          {event.cancelled_at ? "Reinstate" : "Cancel"}
        </button>
        <button onClick={onDelete} className="text-[10.5px] font-semibold px-3 h-7 rounded-full text-alert-dark flex items-center gap-1">
          <Trash2 className="size-3" /> Delete
        </button>
      </div>
    </li>
  );
};

export default AdminEvents;
