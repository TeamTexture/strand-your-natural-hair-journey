import { useState, useMemo } from "react";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Check, CalendarX } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import ItalicSub from "@/components/ItalicSub";
import FormField from "@/components/FormField";
import Tag from "@/components/Tag";
import ProAvatar from "@/components/ProAvatar";
import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchProfessionalsIn, type Professional } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { supabase } from "@/integrations/supabase/client";
import { encryptForStorage } from "@/lib/clinicalContext";
import { toast } from "sonner";
import { useOnboardingCompletion } from "@/hooks/useOnboardingCompletion";
import { useQueryClient } from "@tanstack/react-query";


const types = ["Trichologist", "Dermatologist", "Curl Specialist", "GP"];




const ProDetails = () => {
  const queryClient = useQueryClient();
  const { resolveNextPath } = useOnboardingCompletion();
  const navigate = useNavigate();
  const { pros } = useDirectoryProfessionals();

  const [name, setName] = useState("");
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  // Hidden background fields populated when a directory pro is picked.
  const [bgInsta, setBgInsta] = useState("");
  const [bgWebsite, setBgWebsite] = useState("");
  const [bgBookingUrl, setBgBookingUrl] = useState("");

  const [type, setType] = useState("Dermatologist");
  const [clinic, setClinic] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [notesAudioPath, setNotesAudioPath] = useState<string | null>(null);

  // Keep the professional's details, consultation date and notes if the member
  // navigates back to an earlier step and returns.
  useOnboardingDraft(
    "pro-details",
    { name, pickedFrom, bgInsta, bgWebsite, bgBookingUrl, type, clinic, date, notes, notesAudioPath },
    (d) => {
      if (d.name !== undefined) setName(d.name);
      if (d.pickedFrom !== undefined) setPickedFrom(d.pickedFrom);
      if (d.bgInsta !== undefined) setBgInsta(d.bgInsta);
      if (d.bgWebsite !== undefined) setBgWebsite(d.bgWebsite);
      if (d.bgBookingUrl !== undefined) setBgBookingUrl(d.bgBookingUrl);
      if (d.type) setType(d.type);
      if (d.clinic !== undefined) setClinic(d.clinic);
      if (d.date !== undefined) setDate(d.date);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.notesAudioPath !== undefined) setNotesAudioPath(d.notesAudioPath);
    },
  );



  // Validate the consultation date. A date must exist, be valid and not be in the
  // future. Anything older than 6 months is accepted — it only shows a quiet note.
  const { dateError, isWithinWindow, isOlderThanWindow } = useMemo(() => {
    if (!date.trim()) {
      return {
        dateError: "Please enter the date of your consultation.",
        isWithinWindow: false,
        isOlderThanWindow: false,
      };
    }
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return { dateError: "Please enter a valid date.", isWithinWindow: false, isOlderThanWindow: false };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const consult = new Date(parsed);
    consult.setHours(0, 0, 0, 0);
    const daysAgo = Math.floor((today.getTime() - consult.getTime()) / 86_400_000);
    if (daysAgo < 0) {
      return { dateError: "Consultation date cannot be in the future.", isWithinWindow: false, isOlderThanWindow: false };
    }
    if (daysAgo > 180) return { dateError: "", isWithinWindow: false, isOlderThanWindow: true };
    return { dateError: "", isWithinWindow: true, isOlderThanWindow: false };
  }, [date]);

  // Search directory once the user has typed at least 2 characters into Name.
  const matches = useMemo(() => {
    const q = name.trim();
    if (q.length < 2 || pickedFrom) return [];
    return searchProfessionalsIn(pros, q).slice(0, 5);
  }, [pros, name, pickedFrom]);

  const applyPro = (p: Professional) => {
    setName(p.name);
    setType(p.type);
    if (p.clinic) setClinic(p.clinic);

    if (p.clinic) setClinic(p.clinic);
    setBgInsta(p.insta ?? "");
    setBgWebsite(p.website ?? "");
    setBgBookingUrl(p.bookingUrl ?? "");
    setPickedFrom(p.clinic ?? p.name);
  };

  const clearPick = () => {
    setPickedFrom(null);
    setBgInsta("");
    setBgWebsite("");
    setBgBookingUrl("");
  };

  const notesValid = notes.trim().length > 0 || !!notesAudioPath;
  const canContinue = !dateError && notesValid && name.trim().length > 0;

  return (
    <ScreenLayout>
      <TitleBar title="Your Professional" onBack={onboardingBack(navigate, "/onboarding/pro-details")} right={<span>5 of 9</span>} />
      <OnboardingGuide className="pt-2 pb-1" />
      <ItalicSub>Search our directory or add your professional manually.</ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        {/* Name field doubles as a directory search */}
        <div className="relative">
          <FormField
            label="Professional's Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (pickedFrom) clearPick();
            }}
            placeholder="Dr. Adaeze Okafor"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 font-body leading-relaxed">
            We will verify your professional's registration and add them to our directory for other members to find.
          </p>

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
                      {p.title} · {p.clinic}
                    </p>
                  </div>


                </button>
              ))}
            </div>
          )}
        </div>

        {pickedFrom && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-[10px]">
            <Check className="size-4 text-primary shrink-0" />
            <p className="text-xs text-foreground flex-1 min-w-0 truncate">
              Details auto-filled from <span className="font-medium">{pickedFrom}</span>
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

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Type
          </div>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Tag key={t} selected={type === t} onClick={() => setType(t)}>
                {t}
              </Tag>
            ))}
          </div>
        </div>




        <FormField
          label="Clinic"
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
          placeholder="Clinic or salon name"
          autoComplete="off"
        />

        <div>
          <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Date of Consultation
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={cn(
              "w-full px-3.5 py-3 bg-card rounded-[10px] border text-sm font-body",
              "focus:outline-none transition-colors",
              dateError ? "border-warn" : "border-border focus:border-primary/60",
            )}
          />

          {dateError && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warn font-body">
              <AlertCircle className="size-3" />
              {dateError}
            </div>
          )}

          {isWithinWindow && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-good font-body bg-good/10 px-2 py-1 rounded">
              <Check className="size-3" />
              Consultation within 6 months
            </div>
          )}

          {isOlderThanWindow && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground font-body leading-relaxed">
              <CalendarX className="size-3 shrink-0 mt-0.5" />
              <span>
                This consultation is over 6 months old, so some of your characteristics may
                have changed since. You can carry on either way.
              </span>
            </div>
          )}
        </div>

        <VoiceNoteField
          label="Professional's Notes"
          placeholder="Any treatment plan or recommendations given..."
          value={notes}
          onChange={setNotes}
          audioPath={notesAudioPath}
          onAudioPathChange={setNotesAudioPath}
          folder="pro-notes"
          rows={4}
          required
          errorMessage="Please add notes from your consultation"
        />

        {!isExpired && (
          <Button
            variant="gold"
            size="pill"
            className="mt-4"
            disabled={!canContinue}
            onClick={async () => {
              try {
                localStorage.setItem(
                  "strand_professional",
                  JSON.stringify({
                    name, type, clinic, date, notes, notesAudioPath,
                    instagram: bgInsta, website: bgWebsite, bookingUrl: bgBookingUrl,
                    pickedFromDirectory: !!pickedFrom,
                  }),
                );
              } catch {
                /* ignore */
              }
              // Dual-write to user_professionals. PHASE_1_PLAN.md §15.
              try {
                const { data: u } = await supabase.auth.getUser();
                if (u?.user) {
                  const enc = await encryptForStorage([
                    { id: "notes", plaintext: notes },
                  ]);
                  const { error } = await supabase
                    .from("user_professionals")
                    .upsert(
                      {
                        user_id: u.user.id,
                        name,
                        professional_type: type,
                        clinic: clinic || null,
                        consultation_date: date || null,
                        gmc_number_enc: null,
                        iot_number_enc: null,
                        notes_enc: enc.notes,

                        notes_audio_path: notesAudioPath,
                        instagram_handle: bgInsta || null,
                        website_url: bgWebsite || null,
                        booking_url: bgBookingUrl || null,
                        picked_from_directory: !!pickedFrom,
                      },
                      { onConflict: "user_id" },
                    );
                  if (error) throw error;
                }
              } catch (err) {
                console.error("[strand] user_professionals upsert failed", err);
                toast.error("Could not save your professional. Check your connection.");
                return;
              }
              void queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route"] });
              navigate(await resolveNextPath(), { replace: true });
            }}
          >
            Continue →
          </Button>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProDetails;
