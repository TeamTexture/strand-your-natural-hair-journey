import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, type ReactNode } from "react";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { lazyRetry } from "@/lib/lazyRetry";
import { isTransientAuthLockError } from "@/lib/retryQuery";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";
import UrlScanProgressOverlay from "@/components/product/UrlScanProgressOverlay";
import { AuthProvider } from "@/hooks/useAuth";
import { ViewAsProvider } from "@/hooks/useViewAs";
import RequireAuth from "@/components/RequireAuth";
import PaidGate from "@/components/PaidGate";
import OnboardingGate from "@/components/OnboardingGate";
import TrialWall from "@/components/TrialWall";
import RoleGate from "./components/RoleGate";
import ProSubGate from "./components/ProSubGate";
import ProProfileGate from "./components/ProProfileGate";
import GlobalMenu from "@/components/GlobalMenu";
import HomeTour from "@/components/HomeTour";
import WelcomeVoicenotePopup from "@/components/WelcomeVoicenotePopup";
import AccessRestrictedGate from "@/components/AccessRestrictedGate";
import BrandPaywallGate from "@/components/BrandPaywallGate";
import BrandSubGate from "@/components/BrandSubGate";
import ConsentGate from "@/components/ConsentGate";
import { BackButtonProvider } from "@/components/BackButtonContext";
import MessageNotifications from "@/components/MessageNotifications";
import NewEnquiriesAlert from "@/components/pro/NewEnquiriesAlert";
import BookingReturnPrompt from "@/components/booking/BookingReturnPrompt";
import { useKeyboardAwareInputs } from "@/hooks/useKeyboardAwareInputs";
import { useTrackInAppHistory } from "@/hooks/useTrackInAppHistory";
import { useResponsiveTipRefresh } from "@/hooks/useResponsiveTipRefresh";
import { isChromeFreeRoute } from "@/lib/chromeFreeRoutes";

import { TipsLevelProvider } from "@/hooks/useTipsLevel";
import { IngredientSheetProvider } from "@/components/ingredients/IngredientToken";

// Eager: entry + 404 (tiny, always likely to hit)
import Index from "./pages/Index.tsx";
import InternationalGate from "./components/InternationalGate.tsx";
import NotFound from "./pages/NotFound.tsx";

// Everything else is lazy — each page becomes its own async chunk so the
// initial JS payload only contains the shell + splash. This is a large,
// low-risk perf win on cold loads (mobile in particular).
const Auth = lazyRetry(() => import("./pages/Auth"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const OpenMessage = lazyRetry(() => import("./pages/OpenMessage"));

const SetupGuide = lazyRetry(() => import("./pages/SetupGuide"));
const Walkthrough = lazyRetry(() => import("./pages/Walkthrough"));
const OAuthConsent = lazyRetry(() => import("./pages/OAuthConsent"));
const Legal = lazyRetry(() => import("./pages/Legal"));

// Onboarding
const GoalAndChallenge = lazyRetry(() => import("./pages/onboarding/GoalAndChallenge"));
const ProfileStep1 = lazyRetry(() => import("./pages/onboarding/ProfileStep1"));
const Acquisition = lazyRetry(() => import("./pages/onboarding/Acquisition"));
const ProfileStep2 = lazyRetry(() => import("./pages/onboarding/ProfileStep2"));
const ProfileSupplements = lazyRetry(() => import("./pages/onboarding/ProfileSupplements"));
const ProfileStep3Hair = lazyRetry(() => import("./pages/onboarding/ProfileStep3Hair"));
const ProfileStep4Colour = lazyRetry(() => import("./pages/onboarding/ProfileStep4Colour"));
const BloodTiming = lazyRetry(() => import("./pages/onboarding/BloodTiming"));
const ResumeOnboarding = lazyRetry(() => import("./pages/onboarding/ResumeOnboarding"));
const BloodIronVitamins = lazyRetry(() => import("./pages/onboarding/BloodIronVitamins"));
const BloodMinerals = lazyRetry(() => import("./pages/onboarding/BloodMinerals"));
const BloodThyroid = lazyRetry(() => import("./pages/onboarding/BloodThyroid"));
const BloodHormones = lazyRetry(() => import("./pages/onboarding/BloodHormones"));
const BloodAiSummary = lazyRetry(() => import("./pages/onboarding/BloodAiSummary"));
const SuccessScreen = lazyRetry(() => import("./pages/onboarding/SuccessScreen"));
const ProfileStepPhotos = lazyRetry(() => import("./pages/onboarding/ProfileStepPhotos"));

// Profile / blood / misc
const MilestoneGallery = lazyRetry(() => import("./pages/MilestoneGallery"));
const TreatmentPlanBuilder = lazyRetry(() => import("./pages/treatment/TreatmentPlanBuilder"));
const TreatmentPlanDetail = lazyRetry(() => import("./pages/treatment/TreatmentPlanDetail"));
const TreatmentProgress = lazyRetry(() => import("./pages/treatment/TreatmentProgress"));
const TreatmentCheckin = lazyRetry(() => import("./pages/treatment/TreatmentCheckin"));
const TreatmentInvitation = lazyRetry(() => import("./pages/treatment/TreatmentInvitation"));
const TreatmentShareInvitation = lazyRetry(() => import("./pages/treatment/TreatmentShareInvitation"));

const ProTreatmentClients = lazyRetry(() => import("./pages/pro/ProTreatmentClients"));
const ProTreatmentTemplate = lazyRetry(() => import("./pages/pro/ProTreatmentTemplate"));
const ProTreatmentCheckin = lazyRetry(() => import("./pages/pro/ProTreatmentCheckin"));

const Discounts = lazyRetry(() => import("./pages/Discounts"));
const BloodHistory = lazyRetry(() => import("./pages/BloodHistory"));
const BloodUpload = lazyRetry(() => import("./pages/BloodUpload"));
const BloodPanelReview = lazyRetry(() => import("./pages/BloodPanelReview"));
const PersonalDetailsReview = lazyRetry(() => import("./pages/profile-review/PersonalDetails"));
const HealthReview = lazyRetry(() => import("./pages/profile-review/HealthReview"));
const HairReview = lazyRetry(() => import("./pages/profile-review/HairReview"));
const ColourReview = lazyRetry(() => import("./pages/profile-review/ColourReview"));

// Pro portal
const ProApply = lazyRetry(() => import("./pages/pro/ProApply"));
const ProAuth = lazyRetry(() => import("./pages/pro/ProAuth"));
const ProForgotPassword = lazyRetry(() => import("./pages/pro/ProForgotPassword"));
const ProResetPassword = lazyRetry(() => import("./pages/pro/ProResetPassword"));
const ProLanding = lazyRetry(() => import("./pages/pro/ProLanding"));
const ProWelcome = lazyRetry(() => import("./pages/pro/ProWelcome"));
const ProDashboard = lazyRetry(() => import("./pages/pro/ProDashboard"));
const ProSetup = lazyRetry(() => import("./pages/pro/ProSetup"));
const ProUnderReview = lazyRetry(() => import("./pages/pro/ProUnderReview"));
const ProProfile = lazyRetry(() => import("./pages/pro/ProProfile"));
const ProOffers = lazyRetry(() => import("./pages/pro/ProOffers"));
const ProSalonStylists = lazyRetry(() => import("./pages/pro/ProSalonStylists"));
const ProBilling = lazyRetry(() => import("./pages/pro/ProBilling"));
const ProEnquiries = lazyRetry(() => import("./pages/pro/ProEnquiries"));
const ProAppointments = lazyRetry(() => import("./pages/pro/ProAppointments"));
const ProLogAppointment = lazyRetry(() => import("./pages/pro/ProLogAppointment"));
const ProClientPassport = lazyRetry(() => import("./pages/pro/ProClientPassport"));
const ProClients = lazyRetry(() => import("./pages/pro/ProClients"));
const ProPastClient = lazyRetry(() => import("./pages/pro/ProPastClient"));

// Consumer messaging / data
const MyEnquiries = lazyRetry(() => import("./pages/MyEnquiries"));
const Messages = lazyRetry(() => import("./pages/Messages"));
const ChatThreadPage = lazyRetry(() => import("./pages/ChatThreadPage"));
const DataAccess = lazyRetry(() => import("./pages/DataAccess"));
const PersonalisedOffers = lazyRetry(() => import("./pages/PersonalisedOffers"));
const PassportVisibility = lazyRetry(() => import("./pages/PassportVisibility"));
const PassportPreview = lazyRetry(() => import("./pages/PassportPreview"));
const EmailPreferences = lazyRetry(() => import("./pages/EmailPreferences"));
const DataProtectionComplaint = lazyRetry(() => import("./pages/DataProtectionComplaint"));
const AdminDataProtection = lazyRetry(() => import("./pages/admin/AdminDataProtection"));

// Admin
const AdminApplications = lazyRetry(() => import("./pages/admin/AdminApplications"));
const AdminAudit = lazyRetry(() => import("./pages/admin/AdminAudit"));
const AdminTipGrounding = lazyRetry(() => import("./pages/admin/AdminTipGrounding"));
const AdminScoreDebug = lazyRetry(() => import("./pages/admin/AdminScoreDebug"));

const AdminAuthorClarifications = lazyRetry(() => import("./pages/admin/AdminAuthorClarifications"));


const AdminHub = lazyRetry(() => import("./pages/admin/AdminHub"));
const AdminMembers = lazyRetry(() => import("./pages/admin/AdminMembers"));
const AdminInternational = lazyRetry(() => import("./pages/admin/AdminInternational"));
const AdminMemberPassport = lazyRetry(() => import("./pages/admin/AdminMemberPassport"));
const AdminSettings = lazyRetry(() => import("./pages/admin/AdminSettings"));
const AdminProfessionals = lazyRetry(() => import("./pages/admin/AdminProfessionals"));
const AdminProReviews = lazyRetry(() => import("./pages/admin/AdminProReviews"));
const AdminReferrals = lazyRetry(() => import("./pages/admin/AdminReferrals"));
const AdminViewAs = lazyRetry(() => import("./pages/admin/AdminViewAs"));
const AdminBrands = lazyRetry(() => import("./pages/admin/AdminBrands"));
const AdminBrandEdit = lazyRetry(() => import("./pages/admin/AdminBrandEdit"));
const AdminTreatment = lazyRetry(() => import("./pages/admin/AdminTreatment"));
const AdminTreatmentTemplate = lazyRetry(() => import("./pages/admin/AdminTreatmentTemplate"));
const AdminTreatmentPlan = lazyRetry(() => import("./pages/admin/AdminTreatmentPlan"));
const AdminMessages = lazyRetry(() => import("./pages/admin/AdminMessages"));
const AdminMemberMessages = lazyRetry(() => import("./pages/admin/AdminMemberMessages"));
const AdminBroadcast = lazyRetry(() => import("./pages/admin/AdminBroadcast"));
const AdminWelcomeVoicenote = lazyRetry(() => import("./pages/admin/AdminWelcomeVoicenote"));
const AdminBrandOffers = lazyRetry(() => import("./pages/admin/AdminBrandOffers"));
const AdminShelfReview = lazyRetry(() => import("./pages/admin/AdminShelfReview"));
const AdminBrandCalendar = lazyRetry(() => import("./pages/admin/AdminBrandCalendar"));
const AdminBrandOfferReview = lazyRetry(() => import("./pages/admin/AdminBrandOfferReview"));
const AdminModeration = lazyRetry(() => import("./pages/admin/AdminModeration"));
const AdminLibrary = lazyRetry(() => import("./pages/admin/AdminLibrary"));
const AdminEvents = lazyRetry(() => import("./pages/admin/AdminEvents"));
const AdminBloodVendors = lazyRetry(() => import("./pages/admin/AdminBloodVendors"));
const AdminSalons = lazyRetry(() => import("./pages/admin/AdminSalons"));

const AdminCapabilities = lazyRetry(() => import("./pages/admin/AdminCapabilities"));
const AdminCuratedOffers = lazyRetry(() => import("./pages/admin/AdminCuratedOffers"));


// Brand
const BrandAuth = lazyRetry(() => import("./pages/brand/BrandAuth"));
const BrandForgotPassword = lazyRetry(() => import("./pages/brand/BrandForgotPassword"));
const BrandResetPassword = lazyRetry(() => import("./pages/brand/BrandResetPassword"));
const BrandDashboard = lazyRetry(() => import("./pages/brand/BrandDashboard"));
const BrandCreateOffer = lazyRetry(() => import("./pages/brand/BrandCreateOffer"));
const BrandOfferDetail = lazyRetry(() => import("./pages/brand/BrandOfferDetail"));
const BrandExtendOffer = lazyRetry(() => import("./pages/brand/BrandExtendOffer"));
const BrandTagsReceived = lazyRetry(() => import("./pages/brand/BrandTagsReceived"));
const BrandCheckoutSuccess = lazyRetry(() => import("./pages/brand/BrandCheckoutSuccess"));
const BrandSubscribe = lazyRetry(() => import("./pages/brand/BrandSubscribe"));
const BrandBilling = lazyRetry(() => import("./pages/brand/BrandBilling"));
const BrandProfileEditor = lazyRetry(() => import("./pages/brand/BrandProfileEditor"));
const BrandShelf = lazyRetry(() => import("./pages/brand/BrandShelf"));
const BrandShelfProduct = lazyRetry(() => import("./pages/brand/BrandShelfProduct"));
const BrandProductScanning = lazyRetry(() => import("./pages/brand/BrandProductScanning"));
const OfferPage = lazyRetry(() => import("./pages/OfferPage"));
const BrandProductPage = lazyRetry(() => import("./pages/BrandProductPage"));
const BrandsDirectory = lazyRetry(() => import("./pages/BrandsDirectory"));
const BrandDetailPage = lazyRetry(() => import("./pages/BrandDetailPage"));
const BrandShelfProductOpen = lazyRetry(() => import("./pages/BrandShelfProductOpen"));
const Subscribe = lazyRetry(() => import("./pages/Subscribe"));
const TrialPaywall = lazyRetry(() => import("./pages/TrialPaywall"));

// Main app
const Home = lazyRetry(() => import("./pages/Home"));
const SetCurrentStyle = lazyRetry(() => import("./pages/SetCurrentStyle"));
const WashDayHub = lazyRetry(() => import("./pages/WashDayHub"));
const WashDayDetail = lazyRetry(() => import("./pages/WashDayDetail"));
const WashLogSteps = lazyRetry(() => import("./pages/wash/WashLogSteps"));
const WashLogStyle = lazyRetry(() => import("./pages/wash/WashLogStyle"));
const WashFavourites = lazyRetry(() => import("./pages/wash/WashFavourites"));
const WashStep1 = lazyRetry(() => import("./pages/wash/WashStep1"));
const WashStep2 = lazyRetry(() => import("./pages/wash/WashStep2"));
const WashStep3 = lazyRetry(() => import("./pages/wash/WashStep3"));
const WashStepStyling = lazyRetry(() => import("./pages/wash/WashStepStyling"));
const WashStep4 = lazyRetry(() => import("./pages/wash/WashStep4"));
const Products = lazyRetry(() => import("./pages/Products"));
const IngredientDetail = lazyRetry(() => import("./pages/IngredientDetail"));
const Wishlist = lazyRetry(() => import("./pages/Wishlist"));
const Favourites = lazyRetry(() => import("./pages/Favourites"));
const OffShelf = lazyRetry(() => import("./pages/OffShelf"));
const Avoidlist = lazyRetry(() => import("./pages/Avoidlist"));
const ProductScanning = lazyRetry(() => import("./pages/ProductScanning"));
const AddHomemadeProduct = lazyRetry(() => import("./pages/AddHomemadeProduct"));
const ProductProfileRedirect = lazyRetry(() => import("./pages/ProductProfileRedirect"));
const ToolProfile = lazyRetry(() => import("./pages/ToolProfile"));
const ProductRepository = lazyRetry(() => import("./pages/ProductRepository"));
const BrandProducts = lazyRetry(() => import("./pages/BrandProducts"));
const ProductsByIngredient = lazyRetry(() => import("./pages/ProductsByIngredient"));
const IngredientResearch = lazyRetry(() => import("./pages/IngredientResearch"));
const Journal = lazyRetry(() => import("./pages/Journal"));
const StyleRecord = lazyRetry(() => import("./pages/StyleRecord"));
const MoodboardList = lazyRetry(() => import("./pages/MoodboardList"));
const MoodboardBoard = lazyRetry(() => import("./pages/MoodboardBoard"));
const Appointments = lazyRetry(() => import("./pages/Appointments"));
const LeaveReview = lazyRetry(() => import("./pages/LeaveReview"));
const LogAppointment = lazyRetry(() => import("./pages/LogAppointment"));
const ProReviews = lazyRetry(() => import("./pages/pro/ProReviews"));
const ProReviewsPublic = lazyRetry(() => import("./pages/ProReviewsPublic"));
const Directory = lazyRetry(() => import("./pages/Directory"));
const Profile = lazyRetry(() => import("./pages/Profile"));
const NutritionPlan = lazyRetry(() => import("./pages/NutritionPlan"));
const Help = lazyRetry(() => import("./pages/Help"));
const Contact = lazyRetry(() => import("./pages/Contact"));

// STRAND+
import PlusGate from "./components/PlusGate";

const PlusUpgrade = lazyRetry(() => import("./pages/PlusUpgrade"));
const PlusWelcome = lazyRetry(() => import("./pages/PlusWelcome"));
const Forum = lazyRetry(() => import("./pages/Forum"));
const ForumNewThread = lazyRetry(() => import("./pages/ForumNewThread"));
const ForumThread = lazyRetry(() => import("./pages/ForumThread"));
const ForumTag = lazyRetry(() => import("./pages/ForumTag"));
const MemberProfile = lazyRetry(() => import("./pages/MemberProfile"));
const PlusLibrary = lazyRetry(() => import("./pages/PlusLibrary"));
const PlusLibraryCollection = lazyRetry(() => import("./pages/PlusLibraryCollection"));
const PlusEvents = lazyRetry(() => import("./pages/PlusEvents"));
const PlusEventDetail = lazyRetry(() => import("./pages/PlusEventDetail"));
const PlusTickets = lazyRetry(() => import("./pages/PlusTickets"));

// Global react-query defaults — Home (and every other screen) relies on
// queries NOT quietly refetching under the user while they're reading. Any
// hook that legitimately needs polling or focus-refresh opts in explicitly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      // When many queries fire at once the auth token lock can be "stolen",
      // aborting in-flight requests and leaving sections blank. Retry those.
      retry: (failureCount, error) =>
        failureCount < 3 && isTransientAuthLockError(error),
      retryDelay: (attempt) => 150 * (attempt + 1),
    },
  },
});


// Helper to wrap protected routes.
// <TrialWall> sits OUTSIDE the membership/onboarding gates on purpose: a member
// stamped into the trial funnel must be returned to the paywall, not handed to
// the older /subscribe redirects, and cannot reach ANY screen outside the
// paywall allowlist — onboarding steps included.
const Protected = ({ children }: { children: React.ReactNode }) => (
  <RequireAuth><TrialWall>{children}</TrialWall></RequireAuth>
);
const Paid = ({ children }: { children: React.ReactNode }) => (
  <RequireAuth><TrialWall><PaidGate>{children}</PaidGate></TrialWall></RequireAuth>
);
const Onboard = ({ children }: { children: React.ReactNode }) => (
  <RequireAuth><TrialWall><OnboardingGate>{children}</OnboardingGate></TrialWall></RequireAuth>
);

// Suspense fallback that matches the app's warm-sand shell so it never
// flashes white during a chunk fetch on slow mobile networks.
const RouteFallback = () => (
  <div
    className="flex-1 flex items-center justify-center bg-background"
    aria-live="polite"
    aria-busy="true"
  >
    <span className="sr-only">Loading…</span>
    <span className="block size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
  </div>
);

// Mounts global side-effects (e.g. keyboard-aware input scrolling) inside the
// React tree so they're active for every screen in the app.
const GlobalEffects = () => {
  useKeyboardAwareInputs();
  useTrackInAppHistory();
  useResponsiveTipRefresh();
  return null;
};

// These components can surface names, message previews, professional enquiries,
// or booking controls. Do not merely hide their DOM: keep them unmounted so
// they cannot query, subscribe, or open over registration/onboarding/paywalls.
const AuthenticatedAppOverlays = () => {
  const location = useLocation();
  if (isChromeFreeRoute(location.pathname)) return null;
  return (
    <>
      <MessageNotifications />
      <NewEnquiriesAlert />
      <BookingReturnPrompt />
    </>
  );
};

// Resets the crash boundary on navigation so a broken screen never sticks.
const RouteCrashGuard = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return <RouteErrorBoundary resetKey={location.pathname}>{children}</RouteErrorBoundary>;
};


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ViewAsProvider>
        <AuthProvider>
          <TipsLevelProvider>
          <IngredientSheetProvider>
          <BackButtonProvider>
            <GlobalEffects />
            <AuthenticatedAppOverlays />
            <PhoneShell>
              <div className="flex flex-col h-full">
                <GlobalMenu />
                <div className="flex-1 min-h-0 overflow-y-auto">

                <AccessRestrictedGate>
                <BrandPaywallGate>
                <InternationalGate>
                <TrialWall>
                <ConsentGate>
                <RouteCrashGuard>
                <Suspense fallback={<RouteFallback />}>
                <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/setup" element={<Onboard><SetupGuide /></Onboard>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              {/* Public landing for admin broadcast emails — resolves state, then forwards. */}
              <Route path="/open" element={<OpenMessage />} />
              <Route path="/legal/:doc" element={<Legal />} />
              <Route path="/walkthrough" element={<Onboard><Walkthrough /></Onboard>} />
              

              {/* Onboarding (auth required so data persists) */}
              <Route path="/onboarding/goal" element={<Onboard><GoalAndChallenge /></Onboard>} />
              <Route path="/onboarding/profile-step-1" element={<Onboard><ProfileStep1 /></Onboard>} />
              <Route path="/onboarding/acquisition" element={<Onboard><Acquisition /></Onboard>} />
              <Route path="/onboarding/profile-step-2" element={<Onboard><ProfileStep2 /></Onboard>} />
              <Route path="/onboarding/profile-supplements" element={<Onboard><ProfileSupplements /></Onboard>} />
              {/* The professional-consultation stage was removed from onboarding.
                  Members parked on those paths (bookmark, email link, stale
                  saved step) land on the hair characteristics form instead of a
                  dead route. */}
              <Route path="/onboarding/pro-gate" element={<Navigate to="/onboarding/profile-step-3-hair" replace />} />
              <Route path="/onboarding/pro-book" element={<Navigate to="/onboarding/profile-step-3-hair" replace />} />
              <Route path="/onboarding/pro-details" element={<Navigate to="/onboarding/profile-step-3-hair" replace />} />
              <Route path="/onboarding/profile-step-3-hair" element={<Onboard><ProfileStep3Hair /></Onboard>} />
              <Route path="/onboarding/profile-step-4-colour" element={<Onboard><ProfileStep4Colour /></Onboard>} />
              <Route path="/onboarding/resume" element={<Onboard><ResumeOnboarding /></Onboard>} />
              <Route path="/onboarding/blood-timing" element={<Onboard><BloodTiming /></Onboard>} />
              <Route path="/onboarding/blood-iron-vitamins" element={<Onboard><BloodIronVitamins /></Onboard>} />
              <Route path="/onboarding/blood-minerals" element={<Onboard><BloodMinerals /></Onboard>} />
              <Route path="/onboarding/blood-thyroid" element={<Onboard><BloodThyroid /></Onboard>} />
              <Route path="/onboarding/blood-hormones" element={<Onboard><BloodHormones /></Onboard>} />
              <Route path="/onboarding/blood-ai-summary" element={<Onboard><BloodAiSummary /></Onboard>} />
              <Route path="/onboarding/photos" element={<Onboard><ProfileStepPhotos /></Onboard>} />
              <Route path="/onboarding/success" element={<Onboard><SuccessScreen /></Onboard>} />

              {/* Main app */}
              <Route path="/home" element={<Paid><Home /></Paid>} />
              <Route path="/profile/personal" element={<Paid><PersonalDetailsReview /></Paid>} />
              <Route path="/profile/health" element={<Paid><HealthReview /></Paid>} />
              <Route path="/profile/hair" element={<Paid><HairReview /></Paid>} />
              <Route path="/profile/colour" element={<Paid><ColourReview /></Paid>} />

              <Route path="/home/style" element={<Paid><SetCurrentStyle /></Paid>} />
              <Route path="/wash-day" element={<Paid><WashDayHub /></Paid>} />
              <Route path="/wash-day/:id" element={<Paid><WashDayDetail /></Paid>} />
              <Route path="/wash/log" element={<Paid><WashLogSteps /></Paid>} />
              <Route path="/wash/log/style" element={<Paid><WashLogStyle /></Paid>} />
              <Route path="/wash/favourites" element={<Paid><WashFavourites /></Paid>} />
              <Route path="/wash/step-1" element={<Paid><WashStep1 /></Paid>} />
              <Route path="/wash/step-2" element={<Paid><WashStep2 /></Paid>} />
              <Route path="/wash/step-3" element={<Paid><WashStep3 /></Paid>} />
              <Route path="/wash/step-styling" element={<Paid><WashStepStyling /></Paid>} />
              <Route path="/wash/step-4" element={<Paid><WashStep4 /></Paid>} />
              <Route path="/products" element={<Paid><Products /></Paid>} />
              <Route path="/products/ingredient" element={<Paid><IngredientDetail /></Paid>} />
              <Route path="/products/wishlist" element={<Paid><Wishlist /></Paid>} />
              <Route path="/products/favourites" element={<Paid><Favourites /></Paid>} />
              <Route path="/products/off-shelf" element={<Paid><OffShelf /></Paid>} />
              <Route path="/products/avoidlist" element={<Paid><Avoidlist /></Paid>} />
              <Route path="/products/scanning" element={<Paid><ProductScanning /></Paid>} />
              <Route path="/products/homemade/new" element={<Paid><AddHomemadeProduct /></Paid>} />
              <Route path="/products/repository" element={<Paid><ProductRepository /></Paid>} />
              <Route path="/products/profile/:id" element={<Paid><ProductProfileRedirect /></Paid>} />
              <Route path="/tools/:id" element={<Paid><ToolProfile /></Paid>} />
              <Route path="/products/brand/:brand" element={<Paid><BrandProducts /></Paid>} />
              <Route path="/products/by-ingredient" element={<Paid><ProductsByIngredient /></Paid>} />
               <Route path="/products/ingredient-research" element={<Paid><IngredientResearch /></Paid>} />
               <Route path="/treatment/new" element={<Paid><PlusGate title="Treatment plans"><TreatmentPlanBuilder /></PlusGate></Paid>} />
               <Route path="/treatment/:id" element={<Paid><TreatmentPlanDetail /></Paid>} />
               <Route path="/treatment/:id/progress" element={<Paid><TreatmentProgress /></Paid>} />
               <Route path="/treatment/:id/checkin/:week" element={<Paid><TreatmentCheckin /></Paid>} />
               <Route path="/treatment/:id/checkin" element={<Paid><TreatmentCheckin /></Paid>} />
               <Route path="/treatment/invitation/:assignmentId" element={<Protected><TreatmentInvitation /></Protected>} />
               <Route path="/treatment/share/:shareId" element={<Protected><TreatmentShareInvitation /></Protected>} />

               <Route path="/journal" element={<Paid><Journal /></Paid>} />

              <Route path="/journal/entry/:id" element={<Paid><StyleRecord /></Paid>} />
              <Route path="/journal/moodboards" element={<Paid><MoodboardList /></Paid>} />
              <Route path="/journal/moodboards/:id" element={<Paid><MoodboardBoard /></Paid>} />
              <Route path="/appointments" element={<Paid><Appointments /></Paid>} />
              <Route path="/appointments/log" element={<Paid><LogAppointment /></Paid>} />
              <Route path="/reviews/new" element={<Paid><LeaveReview /></Paid>} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/directory/:proUserId/reviews" element={<ProReviewsPublic />} />
              <Route
                path="/pro/reviews"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProReviews />
                  </RoleGate>
                }
              />
              <Route path="/profile" element={<Paid><Profile /></Paid>} />
              <Route path="/profile/milestones" element={<Paid><MilestoneGallery /></Paid>} />
              <Route path="/profile/discounts" element={<Paid><Discounts /></Paid>} />
              <Route path="/blood-history" element={<Paid><BloodHistory /></Paid>} />
              {/* Part of the onboarding capture flow (?onboarding=1) — stays pre-payment. */}
              <Route path="/blood-upload" element={<Onboard><BloodUpload /></Onboard>} />
              <Route path="/blood-panel/:id" element={<Paid><BloodPanelReview /></Paid>} />


              <Route path="/nutrition-plan" element={<Paid><NutritionPlan /></Paid>} />
              <Route path="/help" element={<Protected><Help /></Protected>} />
              <Route path="/contact" element={<Protected><Contact /></Protected>} />
              {/* Public on purpose — non-members have the same statutory right to complain. */}
              <Route path="/data-protection-complaint" element={<DataProtectionComplaint />} />

              {/* Professional portal (Phase A/B — application + admin vetting) */}
              <Route path="/pro/auth" element={<ProAuth />} />
              <Route path="/pro/forgot-password" element={<ProForgotPassword />} />
              <Route path="/pro/reset-password" element={<ProResetPassword />} />
              <Route path="/pro/landing" element={<Protected><ProLanding /></Protected>} />
              <Route path="/pro/apply" element={<Protected><ProApply /></Protected>} />
              <Route path="/pro/welcome" element={<Protected><ProWelcome /></Protected>} />
              {/* Mandatory profile setup + review holding screen (not profile-gated) */}
              <Route
                path="/pro/setup"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProSetup /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/under-review"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProUnderReview /></ProSubGate>
                  </RoleGate>
                }
              />
              {/* Professional portal — dashboard gated behind an active subscription */}
              <Route
                path="/pro"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProDashboard /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/profile"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProProfile /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/salon"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProSalonStylists /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/offers"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProOffers /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />

              <Route
                path="/pro/billing"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProBilling />
                  </RoleGate>
                }
              />
              <Route
                path="/pro/enquiries"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProEnquiries /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/appointments"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProAppointments /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />

              <Route
                path="/pro/appointments/log"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProLogAppointment /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />

              <Route
                path="/pro/clients"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProClients /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/clients/:consumerId/past"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProPastClient /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/clients/:consumerId"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProClientPassport /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/treatment"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProTreatmentClients /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/treatment/templates/:id"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProTreatmentTemplate /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/treatment/plan/:planId/week/:week"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfileGate><ProTreatmentCheckin /></ProProfileGate></ProSubGate>
                  </RoleGate>
                }
              />



              <Route path="/profile/enquiries" element={<Paid><MyEnquiries /></Paid>} />
              <Route path="/messages" element={<Protected><Messages /></Protected>} />
              <Route path="/messages/:threadId" element={<Protected><ChatThreadPage /></Protected>} />
              <Route path="/profile/data-access" element={<Protected><DataAccess /></Protected>} />
              <Route path="/profile/passport-visibility" element={<Protected><PassportVisibility /></Protected>} />
              <Route path="/profile/passport-preview" element={<Protected><PassportPreview /></Protected>} />
              <Route path="/profile/personalised-offers" element={<Protected><PersonalisedOffers /></Protected>} />
              <Route path="/email-preferences" element={<Protected><EmailPreferences /></Protected>} />

              <Route
                path="/admin"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminHub />
                  </RoleGate>
                }
              />
              <Route
                path="/admin/applications"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminApplications />
                  </RoleGate>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminAudit />
                  </RoleGate>
                }
              />
              <Route
                path="/admin/tip-grounding"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminTipGrounding />
                  </RoleGate>
                }
              />
              <Route
                path="/admin/score-debug"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminScoreDebug />
                  </RoleGate>
                }
              />

              <Route
                path="/admin/clarifications"
                element={
                  <RoleGate allow={["admin"]}>
                    <AdminAuthorClarifications />
                  </RoleGate>
                }
              />




              <Route path="/subscribe" element={<Protected><Subscribe /></Protected>} />
              {/* 3-day free trial paywall — auth only, deliberately outside the
                  onboarding and paywall gates so an abandoned trial can always
                  be reopened without hitting a redirect loop. */}
              <Route path="/start-trial" element={<Protected><TrialPaywall /></Protected>} />
              <Route path="/admin/international" element={<RoleGate allow={["admin"]}><AdminInternational /></RoleGate>} />
              <Route path="/admin/members" element={<RoleGate allow={["admin"]}><AdminMembers /></RoleGate>} />
              <Route path="/admin/members/:userId/passport" element={<RoleGate allow={["admin"]}><AdminMemberPassport /></RoleGate>} />
              <Route path="/admin/settings" element={<RoleGate allow={["admin"]}><AdminSettings /></RoleGate>} />
              <Route path="/admin/professionals" element={<RoleGate allow={["admin"]}><AdminProfessionals /></RoleGate>} />
              <Route path="/admin/capabilities" element={<RoleGate allow={["admin"]}><AdminCapabilities /></RoleGate>} />
              <Route path="/admin/curated-offers" element={<RoleGate allow={["admin"]}><AdminCuratedOffers /></RoleGate>} />

              <Route path="/admin/pro-reviews" element={<RoleGate allow={["admin"]}><AdminProReviews /></RoleGate>} />
              <Route path="/admin/referrals" element={<RoleGate allow={["admin"]}><AdminReferrals /></RoleGate>} />
              <Route path="/admin/view-as" element={<RoleGate allow={["admin"]}><AdminViewAs /></RoleGate>} />
              <Route path="/admin/brands" element={<RoleGate allow={["admin"]}><AdminBrands /></RoleGate>} />
              <Route path="/admin/brands/:userId/edit" element={<RoleGate allow={["admin"]}><AdminBrandEdit /></RoleGate>} />
              <Route path="/admin/treatment" element={<RoleGate allow={["admin"]}><AdminTreatment /></RoleGate>} />
              <Route path="/admin/treatment/templates/:id" element={<RoleGate allow={["admin"]}><AdminTreatmentTemplate /></RoleGate>} />
              <Route path="/admin/treatment/plan/:planId" element={<RoleGate allow={["admin"]}><AdminTreatmentPlan /></RoleGate>} />
              <Route path="/admin/shelf-review" element={<RoleGate allow={["admin"]}><AdminShelfReview /></RoleGate>} />

              <Route path="/admin/messages" element={<RoleGate allow={["admin"]}><AdminMessages /></RoleGate>} />
              <Route path="/admin/member-messages" element={<RoleGate allow={["admin"]}><AdminMemberMessages /></RoleGate>} />
              <Route path="/admin/broadcast" element={<RoleGate allow={["admin"]}><AdminBroadcast /></RoleGate>} />
              <Route path="/admin/welcome-voicenote" element={<RoleGate allow={["admin"]}><AdminWelcomeVoicenote /></RoleGate>} />


              {/* Consumer-facing brand directory */}
              <Route path="/brands" element={<Paid><BrandsDirectory /></Paid>} />
              <Route path="/brands/:brandUserId" element={<Paid><BrandDetailPage /></Paid>} />
             <Route path="/brands/:brandUserId/product/:brandProductId" element={<Paid><BrandShelfProductOpen /></Paid>} />
             {/* Brand shelf items with no advert (tools especially) — the add
                 action here writes tools to My Tools and products to the shelf. */}
             <Route path="/brands/:brandUserId/catalogue/:brandProductId" element={<Paid><BrandProductPage /></Paid>} />

              {/* Brand routes */}
              <Route path="/brand/auth" element={<BrandAuth />} />
              <Route path="/brand/forgot-password" element={<BrandForgotPassword />} />
              <Route path="/brand/reset-password" element={<BrandResetPassword />} />
              <Route path="/brand/subscribe" element={<RoleGate allow={["brand", "admin"]}><BrandSubscribe /></RoleGate>} />
              <Route path="/brand/billing" element={<RoleGate allow={["brand", "admin"]}><BrandBilling /></RoleGate>} />
              <Route path="/brand" element={<BrandSubGate><BrandDashboard /></BrandSubGate>} />
              <Route path="/brand/profile" element={<BrandSubGate><BrandProfileEditor /></BrandSubGate>} />
              <Route path="/brand/shelf" element={<BrandSubGate><BrandShelf /></BrandSubGate>} />
              <Route path="/brand/shelf/scanning" element={<BrandSubGate><BrandProductScanning /></BrandSubGate>} />
              <Route path="/brand/shelf/:id" element={<BrandSubGate><BrandShelfProduct /></BrandSubGate>} />

              <Route path="/brand/offers/new" element={<BrandSubGate><BrandCreateOffer /></BrandSubGate>} />
              <Route path="/brand/offers/:id" element={<BrandSubGate><BrandOfferDetail /></BrandSubGate>} />
              <Route path="/brand/offers/:id/edit" element={<BrandSubGate><BrandCreateOffer /></BrandSubGate>} />
              <Route path="/brand/tags" element={<BrandSubGate><BrandTagsReceived /></BrandSubGate>} />
              <Route path="/brand/offers/:id/extend" element={<BrandSubGate><BrandExtendOffer /></BrandSubGate>} />
              <Route path="/brand/checkout/success" element={<RoleGate allow={["brand", "admin"]}><BrandCheckoutSuccess /></RoleGate>} />

              {/* Pro promoted campaigns — reuse the brand pages via URL-based
                   owner mode. Same booking calendar + Stripe flow, gated by
                   the pro subscription instead of the brand annual fee. */}
              <Route path="/pro/campaigns" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><ProProfileGate><BrandDashboard /></ProProfileGate></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/new" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><ProProfileGate><BrandCreateOffer /></ProProfileGate></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><ProProfileGate><BrandOfferDetail /></ProProfileGate></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id/edit" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><ProProfileGate><BrandCreateOffer /></ProProfileGate></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id/extend" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><ProProfileGate><BrandExtendOffer /></ProProfileGate></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/checkout/success" element={<RoleGate allow={["professional", "admin"]}><BrandCheckoutSuccess /></RoleGate>} />

              <Route path="/offers/:id" element={<Paid><OfferPage /></Paid>} />
              <Route path="/offers/:offerId/product/:productId" element={<Paid><BrandProductPage /></Paid>} />

              <Route path="/admin/brand-offers" element={<RoleGate allow={["admin"]}><AdminBrandOffers /></RoleGate>} />
              <Route path="/admin/brand-offers/:id" element={<RoleGate allow={["admin"]}><AdminBrandOfferReview /></RoleGate>} />
              <Route path="/admin/brand-calendar" element={<RoleGate allow={["admin"]}><AdminBrandCalendar /></RoleGate>} />
              <Route path="/admin/moderation" element={<RoleGate allow={["admin"]}><AdminModeration /></RoleGate>} />
              <Route path="/admin/data-protection" element={<RoleGate allow={["admin"]}><AdminDataProtection /></RoleGate>} />
              <Route path="/admin/library" element={<RoleGate allow={["admin"]}><AdminLibrary /></RoleGate>} />
              <Route path="/admin/events" element={<RoleGate allow={["admin"]}><AdminEvents /></RoleGate>} />
              <Route path="/admin/blood-vendors" element={<RoleGate allow={["admin"]}><AdminBloodVendors /></RoleGate>} />
              <Route path="/admin/salons" element={<RoleGate allow={["admin"]}><AdminSalons /></RoleGate>} />
              

              {/* STRAND+ */}
              <Route path="/plus/upgrade" element={<Protected><PlusUpgrade /></Protected>} />
              <Route path="/plus/welcome" element={<Protected><PlusWelcome /></Protected>} />
              <Route path="/forum" element={<Protected><Forum /></Protected>} />
              <Route path="/forum/new" element={<Protected><ForumNewThread /></Protected>} />
              <Route path="/forum/tag/:tag" element={<Protected><ForumTag /></Protected>} />
              <Route path="/forum/:id" element={<Protected><ForumThread /></Protected>} />
              <Route path="/member/:userId" element={<Protected><MemberProfile /></Protected>} />
              <Route path="/plus/library" element={<Protected><PlusLibrary /></Protected>} />
              <Route path="/plus/library/:id" element={<Protected><PlusLibraryCollection /></Protected>} />
              <Route path="/plus/events" element={<Protected><PlusEvents /></Protected>} />
              <Route path="/plus/events/:id" element={<Protected><PlusEventDetail /></Protected>} />
              <Route path="/plus/tickets" element={<Protected><PlusTickets /></Protected>} />


              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}


              <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                </RouteCrashGuard>
                </ConsentGate>
                </TrialWall>
                </InternationalGate>
                </BrandPaywallGate>
                </AccessRestrictedGate>



                </div>
              </div>
              {/* Live wait state for pasted-link product scans — mounted once
                  inside the phone frame so all seven surfaces that can start a
                  link scan share it (src/lib/urlScanProgress.ts). */}
              <UrlScanProgressOverlay />
            </PhoneShell>
            {/* Guided first-run tour — mounted OUTSIDE PhoneShell, which keys
                its children by pathname; inside it, the tour would remount and
                lose its place every time it walked to the next page. */}
            <HomeTour />
            {/* Welcome voice note popup — surfaces once the tour is finished
                or skipped (never on Minimise). Additive to HomeTour. */}
            <WelcomeVoicenotePopup />
          </BackButtonProvider>
          </IngredientSheetProvider>
          </TipsLevelProvider>
        </AuthProvider>
        </ViewAsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
