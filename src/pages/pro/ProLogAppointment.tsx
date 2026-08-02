import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarCheck, Info } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import TimePicker12h from "@/components/TimePicker12h";
import { Button } from "@/components/ui/button";
import { smartBack } from "@/lib/smartBack";
import { cn } from "@/lib/utils";
import { useProClients } from "@/hooks/useProClients";
import { useProLogAppointment } from "@/hooks/useProLogAppointment";

/** Today as yyyy-mm-dd in local time, for the date input's min sensible value. */
const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ProLogAppointment = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const prefilledClient = params.get("client");
  const threadId = params.get("thread");

  const { data: clients = [], isLoading } = useProClients();
  const active = useMemo(() => clients.filter((c) => !c.revoked_at), [clients]);

  const [clientId, setClientId] = useState<string>(prefilledClient ?? "");
  const [date, setDate] = useState<string>(todayIso());
  const [time, setTime] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const logAppointment = useProLogAppointment();

  const chosen = active.find((c) => c.consumer_id === clientId);
  const canSave = !!clientId && !!date && !logAppointment.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await logAppointment.mutateAsync({
        client_user_id: clientId,
        appointment_date: date,
        appointment_time: time,
        service,
        notes,
        location,
      });
      toast.success("Logged — it's now in both diaries");
      nav(threadId ? `/messages/${threadId}` : "/pro/appointments", { replace: true });
    } catch (e) {
      console.error("Pro appointment log failed:", e);
      toast.error(e instanceof Error ? e.message : "Could not log the appointment");
    }
  };

  const fieldCls =
    "w-full text-sm p-3 rounded-[12px] border border-border bg-card focus:outline-none focus:border-primary/60 font-body";

  return (
    <ScreenLayout>
      <TitleBar title="Log appointment" onBack={smartBack(nav, "/pro/appointments")} />
      <div className="px-5 pb-10 space-y-5">
        <div className="flex gap-2.5 rounded-[14px] border border-primary/30 bg-primary/10 p-3.5">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[12px] font-body text-foreground/85 leading-snug">
            Logging it here puts the appointment in your Strand diary and your client's
            appointments list, so you're both working from the same record.
          </p>
        </div>

        <div className="space-y-2">
          <SectionLabel>Client</SectionLabel>
          {isLoading ? (
            <LoadingDot label="Loading your clients…" fullScreen={false} />
          ) : active.length === 0 ? (
            <p className="text-[12px] font-body text-muted-foreground">
              You'll be able to log appointments once you've accepted an enquiry.
            </p>
          ) : (
            <div className="space-y-2">
              {active.map((c) => {
                const name = (c.display_name ?? "").split(/\s+/)[0] || "Client";
                const selected = c.consumer_id === clientId;
                return (
                  <button
                    key={c.consumer_id}
                    type="button"
                    onClick={() => setClientId(c.consumer_id)}
                    className={cn(
                      "w-full min-h-[56px] flex items-center gap-3 rounded-[14px] border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-secondary/60",
                    )}
                  >
                    <ProAvatar name={name} photoUrl={c.avatar_url ?? undefined} size="size-9" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-display text-[15px] font-semibold truncate">
                        {name}
                      </span>
                      <span className="block text-[11px] font-body text-muted-foreground">
                        {c.next_appointment_date
                          ? "Has an upcoming appointment"
                          : c.appointment_count > 0
                            ? `${c.appointment_count} logged so far`
                            : "No appointments yet"}
                      </span>
                    </span>
                    {selected && (
                      <span className="text-[10px] font-body uppercase tracking-[0.14em] text-primary">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Date</SectionLabel>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldCls}
          />
        </div>

        <div className="space-y-2">
          <SectionLabel>Time</SectionLabel>
          <TimePicker12h value={time} onChange={setTime} />
        </div>

        <div className="space-y-2">
          <SectionLabel>Service</SectionLabel>
          <input
            type="text"
            value={service}
            maxLength={80}
            placeholder="Silk press, consultation, colour…"
            onChange={(e) => setService(e.target.value)}
            className={fieldCls}
          />
        </div>

        <div className="space-y-2">
          <SectionLabel>Location</SectionLabel>
          <input
            type="text"
            value={location}
            maxLength={120}
            placeholder="Leave blank to use your salon address"
            onChange={(e) => setLocation(e.target.value)}
            className={fieldCls}
          />
        </div>

        <div className="space-y-2">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={notes}
            maxLength={1000}
            rows={4}
            placeholder="Anything your client should arrive knowing."
            onChange={(e) => setNotes(e.target.value)}
            className={cn(fieldCls, "resize-none")}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full h-12 rounded-pill text-[14px] font-body font-semibold uppercase tracking-[0.08em]"
        >
          <CalendarCheck className="size-4 mr-2" />
          {logAppointment.isPending ? "Logging…" : "Log appointment"}
        </Button>
        {chosen && (
          <p className="text-[11px] font-body text-muted-foreground text-center">
            {(chosen.display_name ?? "Your client").split(/\s+/)[0]} will be notified and see it in
            their appointments.
          </p>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProLogAppointment;
