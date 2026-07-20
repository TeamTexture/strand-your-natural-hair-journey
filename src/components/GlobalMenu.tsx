// Inline top bar with hamburger menu — part of the app layout, not a floating overlay.
// Reserves its own row above page content so pages never sit under it.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  ChevronLeft,
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
import { useBackButtonContext } from "@/components/BackButtonContext";


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
  const { hasPageBackButton } = useBackButtonContext();

  const hidden =
    !session ||
    location.pathname === "/" ||
    HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hidden) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  // Only show the menu's back button when the page itself hasn't already
  // rendered one (e.g. via TitleBar), so the user never sees two back buttons.
  const canGoBack = location.pathname !== "/home" && !hasPageBackButton;


  return (
    <div
      className="shrink-0 flex items-center justify-between px-3 border-b border-border/40 bg-background"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 6px)",
        paddingBottom: "6px",
      }}
    >
      {canGoBack ? (
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="size-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <span className="size-9" aria-hidden />
      )}
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="size-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
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
    </div>
  );
};

export default GlobalMenu;
