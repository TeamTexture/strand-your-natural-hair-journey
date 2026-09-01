import { smartBack } from "@/lib/smartBack";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import StepProgress from "@/components/nav/StepProgress";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import VoiceNoteField from "@/components/VoiceNoteField";
import LevelGate from "@/components/tips/LevelGate";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { readWashDraft, writeWashDraft } from "@/lib/washDraft";
import { useWashDraftHydration } from "@/hooks/useWashDraftHydration";

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
  // Restore this screen's slice of the unsaved log (local or durable copy).
  const { ready: draftReady } = useWashDraftHydration();
  useEffect(() => {
    if (!draftReady) return;
    const saved = readWashDraft<{ note?: string; audioPath?: string | null }>("strand_wash_step3", {});
    if (saved.note) setText((cur) => (cur ? cur : saved.note!));
    if (saved.audioPath) setAudioPath((cur) => cur ?? saved.audioPath!);
  }, [draftReady]);



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
      <TitleBar title="Wash Day" onBack={smartBack(navigate, "/wash/step-2")} />
      <div className="px-5 pt-1 pb-3"><StepProgress current={3} total={5} label="Hair feel" /></div>
      <LevelGate min={2} fallback={<ItalicSub>Tell us how your hair feels today.</ItalicSub>}>
        <ItalicSub>
          Tell us how your hair feels today, in your own words.
        </ItalicSub>
      </LevelGate>

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
            {previous.audioUrl && (
              <VoicePlayer
                url={previous.audioUrl}
                variant="onSurface"
                className="mt-2 text-primary"
              />
            )}

          </SurfaceCard>
        )}

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            writeWashDraft("strand_wash_step3", { note: text, audioPath });
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
