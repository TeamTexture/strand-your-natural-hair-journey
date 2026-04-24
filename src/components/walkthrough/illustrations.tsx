// SVG/CSS illustrations for walkthrough & setup guide.
// Pure CSS / Tailwind — no external assets. Designed to look like real
// high-fidelity STRAND screens (status bar, content, bottom nav) with
// subtle ambient animations and an animated tap pointer that hints at
// "this is what you'll see when you log in".
import { cn } from "@/lib/utils";

// ---------- Shared phone shell ----------
type PhoneFrameProps = {
  children: React.ReactNode;
  className?: string;
  /** Pretend label rendered in the status bar / title area */
  title?: string;
  /** Highlights the matching bottom-nav slot */
  activeNav?: "home" | "wash" | "products" | "journal" | "profile";
};

const NAV_ITEMS: { key: NonNullable<PhoneFrameProps["activeNav"]>; icon: string; label: string }[] = [
  { key: "home", icon: "✦", label: "Home" },
  { key: "wash", icon: "💧", label: "Wash" },
  { key: "products", icon: "🧴", label: "Shelf" },
  { key: "journal", icon: "📓", label: "Journal" },
  { key: "profile", icon: "✿", label: "Me" },
];

const PhoneFrame = ({ children, className, title, activeNav }: PhoneFrameProps) => (
  <div
    className={cn(
      // Larger, blown-up device. Notable shadow + brand glow.
      "relative mx-auto w-[290px] h-[520px] rounded-[40px] bg-card",
      "border-[6px] border-foreground/90 shadow-[0_30px_60px_-20px_hsl(var(--primary)/0.45),0_8px_20px_-8px_hsl(0_0%_0%/0.4)]",
      "overflow-hidden flex flex-col",
      className,
    )}
  >
    {/* Speaker / notch */}
    <div className="h-7 bg-card flex items-center justify-center relative">
      <div className="w-20 h-[18px] bg-foreground/90 rounded-full" />
    </div>

    {/* Status bar */}
    <div className="px-5 pb-1 flex items-center justify-between text-[10px] font-body text-foreground/70">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span>●●●</span>
        <span>􀋨</span>
        <span className="text-foreground/80">100%</span>
      </span>
    </div>

    {/* Title bar */}
    {title && (
      <div className="px-5 pt-1 pb-2 flex items-center justify-between">
        <span className="font-display text-[15px] text-foreground">{title}</span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-primary">STRAND</span>
      </div>
    )}

    {/* Body */}
    <div className="flex-1 px-4 pb-3 flex flex-col gap-2.5 bg-background overflow-hidden">{children}</div>

    {/* Bottom nav */}
    <div className="border-t border-border/60 bg-card/95 backdrop-blur px-2 py-2 flex items-center justify-between">
      {NAV_ITEMS.map((n) => {
        const active = n.key === activeNav;
        return (
          <div
            key={n.key}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-0.5 rounded-md transition-colors",
              active ? "text-primary" : "text-foreground/45",
            )}
          >
            <span className={cn("text-[14px] leading-none", active && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]")}>
              {n.icon}
            </span>
            <span className="text-[8px] font-body uppercase tracking-[0.1em]">{n.label}</span>
          </div>
        );
      })}
    </div>

    {/* Home indicator */}
    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-[3px] rounded-full bg-foreground/70" />
  </div>
);

/* ---------- Animated helpers ---------- */

/**
 * A small finger / cursor that taps a point on the screen on a loop.
 * top/left are percentages of the phone-content area.
 */
const TapFinger = ({ top, left, delay = 0 }: { top: string; left: string; delay?: number }) => (
  <div
    className="pointer-events-none absolute z-30"
    style={{ top, left, animation: `strand-tap 2.6s ease-in-out ${delay}s infinite` }}
  >
    {/* Ripple */}
    <span
      className="absolute -inset-2 rounded-full border border-primary/70"
      style={{ animation: `strand-ripple 2.6s ease-out ${delay}s infinite` }}
    />
    {/* Fingertip dot */}
    <span className="block size-4 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)] border-2 border-primary-foreground" />
  </div>
);

/** Inject keyframes once. */
const Keyframes = () => (
  <style>{`
    @keyframes strand-tap {
      0%, 100% { transform: scale(1) translateY(0); opacity: 0.95; }
      45%      { transform: scale(0.78) translateY(2px); opacity: 1; }
      55%      { transform: scale(0.78) translateY(2px); opacity: 1; }
    }
    @keyframes strand-ripple {
      0%   { transform: scale(0.4); opacity: 0; }
      40%  { transform: scale(1);   opacity: 0.9; }
      100% { transform: scale(2.4); opacity: 0; }
    }
    @keyframes strand-pulse-ring {
      0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.55); }
      50%      { box-shadow: 0 0 0 8px hsl(var(--primary) / 0); }
    }
    @keyframes strand-bar-fill {
      0%, 10%   { width: 0%; }
      55%, 100% { width: var(--bar-target, 70%); }
    }
    @keyframes strand-fade-up {
      0%   { opacity: 0; transform: translateY(6px); }
      30%  { opacity: 1; transform: translateY(0); }
      85%  { opacity: 1; transform: translateY(0); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes strand-shutter {
      0%, 60%  { transform: scale(1);   opacity: 1; }
      70%      { transform: scale(0.9); opacity: 0.8; }
      80%      { transform: scale(1.05); opacity: 1; }
      100%     { transform: scale(1);   opacity: 1; }
    }
    @keyframes strand-flash {
      0%, 65% { opacity: 0; }
      72%     { opacity: 0.85; }
      90%     { opacity: 0; }
      100%    { opacity: 0; }
    }
    @keyframes strand-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `}</style>
);

/* ---------- Walkthrough screens (high-fi, animated) ---------- */

export const HomeIllustration = () => (
  <div className="relative">
    <Keyframes />
    <PhoneFrame title="Good morning" activeNav="home">
      {/* Greeting card */}
      <div className="bg-gradient-to-br from-primary/15 via-card to-card border border-primary/30 rounded-2xl p-3">
        <div className="text-[9px] uppercase tracking-[0.2em] text-primary mb-1">Today · Wed</div>
        <div className="font-display text-[15px] text-foreground leading-tight">Hi, Amara ✨</div>
        <div className="text-[10px] text-foreground/70 mt-0.5">Day 4 · post-wash routine</div>
      </div>

      {/* Alert pill */}
      <div
        className="bg-warn/15 border border-warn/40 rounded-xl px-3 py-2 flex items-center gap-2"
        style={{ animation: "strand-pulse-ring 2.4s ease-in-out infinite" }}
      >
        <span className="size-5 rounded-full bg-warn/30 text-warn flex items-center justify-center text-[10px]">⚠</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold leading-tight">Hard water + low ferritin</div>
          <div className="text-[8px] text-foreground/60">Filter rec · iron-rich plan</div>
        </div>
      </div>

      {/* Quick tiles */}
      <div className="grid grid-cols-2 gap-2 mt-0.5">
        {[
          { e: "💧", t: "Wash day", s: "in 3 days" },
          { e: "🧴", t: "Products", s: "12 saved" },
          { e: "📓", t: "Journal", s: "Photo today" },
          { e: "🩺", t: "Health", s: "All caught up" },
        ].map((tile, idx) => (
          <div
            key={tile.t}
            className={cn(
              "bg-card border border-border rounded-xl p-2.5 flex flex-col gap-0.5",
              idx === 0 && "border-primary/50 bg-primary/5",
            )}
          >
            <div className="text-base leading-none">{tile.e}</div>
            <div className="text-[10px] font-semibold leading-tight">{tile.t}</div>
            <div className="text-[8px] text-foreground/55">{tile.s}</div>
          </div>
        ))}
      </div>

      {/* Animated tap on the wash-day tile */}
      <TapFinger top="62%" left="22%" />
    </PhoneFrame>
  </div>
);

export const WashIllustration = () => {
  const TODAY = 18;
  return (
    <div className="relative">
      <Keyframes />
      <PhoneFrame title="Wash Day" activeNav="wash">
        {/* Streak card */}
        <div className="bg-gradient-to-br from-primary/20 to-card border border-primary/30 rounded-2xl p-3 flex items-center gap-3">
          <div className="size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-base">
            7
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-primary">Streak</div>
            <div className="font-display text-[13px] leading-tight">7 weeks logged</div>
            <div className="text-[8px] text-foreground/60">Last wash · Sun · co-wash + LCO</div>
          </div>
        </div>

        {/* Calendar heatmap */}
        <div className="bg-card border border-border rounded-2xl p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold">November</span>
            <span className="text-[8px] text-foreground/60">Wash days</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`d-${i}`} className="text-[7px] text-center text-foreground/50 mb-0.5">
                {d}
              </div>
            ))}
            {Array.from({ length: 28 }).map((_, i) => {
              const day = i + 1;
              const washed = [3, 10, 17].includes(day);
              const todayCell = day === TODAY;
              return (
                <div
                  key={`c-${i}`}
                  className={cn(
                    "aspect-square rounded-[4px] flex items-center justify-center text-[7px] transition-colors",
                    washed
                      ? "bg-primary text-primary-foreground"
                      : todayCell
                        ? "bg-primary/15 border border-primary/60 text-primary"
                        : "bg-secondary text-foreground/40",
                  )}
                  style={
                    todayCell
                      ? { animation: "strand-pulse-ring 2.2s ease-in-out infinite" }
                      : undefined
                  }
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inline routine preview */}
        <div className="bg-card border border-border rounded-2xl p-2.5 flex items-center gap-2">
          <div className="size-8 rounded-lg bg-secondary flex items-center justify-center text-[12px]">🫧</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold leading-tight">Cleanse · Condition · L·C·O</div>
            <div className="h-1 mt-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ ["--bar-target" as string]: "78%", animation: "strand-bar-fill 2.6s ease-out infinite" }}
              />
            </div>
          </div>
          <span className="text-[9px] font-semibold text-primary">3/4</span>
        </div>

        {/* CTA */}
        <div
          className="mt-auto bg-primary text-primary-foreground text-[10px] font-medium uppercase tracking-[0.18em] py-2.5 rounded-xl text-center shadow-[0_8px_18px_-8px_hsl(var(--primary)/0.7)]"
          style={{ animation: "strand-pulse-ring 2.6s ease-in-out infinite" }}
        >
          + Log Today's Wash
        </div>

        {/* Tap on the CTA */}
        <TapFinger top="83%" left="50%" delay={0.6} />
      </PhoneFrame>
    </div>
  );
};

export const ProductsIllustration = () => (
  <div className="relative">
    <Keyframes />
    <PhoneFrame title="My Shelf" activeNav="products">
      {/* Scan card */}
      <div className="relative bg-gradient-to-br from-foreground/[0.04] to-card border border-border rounded-2xl p-3 overflow-hidden">
        <div className="flex items-center gap-2">
          <div
            className="size-9 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-base"
            style={{ animation: "strand-shutter 2.4s ease-in-out infinite" }}
          >
            📷
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold leading-tight">Scan an ingredient list</div>
            <div className="text-[8px] text-foreground/60">AI matches it to your hair profile</div>
          </div>
        </div>
        {/* Camera "flash" */}
        <span
          className="pointer-events-none absolute inset-0 bg-primary-foreground/40"
          style={{ animation: "strand-flash 2.4s ease-in-out infinite" }}
        />
      </div>

      {/* Result rows */}
      <div className="space-y-1.5">
        {[
          { color: "bg-good", text: "text-good", ring: "ring-good/40", n: 92, name: "Camille Rose Honey", tag: "Match · curls love this" },
          { color: "bg-primary", text: "text-primary", ring: "ring-primary/40", n: 78, name: "Mielle Pomegranate", tag: "Good · low protein" },
          { color: "bg-warn", text: "text-warn", ring: "ring-warn/40", n: 54, name: "Brand X Mousse", tag: "Watch · drying alcohol" },
        ].map((p, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 bg-card border border-border rounded-xl p-2",
              i === 0 && "ring-2 ring-primary/30",
            )}
            style={i === 0 ? { animation: "strand-fade-up 2.6s ease-out infinite" } : undefined}
          >
            <div
              className={cn(
                "size-9 rounded-full flex items-center justify-center text-[11px] font-display font-semibold text-alert-dark-foreground ring-2",
                p.color,
                p.ring,
              )}
            >
              {p.n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold leading-tight truncate">{p.name}</div>
              <div className={cn("text-[8px] truncate", p.text)}>{p.tag}</div>
            </div>
            <span className="text-[10px] text-foreground/40">›</span>
          </div>
        ))}
      </div>

      {/* Tap on the camera */}
      <TapFinger top="20%" left="22%" />
    </PhoneFrame>
  </div>
);

export const JournalIllustration = () => (
  <div className="relative">
    <Keyframes />
    <PhoneFrame title="Journal" activeNav="journal">
      {/* Tabs */}
      <div className="flex items-center gap-1 text-[9px] font-body uppercase tracking-[0.15em]">
        <span className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground">Photos</span>
        <span className="px-2.5 py-1 rounded-full bg-secondary text-foreground/60">Mood</span>
        <span className="px-2.5 py-1 rounded-full bg-secondary text-foreground/60">Notes</span>
      </div>

      {/* Photo grid — gradient swatches as faux portraits */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          "from-primary/40 to-primary/10",
          "from-foreground/20 to-foreground/5",
          "from-good/40 to-good/10",
          "from-warn/35 to-warn/5",
          "from-primary/30 to-foreground/10",
          "from-primary/50 to-primary/15",
        ].map((g, i) => (
          <div
            key={i}
            className={cn(
              "relative aspect-square rounded-lg bg-gradient-to-br border border-border overflow-hidden",
              g,
            )}
            style={i === 5 ? { animation: "strand-fade-up 2.6s ease-out infinite" } : undefined}
          >
            {/* Faux silhouette */}
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 block size-5 rounded-full bg-foreground/25 translate-y-1.5" />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 block w-7 h-3 rounded-t-full bg-foreground/20 translate-y-0" />
            {i === 5 && (
              <span className="absolute top-1 right-1 text-[7px] bg-primary text-primary-foreground rounded px-1">NEW</span>
            )}
          </div>
        ))}
      </div>

      {/* Note card */}
      <div className="bg-card border border-border rounded-2xl p-2.5">
        <div className="flex items-center gap-1.5 text-[9px] text-foreground/60 mb-1">
          <span className="size-1.5 rounded-full bg-primary" />
          Today · Twist out, day 3
        </div>
        <div className="text-[10px] leading-snug text-foreground/85">
          Scalp felt calmer after the rosemary rinse. Definition holding well in humidity.
        </div>
        <div
          className="mt-2 h-1 rounded-full bg-secondary overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary/60 to-primary"
            style={{
              backgroundSize: "200% 100%",
              animation: "strand-shimmer 2.4s linear infinite",
              width: "70%",
            }}
          />
        </div>
      </div>

      {/* Tap on the new photo */}
      <TapFinger top="48%" left="78%" delay={0.4} />
    </PhoneFrame>
  </div>
);

export const ProfileIllustration = () => (
  <div className="relative">
    <Keyframes />
    <PhoneFrame title="My Profile" activeNav="profile">
      {/* Identity */}
      <div className="flex items-center gap-2.5">
        <div className="size-11 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center font-display text-sm">
          AM
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[13px] leading-tight">Amara Mensah</div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-primary">Strand member · 4C · fine</div>
        </div>
        <span className="text-[9px] text-foreground/40">Edit ›</span>
      </div>

      {/* Blood markers */}
      <div className="bg-card border border-border rounded-2xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em]">
          <span className="text-foreground/55">Blood markers</span>
          <span className="text-primary">View all</span>
        </div>
        {[
          { c: "bg-warn", t: "Ferritin", v: "Low · 18", label: "text-warn" },
          { c: "bg-warn", t: "Vitamin D", v: "Low · 38", label: "text-warn" },
          { c: "bg-good", t: "Vitamin B12", v: "Normal", label: "text-good" },
        ].map((r, i) => (
          <div
            key={r.t}
            className="flex items-center gap-2 text-[10px] font-body"
            style={i === 0 ? { animation: "strand-fade-up 2.6s ease-out infinite" } : undefined}
          >
            <div className={cn("size-2 rounded-full", r.c)} />
            <span className="flex-1 truncate">{r.t}</span>
            <span className={cn("font-semibold", r.label)}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Nutrition plan */}
      <div className="bg-primary/10 border border-primary/30 rounded-2xl p-2.5">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">🥗</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold leading-tight">Personalised nutrition plan</div>
            <div className="text-[8px] text-foreground/65">3 supplements · 5 hair-forward foods</div>
          </div>
        </div>
        <div className="flex gap-1 mt-2">
          {["Iron+", "D3", "Biotin"].map((p) => (
            <span key={p} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Share PDF row */}
      <div className="mt-auto bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2">
        <span className="size-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px]">⇪</span>
        <span className="flex-1 text-[10px] font-semibold">Share clinical PDF</span>
        <span className="text-[9px] text-primary uppercase tracking-[0.15em]">Send</span>
      </div>

      {/* Tap on share */}
      <TapFinger top="86%" left="84%" delay={0.8} />
    </PhoneFrame>
  </div>
);

/* ---------- SETUP GUIDE (unchanged API, lightly polished) ---------- */
export const SetupShareIllustration = () => (
  <div className="flex flex-col items-center gap-4">
    <PhoneFrame className="w-[180px] h-[260px]" />
    <div className="bg-card border border-border rounded-[14px] px-3 py-2 flex items-center gap-2 shadow-sm">
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
        <path
          d="M8 1L8 13M8 1L4 5M8 1L12 5M2 11V17C2 18.1 2.9 19 4 19H12C13.1 19 14 18.1 14 17V11"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs font-body">Add to Home Screen</span>
    </div>
  </div>
);

export type SetupPlatform = "ios-safari" | "ios-other" | "android" | "desktop";

const STEP_SETS: Record<SetupPlatform, { i: string; t: string; s: string }[]> = {
  "ios-safari": [
    { i: "↑", t: "Tap the Share button", s: "The square with an arrow, at the bottom of Safari" },
    { i: "🏠", t: "Tap 'Add to Home Screen'", s: "Scroll down in the share sheet if needed" },
    { i: "✓", t: "Tap Add", s: "STRAND appears on your home screen" },
  ],
  "ios-other": [
    { i: "🧭", t: "Open this page in Safari", s: "Install only works from Safari on iPhone or iPad" },
    { i: "↑", t: "Tap the Share button", s: "The square with an arrow at the bottom of Safari" },
    { i: "🏠", t: "Tap 'Add to Home Screen'", s: "Then tap Add — STRAND appears instantly" },
  ],
  android: [
    { i: "⋮", t: "Tap the menu button", s: "Three dots in Chrome, or your browser's menu" },
    { i: "📲", t: "Tap 'Install app' or 'Add to Home screen'", s: "Wording varies by browser" },
    { i: "✓", t: "Confirm", s: "STRAND appears with your other apps" },
  ],
  desktop: [
    { i: "⊕", t: "Look for the install icon", s: "In the address bar (Chrome, Edge, Brave) or browser menu" },
    { i: "📲", t: "Click 'Install STRAND'", s: "Or 'Add to Home screen' on some browsers" },
    { i: "✓", t: "Confirm", s: "STRAND opens in its own window like an app" },
  ],
};

export const SetupStepsIllustration = ({ platform }: { platform: SetupPlatform }) => (
  <div className="space-y-2">
    {STEP_SETS[platform].map((step, idx) => (
      <div key={idx} className="bg-card border border-border rounded-[14px] p-3 flex items-center gap-3">
        <div className="size-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-base">
          {step.i}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold font-body">
            {idx + 1}. {step.t}
          </p>
          <p className="text-[11px] text-muted-foreground font-body">{step.s}</p>
        </div>
      </div>
    ))}
  </div>
);

export const SetupHomeScreenIllustration = () => (
  <div className="grid grid-cols-4 gap-3 max-w-[260px] mx-auto">
    {Array.from({ length: 8 }).map((_, i) => {
      const isStrand = i === 5;
      return (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "size-12 rounded-[12px] flex items-center justify-center",
              isStrand
                ? "bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
                : "bg-secondary",
            )}
          >
            {isStrand && <span className="font-display text-[10px] tracking-[0.1em]">ST</span>}
          </div>
          <span className={cn("text-[8px] font-body", isStrand ? "text-foreground font-semibold" : "text-foreground/40")}>
            {isStrand ? "STRAND" : ""}
          </span>
        </div>
      );
    })}
  </div>
);
