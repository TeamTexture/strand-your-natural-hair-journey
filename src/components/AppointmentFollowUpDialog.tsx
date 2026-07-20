import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Storage key holds the ids we've already prompted for. We only want to
// surface each past-due appointment once — if the user dismisses without
// logging, we don't want to nag them every time they open the app.
const DISMISS_KEY = "strand:appt-followup-dismissed";
// Trigger the pop-up an hour after the scheduled time has passed. Before that
// window we assume the person may still be at the appointment.
const DELAY_MS = 60 * 60 * 1000;

type PendingAppt = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  professional_name: string | null;
  clinic_name: string | null;
};

const loadDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const rememberDismissed = (id: string) => {
  try {
    const list = loadDismissed();
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* ignore quota errors */
  }
};

export default function AppointmentFollowUpDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAppt | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, professional_name, clinic_name")
        .eq("user_id", user.id)
        .eq("status", "upcoming")
        .lte("appointment_date", today)
        .order("appointment_date", { ascending: false })
        .limit(10);
      if (cancelled || !data) return;
      const dismissed = new Set(loadDismissed());
      const now = Date.now();
      const due = (data as PendingAppt[]).find((row) => {
        if (dismissed.has(row.id)) return false;
        const dtIso = `${row.appointment_date}T${row.appointment_time ?? "23:59"}:00`;
        const t = Date.parse(dtIso);
        return Number.isFinite(t) && now - t >= DELAY_MS;
      });
      if (due) setPending(due);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!pending) return null;

  const who = pending.professional_name || pending.clinic_name || "your appointment";
  const dateLabel = new Date(`${pending.appointment_date}T00:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "short" },
  );

  const handleLog = () => {
    rememberDismissed(pending.id);
    setPending(null);
    navigate(`/appointments/log?fromId=${pending.id}`);
  };

  const handleLater = () => {
    rememberDismissed(pending.id);
    setPending(null);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleLater(); }}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Did you have your appointment with {who}?
          </DialogTitle>
          <DialogDescription>
            {dateLabel} — log how it went and we'll pre-fill everything we already
            know from your booking.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleLog} className="w-full rounded-pill">
            Log my appointment
          </Button>
          <Button variant="ghost" onClick={handleLater} className="w-full rounded-pill">
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
