// Inline top bar with hamburger menu — part of the app layout, not a floating overlay.
// Reserves its own row above page content so pages never sit under it.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Star,
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
  Briefcase,
  ShieldCheck,
  ChevronDown,
  LayoutDashboard,
  Sparkles,
  Inbox,
  CreditCard,
  FileText,
  ClipboardList,
  Settings,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";
import { usePendingApplicationsCount } from "@/hooks/usePendingApplicationsCount";
import { useBackButtonContext } from "@/components/BackButtonContext";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

const CONSUMER_NAV: NavItem[] = [
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

const PRO_NAV: NavItem[] = [
  { label: "Dashboard", to: "/pro", icon: LayoutDashboard },
  { label: "Profile", to: "/pro/profile", icon: User },
  { label: "Offers", to: "/pro/offers", icon: Sparkles },
  { label: "Enquiries", to: "/pro/enquiries", icon: Inbox },
  { label: "Billing", to: "/pro/billing", icon: CreditCard },
];


// Hide menu on splash, auth and onboarding flows.
const HIDDEN_PREFIXES = ["/auth", "/onboarding", "/walkthrough", "/setup", "/.lovable"];

const GlobalMenu = () => {
  const { session, signOut } = useAuth();
  const { isConsumer, isProfessional, isAdmin } = useRoles();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { hasPageBackButton } = useBackButtonContext();

  const hidden =
    !session ||
    location.pathname === "/" ||
    HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hidden) return null;

  const path = location.pathname;
  const activeView: "consumer" | "pro" | "admin" = path.startsWith("/admin")
    ? "admin"
    : path.startsWith("/pro")
      ? "pro"
      : "consumer";

  const roleCount = [isConsumer, isProfessional, isAdmin].filter(Boolean).length;
  const showViewSwitcher = roleCount > 1;

  const viewMeta = {
    consumer: { label: "My STRAND", icon: HomeIcon, to: "/home" },
    pro: { label: "Professional", icon: Briefcase, to: "/pro" },
    admin: { label: "Admin", icon: ShieldCheck, to: "/admin" },
  } as const;

  const ActiveIcon = viewMeta[activeView].icon;


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
      <div className="flex items-center gap-1">
        {showViewSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Switch view"
                className="h-9 px-2.5 rounded-full flex items-center gap-1.5 border border-border bg-card text-foreground/80 hover:bg-muted/60 transition-colors"
              >
                <ActiveIcon className="size-4 text-primary" />
                <span className="text-[11px] font-body font-medium leading-none hidden sm:inline">
                  {viewMeta[activeView].label}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isConsumer && (
                <DropdownMenuItem
                  onClick={() => navigate(viewMeta.consumer.to)}
                  className={activeView === "consumer" ? "bg-primary/10 text-primary" : ""}
                >
                  <HomeIcon className="size-4 mr-2" /> My STRAND
                </DropdownMenuItem>
              )}
              {isProfessional && (
                <DropdownMenuItem
                  onClick={() => navigate(viewMeta.pro.to)}
                  className={activeView === "pro" ? "bg-primary/10 text-primary" : ""}
                >
                  <Briefcase className="size-4 mr-2" /> Professional
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => navigate(viewMeta.admin.to)}
                  className={activeView === "admin" ? "bg-primary/10 text-primary" : ""}
                >
                  <ShieldCheck className="size-4 mr-2" /> Admin
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {location.pathname === "/home" && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Take the tour"
                  onClick={() => window.dispatchEvent(new CustomEvent("strand:start-tour"))}
                  className="size-9 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
                >
                  <Star className="size-[18px] fill-current" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                <span>Take the tour</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <button
          type="button"
          aria-label="Open menu"
          data-tour="global-menu"
          onClick={() => setOpen(true)}
          className="size-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
        >
          <Menu className="size-5" />
        </button>
      </div>

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
