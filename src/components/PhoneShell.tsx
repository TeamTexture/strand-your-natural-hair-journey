import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import ViewAsBanner from "@/components/ViewAsBanner";
import { isChromeFreeRoute } from "@/lib/chromeFreeRoutes";

interface Props {
  children: ReactNode;
}

/**
 * iOS-style phone frame, 375px wide.
 * - Mobile (<640px): full screen, native feel — respects safe-area insets,
 *   disables overscroll bounce so the browser background never peeks through.
 * - Desktop (>=640px): 375x812 framed device on a tinted backdrop (preview only).
 */
const PhoneShell = ({ children }: Props) => {
  // Plain-term definitions are claimed once per page: remounting the provider
  // on every route change clears the claims for the new screen.
  const { pathname } = useLocation();
  return (
  <div className="min-h-[100dvh] w-full bg-foreground/[0.04] desk:bg-foreground/[0.06] flex items-center justify-center p-0 desk:p-6 select-none overscroll-none">
    <div
      data-app-frame
      className="
        relative w-full desk:max-w-[375px] bg-background overflow-hidden
        h-[100dvh] desk:h-[812px]
        desk:rounded-[50px] desk:border-[10px] desk:border-foreground/90
        desk:shadow-[0_30px_80px_-20px_rgba(44,36,22,0.45)]
      "
    >
      {/* iOS notch (desktop only) */}
      <div className="hidden desk:block absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/90 rounded-b-2xl z-30 pointer-events-none" />
      <div className="relative z-10 h-full desk:h-[calc(100%-2rem)] desk:pt-8 flex flex-col">
        {/* Admin "View as user" banner — renders only when active. */}
        {!isChromeFreeRoute(pathname) && <ViewAsBanner />}
        <div className="flex-1 min-h-0">
          <div key={pathname} className="h-full">{children}</div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default PhoneShell;

