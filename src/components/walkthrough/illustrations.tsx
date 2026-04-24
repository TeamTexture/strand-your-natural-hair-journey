// SVG illustrations for walkthrough & setup guide. Pure CSS/SVG — on brand.
import { cn } from "@/lib/utils";

const PhoneFrame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("mx-auto w-[180px] h-[320px] rounded-[28px] bg-card border-2 border-primary/40 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.3)] overflow-hidden flex flex-col", className)}>
    <div className="h-5 bg-card flex items-center justify-center">
      <div className="w-12 h-1 bg-primary/30 rounded-full" />
    </div>
    <div className="flex-1 p-3 flex flex-col gap-2 bg-background">
      {children}
    </div>
  </div>
);

export const HomeIllustration = () => (
  <PhoneFrame>
    <div className="bg-alert-dark text-alert-dark-foreground rounded-md p-2 text-[8px] font-body">
      <div className="text-primary font-semibold tracking-[0.15em] uppercase mb-1">Today</div>
      <div>Hard water alert · Low ferritin</div>
    </div>
    <div className="grid grid-cols-2 gap-1.5 mt-1">
      {["💧", "🧴", "📓", "🩺"].map((e) => (
        <div key={e} className="bg-card border border-border rounded-md aspect-square flex items-center justify-center text-lg">{e}</div>
      ))}
    </div>
  </PhoneFrame>
);

export const WashIllustration = () => (
  <PhoneFrame>
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }).map((_, i) => (
        <div key={i} className={cn("aspect-square rounded-sm", [3, 10, 17, 24].includes(i) ? "bg-primary" : "bg-secondary")} />
      ))}
    </div>
    <div className="mt-auto bg-primary text-primary-foreground text-[8px] py-1.5 rounded-md text-center font-medium uppercase tracking-[0.15em]">
      + Log Wash
    </div>
  </PhoneFrame>
);

export const ProductsIllustration = () => (
  <PhoneFrame>
    {[
      { color: "bg-good", n: 92 },
      { color: "bg-primary", n: 78 },
      { color: "bg-warn", n: 54 },
    ].map((p, i) => (
      <div key={i} className="flex items-center gap-2 bg-card border border-border rounded-md p-1.5">
        <div className={cn("size-7 rounded-full flex items-center justify-center text-[9px] text-alert-dark-foreground font-semibold", p.color)}>
          {p.n}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="h-1.5 bg-secondary rounded w-3/4" />
          <div className="h-1 bg-secondary/60 rounded w-1/2" />
        </div>
      </div>
    ))}
  </PhoneFrame>
);

export const JournalIllustration = () => (
  <PhoneFrame>
    <div className="grid grid-cols-2 gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square bg-card border border-border rounded-md flex items-center justify-center">
          <div className="size-6 rounded-full bg-primary/30" />
        </div>
      ))}
    </div>
    <div className="mt-auto bg-secondary rounded-md p-1.5">
      <div className="h-1.5 bg-foreground/30 rounded w-3/4 mb-1" />
      <div className="h-1 bg-foreground/20 rounded w-full" />
    </div>
  </PhoneFrame>
);

export const ProfileIllustration = () => (
  <PhoneFrame>
    <div className="flex items-center gap-2">
      <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">✨</div>
      <div className="flex-1">
        <div className="h-1.5 bg-foreground/40 rounded w-3/4 mb-1" />
        <div className="h-1 bg-primary/60 rounded w-1/2" />
      </div>
    </div>
    <div className="bg-card border border-border rounded-md p-1.5 space-y-1">
      {[
        { c: "bg-warn", t: "Ferritin LOW" },
        { c: "bg-warn", t: "Vitamin D LOW" },
        { c: "bg-good", t: "B12 Normal" },
      ].map((r) => (
        <div key={r.t} className="flex items-center gap-1.5 text-[8px] font-body">
          <div className={cn("size-1.5 rounded-full", r.c)} />
          <span className="flex-1">{r.t}</span>
        </div>
      ))}
    </div>
    <div className="bg-primary/10 border border-primary/30 rounded-md p-1.5 text-[8px]">
      <div className="font-semibold mb-0.5">Nutrition plan</div>
      <div className="text-foreground/70">3 supplements suggested</div>
    </div>
  </PhoneFrame>
);

// SETUP GUIDE
export const SetupShareIllustration = () => (
  <div className="flex flex-col items-center gap-4">
    <PhoneFrame className="w-[140px] h-[200px]">
      <div className="flex-1 flex items-center justify-center">
        <span className="font-display text-primary text-2xl tracking-[0.2em]">STRAND</span>
      </div>
    </PhoneFrame>
    <div className="bg-card border border-border rounded-[14px] px-3 py-2 flex items-center gap-2 shadow-sm">
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
        <path d="M8 1L8 13M8 1L4 5M8 1L12 5M2 11V17C2 18.1 2.9 19 4 19H12C13.1 19 14 18.1 14 17V11" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs font-body">Add to Home Screen</span>
    </div>
  </div>
);

export const SetupStepsIllustration = ({ android }: { android: boolean }) => (
  <div className="space-y-2">
    {(android
      ? [
          { i: "⋮", t: "Tap the three dots", s: "Top right of Chrome" },
          { i: "🏠", t: "Tap Add to Home Screen", s: "In the dropdown" },
          { i: "✓", t: "Tap Add", s: "STRAND appears instantly" },
        ]
      : [
          { i: "↑", t: "Tap the Share button", s: "Bottom of Safari" },
          { i: "🏠", t: "Tap Add to Home Screen", s: "Scroll down in share sheet" },
          { i: "✓", t: "Tap Add", s: "STRAND appears instantly" },
        ]
    ).map((step, idx) => (
      <div key={idx} className="bg-card border border-border rounded-[14px] p-3 flex items-center gap-3">
        <div className="size-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-base">{step.i}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold font-body">{idx + 1}. {step.t}</p>
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
