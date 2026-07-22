import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";
import { AuthProvider } from "@/hooks/useAuth";
import { ViewAsProvider } from "@/hooks/useViewAs";
import RequireAuth from "@/components/RequireAuth";
import PaidGate from "@/components/PaidGate";
import OnboardingGate from "@/components/OnboardingGate";
import Subscribe from "./pages/Subscribe";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminMemberPassport from "./pages/admin/AdminMemberPassport";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminProfessionals from "./pages/admin/AdminProfessionals";
import AdminViewAs from "./pages/admin/AdminViewAs";
import AdminBrands from "./pages/admin/AdminBrands";
import AdminMessages from "./pages/admin/AdminMessages";
import BrandsDirectory from "./pages/BrandsDirectory";
import BrandDetailPage from "./pages/BrandDetailPage";

import GlobalMenu from "@/components/GlobalMenu";
import AccessRestrictedGate from "@/components/AccessRestrictedGate";
import { BackButtonProvider } from "@/components/BackButtonContext";
import MessageNotifications from "@/components/MessageNotifications";
import { useKeyboardAwareInputs } from "@/hooks/useKeyboardAwareInputs";
import { useTrackInAppHistory } from "@/hooks/useTrackInAppHistory";


import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import SetupGuide from "./pages/SetupGuide";
import Walkthrough from "./pages/Walkthrough";

// Onboarding flow
import ProfileStep1 from "./pages/onboarding/ProfileStep1";
import ProfileStep2 from "./pages/onboarding/ProfileStep2";
import ProGate from "./pages/onboarding/ProGate";
import ProBook from "./pages/onboarding/ProBook";
import ProDetails from "./pages/onboarding/ProDetails";
import ProfileStep3Hair from "./pages/onboarding/ProfileStep3Hair";
import ProfileStep4Colour from "./pages/onboarding/ProfileStep4Colour";
import BloodTiming from "./pages/onboarding/BloodTiming";
import BloodIronVitamins from "./pages/onboarding/BloodIronVitamins";
import BloodMinerals from "./pages/onboarding/BloodMinerals";
import BloodThyroid from "./pages/onboarding/BloodThyroid";
import BloodHormones from "./pages/onboarding/BloodHormones";
import BloodAiSummary from "./pages/onboarding/BloodAiSummary";
import SuccessScreen from "./pages/onboarding/SuccessScreen";
import ProfileStepPhotos from "./pages/onboarding/ProfileStepPhotos";
import StrandSummary from "./pages/onboarding/StrandSummary";
import MilestoneGallery from "./pages/MilestoneGallery";
import Discounts from "./pages/Discounts";
import BloodHistory from "./pages/BloodHistory";
import BloodUpload from "./pages/BloodUpload";
import BloodPanelReview from "./pages/BloodPanelReview";
import PersonalDetailsReview from "./pages/profile-review/PersonalDetails";
import HealthReview from "./pages/profile-review/HealthReview";
import HairReview from "./pages/profile-review/HairReview";
import ColourReview from "./pages/profile-review/ColourReview";
import RoleGate from "./components/RoleGate";
import ProApply from "./pages/pro/ProApply";
import ProAuth from "./pages/pro/ProAuth";
import ProLanding from "./pages/pro/ProLanding";
import ProWelcome from "./pages/pro/ProWelcome";
import ProSubGate from "./components/ProSubGate";
import ProDashboard from "./pages/pro/ProDashboard";
import ProProfile from "./pages/pro/ProProfile";
import ProOffers from "./pages/pro/ProOffers";
import ProBilling from "./pages/pro/ProBilling";
import ProEnquiries from "./pages/pro/ProEnquiries";
import ProAppointments from "./pages/pro/ProAppointments";

import MyEnquiries from "./pages/MyEnquiries";
import Messages from "./pages/Messages";
import ChatThreadPage from "./pages/ChatThreadPage";
import DataAccess from "./pages/DataAccess";
import AdminApplications from "./pages/admin/AdminApplications";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminHub from "./pages/admin/AdminHub";
import ProClientPassport from "./pages/pro/ProClientPassport";
import ProClients from "./pages/pro/ProClients";
import ProPastClient from "./pages/pro/ProPastClient";

import BrandAuth from "./pages/brand/BrandAuth";
import BrandDashboard from "./pages/brand/BrandDashboard";
import BrandCreateOffer from "./pages/brand/BrandCreateOffer";
import BrandOfferDetail from "./pages/brand/BrandOfferDetail";
import BrandExtendOffer from "./pages/brand/BrandExtendOffer";
import BrandCheckoutSuccess from "./pages/brand/BrandCheckoutSuccess";
import BrandSubscribe from "./pages/brand/BrandSubscribe";
import BrandBilling from "./pages/brand/BrandBilling";
import BrandProfileEditor from "./pages/brand/BrandProfileEditor";
import OfferPage from "./pages/OfferPage";
import BrandProductPage from "./pages/BrandProductPage";
import AdminBrandOffers from "./pages/admin/AdminBrandOffers";
import AdminBrandCalendar from "./pages/admin/AdminBrandCalendar";
import AdminBrandOfferReview from "./pages/admin/AdminBrandOfferReview";



// Main app
import Home from "./pages/Home";
import SetCurrentStyle from "./pages/SetCurrentStyle";
import WashDayHub from "./pages/WashDayHub";
import WashDayDetail from "./pages/WashDayDetail";
import WashStep1 from "./pages/wash/WashStep1";
import WashStep2 from "./pages/wash/WashStep2";
import WashStep3 from "./pages/wash/WashStep3";
import WashStepStyling from "./pages/wash/WashStepStyling";
import WashStep4 from "./pages/wash/WashStep4";
import Products from "./pages/Products";
import IngredientDetail from "./pages/IngredientDetail";
import Wishlist from "./pages/Wishlist";
import Favourites from "./pages/Favourites";
import OffShelf from "./pages/OffShelf";
import Avoidlist from "./pages/Avoidlist";
import ProductScanning from "./pages/ProductScanning";
import ProductProfileRedirect from "./pages/ProductProfileRedirect";
import ProductRepository from "./pages/ProductRepository";
import BrandProducts from "./pages/BrandProducts";
import ProductsByIngredient from "./pages/ProductsByIngredient";
import IngredientResearch from "./pages/IngredientResearch";
import Journal from "./pages/Journal";
import JournalEntry from "./pages/JournalEntry";
import MoodboardList from "./pages/MoodboardList";
import MoodboardBoard from "./pages/MoodboardBoard";
import Appointments from "./pages/Appointments";
import LogAppointment from "./pages/LogAppointment";
import Directory from "./pages/Directory";
import Profile from "./pages/Profile";
import NutritionPlan from "./pages/NutritionPlan";
import Help from "./pages/Help";
import Contact from "./pages/Contact";
import OAuthConsent from "./pages/OAuthConsent";

// STRAND+
import PlusUpgrade from "./pages/PlusUpgrade";
import PlusWelcome from "./pages/PlusWelcome";
import Forum from "./pages/Forum";
import ForumNewThread from "./pages/ForumNewThread";
import ForumThread from "./pages/ForumThread";
import ForumTag from "./pages/ForumTag";
import MemberProfile from "./pages/MemberProfile";
import PlusLibrary from "./pages/PlusLibrary";
import PlusLibraryCollection from "./pages/PlusLibraryCollection";
import PlusEvents from "./pages/PlusEvents";
import PlusEventDetail from "./pages/PlusEventDetail";
import PlusTickets from "./pages/PlusTickets";
import AdminModeration from "./pages/admin/AdminModeration";
import AdminLibrary from "./pages/admin/AdminLibrary";
import AdminEvents from "./pages/admin/AdminEvents";

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
      <BrowserRouter>
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
