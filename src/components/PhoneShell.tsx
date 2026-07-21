import { ReactNode } from "react";
import ViewAsBanner from "@/components/ViewAsBanner";

interface Props {
  children: ReactNode;
}

/**
 * iOS-style phone frame, 375px wide.
 * - Mobile (<640px): full screen, native feel — respects safe-area insets,
 *   disables overscroll bounce so the browser background never peeks through.
 * - Desktop (>=640px): 375x812 framed device on a tinted backdrop (preview only).
 */
const PhoneShell = ({ children }: Props) => (
  <div className="min-h-[100dvh] w-full bg-foreground/[0.04] sm:bg-foreground/[0.06] flex items-center justify-center p-0 sm:p-6 select-none overscroll-none">
    <div
      className="
        relative w-full max-w-[375px] bg-background overflow-hidden
        h-[100dvh] sm:h-[812px]
        sm:rounded-[50px] sm:border-[10px] sm:border-foreground/90
        sm:shadow-[0_30px_80px_-20px_rgba(44,36,22,0.45)]
      "
    >
      {/* iOS notch (desktop only) */}
      <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/90 rounded-b-2xl z-30 pointer-events-none" />
      <div className="relative z-10 h-full sm:h-[calc(100%-2rem)] sm:pt-8 flex flex-col">
        {/* Admin "View as user" banner — renders only when active. */}
        <ViewAsBanner />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  </div>
);

export default PhoneShell;

