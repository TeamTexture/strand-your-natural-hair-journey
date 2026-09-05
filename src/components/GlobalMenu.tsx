// Inline top bar with hamburger menu — part of the app layout, not a floating overlay.
// Reserves its own row above page content so pages never sit under it.
import { useEffect, useState } from "react";
import FeatureDirectory from "@/components/nav/FeatureDirectory";

/** Fired by Home's "Explore all features" button to open the directory sheet. */
export const OPEN_MENU_EVENT = "strand:open-feature-directory";

import { useLocation, useNavigate } from "react-router-dom";
import { routeToView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";
import { CHROME_FREE_PREFIXES, isChromeFreeRoute } from "@/lib/chromeFreeRoutes";

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
  MessageSquare,
  ShieldAlert,
  Library,
  Sparkles as PlusSparkles,
  Ticket,
} from "lucide-react";
import GlobalChatWidget from "@/components/GlobalChatWidget";
import TipsLevelButton from "@/components/TipsLevelButton";
import GlobalTipsDensityStrip from "@/components/GlobalTipsDensityStrip";
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
import { useMyProfile } from "@/hooks/useMyProfile";
import { useAccessRestricted } from "@/hooks/useAccessRestricted";
import { useBrandLockout } from "@/hooks/useBrandLockout";
import { useProSubscription } from "@/hooks/useProSubscription";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useMemberAppUnlocked } from "@/hooks/useMemberAppUnlocked";
import { useInternationalBlock } from "@/hooks/useInternationalBlock";
import { usePendingApplicationsCount } from "@/hooks/usePendingApplicationsCount";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import { useUpgradeEligibility } from "@/hooks/useUpgradeEligibility";
import { useBackButtonContext } from "@/components/BackButtonContext";
import { safeBack } from "@/lib/smartBack";
import { toast } from "sonner";

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
  { label: "Listing discount", to: "/pro/offers", icon: Sparkles },
  { label: "Enquiries", to: "/pro/enquiries", icon: Inbox },
  { label: "Clients", to: "/pro/clients", icon: Users },
  { label: "Appointments", to: "/pro/appointments", icon: Calendar },

  { label: "Billing", to: "/pro/billing", icon: CreditCard },
];
const BRAND_NAV: NavItem[] = [
  { label: "Dashboard", to: "/brand", icon: LayoutDashboard },
  { label: "Create offer", to: "/brand/offers/new", icon: Megaphone },
  { label: "Edit brand page", to: "/brand/profile", icon: Settings },
];




// Keep app navigation hidden until the member is inside the paid app.
const HIDDEN_PREFIXES = ["/auth", "/.lovable"];
const ONBOARDING_PREFIXES = CHROME_FREE_PREFIXES;

const GlobalMenu = () => {
  const { session, signOut } = useAuth();
  const { isConsumer, isProfessional, isAdmin, isBrand } = useRoles();
  const { data: myProfile, isLoading: profileLoading } = useMyProfile();
  const { isActive: proSubActive } = useProSubscription();
  const { hasAccess: memberHasAccess } = useConsumerSubscription();
  const { data: pendingApplicationsCount = 0 } = usePendingApplicationsCount();
  const { isRestricted } = useAccessRestricted();
  // An unpaid brand account gets no navigation at all — the paywall screen
  // carries its own sign-out and support links.
  const { locked: brandLocked } = useBrandLockout();
  const { hasPlus } = usePlusAccess();
  // Upgrade CTA is consumer-only — never for professional, brand or admin accounts.
  const { canUpgrade } = useUpgradeEligibility();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Home's "Explore all features" button opens this same sheet.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
  }, []);

  const { hasPageBackButton } = useBackButtonContext();
  // Paywall / onboarding chrome lock — see useMemberAppUnlocked.
  const {
    unlocked: memberAppUnlocked,
    resumePath,
    known: memberAppLockKnown,
  } = useMemberAppUnlocked();
  const { blocked: internationalBlocked } = useInternationalBlock();


  const path = location.pathname;

  // Tips-level preference is irrelevant on directory surfaces where the user
  // is browsing listings, not receiving personalised guidance.
  const isDirectoryPage = path.startsWith("/directory") || path.startsWith("/brands");

  const routeView = routeToView(path, location.search);


  const [rememberedView, setRememberedView] = useState<
    "consumer" | "pro" | "admin" | "brand"
  >(() => {
    const stored = sessionStorage.getItem("strand.lastRoleView");
    if (stored === "consumer" || stored === "pro" || stored === "admin" || stored === "brand") {
      return stored;
    }
    return "consumer";
  });

  useEffect(() => {
    if (routeView) {
      sessionStorage.setItem("strand.lastRoleView", routeView);
      setRememberedView(routeView);
    }
  }, [routeView]);

  const hidden =
    !session ||
    isRestricted ||
    brandLocked ||
    // Accounts blocked as outside the UK get the waiting-list splash and no
    // chrome at all — no menu, so no route back into onboarding or the app.
    internationalBlocked ||
    isChromeFreeRoute(location.pathname) ||
    HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hidden) return null;

  const isOnboarding = ONBOARDING_PREFIXES.some((p) => location.pathname.startsWith(p));

  // The guidance strip only appears once the member is truly inside the app:
  // onboarding finished, membership active, and Home reached at least once.
  const onboardingDone = !!myProfile?.onboarding_completed_at;
  const reachedHome = (() => {
    try {
      if (location.pathname.startsWith("/home")) {
        localStorage.setItem("strand.reachedHome", "1");
        return true;
      }
      return localStorage.getItem("strand.reachedHome") === "1";
    } catch {
      return location.pathname.startsWith("/home");
    }
  })();
  const showTipsStrip =
    !isOnboarding && onboardingDone && memberHasAccess && reachedHome;

  const activeView: "consumer" | "pro" | "admin" | "brand" = routeView ?? rememberedView;

  // A member who has not finished the required onboarding (hair characteristics
  // + blood work) or has no live membership gets NO app navigation — no
  // hamburger, no view switcher, no shortcuts. Some screens are legitimately
  // reachable mid-onboarding (the professional directory is part of the
  // consultation step), so the bar itself stays for the back button and a single
  // way onward: back into onboarding.
  // NOTHING renders while the lock answer is still unknown. A member who has
  // finished onboarding must never see the resume bar, not even for a frame, so
  // "no answer yet" renders no chrome at all rather than the locked bar.
  // The trial paywall carries its own chrome and exactly one other action
  // (Sign out). No app bar there — the locked bar's "Continue onboarding"
  // button would be a door straight past the paywall.
  if (path === TRIAL_PAYWALL_PATH) return null;
  if (activeView === "consumer" && !memberAppUnlocked && !memberAppLockKnown) return null;
  if (activeView === "consumer" && !memberAppUnlocked) {
    return (
      <div className="shrink-0 border-b border-border/40 bg-background">
        <div
          className="flex items-center justify-between px-3"
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 6px)", paddingBottom: "6px" }}
        >
          {hasPageBackButton ? (
            <span className="size-9 shrink-0" aria-hidden />
          ) : (
            <button
              type="button"
              aria-label="Back"
              onClick={() => safeBack(navigate)}
              className="size-9 shrink-0 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="flex-1 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut();
                  navigate("/", { replace: true });
                } catch (e) {
                  console.error("[sign out] failed", e);
                  toast.error("Sign out failed — check your connection and try again.");
                }
              }}
              className="h-8 px-2 rounded-full bg-primary text-foreground text-[9px] font-body font-bold uppercase tracking-[0.08em] whitespace-nowrap"
            >
              Save & sign out
            </button>
            <button
              type="button"
              onClick={() => navigate(resumePath)}
              className="h-8 px-2 rounded-full bg-primary text-foreground text-[9px] font-body font-bold uppercase tracking-[0.08em] whitespace-nowrap"
            >
              Continue onboarding
            </button>
          </div>
        </div>
      </div>
    );
  }


  // A consumer role alone is not enough: the user must have actually completed
  // (or started) a member profile. Otherwise professionals without an end-user
  // profile see a toggle to an empty/broken consumer view.
  const hasConsumerProfile = !!myProfile;
  const viableConsumer = isConsumer && hasConsumerProfile;

  const viableAccountCount = [viableConsumer, isProfessional, isAdmin, isBrand].filter(Boolean).length;
  // Anyone with more than one *viable* account (member + pro, member + brand,
  // admin + pro…) gets the toggle in every view.
  const showViewSwitcher = viableAccountCount > 1 && !profileLoading;


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
    { label: "Moderation", to: "/admin/moderation", icon: ShieldAlert },
    { label: "Library", to: "/admin/library", icon: Library },
    { label: "Events", to: "/admin/events", icon: CalendarIcon },

    { label: "Audit trail", to: "/admin/audit", icon: FileText },
    { label: "Settings", to: "/admin/settings", icon: Settings },
  ];

  // STRAND+ items are rendered in a dedicated gold section at the top of the
  // menu (see nav render below), not mixed inline with standard consumer nav.
  const PLUS_NAV: NavItem[] = [
    { label: "Community forum", to: "/forum", icon: MessageSquare },
    { label: "STRAND+ Library", to: "/plus/library", icon: Library },
    { label: "STRAND+ Events", to: "/plus/events", icon: CalendarIcon },
    { label: "My tickets", to: "/plus/tickets", icon: Ticket },
  ];
  const CONSUMER_NAV_FINAL: NavItem[] = CONSUMER_NAV;

  // For pro view: only show items the pro can actually access.
  // Approved + subscribed pros (or admins acting as pro) see everything.
  // Otherwise (application pending, or approved-but-unpaid), the dashboard
  // is locked to the landing/welcome screen and we surface nothing.
  const proUnlocked = isAdmin || (isProfessional && proSubActive);

  // Suppress the top bar for pros still in application / acceptance — the
  // landing, apply and welcome screens have their own back affordances, and the
  // hamburger isn't useful until they're actually inside the app. Multi-account
  // users keep the bar so the view toggle is always reachable.
  const lockedPro = activeView === "pro" && !proUnlocked;
  if (lockedPro && !showViewSwitcher) return null;


  /** Members get the full feature directory instead of a short nav list. */
  const showDirectory = activeView === "consumer" && !isOnboarding;

  const navItems: NavItem[] =

    activeView === "admin"
      ? ADMIN_NAV
      : activeView === "brand"
        ? BRAND_NAV
        : activeView === "pro"
          ? PRO_NAV
          : CONSUMER_NAV_FINAL;




  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  // Only show the menu's back button when the page itself hasn't already
  // rendered one (e.g. via TitleBar), so the user never sees two back buttons.
  const canGoBack = location.pathname !== "/home" && !hasPageBackButton;


  return (
      <div className="shrink-0 border-b border-border/40 bg-background">
        <div
          className="flex items-center justify-between px-3"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 0px), 6px)",
            paddingBottom: "6px",
          }}
        >
          <div className="flex items-center gap-1 shrink-0">
            <GlobalChatWidget />
            {canGoBack ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => safeBack(navigate)}
                className="size-9 shrink-0 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : (
              <span className="size-9 shrink-0" aria-hidden />
            )}
          </div>
          <div className="flex items-center gap-1 min-w-0 shrink justify-end">
            {allowsMemberFeatures(activeView) && !isDirectoryPage && (
              <TipsLevelButton className="shrink-0" />
            )}
            {showViewSwitcher && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Switch view"
                    className="h-9 shrink-0 px-2.5 rounded-full flex items-center justify-start gap-1.5 whitespace-nowrap border border-border bg-card text-foreground/80 hover:bg-muted/60 transition-colors"
                  >
                    <ActiveIcon className="size-4 shrink-0 text-primary" />
                    <span className="text-[11px] font-body font-medium leading-none whitespace-nowrap">
                      {viewMeta[activeView].label}
                    </span>
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48">
                  {viableConsumer && (
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
                  {isBrand && (
                    <DropdownMenuItem
                      onClick={() => navigate(viewMeta.brand.to)}
                      className={activeView === "brand" ? "bg-primary/10 text-primary" : ""}
                    >
                      <Store className="size-4 mr-2" /> Brand
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
            {activeView === "consumer" && canUpgrade && !hasPlus && !isOnboarding && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Upgrade to STRAND+"
                      onClick={() => navigate("/plus/upgrade")}
                      className="h-9 pl-3 pr-2 rounded-full flex items-center gap-1.5 bg-brown text-brown-foreground border border-brown hover:opacity-90 transition-opacity shrink-0"
                    >
                      <span className="text-[11px] font-body font-bold tracking-wide uppercase">Upgrade</span>
                      <span className="size-4 rounded-full bg-brown-foreground/20 flex items-center justify-center text-[11px] font-body font-bold leading-none">+</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    <span>Upgrade to STRAND+</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!lockedPro && (
            <button
              type="button"
              aria-label="Open menu"
              data-tour="global-menu"
              onClick={() => setOpen(true)}
              className="size-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 transition-colors shrink-0"
            >
              <Menu className="size-5" />
            </button>
            )}
          </div>

        </div>
      {activeView === "consumer" && showTipsStrip && <GlobalTipsDensityStrip />}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[280px] p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b">
            <SheetTitle className="font-display text-xl">
              {showDirectory ? "Everything in STRAND" : "Menu"}
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto py-2">
            {!isOnboarding && activeView === "consumer" && hasPlus && (
              <div className="mx-3 mb-3 rounded-[14px] border-2 border-primary/60 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent overflow-hidden">
                <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5">
                  <PlusSparkles className="size-3.5 text-primary" />
                  <span className="text-[10px] uppercase tracking-[0.22em] font-body font-bold text-primary">
                    STRAND+ Member
                  </span>
                </div>
                {PLUS_NAV.map(({ label, to, icon: Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return (
                    <button
                      key={to}
                      onClick={() => go(to)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-body transition-colors ${
                        active ? "bg-primary/20 text-primary" : "text-foreground/85 hover:bg-primary/10"
                      }`}
                    >
                      <Icon className="size-4 text-primary" />
                      <span className="flex-1">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {showDirectory ? (
              <FeatureDirectory
                onNavigate={() => setOpen(false)}
                onSignOut={async () => {
                  setOpen(false);
                  try {
                    await signOut();
                    navigate("/");
                  } catch (e) {
                    console.error("[sign out] failed", e);
                    toast.error("Sign out failed — check your connection and try again.");
                  }
                }}
                onSwitchView={
                  showViewSwitcher
                    ? () => {
                        // Head for the first other account view this user holds.
                        const alt = isProfessional
                          ? viewMeta.pro.to
                          : isBrand
                            ? viewMeta.brand.to
                            : isAdmin
                              ? viewMeta.admin.to
                              : viewMeta.consumer.to;
                        navigate(alt);
                      }
                    : undefined
                }
              />
            ) : (
              !isOnboarding &&
              navItems.map(({ label, to, icon: Icon, badge }) => {
                const active =
                  to === "/home" || to === "/pro" || to === "/admin" || to === "/brand"
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
              })
            )}

          </nav>
          {showViewSwitcher && (
            <div className="border-t p-3 space-y-1">
              <p className="px-3 pb-1 text-[10px] uppercase tracking-wider font-body font-semibold text-muted-foreground">
                Switch view
              </p>
              {viableConsumer && activeView !== "consumer" && (isAdmin || activeView !== "pro") && (
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
              {isBrand && activeView !== "brand" && (
                <button
                  onClick={() => go(viewMeta.brand.to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body hover:bg-muted/50 transition-colors"
                >
                  <Store className="size-4" />
                  <span>Brand</span>
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
                try {
                  await signOut();
                  navigate("/");
                } catch (e) {
                  console.error("[sign out] failed", e);
                  toast.error("Sign out failed — check your connection and try again.");
                }
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
