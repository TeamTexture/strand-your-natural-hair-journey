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
  Store,
  Megaphone,
  Calendar as CalendarIcon,
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
import { useAccessRestricted } from "@/hooks/useAccessRestricted";
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
  { label: "Clients", to: "/pro/clients", icon: Users },
  { label: "Appointments", to: "/pro/appointments", icon: Calendar },

  { label: "Billing", to: "/pro/billing", icon: CreditCard },
];
const BRAND_NAV: NavItem[] = [
  { label: "Dashboard", to: "/brand", icon: LayoutDashboard },
  { label: "Create offer", to: "/brand/offers/new", icon: Megaphone },
];




// Hide menu on splash and auth. Onboarding/walkthrough/setup keep the top
// bar so users always have a back button and a way to sign out — otherwise
// they can get stranded on step 1 with no exit.
const HIDDEN_PREFIXES = ["/auth", "/.lovable"];
const ONBOARDING_PREFIXES = ["/onboarding", "/walkthrough", "/setup"];

const GlobalMenu = () => {
  const { session, signOut } = useAuth();
  const { isConsumer, isProfessional, isAdmin, isBrand } = useRoles();
  const { isActive: proSubActive } = useProSubscription();
  const { data: pendingApplicationsCount = 0 } = usePendingApplicationsCount();
  const { isRestricted } = useAccessRestricted();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { hasPageBackButton } = useBackButtonContext();

  const hidden =
    !session ||
    isRestricted ||
    location.pathname === "/" ||
    HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hidden) return null;

  const isOnboarding = ONBOARDING_PREFIXES.some((p) => location.pathname.startsWith(p));

  const path = location.pathname;
  const activeView: "consumer" | "pro" | "admin" | "brand" = path.startsWith("/admin")
    ? "admin"
    : path.startsWith("/brand")
      ? "brand"
      : path.startsWith("/pro")
        ? "pro"
        : "consumer";

  const roleCount = [isConsumer, isProfessional, isAdmin, isBrand].filter(Boolean).length;
  const showViewSwitcher = roleCount > 1;

  const viewMeta = {
    consumer: { label: "My STRAND", icon: HomeIcon, to: "/home" },
    pro: { label: "Professional", icon: Briefcase, to: "/pro" },
    admin: { label: "Admin", icon: ShieldCheck, to: "/admin" },
    brand: { label: "Brand", icon: Store, to: "/brand" },
  } as const;

  const ActiveIcon = viewMeta[activeView].icon;

  const ADMIN_NAV: NavItem[] = [
    { label: "Overview", to: "/admin", icon: LayoutDashboard },
    { label: "Applications", to: "/admin/applications", icon: ClipboardList, badge: pendingApplicationsCount },
    { label: "Professionals", to: "/admin/professionals", icon: Sparkles },
    { label: "Members", to: "/admin/members", icon: Users },
    { label: "Brand offers", to: "/admin/brand-offers", icon: Megaphone },
    { label: "Booking calendar", to: "/admin/brand-calendar", icon: CalendarIcon },

    { label: "Audit trail", to: "/admin/audit", icon: FileText },
    { label: "Settings", to: "/admin/settings", icon: Settings },
  ];

  // For pro view: only show items the pro can actually access.
  // Approved + subscribed pros (or admins acting as pro) see everything.
  // Otherwise (application pending, or approved-but-unpaid), the dashboard
  // is locked to the landing/welcome screen and we surface nothing.
  const proUnlocked = isAdmin || (isProfessional && proSubActive);

  // Suppress the entire top bar for pros still in application / acceptance —
  // the landing, apply and welcome screens have their own back affordances,
  // and the hamburger isn't useful until they're actually inside the app.
  if (activeView === "pro" && !proUnlocked) return null;

  const navItems: NavItem[] =
    activeView === "admin"
      ? ADMIN_NAV
      : activeView === "brand"
        ? BRAND_NAV
        : activeView === "pro"
          ? PRO_NAV
          : CONSUMER_NAV;



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
            {!isOnboarding && navItems.map(({ label, to, icon: Icon, badge }) => {
              const active =
                to === "/home" || to === "/pro" || to === "/admin"
                  ? location.pathname === to
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
                  <span className="flex-1">{label}</span>
                  {badge && badge > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold leading-none bg-primary text-primary-foreground">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          {showViewSwitcher && (
            <div className="border-t p-3 space-y-1">
              <p className="px-3 pb-1 text-[10px] uppercase tracking-wider font-body font-semibold text-muted-foreground">
                Switch view
              </p>
              {isConsumer && activeView !== "consumer" && (
                <button
                  onClick={() => go(viewMeta.consumer.to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body hover:bg-muted/50 transition-colors"
                >
                  <HomeIcon className="size-4" />
                  <span>My STRAND</span>
                </button>
              )}
              {isProfessional && activeView !== "pro" && (
                <button
                  onClick={() => go(viewMeta.pro.to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body hover:bg-muted/50 transition-colors"
                >
                  <Briefcase className="size-4" />
                  <span>Professional</span>
                </button>
              )}
              {isAdmin && activeView !== "admin" && (
                <button
                  onClick={() => go(viewMeta.admin.to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body hover:bg-muted/50 transition-colors"
                >
                  <ShieldCheck className="size-4" />
                  <span>Admin</span>
                </button>
              )}
            </div>
          )}
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
