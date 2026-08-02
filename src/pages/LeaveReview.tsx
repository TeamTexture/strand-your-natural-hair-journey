import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Star } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import StepProgress from "@/components/nav/StepProgress";
import StarRatingInput from "@/components/StarRatingInput";
import ReviewVoicenoteRecorder from "@/components/ReviewVoicenoteRecorder";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { smartBack } from "@/lib/smartBack";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Appt = {
  id: string;
  professional_name: string | null;
  clinic_name: string | null;
  service: string | null;
  appointment_date: string;
  linked_pro_user_id: string | null;
  status: string | null;
};

/** Star rating → words, so the confirm step never shows a bare number. */
const RATING_WORDS: Record<number, string> = {
  1: "Not for me",
  2: "It was okay",
  3: "Good",
  4: "Really good",
  5: "Loved it",
};

const LeaveReview = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const appointmentId = params.get("appointmentId");

  const [appt, setAppt] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState(0);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [bodyText, setBodyText] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appointmentId || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select(
          "id, professional_name, clinic_name, service, appointment_date, linked_pro_user_id, status",
        )
        .eq("id", appointmentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setAppt((data as Appt) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, user]);

  const who = appt?.professional_name || appt?.clinic_name || "your professional";
  const dateLabel = useMemo(() => {
    if (!appt) return "";
    return new Date(`${appt.appointment_date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }, [appt]);

  const hasContent = bodyText.trim().length > 0 || !!audioPath;

  const submit = async () => {
    if (!user || !appt || !appt.linked_pro_user_id || !rating) return;
    setSaving(true);
    const { error } = await supabase.from("reviews").insert({
      appointment_id: appt.id,
      professional_id: appt.linked_pro_user_id,
      client_user_id: user.id,
      rating,
      body_text: mode === "text" && bodyText.trim() ? bodyText.trim() : null,
      audio_path: mode === "voice" ? audioPath : null,
      transcription_text:
        mode === "voice" && transcription.trim() ? transcription.trim() : null,
    });
    setSaving(false);
    if (error) {
      console.error("Review submit failed:", error);
      toast.error(
        error.code === "23505" || error.message.includes("duplicate")
          ? "You've already reviewed this appointment"
          : "Could not send your review",
      );
      return;
    }
    toast.success("Review sent — it appears once your professional approves it");
    nav("/appointments");
  };

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Leave a review" onBack={smartBack(nav, "/appointments")} />
        <p className="px-4 pt-6 text-[13px] font-body text-muted-foreground">Loading…</p>
      </ScreenLayout>
    );
  }

  // Reviews are tied to a logged appointment with a STRAND professional —
  // without that link there is nobody to review.
  if (!appt || !appt.linked_pro_user_id) {
    return (
      <ScreenLayout>
        <TitleBar title="Leave a review" onBack={smartBack(nav, "/appointments")} />
        <div className="px-4 pt-6 space-y-4">
          <p className="text-[13px] font-body text-muted-foreground leading-relaxed">
            Reviews are available for appointments with a professional listed on STRAND. This
            appointment isn't linked to one.
          </p>
          <Button
            onClick={() => nav("/appointments")}
            className="w-full rounded-pill min-h-[44px]"
          >
            Back to appointments
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Leave a review" onBack={smartBack(nav, "/appointments")} />

      <div className="px-4 pb-10 space-y-5">
        <StepProgress current={step} total={3} label={["Rating", "Your words", "Confirm"][step - 1]} />

        <div className="rounded-[14px] border border-border bg-card p-4">
          <p className="font-display text-[17px] font-semibold leading-tight">{who}</p>
          <p className="text-[12px] font-body text-muted-foreground mt-1">
            {appt.service ? `${appt.service} · ${dateLabel}` : dateLabel}
          </p>
        </div>

        {step === 1 && (
          <>
            <SectionLabel>How would you rate it?</SectionLabel>
            <StarRatingInput value={rating} onChange={setRating} />
            <Button
              disabled={!rating}
              onClick={() => setStep(2)}
              className="w-full rounded-pill min-h-[48px]"
            >
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => nav("/appointments")}
              className="w-full rounded-pill min-h-[44px]"
            >
              Skip for now
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <SectionLabel>How did it go?</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {(["text", "voice"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "min-h-[44px] rounded-full border text-[11px] uppercase tracking-[0.15em] font-body transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-foreground hover:border-primary/60",
                  )}
                >
                  {m === "text" ? "Write it" : "Record it"}
                </button>
              ))}
            </div>

            {mode === "text" ? (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={7}
                placeholder="What stood out? How does your hair feel now?"
                className="w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm font-body focus:outline-none focus:border-primary/60 resize-none"
              />
            ) : (
              <ReviewVoicenoteRecorder
                audioPath={audioPath}
                onAudioPathChange={setAudioPath}
                transcription={transcription}
                onTranscriptionChange={setTranscription}
              />
            )}

            <Button
              onClick={() => setStep(3)}
              disabled={mode === "voice" ? !audioPath : !hasContent}
              className="w-full rounded-pill min-h-[48px]"
            >
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              className="w-full rounded-pill min-h-[44px]"
            >
              Back to rating
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <SectionLabel>Check it over</SectionLabel>
            <div className="rounded-[14px] border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "size-5",
                      n <= rating ? "text-primary fill-primary" : "text-muted-foreground/30",
                    )}
                  />
                ))}
                <span className="ml-1.5 text-[12px] font-body text-muted-foreground">
                  {RATING_WORDS[rating]}
                </span>
              </div>

              {mode === "text" && bodyText.trim() && (
                <p className="text-[13px] font-body text-foreground leading-relaxed whitespace-pre-wrap">
                  {bodyText.trim()}
                </p>
              )}

              {mode === "voice" && (
                <div className="space-y-2">
                  <p className="text-[12px] font-body text-muted-foreground">
                    Your voicenote will be sent{transcription.trim() ? " with the transcription below" : ""}.
                  </p>
                  {transcription.trim() && (
                    <p className="text-[13px] font-body text-foreground leading-relaxed whitespace-pre-wrap">
                      {transcription.trim()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-[12px] font-body text-muted-foreground leading-relaxed">
              {who} sees your review first and approves it before it appears on their profile.
            </p>

            <Button
              onClick={submit}
              disabled={saving || !rating}
              className="w-full rounded-pill min-h-[48px]"
            >
              <Check className="size-4 mr-1.5" />
              {saving ? "Sending…" : "Send review"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStep(2)}
              className="w-full rounded-pill min-h-[44px]"
            >
              Change something
            </Button>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default LeaveReview;
