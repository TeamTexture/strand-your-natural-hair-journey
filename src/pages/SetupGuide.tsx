import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SetupShareIllustration,
  SetupStepsIllustration,
  SetupHomeScreenIllustration,
  type SetupPlatform,
} from "@/components/walkthrough/illustrations";
import { useAuth } from "@/hooks/useAuth";

const detectPlatform = (): SetupPlatform => {
  if (typeof navigator === "undefined") return "ios-safari";
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Mac/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  const isAndroid = /android/i.test(ua);
  if (isIOS) {
    const isSafari = /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA)/.test(ua);
    return isSafari ? "ios-safari" : "ios-other";
  }
  if (isAndroid) return "android";
  return "desktop";
};

const PLATFORM_COPY: Record<SetupPlatform, { title: string; body: string }> = {
  "ios-safari": {
    title: "Three taps and you are done",
    body: "Use the Share button at the bottom of Safari, then choose Add to Home Screen.",
  },
  "ios-other": {
    title: "Open in Safari to install",
    body: "On iPhone and iPad, installing to the home screen only works from Safari. Open this page in Safari, then follow the steps below.",
  },
  android: {
    title: "A few taps and you are done",
    body: "Open your browser's menu (three dots in Chrome) and choose Install app or Add to Home screen. The exact wording varies between browsers.",
  },
  desktop: {
    title: "Install STRAND on your computer",
    body: "Look for the install icon in your browser's address bar, or open the browser menu and choose Install STRAND. For the full mobile experience, open this page on your phone.",
  },
};

const SetupGuide = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const fromHelp = params.get("from") === "help";

  const [i, setI] = useState(0);
  const platform = useMemo(detectPlatform, []);
  const platformCopy = PLATFORM_COPY[platform];

  const finish = () => {
    // Clear the per-user "first run" flag so it never auto-shows again.
    if (user?.id) {
      localStorage.removeItem(`strand_setup_pending:${user.id}`);
    }
    if (fromHelp) {
      navigate(-1);
    } else {
      navigate("/onboarding/profile-step-1", { replace: true });
    }
  };

  const slides = [
    {
      illustration: <SetupShareIllustration />,
      title: "Add STRAND to your home screen",
      body: "For the best experience, install STRAND as an app. It takes about 10 seconds and works just like a native app — no app store needed.",
    },
    {
      illustration: <SetupStepsIllustration platform={platform} />,
      title: platformCopy.title,
      body: platformCopy.body,
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
          {fromHelp ? "Close" : "Skip"}
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
          <Button variant="gold" size="pill" onClick={finish}>
            {fromHelp ? "Done" : "Get Started →"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default SetupGuide;
