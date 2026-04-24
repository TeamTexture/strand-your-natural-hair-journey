import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * iOS-style phone frame, 375px wide.
 * - Mobile (<640px): full screen, native feel.
 * - Desktop (>=640px): 375x812 framed device on a tinted backdrop.
 *
 * Children render inside a fixed-height area (h-full) so that ScreenLayout
 * can use flex column with overflow-y-auto on the main region.
 */
const PhoneShell = ({ children }: Props) => (
  <div className="min-h-screen w-full bg-foreground/[0.04] sm:bg-foreground/[0.06] flex items-center justify-center p-0 sm:p-6">
    <div
      className="
        relative w-full max-w-[375px] bg-background overflow-hidden
        h-screen sm:h-[812px]
        sm:rounded-[50px] sm:border-[10px] sm:border-foreground/90
        sm:shadow-[0_30px_80px_-20px_rgba(44,36,22,0.45)]
      "
    >
      {/* iOS notch (desktop only) */}
      <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/90 rounded-b-2xl z-30 pointer-events-none" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  </div>
);

export default PhoneShell;
