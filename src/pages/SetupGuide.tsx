import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

const detectPlatform = (): Platform => {
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

// ─────────────────────────────────────────────────────────────────────
// Shared phone-frame shell. Just a rounded-rect outline in gold-on-sand
// so the animations sit inside something that reads as "a phone".
// ─────────────────────────────────────────────────────────────────────
const PhoneFrame = ({ children }: { children: React.ReactNode }) => (
  <div
    className="relative mx-auto rounded-[28px] border-2 overflow-hidden"
    style={{
      width: 200,
      height: 290,
      borderColor: "#C49A3C",
      backgroundColor: "#F2E8D9",
    }}
  >
    {/* Notch */}
    <div
      className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full"
      style={{ width: 50, height: 5, backgroundColor: "#C49A3C", opacity: 0.4 }}
    />
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// SLIDE 1 — Tap the share / menu icon.
// iOS: Safari bottom bar slides up, share box pulses, finger taps it.
// Android: Chrome top bar with three dots, dots pulse, finger taps.
// ─────────────────────────────────────────────────────────────────────
const Slide1Animation = ({ platform }: { platform: Platform }) => {
  if (platform === "android") {
    return (
      <PhoneFrame>
        {/* Chrome address bar at top */}
        <div
          className="absolute top-3.5 left-2.5 right-2.5 h-7 rounded-full px-2 flex items-center justify-between animate-[strandSlideDown_0.6s_ease-out_both]"
          style={{ backgroundColor: "#fff", border: "1px solid #C49A3C40" }}
        >
          <div className="flex-1 mx-1.5 h-2 rounded-full" style={{ backgroundColor: "#C49A3C20" }} />
          {/* Three dots — pulsing gold */}
          <div className="relative flex flex-col gap-[2px] pr-0.5 animate-[strandPulseGlow_1.6s_ease-in-out_infinite]">
            <span className="block size-1 rounded-full" style={{ backgroundColor: "#C49A3C" }} />
            <span className="block size-1 rounded-full" style={{ backgroundColor: "#C49A3C" }} />
            <span className="block size-1 rounded-full" style={{ backgroundColor: "#C49A3C" }} />
          </div>
        </div>
        {/* Page hint */}
        <div className="absolute inset-x-6 top-16 bottom-6 rounded-2xl"
             style={{ backgroundColor: "#fff", border: "1px dashed #C49A3C40" }} />
        {/* Tap indicator on the dots */}
        <div
          className="absolute rounded-full pointer-events-none animate-[strandTap_2.4s_ease-in-out_infinite]"
          style={{
            top: 8,
            right: 6,
            width: 26,
            height: 26,
            border: "2px solid #C49A3C",
            backgroundColor: "#C49A3C30",
          }}
        />
      </PhoneFrame>
    );
  }
  return (
    <PhoneFrame>
      {/* Page placeholder */}
      <div
        className="absolute inset-x-4 top-6 bottom-14 rounded-2xl"
        style={{ backgroundColor: "#fff", border: "1px dashed #C49A3C40" }}
      />
      {/* Safari bottom bar */}
      <div
        className="absolute left-2 right-2 bottom-3 h-9 rounded-xl flex items-center justify-around animate-[strandSlideUp_0.6s_ease-out_both]"
        style={{ backgroundColor: "#fff", border: "1px solid #C49A3C40" }}
      >
        <span className="text-[10px]" style={{ color: "#C49A3C80" }}>‹</span>
        <span className="text-[10px]" style={{ color: "#C49A3C80" }}>›</span>
        {/* Share icon: square with arrow up — pulses gold */}
        <div className="relative animate-[strandPulseGlow_1.6s_ease-in-out_infinite]">
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
            <path d="M9 2 L9 13 M9 2 L5.5 5.5 M9 2 L12.5 5.5"
                  stroke="#C49A3C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 9 L3 17 Q3 18 4 18 L14 18 Q15 18 15 17 L15 9"
                  stroke="#C49A3C" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <span className="text-[10px]" style={{ color: "#C49A3C80" }}>📑</span>
        <span className="text-[10px]" style={{ color: "#C49A3C80" }}>⊞</span>
      </div>
      {/* Tap indicator over the share icon */}
      <div
        className="absolute rounded-full pointer-events-none animate-[strandTap_2.4s_ease-in-out_infinite]"
        style={{
          // Centred over the share icon (Safari bar share is roughly 1/2 way across; we have 5 slots)
          left: "calc(50% - 14px)",
          bottom: 6,
          width: 28,
          height: 28,
          border: "2px solid #C49A3C",
          backgroundColor: "#C49A3C30",
        }}
      />
    </PhoneFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────
// SLIDE 2 — Share sheet slides up; "Add to Home Screen" highlights.
// Android: dropdown slides down with same row highlighted.
// ─────────────────────────────────────────────────────────────────────
const Slide2Animation = ({ platform }: { platform: Platform }) => {
  const isAndroid = platform === "android";
  return (
    <PhoneFrame>
      <div
        className="absolute inset-x-4 top-6 bottom-4 rounded-2xl"
        style={{ backgroundColor: "#fff", border: "1px dashed #C49A3C40" }}
      />
      {/* Sheet / menu */}
      <div
        className={cn(
          "absolute left-2 right-2 rounded-2xl p-2.5 flex flex-col gap-1.5",
          isAndroid
            ? "top-12 animate-[strandSlideDown_0.6s_ease-out_both]"
            : "bottom-3 animate-[strandSlideUp_0.6s_ease-out_both]",
        )}
        style={{ backgroundColor: "#fff", border: "1px solid #C49A3C60" }}
      >
        {/* Drag handle (iOS only) */}
        {!isAndroid && (
          <div
            className="mx-auto rounded-full mb-1"
            style={{ width: 30, height: 3, backgroundColor: "#C49A3C50" }}
          />
        )}
        {/* Icon row */}
        <div className="flex gap-1.5 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="size-7 rounded-lg shrink-0"
              style={{ backgroundColor: "#C49A3C15" }}
            />
          ))}
        </div>
        {/* Add to Home Screen — highlighted with pulsing ring */}
        <div className="relative mt-1">
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              backgroundColor: "#C49A3C20",
              border: "1.5px solid #C49A3C",
            }}
          >
            <div className="relative size-5 rounded-md flex items-center justify-center"
                 style={{ backgroundColor: "#C49A3C" }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 5 L6 1.5 L10 5 L10 10 L7.5 10 L7.5 7 L4.5 7 L4.5 10 L2 10 Z"
                      stroke="#fff" strokeWidth="1" strokeLinejoin="round" fill="none" />
                <circle cx="9.5" cy="2.5" r="1.5" fill="#fff" />
                <path d="M9.5 1.7 L9.5 3.3 M8.7 2.5 L10.3 2.5" stroke="#C49A3C" strokeWidth="0.6" />
              </svg>
            </div>
            <span className="text-[8px] font-medium" style={{ color: "#7A5A1F" }}>
              Add to Home Screen
            </span>
          </div>
          {/* Pulsing ring */}
          <div
            className="absolute inset-0 rounded-lg pointer-events-none animate-[strandRingPulse_1.6s_ease-out_infinite]"
            style={{ border: "2px solid #C49A3C" }}
          />
        </div>
        {/* Other rows */}
        <div className="h-2.5 rounded" style={{ backgroundColor: "#C49A3C10" }} />
        {!isAndroid && <div className="h-2.5 rounded" style={{ backgroundColor: "#C49A3C10" }} />}
      </div>
      {/* Tap indicator over Add to Home Screen */}
      <div
        className="absolute rounded-full pointer-events-none animate-[strandTap_2.4s_ease-in-out_infinite]"
        style={{
          left: "50%",
          marginLeft: -14,
          // Approx position of the highlighted row in both layouts
          ...(isAndroid ? { top: 78 } : { bottom: 38 }),
          width: 28,
          height: 28,
          border: "2px solid #C49A3C",
          backgroundColor: "#C49A3C30",
        }}
      />
    </PhoneFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────
// SLIDE 3 — Confirmation dialog with pulsing Add button → tap → app
// icon bounces into a home screen grid.
// ─────────────────────────────────────────────────────────────────────
const Slide3Animation = () => {
  return (
    <PhoneFrame>
      {/* Home screen grid (always present in background) */}
      <div className="absolute inset-x-4 top-8 grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => {
          const isStrand = i === 5; // the slot the icon will land in
          return (
            <div key={i} className="aspect-square rounded-lg relative" style={{ backgroundColor: "#C49A3C20" }}>
              {isStrand && (
                <div
                  className="absolute inset-0 rounded-lg flex items-center justify-center font-semibold animate-[strandIconBounce_4s_ease-out_infinite]"
                  style={{
                    backgroundColor: "#C49A3C",
                    color: "#F2E8D9",
                    fontSize: 8,
                    letterSpacing: "0.05em",
                  }}
                >
                  S
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation dialog — appears, gets tapped, dismisses */}
      <div
        className="absolute left-3 right-3 top-12 rounded-2xl p-2.5 animate-[strandDialogCycle_4s_ease-in-out_infinite]"
        style={{
          backgroundColor: "#fff",
          border: "1px solid #C49A3C80",
          boxShadow: "0 8px 24px -8px rgba(196,154,60,0.4)",
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-medium" style={{ color: "#7A5A1F" }}>Cancel</span>
          <span className="text-[9px] font-semibold" style={{ color: "#000" }}>Add to Home Screen</span>
          <div className="relative">
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "#C49A3C", color: "#fff" }}
            >
              Add
            </span>
            <div
              className="absolute inset-0 rounded pointer-events-none animate-[strandRingPulse_1.4s_ease-out_infinite]"
              style={{ border: "2px solid #C49A3C" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="size-6 rounded" style={{ backgroundColor: "#C49A3C" }} />
          <div className="flex-1">
            <div className="text-[8px] font-semibold" style={{ color: "#000" }}>STRAND</div>
            <div className="h-1 rounded" style={{ backgroundColor: "#C49A3C20", width: "70%" }} />
          </div>
        </div>
      </div>

      {/* Tap indicator over the Add button (only visible during dialog phase) */}
      <div
        className="absolute rounded-full pointer-events-none animate-[strandTapDelayed_4s_ease-in-out_infinite]"
        style={{
          top: 50,
          right: 8,
          width: 24,
          height: 24,
          border: "2px solid #C49A3C",
          backgroundColor: "#C49A3C30",
        }}
      />
    </PhoneFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Inject the keyframes once. Tailwind doesn't have these custom ones,
// and they're scoped enough that a single <style> tag is the simplest
// way to add them without touching tailwind.config.ts.
// ─────────────────────────────────────────────────────────────────────
const ANIMATION_KEYFRAMES = `
@keyframes strandSlideUp {
  from { transform: translateY(60%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes strandSlideDown {
  from { transform: translateY(-60%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes strandPulseGlow {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(196,154,60,0)); transform: scale(1); }
  50% { filter: drop-shadow(0 0 6px rgba(196,154,60,0.85)); transform: scale(1.08); }
}
@keyframes strandRingPulse {
  0% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(1.4); opacity: 0; }
}
@keyframes strandTap {
  0%, 50% { opacity: 0; transform: scale(0.5); }
  60% { opacity: 1; transform: scale(1); }
  75% { opacity: 1; transform: scale(0.85); }
  90%, 100% { opacity: 0; transform: scale(0.5); }
}
@keyframes strandTapDelayed {
  0%, 35% { opacity: 0; transform: scale(0.5); }
  45%, 55% { opacity: 1; transform: scale(1); }
  65% { opacity: 1; transform: scale(0.8); }
  75%, 100% { opacity: 0; transform: scale(0.5); }
}
@keyframes strandDialogCycle {
  0% { opacity: 0; transform: translateY(-20%) scale(0.9); }
  15% { opacity: 1; transform: translateY(0) scale(1); }
  60% { opacity: 1; transform: translateY(0) scale(1); }
  68% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 0; transform: scale(0.95); }
}
@keyframes strandIconBounce {
  0%, 65% { opacity: 0; transform: scale(0.2) translateY(-30px); }
  72% { opacity: 1; transform: scale(1.25) translateY(0); }
  78% { transform: scale(0.9); }
  84% { transform: scale(1.05); }
  90%, 100% { opacity: 1; transform: scale(1); }
}
`;

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────
const PLATFORM_COPY: Record<Platform, { s1Title: string; s1Body: string; s2Title: string; s2Body: string }> = {
  "ios-safari": {
    s1Title: "Step 1 — Tap the Share icon",
    s1Body:
      "Open STRAND in Safari on your iPhone. Tap the share icon at the bottom of the screen — it looks like a box with an arrow pointing up.",
    s2Title: "Step 2 — Add to Home Screen",
    s2Body: "Scroll down in the share sheet until you see Add to Home Screen. Tap it.",
  },
  "ios-other": {
    s1Title: "Open in Safari first",
    s1Body:
      "On iPhone and iPad, installing to the home screen only works from Safari. Open this page in Safari, then tap the share icon at the bottom.",
    s2Title: "Step 2 — Add to Home Screen",
    s2Body: "Scroll down in the share sheet until you see Add to Home Screen. Tap it.",
  },
  android: {
    s1Title: "Step 1 — Tap the menu",
    s1Body:
      "Open STRAND in Chrome on your Android. Tap the three dots in the top right corner of your browser.",
    s2Title: "Step 2 — Add to Home Screen",
    s2Body: "In the menu that appears, tap Add to Home Screen (or Install app).",
  },
  desktop: {
    s1Title: "Step 1 — Find the install icon",
    s1Body:
      "Look for the install icon in your browser's address bar, or open the browser menu and choose Install STRAND. For the full mobile experience, open this page on your phone.",
    s2Title: "Step 2 — Confirm install",
    s2Body: "Click Install when your browser asks. STRAND will open in its own window.",
  },
};

const SetupGuide = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const fromHelp = params.get("from") === "help";

  const [i, setI] = useState(0);
  const platform = useMemo(detectPlatform, []);
  const copy = PLATFORM_COPY[platform];

  const finish = () => {
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
      animation: <Slide1Animation platform={platform} />,
      title: copy.s1Title,
      body: copy.s1Body,
    },
    {
      animation: <Slide2Animation platform={platform} />,
      title: copy.s2Title,
      body: copy.s2Body,
    },
    {
      animation: <Slide3Animation />,
      title: "Step 3 — Tap Add",
      body:
        "Tap Add in the top right corner. STRAND will appear on your home screen instantly — just like a native app.",
    },
  ];

  const slide = slides[i];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Inject animation keyframes (scoped to this screen) */}
      <style>{ANIMATION_KEYFRAMES}</style>

      <div className="flex justify-end px-5 pt-4">
        <button
          onClick={finish}
          className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground font-body"
        >
          {fromHelp ? "Close" : "Skip"}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
        <div className="mb-7">{slide.animation}</div>
        <h2 className="font-display text-[24px] leading-tight text-foreground mb-3">{slide.title}</h2>
        <p className="text-sm font-body leading-relaxed text-foreground/85 max-w-[300px]">{slide.body}</p>
        {i === 2 && (
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {["💧 Wash Day", "🧴 Ingredients", "🛡️ Verified"].map((t) => (
              <span key={t} className="bg-secondary text-foreground/80 text-[11px] px-2.5 py-1.5 rounded-full">
                {t}
              </span>
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
          <Button variant="gold" size="pill" onClick={() => setI(i + 1)}>
            Next →
          </Button>
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
