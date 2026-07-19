// Fixed top-right hamburger menu, always visible on authenticated app screens.
// Opens a Sheet with quick navigation across the main areas of the app.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Home as HomeIcon,
  Droplets,
  ShoppingBag,
  BookOpen,
  Calendar,
  Users,
  User,
  Salad,
  Activity,
  HelpCircle,
  Mail,
  LogOut,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";

const NAV: { label: string; to: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Home", to: "/home", icon: HomeIcon },
  { label: "Wash Day", to: "/wash-day", icon: Droplets },
  { label: "Products", to: "/products", icon: ShoppingBag },
  { label: "Style Journal", to: "/journal", icon: BookOpen },
  { label: "Appointments", to: "/appointments", icon: Calendar },
  { label: "Directory", to: "/directory", icon: Users },
  { label: "Blood Work", to: "/blood-history", icon: Activity },
  { label: "Nutrition Plan", to: "/nutrition-plan", icon: Salad },
  { label: "Profile", to: "/profile", icon: User },
  { label: "Help", to: "/help", icon: HelpCircle },
  { label: "Contact", to: "/contact", icon: Mail },
];

// Hide menu on splash, auth and onboarding flows.
const HIDDEN_PREFIXES = ["/auth", "/onboarding", "/walkthrough", "/setup", "/.lovable"];

const GlobalMenu = () => {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!session) return null;
  if (location.pathname === "/") return null;
  if (HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 size-10 rounded-full bg-background/85 backdrop-blur border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[280px] p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b">
            <SheetTitle className="font-display text-xl">Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map(({ label, to, icon: Icon }) => {
              const active =
                to === "/home"
                  ? location.pathname === "/home"
                  : location.pathname === to || location.pathname.startsWith(to + "/");
              return (
                <button
                  key={to}
                  onClick={() => go(to)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left text-sm font-body transition-colors ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="border-t p-3">
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
                navigate("/");
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-4" />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default GlobalMenu;
