import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

const WashStep3 = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>3 of 4</span>} onBack={() => navigate("/wash/step-2")} />
      <ProgressDots total={4} current={3} />
      <ItalicSub>
        Moisture is in how your hair moves and feels — not a label. Tell us in your own words.
      </ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        <div className="bg-card border-2 border-primary/40 rounded-[14px] p-6 text-center">
          <div className="text-5xl mb-3">🎙️</div>
          <p className="font-display text-lg font-semibold">Record a voice note</p>
          <p className="font-body text-sm text-muted-foreground mt-2 leading-snug">
            How does your hair feel right now? How does it move? Is it soft, dry, crunchy, frizzy, defined? Tap to record — we will transcribe it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">or type instead</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="My hair feels..."
          rows={5}
          className="w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60 resize-none"
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
            localStorage.setItem("strand_wash_step3", JSON.stringify({ note: text }));
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
