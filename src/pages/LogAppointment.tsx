import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Check } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import FormField from "@/components/FormField";
import Tag from "@/components/Tag";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { searchProfessionalsIn, type Professional } from "@/data/professionals";
import { toast } from "sonner";
import VoiceNoteField from "@/components/VoiceNoteField";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import { Camera, X } from "lucide-react";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";

const TYPES = ["Trichologist", "Dermatologist", "Curl Specialist", "Braider", "GP", "Stylist"];

const STATUSES = [
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

const LogAppointment = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pros } = useDirectoryProfessionals();
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get("fromId");

  const [query, setQuery] = useState("");
  const [pickedFromDirectory, setPickedFromDirectory] = useState<Professional | null>(null);

  const [proName, setProName] = useState("");
  const [proType, setProType] = useState("Dermatologist");
  const [clinic, setClinic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [notesAudio, setNotesAudio] = useState<string | null>(null);
  const [status, setStatus] = useState<"upcoming" | "completed">("upcoming");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");

  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from an existing appointment (e.g. from the "did you have your
  // appointment?" home alert). We load the booking, populate every field we
  // can, and default the status to "completed" since the user is logging it.
  useEffect(() => {
    if (!fromId || !user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("professional_name, professional_type, clinic_name, appointment_date, appointment_time, reason, notes, follow_up_needed, follow_up_date, follow_up_time")
        .eq("id", fromId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setProName(data.professional_name ?? "");
      if (data.professional_type) setProType(data.professional_type);
      setClinic(data.clinic_name ?? "");
      if (data.appointment_date) setDate(data.appointment_date);
      setTime(data.appointment_time ?? "");
      setReason(data.reason ?? "");
      setNotes(data.notes ?? "");
      setFollowUp(!!data.follow_up_needed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFollowUpDate(((data as any).follow_up_date ?? "") as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFollowUpTime(((data as any).follow_up_time ?? "") as string);

      setStatus("completed");
      setPrefilled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromId, user]);


  // Local-only list of File objects awaiting upload; uploaded after the
  // appointment row is created so we can FK them to its id.
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const { upload: uploadApptPhoto } = usePhotoUploader("appointment-photos");

  // Default date to today (yyyy-mm-dd)
  useEffect(() => {
    if (!date) {
      const d = new Date();
      const iso = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      setDate(iso);
    }
  }, [date]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || pickedFromDirectory) return [];
    return searchProfessionalsIn(pros, q).slice(0, 5);
  }, [pros, query, pickedFromDirectory]);

  const applyPro = (p: Professional) => {
    setProName(p.name);
    setProType(p.type);
    setClinic(p.clinic);
    setQuery(p.name);
    setPickedFromDirectory(p);
  };

  const clearPick = () => {
    setPickedFromDirectory(null);
    setQuery("");
  };

  const canSave = proName.trim().length > 0 && date.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!user) {
      toast.error("Please sign in to log appointments");
      return;
    }
    if (!canSave) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      professional_name: proName.trim(),
      professional_type: proType,
      clinic_name: clinic.trim() || null,
      appointment_date: date,
      appointment_time: time.trim() || null,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
      status,
      follow_up_needed: followUp,
      follow_up_date: followUp && followUpDate ? followUpDate : null,
      follow_up_time: followUp && followUpTime.trim() ? followUpTime.trim() : null,
    };

    let savedId: string | null = null;
    if (fromId) {
      // Updating the pre-existing booking (came from the home alert).
      const { data: updated, error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", fromId)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error || !updated) {
        setSaving(false);
        console.error("Appointment update failed:", error);
        toast.error("Could not save appointment");
        return;
      }
      savedId = updated.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("appointments")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        setSaving(false);
        console.error("Appointment save failed:", error);
        toast.error("Could not save appointment");
        return;
      }
      savedId = inserted.id;
    }


    // Upload any pending photos in parallel and link them to the new appointment.
    if (pendingPhotos.length > 0) {
      const uploaded = await Promise.all(pendingPhotos.map((p) => uploadApptPhoto(p.file)));
      const rows = uploaded
        .filter((path): path is string => !!path)
        .map((path) => ({ appointment_id: savedId!, user_id: user.id, storage_path: path }));
      if (rows.length > 0) {
        const { error: photoErr } = await supabase.from("appointment_photos").insert(rows);
        if (photoErr) console.error("appointment_photos insert failed", photoErr);
      }
    }

    setSaving(false);
    toast.success("Appointment logged");
    navigate("/appointments");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Log Appointment" onBack={() => navigate("/appointments")} />

      <div className="px-5 pb-8 space-y-4">
        {prefilled && (
          <div className="px-3.5 py-2.5 bg-primary/10 border border-primary/30 rounded-[10px]">
            <p className="text-xs text-foreground leading-snug">
              Pre-filled from your booking. Update anything that changed, add notes/photos, then save.
            </p>
          </div>
        )}
        {/* Directory search */}
        <div>
          <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Find Professional
          </span>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (pickedFromDirectory) setPickedFromDirectory(null);
              }}
              placeholder="Search name, clinic, or location"
              autoComplete="off"
              className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
            />
            {matches.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden max-h-[280px] overflow-y-auto">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPro(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/5 border-b border-border/50 last:border-b-0 min-h-[56px]"
                  >
                    <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-9" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.clinic} · {p.location}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {pickedFromDirectory && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-[10px]">
            <Check className="size-4 text-primary shrink-0" />
            <p className="text-xs text-foreground flex-1 min-w-0 truncate">
              From directory · <span className="font-medium">{pickedFromDirectory.clinic}</span>
            </p>
            <button
              type="button"
              onClick={clearPick}
              className="text-[11px] uppercase tracking-[0.1em] text-primary font-medium px-2 min-h-[36px]"
            >
              Clear
            </button>
          </div>
        )}

        <FormField
          label="Professional's Name"
          value={proName}
          onChange={(e) => setProName(e.target.value)}
          placeholder="Dr. Yvonne Abimbola"
          autoComplete="off"
        />

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Type
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Tag key={t} selected={proType === t} onClick={() => setProType(t)}>
                {t}
              </Tag>
            ))}
          </div>
        </div>

        <FormField
          label="Clinic / Salon"
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
          placeholder="Dr Eve Skin"
          autoComplete="off"
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
              Date
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
              Time
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
            />
          </label>
        </div>

        <FormField
          label="Reason for Visit"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Hair loss assessment, scalp consult..."
          autoComplete="off"
        />

        <VoiceNoteField
          label="Notes"
          placeholder="Diagnosis, treatment plan, recommendations..."
          value={notes}
          onChange={setNotes}
          audioPath={notesAudio}
          onAudioPathChange={setNotesAudio}
          folder="appointments/notes"
          rows={4}
        />

        {/* Photos — attach scalp / receipt / treatment shots to the appointment */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Photos
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingPhotos.map((p, idx) => (
              <div key={idx} className="relative size-20 rounded-[10px] overflow-hidden bg-muted">
                <img src={p.previewUrl} alt="Attachment" className="absolute inset-0 size-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.previewUrl);
                    setPendingPhotos((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  aria-label="Remove photo"
                  className="absolute top-0.5 right-0.5 size-6 rounded-full bg-background/85 backdrop-blur flex items-center justify-center text-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              className="size-20 rounded-[10px] border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex flex-col items-center justify-center gap-1 text-primary transition-colors"
            >
              <Camera className="size-5" />
              <span className="text-[10px] font-medium">Add</span>
            </button>
          </div>
          <input
            ref={photoFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPendingPhotos((prev) => [...prev, { file: f, previewUrl: URL.createObjectURL(f) }]);
              if (photoFileRef.current) photoFileRef.current.value = "";
            }}
          />
          {pendingPhotos.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Photos upload when you save the appointment.
            </p>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Status
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Tag
                key={s.id}
                selected={status === s.id}
                onClick={() => setStatus(s.id as "upcoming" | "completed")}
              >
                {s.label}
              </Tag>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => {
                const on = e.target.checked;
                setFollowUp(on);
                // First tick: default the follow-up date to 6 weeks after the
                // appointment date — a sensible starting point for most
                // trichology / dermatology follow-ups. The user can override.
                if (on && !followUpDate && date) {
                  const base = new Date(`${date}T00:00:00`);
                  base.setDate(base.getDate() + 42);
                  const y = base.getFullYear();
                  const m = (base.getMonth() + 1).toString().padStart(2, "0");
                  const d = base.getDate().toString().padStart(2, "0");
                  setFollowUpDate(`${y}-${m}-${d}`);
                }
              }}
              className="size-5 rounded border-border accent-primary"
            />
            <span className="text-sm font-body">Follow-up needed</span>
          </label>

          {followUp && (
            <div className="px-3.5 py-3 bg-primary/5 border border-primary/25 rounded-[12px] space-y-3">
              <p className="text-[11px] text-muted-foreground leading-snug">
                Schedule the follow-up now so it lives on your calendar and in
                your STRAND diary.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
                    Follow-up Date
                  </span>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
                    Time
                  </span>
                  <input
                    type="time"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
                  />
                </label>
              </div>
              {followUpDate && proName.trim().length > 0 && (
                <AddToCalendarButton
                  variant="full"
                  label="Add follow-up to Calendar"
                  event={{
                    title: `Follow-up: ${proType} — ${proName.trim()}`,
                    date: followUpDate,
                    time: followUpTime || null,
                    durationMinutes: 60,
                    location: clinic.trim() || null,
                    description: [
                      reason ? `Original reason: ${reason}` : null,
                      "Follow-up from your STRAND appointment log.",
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                  }}
                />
              )}
            </div>
          )}
        </div>


        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          disabled={!canSave}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save Appointment"}
        </Button>

        {date && proName.trim().length > 0 && (
          <AddToCalendarButton
            variant="full"
            event={{
              title: `${proType} — ${proName.trim()}`,
              date,
              time: time || null,
              durationMinutes: 60,
              location: clinic.trim() || null,
              description: [reason, notes].filter(Boolean).join("\n\n") || undefined,
            }}
          />
        )}
      </div>
    </ScreenLayout>
  );
};

export default LogAppointment;
