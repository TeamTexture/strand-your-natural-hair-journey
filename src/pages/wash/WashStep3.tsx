import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VOICENOTE_BUCKET = "voicenotes";

interface PreviousEntry {
  date: string;
  note: string | null;
  audioUrl: string | null;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return year === new Date().getFullYear() ? `${day} ${month}` : `${day} ${month} ${year}`;
};

const WashStep3 = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);

  const [previous, setPrevious] = useState<PreviousEntry | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) { setLoadingPrev(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("wash_days")
        .select("wash_date, hair_feel_note, hair_feel_voice_url")
        .eq("user_id", user.id)
        .order("wash_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!data || (!data.hair_feel_note && !data.hair_feel_voice_url)) {
        setPrevious(null);
        setLoadingPrev(false);
        return;
      }
      let audioUrl: string | null = null;
      if (data.hair_feel_voice_url) {
        const { data: sig } = await supabase
          .storage
          .from(VOICENOTE_BUCKET)
          .createSignedUrl(data.hair_feel_voice_url, 3600);
        audioUrl = sig?.signedUrl ?? null;
      }
      setPrevious({ date: data.wash_date, note: data.hair_feel_note, audioUrl });
      setLoadingPrev(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const togglePlay = () => {
    if (!previous?.audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(previous.audioUrl);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>3 of 5</span>} onBack={smartBack(navigate, "/wash/step-2")} />
      <ProgressDots total={5} current={3} />
      <ItalicSub>
        Moisture is in how your hair moves and feels — not a label. Tell us in your own words.
      </ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        <VoiceNoteField
          label="How does your hair feel?"
          placeholder="My hair feels..."
          value={text}
          onChange={setText}
          audioPath={audioPath}
          onAudioPathChange={setAudioPath}
          folder="wash-day"
          rows={5}
        />

        {!loadingPrev && previous && (
          <SurfaceCard tone="gold">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-xs font-semibold">Previous entry — {formatDate(previous.date)}</p>
              {previous.audioUrl && (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause previous voicenote" : "Play previous voicenote"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium border border-primary/30 transition-colors min-h-[32px]"
                >
                  {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {isPlaying ? "Pause" : "Replay"}
                </button>
              )}
            </div>
            {previous.note ? (
              <p className="font-body text-sm text-muted-foreground leading-snug">
                "{previous.note}"
              </p>
            ) : (
              <p className="font-body text-sm text-muted-foreground italic">
                Voicenote only — tap replay to hear it.
              </p>
            )}
          </SurfaceCard>
        )}

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            localStorage.setItem("strand_wash_step3", JSON.stringify({ note: text, audioPath }));
            navigate("/wash/step-styling");
          }}
        >
          Next — Styling →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep3;
