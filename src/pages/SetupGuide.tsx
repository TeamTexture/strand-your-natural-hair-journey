import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SetupShareIllustration,
  SetupStepsIllustration,
  SetupHomeScreenIllustration,
} from "@/components/walkthrough/illustrations";

const FLAG = "strand_setup_complete";

const SetupGuide = () => {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const isAndroid = useMemo(
    () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent),
    [],
  );

  const finish = () => {
    localStorage.setItem(FLAG, "true");
    navigate("/", { replace: true });
  };

  const slides = [
    {
      illustration: <SetupShareIllustration />,
      title: "Add STRAND to your home screen",
      body: "For the best experience, install STRAND as an app. It takes 10 seconds and works exactly like a native app — no App Store needed.",
    },
    {
      illustration: <SetupStepsIllustration android={isAndroid} />,
      title: "Three taps and you are done",
      body: isAndroid
        ? "These instructions are for Android Chrome. On iPhone, use the share button in Safari."
        : "These instructions are for iPhone Safari. On Android, tap the three dots in Chrome and select Add to Home Screen.",
    },
    {
      illustration: <SetupHomeScreenIllustration />,
      title: "You are all set",
      body: "STRAND lives on your home screen. Tap it any time to open your hair journal, log a wash day, or check your ingredient analysis.",
    },
  ];

  const slide = slides[i];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex justify-end px-5 pt-4">
        <button
          onClick={finish}
          className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground font-body"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
        <div className="mb-7">{slide.illustration}</div>
        <h2 className="font-display text-[24px] leading-tight text-foreground mb-3">{slide.title}</h2>
        <p className="text-sm font-body leading-relaxed text-foreground/85 max-w-[300px]">{slide.body}</p>
        {i === 2 && (
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {["💧 Wash Day", "🧴 Ingredients", "🛡️ Verified"].map((t) => (
              <span key={t} className="bg-secondary text-foreground/80 text-[11px] px-2.5 py-1.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center gap-1.5 pb-4">
        {slides.map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "size-1.5 rounded-full transition-all",
              idx === i ? "bg-primary w-4" : "bg-primary/30",
            )}
          />
        ))}
      </div>

      <div className="px-7 pb-8">
        {i < slides.length - 1 ? (
          <Button variant="gold" size="pill" onClick={() => setI(i + 1)}>Next →</Button>
        ) : (
          <Button variant="gold" size="pill" onClick={finish}>Get Started →</Button>
        )}
      </div>
    </div>
  );
};

export default SetupGuide;
