import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import VoiceNoteField from "@/components/VoiceNoteField";
import { Button } from "@/components/ui/button";

const WashStep3 = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>3 of 4</span>} onBack={() => navigate("/wash/step-2")} />
      <ProgressDots total={4} current={3} />
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

        <SurfaceCard tone="gold">
          <p className="text-xs font-semibold mb-1">Previous entry — 7 Apr</p>
          <p className="font-body text-sm text-muted-foreground leading-snug">
            "Really soft after the heat hat, curls looked defined day 1 but by day 3 it felt a bit crunchy at the ends."
          </p>
        </SurfaceCard>

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            localStorage.setItem("strand_wash_step3", JSON.stringify({ note: text, audioPath }));
            navigate("/wash/step-4");
          }}
        >
          Next — Review & Save →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep3;
