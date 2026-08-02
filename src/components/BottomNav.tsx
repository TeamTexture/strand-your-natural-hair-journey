import { NavLink } from "react-router-dom";
import { Home, FlaskConical, Droplets, Apple, User } from "lucide-react";
import { tap } from "@/lib/haptics";
import { useNotifications } from "@/hooks/useNotifications";

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
  // Badges appear only for genuinely actionable counts (unread notifications).
  const { unreadCount } = useNotifications();
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
        data-tour={to === "/profile" ? "bottom-nav-profile" : undefined}
        className={({ isActive }) =>
          `min-h-[56px] py-2 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.12em] font-body transition-colors ${
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative">
              <Icon className={`size-5 ${isActive ? "stroke-[2]" : "stroke-[1.5]"}`} aria-hidden="true" />
              {to === "/profile" && unreadCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-body font-semibold flex items-center justify-center"
                  aria-label={`${unreadCount} unread`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span className="text-center leading-none">{label}</span>
          </>
        )}
      </NavLink>
    ))}
  </nav>
  );
};

export default BottomNav;
