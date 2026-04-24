import { NavLink } from "react-router-dom";
import { Home, FlaskConical, Droplets, BookOpen, User } from "lucide-react";

const tabs = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/products", label: "Products", Icon: FlaskConical },
  { to: "/wash-day", label: "Wash Day", Icon: Droplets },
  { to: "/journal", label: "Journal", Icon: BookOpen },
  { to: "/profile", label: "Profile", Icon: User },
];

const BottomNav = () => (
  <nav
    aria-label="Primary"
    className="shrink-0 h-[72px] border-t border-border bg-card/95 backdrop-blur-sm grid grid-cols-5"
  >
    {tabs.map(({ to, label, Icon }) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.12em] font-body transition-colors ${
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={`size-5 ${isActive ? "stroke-[2]" : "stroke-[1.5]"}`} />
            <span>{label}</span>
          </>
        )}
      </NavLink>
    ))}
  </nav>
);

export default BottomNav;
