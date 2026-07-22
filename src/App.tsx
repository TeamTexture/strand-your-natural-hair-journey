import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";
import { AuthProvider } from "@/hooks/useAuth";
import { ViewAsProvider } from "@/hooks/useViewAs";
import RequireAuth from "@/components/RequireAuth";
import PaidGate from "@/components/PaidGate";
import OnboardingGate from "@/components/OnboardingGate";
import RoleGate from "./components/RoleGate";
import ProSubGate from "./components/ProSubGate";
import GlobalMenu from "@/components/GlobalMenu";
import AccessRestrictedGate from "@/components/AccessRestrictedGate";
import { BackButtonProvider } from "@/components/BackButtonContext";
import MessageNotifications from "@/components/MessageNotifications";
import { useKeyboardAwareInputs } from "@/hooks/useKeyboardAwareInputs";
import { useTrackInAppHistory } from "@/hooks/useTrackInAppHistory";

// Eager: entry + 404 (tiny, always likely to hit)
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

// Everything else is lazy — each page becomes its own async chunk so the
// initial JS payload only contains the shell + splash. This is a large,
// low-risk perf win on cold loads (mobile in particular).
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SetupGuide = lazy(() => import("./pages/SetupGuide"));
const Walkthrough = lazy(() => import("./pages/Walkthrough"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));

// Onboarding
const ProfileStep1 = lazy(() => import("./pages/onboarding/ProfileStep1"));
const ProfileStep2 = lazy(() => import("./pages/onboarding/ProfileStep2"));
const ProGate = lazy(() => import("./pages/onboarding/ProGate"));
const ProBook = lazy(() => import("./pages/onboarding/ProBook"));
const ProDetails = lazy(() => import("./pages/onboarding/ProDetails"));
const ProfileStep3Hair = lazy(() => import("./pages/onboarding/ProfileStep3Hair"));
const ProfileStep4Colour = lazy(() => import("./pages/onboarding/ProfileStep4Colour"));
const BloodTiming = lazy(() => import("./pages/onboarding/BloodTiming"));
const BloodIronVitamins = lazy(() => import("./pages/onboarding/BloodIronVitamins"));
const BloodMinerals = lazy(() => import("./pages/onboarding/BloodMinerals"));
const BloodThyroid = lazy(() => import("./pages/onboarding/BloodThyroid"));
const BloodHormones = lazy(() => import("./pages/onboarding/BloodHormones"));
const BloodAiSummary = lazy(() => import("./pages/onboarding/BloodAiSummary"));
const SuccessScreen = lazy(() => import("./pages/onboarding/SuccessScreen"));
const ProfileStepPhotos = lazy(() => import("./pages/onboarding/ProfileStepPhotos"));
const StrandSummary = lazy(() => import("./pages/onboarding/StrandSummary"));

// Profile / blood / misc
const MilestoneGallery = lazy(() => import("./pages/MilestoneGallery"));
const Discounts = lazy(() => import("./pages/Discounts"));
const BloodHistory = lazy(() => import("./pages/BloodHistory"));
const BloodUpload = lazy(() => import("./pages/BloodUpload"));
const BloodPanelReview = lazy(() => import("./pages/BloodPanelReview"));
const PersonalDetailsReview = lazy(() => import("./pages/profile-review/PersonalDetails"));
const HealthReview = lazy(() => import("./pages/profile-review/HealthReview"));
const HairReview = lazy(() => import("./pages/profile-review/HairReview"));
const ColourReview = lazy(() => import("./pages/profile-review/ColourReview"));

// Pro portal
const ProApply = lazy(() => import("./pages/pro/ProApply"));
const ProAuth = lazy(() => import("./pages/pro/ProAuth"));
const ProLanding = lazy(() => import("./pages/pro/ProLanding"));
const ProWelcome = lazy(() => import("./pages/pro/ProWelcome"));
const ProDashboard = lazy(() => import("./pages/pro/ProDashboard"));
const ProProfile = lazy(() => import("./pages/pro/ProProfile"));
const ProOffers = lazy(() => import("./pages/pro/ProOffers"));
const ProBilling = lazy(() => import("./pages/pro/ProBilling"));
const ProEnquiries = lazy(() => import("./pages/pro/ProEnquiries"));
const ProAppointments = lazy(() => import("./pages/pro/ProAppointments"));
const ProClientPassport = lazy(() => import("./pages/pro/ProClientPassport"));
const ProClients = lazy(() => import("./pages/pro/ProClients"));
const ProPastClient = lazy(() => import("./pages/pro/ProPastClient"));

// Consumer messaging / data
const MyEnquiries = lazy(() => import("./pages/MyEnquiries"));
const Messages = lazy(() => import("./pages/Messages"));
const ChatThreadPage = lazy(() => import("./pages/ChatThreadPage"));
const DataAccess = lazy(() => import("./pages/DataAccess"));

// Admin
const AdminApplications = lazy(() => import("./pages/admin/AdminApplications"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const AdminHub = lazy(() => import("./pages/admin/AdminHub"));
const AdminMembers = lazy(() => import("./pages/admin/AdminMembers"));
const AdminMemberPassport = lazy(() => import("./pages/admin/AdminMemberPassport"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminProfessionals = lazy(() => import("./pages/admin/AdminProfessionals"));
const AdminViewAs = lazy(() => import("./pages/admin/AdminViewAs"));
const AdminBrands = lazy(() => import("./pages/admin/AdminBrands"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminBrandOffers = lazy(() => import("./pages/admin/AdminBrandOffers"));
const AdminBrandCalendar = lazy(() => import("./pages/admin/AdminBrandCalendar"));
const AdminBrandOfferReview = lazy(() => import("./pages/admin/AdminBrandOfferReview"));
const AdminModeration = lazy(() => import("./pages/admin/AdminModeration"));
const AdminLibrary = lazy(() => import("./pages/admin/AdminLibrary"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));

// Brand
const BrandAuth = lazy(() => import("./pages/brand/BrandAuth"));
const BrandDashboard = lazy(() => import("./pages/brand/BrandDashboard"));
const BrandCreateOffer = lazy(() => import("./pages/brand/BrandCreateOffer"));
const BrandOfferDetail = lazy(() => import("./pages/brand/BrandOfferDetail"));
const BrandExtendOffer = lazy(() => import("./pages/brand/BrandExtendOffer"));
const BrandCheckoutSuccess = lazy(() => import("./pages/brand/BrandCheckoutSuccess"));
const BrandSubscribe = lazy(() => import("./pages/brand/BrandSubscribe"));
const BrandBilling = lazy(() => import("./pages/brand/BrandBilling"));
const BrandProfileEditor = lazy(() => import("./pages/brand/BrandProfileEditor"));
const OfferPage = lazy(() => import("./pages/OfferPage"));
const BrandProductPage = lazy(() => import("./pages/BrandProductPage"));
const BrandsDirectory = lazy(() => import("./pages/BrandsDirectory"));
const BrandDetailPage = lazy(() => import("./pages/BrandDetailPage"));
const Subscribe = lazy(() => import("./pages/Subscribe"));

// Main app
const Home = lazy(() => import("./pages/Home"));
const SetCurrentStyle = lazy(() => import("./pages/SetCurrentStyle"));
const WashDayHub = lazy(() => import("./pages/WashDayHub"));
const WashDayDetail = lazy(() => import("./pages/WashDayDetail"));
const WashStep1 = lazy(() => import("./pages/wash/WashStep1"));
const WashStep2 = lazy(() => import("./pages/wash/WashStep2"));
const WashStep3 = lazy(() => import("./pages/wash/WashStep3"));
const WashStepStyling = lazy(() => import("./pages/wash/WashStepStyling"));
const WashStep4 = lazy(() => import("./pages/wash/WashStep4"));
const Products = lazy(() => import("./pages/Products"));
const IngredientDetail = lazy(() => import("./pages/IngredientDetail"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Favourites = lazy(() => import("./pages/Favourites"));
const OffShelf = lazy(() => import("./pages/OffShelf"));
const Avoidlist = lazy(() => import("./pages/Avoidlist"));
const ProductScanning = lazy(() => import("./pages/ProductScanning"));
const ProductProfileRedirect = lazy(() => import("./pages/ProductProfileRedirect"));
const ProductRepository = lazy(() => import("./pages/ProductRepository"));
const BrandProducts = lazy(() => import("./pages/BrandProducts"));
const ProductsByIngredient = lazy(() => import("./pages/ProductsByIngredient"));
const IngredientResearch = lazy(() => import("./pages/IngredientResearch"));
const Journal = lazy(() => import("./pages/Journal"));
const JournalEntry = lazy(() => import("./pages/JournalEntry"));
const MoodboardList = lazy(() => import("./pages/MoodboardList"));
const MoodboardBoard = lazy(() => import("./pages/MoodboardBoard"));
const Appointments = lazy(() => import("./pages/Appointments"));
const LogAppointment = lazy(() => import("./pages/LogAppointment"));
const Directory = lazy(() => import("./pages/Directory"));
const Profile = lazy(() => import("./pages/Profile"));
const NutritionPlan = lazy(() => import("./pages/NutritionPlan"));
const Help = lazy(() => import("./pages/Help"));
const Contact = lazy(() => import("./pages/Contact"));

// STRAND+
const PlusUpgrade = lazy(() => import("./pages/PlusUpgrade"));
const PlusWelcome = lazy(() => import("./pages/PlusWelcome"));
const Forum = lazy(() => import("./pages/Forum"));
const ForumNewThread = lazy(() => import("./pages/ForumNewThread"));
const ForumThread = lazy(() => import("./pages/ForumThread"));
const ForumTag = lazy(() => import("./pages/ForumTag"));
const MemberProfile = lazy(() => import("./pages/MemberProfile"));
const PlusLibrary = lazy(() => import("./pages/PlusLibrary"));
const PlusLibraryCollection = lazy(() => import("./pages/PlusLibraryCollection"));
const PlusEvents = lazy(() => import("./pages/PlusEvents"));
const PlusEventDetail = lazy(() => import("./pages/PlusEventDetail"));
const PlusTickets = lazy(() => import("./pages/PlusTickets"));

// Global react-query defaults — Home (and every other screen) relies on
// queries NOT quietly refetching under the user while they're reading. Any
// hook that legitimately needs polling or focus-refresh opts in explicitly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
    },
  },
});

// Helper to wrap protected routes
const Protected = ({ children }: { children: React.ReactNode }) => <RequireAuth>{children}</RequireAuth>;
const Paid = ({ children }: { children: React.ReactNode }) => <PaidGate>{children}</PaidGate>;
const Onboard = ({ children }: { children: React.ReactNode }) => (
  <OnboardingGate>{children}</OnboardingGate>
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
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ViewAsProvider>
        <AuthProvider>
          <BackButtonProvider>
            <GlobalEffects />
            <MessageNotifications />
            <PhoneShell>
              <div className="flex flex-col h-full">
                <GlobalMenu />
                <div className="flex-1 min-h-0 overflow-y-auto">

                <AccessRestrictedGate>
                <Suspense fallback={<RouteFallback />}>
                <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/setup" element={<Onboard><SetupGuide /></Onboard>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/walkthrough" element={<Onboard><Walkthrough /></Onboard>} />

              {/* Onboarding (auth required so data persists) */}
              <Route path="/onboarding/profile-step-1" element={<Onboard><ProfileStep1 /></Onboard>} />
              <Route path="/onboarding/profile-step-2" element={<Onboard><ProfileStep2 /></Onboard>} />
              <Route path="/onboarding/pro-gate" element={<Onboard><ProGate /></Onboard>} />
              <Route path="/onboarding/pro-book" element={<Onboard><ProBook /></Onboard>} />
              <Route path="/onboarding/pro-details" element={<Onboard><ProDetails /></Onboard>} />
              <Route path="/onboarding/profile-step-3-hair" element={<Onboard><ProfileStep3Hair /></Onboard>} />
              <Route path="/onboarding/profile-step-4-colour" element={<Onboard><ProfileStep4Colour /></Onboard>} />
              <Route path="/onboarding/blood-timing" element={<Onboard><BloodTiming /></Onboard>} />
              <Route path="/onboarding/blood-iron-vitamins" element={<Onboard><BloodIronVitamins /></Onboard>} />
              <Route path="/onboarding/blood-minerals" element={<Onboard><BloodMinerals /></Onboard>} />
              <Route path="/onboarding/blood-thyroid" element={<Onboard><BloodThyroid /></Onboard>} />
              <Route path="/onboarding/blood-hormones" element={<Onboard><BloodHormones /></Onboard>} />
              <Route path="/onboarding/blood-ai-summary" element={<Onboard><BloodAiSummary /></Onboard>} />
              <Route path="/onboarding/photos" element={<Onboard><ProfileStepPhotos /></Onboard>} />
              <Route path="/onboarding/strand-summary" element={<Onboard><StrandSummary /></Onboard>} />
              <Route path="/onboarding/success" element={<Onboard><SuccessScreen /></Onboard>} />

              {/* Main app */}
              <Route path="/home" element={<Paid><Home /></Paid>} />
              <Route path="/profile/personal" element={<Onboard><PersonalDetailsReview /></Onboard>} />
              <Route path="/profile/health" element={<Onboard><HealthReview /></Onboard>} />
              <Route path="/profile/hair" element={<Onboard><HairReview /></Onboard>} />
              <Route path="/profile/colour" element={<Onboard><ColourReview /></Onboard>} />
              <Route path="/home/style" element={<Paid><SetCurrentStyle /></Paid>} />
              <Route path="/wash-day" element={<Paid><WashDayHub /></Paid>} />
              <Route path="/wash-day/:id" element={<Paid><WashDayDetail /></Paid>} />
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
              <Route path="/products/repository" element={<Paid><ProductRepository /></Paid>} />
              <Route path="/products/profile/:id" element={<Paid><ProductProfileRedirect /></Paid>} />
              <Route path="/products/brand/:brand" element={<Paid><BrandProducts /></Paid>} />
              <Route path="/products/by-ingredient" element={<Paid><ProductsByIngredient /></Paid>} />
              <Route path="/products/ingredient-research" element={<Paid><IngredientResearch /></Paid>} />
              <Route path="/journal" element={<Paid><Journal /></Paid>} />
              <Route path="/journal/entry/:id" element={<Paid><JournalEntry /></Paid>} />
              <Route path="/journal/moodboards" element={<Paid><MoodboardList /></Paid>} />
              <Route path="/journal/moodboards/:id" element={<Paid><MoodboardBoard /></Paid>} />
              <Route path="/appointments" element={<Paid><Appointments /></Paid>} />
              <Route path="/appointments/log" element={<Paid><LogAppointment /></Paid>} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/profile" element={<Onboard><Profile /></Onboard>} />
              <Route path="/profile/milestones" element={<Onboard><MilestoneGallery /></Onboard>} />
              <Route path="/profile/discounts" element={<Onboard><Discounts /></Onboard>} />
              <Route path="/blood-history" element={<Onboard><BloodHistory /></Onboard>} />
              <Route path="/blood-upload" element={<Onboard><BloodUpload /></Onboard>} />
              <Route path="/blood-panel/:id" element={<Onboard><BloodPanelReview /></Onboard>} />

              <Route path="/nutrition-plan" element={<Paid><NutritionPlan /></Paid>} />
              <Route path="/help" element={<Protected><Help /></Protected>} />
              <Route path="/contact" element={<Protected><Contact /></Protected>} />

              {/* Professional portal (Phase A/B — application + admin vetting) */}
              <Route path="/pro/auth" element={<ProAuth />} />
              <Route path="/pro/landing" element={<Protected><ProLanding /></Protected>} />
              <Route path="/pro/apply" element={<Protected><ProApply /></Protected>} />
              <Route path="/pro/welcome" element={<Protected><ProWelcome /></Protected>} />
              {/* Professional portal — dashboard gated behind an active subscription */}
              <Route
                path="/pro"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProDashboard /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/profile"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProProfile /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/offers"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProOffers /></ProSubGate>
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
                    <ProSubGate><ProEnquiries /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/appointments"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProAppointments /></ProSubGate>
                  </RoleGate>
                }
              />

              <Route
                path="/pro/clients"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProClients /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/clients/:consumerId/past"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProPastClient /></ProSubGate>
                  </RoleGate>
                }
              />
              <Route
                path="/pro/clients/:consumerId"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProClientPassport /></ProSubGate>
                  </RoleGate>
                }
              />



              <Route path="/profile/enquiries" element={<Paid><MyEnquiries /></Paid>} />
              <Route path="/messages" element={<Protected><Messages /></Protected>} />
              <Route path="/messages/:threadId" element={<Protected><ChatThreadPage /></Protected>} />
              <Route path="/profile/data-access" element={<Protected><DataAccess /></Protected>} />

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


              <Route path="/subscribe" element={<Protected><Subscribe /></Protected>} />
              <Route path="/admin/members" element={<RoleGate allow={["admin"]}><AdminMembers /></RoleGate>} />
              <Route path="/admin/members/:userId/passport" element={<RoleGate allow={["admin"]}><AdminMemberPassport /></RoleGate>} />
              <Route path="/admin/settings" element={<RoleGate allow={["admin"]}><AdminSettings /></RoleGate>} />
              <Route path="/admin/professionals" element={<RoleGate allow={["admin"]}><AdminProfessionals /></RoleGate>} />
              <Route path="/admin/view-as" element={<RoleGate allow={["admin"]}><AdminViewAs /></RoleGate>} />
              <Route path="/admin/brands" element={<RoleGate allow={["admin"]}><AdminBrands /></RoleGate>} />
              <Route path="/admin/messages" element={<RoleGate allow={["admin"]}><AdminMessages /></RoleGate>} />

              {/* Consumer-facing brand directory */}
              <Route path="/brands" element={<Paid><BrandsDirectory /></Paid>} />
              <Route path="/brands/:brandUserId" element={<Paid><BrandDetailPage /></Paid>} />

              {/* Brand routes */}
              <Route path="/brand/auth" element={<BrandAuth />} />
              <Route path="/brand/subscribe" element={<RoleGate allow={["brand", "admin"]}><BrandSubscribe /></RoleGate>} />
              <Route path="/brand/billing" element={<RoleGate allow={["brand", "admin"]}><BrandBilling /></RoleGate>} />
              <Route path="/brand" element={<RoleGate allow={["brand", "admin"]}><BrandDashboard /></RoleGate>} />
              <Route path="/brand/profile" element={<RoleGate allow={["brand", "admin"]}><BrandProfileEditor /></RoleGate>} />
              <Route path="/brand/offers/new" element={<RoleGate allow={["brand", "admin"]}><BrandCreateOffer /></RoleGate>} />
              <Route path="/brand/offers/:id" element={<RoleGate allow={["brand", "admin"]}><BrandOfferDetail /></RoleGate>} />
              <Route path="/brand/offers/:id/edit" element={<RoleGate allow={["brand", "admin"]}><BrandCreateOffer /></RoleGate>} />
              <Route path="/brand/offers/:id/extend" element={<RoleGate allow={["brand", "admin"]}><BrandExtendOffer /></RoleGate>} />
              <Route path="/brand/checkout/success" element={<RoleGate allow={["brand", "admin"]}><BrandCheckoutSuccess /></RoleGate>} />

              {/* Pro promoted campaigns — reuse the brand pages via URL-based
                   owner mode. Same booking calendar + Stripe flow, gated by
                   the pro subscription instead of the brand annual fee. */}
              <Route path="/pro/campaigns" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><BrandDashboard /></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/new" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><BrandCreateOffer /></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><BrandOfferDetail /></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id/edit" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><BrandCreateOffer /></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/:id/extend" element={<RoleGate allow={["professional", "admin"]}><ProSubGate><BrandExtendOffer /></ProSubGate></RoleGate>} />
              <Route path="/pro/campaigns/checkout/success" element={<RoleGate allow={["professional", "admin"]}><BrandCheckoutSuccess /></RoleGate>} />

              <Route path="/offers/:id" element={<Paid><OfferPage /></Paid>} />
              <Route path="/offers/:offerId/product/:productId" element={<Paid><BrandProductPage /></Paid>} />

              <Route path="/admin/brand-offers" element={<RoleGate allow={["admin"]}><AdminBrandOffers /></RoleGate>} />
              <Route path="/admin/brand-offers/:id" element={<RoleGate allow={["admin"]}><AdminBrandOfferReview /></RoleGate>} />
              <Route path="/admin/brand-calendar" element={<RoleGate allow={["admin"]}><AdminBrandCalendar /></RoleGate>} />
              <Route path="/admin/moderation" element={<RoleGate allow={["admin"]}><AdminModeration /></RoleGate>} />
              <Route path="/admin/library" element={<RoleGate allow={["admin"]}><AdminLibrary /></RoleGate>} />
              <Route path="/admin/events" element={<RoleGate allow={["admin"]}><AdminEvents /></RoleGate>} />

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
                </AccessRestrictedGate>


                </div>
              </div>
            </PhoneShell>
          </BackButtonProvider>
        </AuthProvider>
        </ViewAsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
