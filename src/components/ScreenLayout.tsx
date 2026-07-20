import { ReactNode } from "react";
import StatusBar from "./StatusBar";
import BottomNav from "./BottomNav";

interface Props {
  children: ReactNode;
  /** Show iOS status bar (default true) */
  status?: boolean;
  /** Show 5-tab bottom nav */
  bottomNav?: boolean;
  /** Optional extra padding-bottom for content (e.g. when no nav but FAB) */
  contentClassName?: string;
  /** Optional Tailwind classes applied to the outer background (overrides default bg-background). */
  backgroundClassName?: string;
}

/**
 * Standard layout for every Strand screen — status bar, scrollable content,
 * optional bottom nav. Lives inside <PhoneShell>.
 */
const ScreenLayout = ({ children, status = true, bottomNav = false, contentClassName = "", backgroundClassName = "bg-background" }: Props) => (
  <div className={`flex flex-col h-full ${backgroundClassName}`}>
    {status && <StatusBar />}
    <main className={`flex-1 overflow-y-auto scrollbar-hide ${contentClassName}`}>
      {children}
    </main>
    {bottomNav && <BottomNav />}
  </div>
);

export default ScreenLayout;
