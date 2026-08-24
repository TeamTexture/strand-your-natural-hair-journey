import { NavLink, useLocation } from "react-router-dom";
import { Home, FlaskConical, Droplets, Apple, User } from "lucide-react";
import { tap } from "@/lib/haptics";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import { useMemberAppUnlocked } from "@/hooks/useMemberAppUnlocked";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";
import { requestTourAutostart } from "@/lib/firstRunTour";

const tabs = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/products", label: "Products", Icon: FlaskConical },
  { to: "/wash-day", label: "Wash Day", Icon: Droplets },
  { to: "/nutrition-plan", label: "Diet", Icon: Apple },
  { to: "/profile", label: "Profile", Icon: User },
];

/**
 * 5-tab bottom nav. Each tab is a 44x44+ touch target and the bar respects
 * the iPhone home-bar safe-area-inset-bottom.
 */
const BottomNav = () => {
  // Hard wall: the member tab bar is a consumer-view feature only. Pro, brand
  // and admin views never render it, even on shared routes (messages, chat).
  const view = useActiveRoleView();
  // Second hard wall: the tab bar links straight into the paid app, so it stays
  // hidden until the member has finished the required onboarding (hair
  // characteristics + blood work) and has live membership access. Screens that
  // are reachable mid-onboarding (e.g. the professional directory) therefore no
  // longer expose the rest of the app. See useMemberAppUnlocked.
  const { unlocked } = useMemberAppUnlocked();
  const location = useLocation();
  // First run only: the Home tab glows with a START HERE label until the
  // member has taken the guided tour. Tapping it flags the tour to open the
  // moment Home mounts, so the tour always actually starts.
  const { eligible: tourPending } = useFirstRunNudge("home_tour_seen_at");
  if (!allowsMemberFeatures(view)) return null;
  if (!unlocked) return null;

  return (
  <nav
    aria-label="Primary"
    data-tour="bottom-nav"
    className="shrink-0 border-t border-border bg-card/95 backdrop-blur-sm grid grid-cols-5 select-none"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
  >
    {tabs.map(({ to, label, Icon }) => (
      <NavLink
        key={to}
        to={to}
        end
        onClick={() => tap()}
        data-tour={to === "/profile" ? "bottom-nav-profile" : `nav-${label.toLowerCase().replace(/ /g, "-")}`}
        onClickCapture={() => {
          if (to === "/home" && tourPending) requestTourAutostart();
        }}
        className={({ isActive }) =>
          `min-h-[56px] py-2 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.12em] font-body transition-colors ${
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative">
              <Icon
                className={`size-5 ${isActive ? "stroke-[2]" : "stroke-[1.5]"} ${
                  to === "/home" && tourPending ? "text-primary animate-pulse" : ""
                }`}
                aria-hidden="true"
              />
              {to === "/home" && tourPending && (
                <>
                  <span
                    className="absolute -inset-2 rounded-full border border-primary/70 animate-ping"
                    aria-hidden="true"
                  />
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-[3px] text-[8px] font-bold uppercase tracking-[0.12em] text-foreground shadow-lg">
                    Start here
                  </span>
                </>
              )}
            </span>
            <span
              className={`text-center leading-none ${
                to === "/home" && tourPending ? "text-primary font-semibold" : ""
              }`}
            >
              {label}
            </span>
          </>
        )}
      </NavLink>
    ))}
  </nav>
  );
};

export default BottomNav;
