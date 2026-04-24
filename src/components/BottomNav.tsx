import { NavLink } from "react-router-dom";
import { Home, FlaskConical, Droplets, BookOpen, User } from "lucide-react";
import { tap } from "@/lib/haptics";

const tabs = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/products", label: "Products", Icon: FlaskConical },
  { to: "/wash-day", label: "Wash Day", Icon: Droplets },
  { to: "/journal", label: "Journal", Icon: BookOpen },
  { to: "/profile", label: "Profile", Icon: User },
];

/**
 * 5-tab bottom nav. Each tab is a 44x44+ touch target and the bar respects
 * the iPhone home-bar safe-area-inset-bottom.
 */
const BottomNav = () => (
  <nav
    aria-label="Primary"
    className="shrink-0 border-t border-border bg-card/95 backdrop-blur-sm grid grid-cols-5 select-none"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
  >
    {tabs.map(({ to, label, Icon }) => (
      <NavLink
        key={to}
        to={to}
        end
        onClick={() => tap()}
        className={({ isActive }) =>
          `min-h-[56px] py-2 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.12em] font-body transition-colors ${
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={`size-5 ${isActive ? "stroke-[2]" : "stroke-[1.5]"}`} aria-hidden="true" />
            <span>{label}</span>
          </>
        )}
      </NavLink>
    ))}
  </nav>
);

export default BottomNav;
