import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";
import { AuthProvider } from "@/hooks/useAuth";
import RequireAuth from "@/components/RequireAuth";
import PaidGate from "@/components/PaidGate";
import Subscribe from "./pages/Subscribe";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminSettings from "./pages/admin/AdminSettings";
import GlobalMenu from "@/components/GlobalMenu";
import AccessRestrictedGate from "@/components/AccessRestrictedGate";
import { BackButtonProvider } from "@/components/BackButtonContext";
import { useKeyboardAwareInputs } from "@/hooks/useKeyboardAwareInputs";


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
import MyEnquiries from "./pages/MyEnquiries";
import DataAccess from "./pages/DataAccess";
import AdminApplications from "./pages/admin/AdminApplications";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminHub from "./pages/admin/AdminHub";
import ProClientPassport from "./pages/pro/ProClientPassport";


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

const queryClient = new QueryClient();

// Helper to wrap protected routes
const Protected = ({ children }: { children: React.ReactNode }) => <RequireAuth>{children}</RequireAuth>;
const Paid = ({ children }: { children: React.ReactNode }) => <PaidGate>{children}</PaidGate>;

// Mounts global side-effects (e.g. keyboard-aware input scrolling) inside the
// React tree so they're active for every screen in the app.
const GlobalEffects = () => {
  useKeyboardAwareInputs();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BackButtonProvider>
            <GlobalEffects />
            <PhoneShell>
              <div className="flex flex-col h-full">
                <GlobalMenu />
                <div className="flex-1 min-h-0 overflow-y-auto">

                <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/setup" element={<Protected><SetupGuide /></Protected>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/walkthrough" element={<Protected><Walkthrough /></Protected>} />

              {/* Onboarding (auth required so data persists) */}
              <Route path="/onboarding/profile-step-1" element={<Protected><ProfileStep1 /></Protected>} />
              <Route path="/onboarding/profile-step-2" element={<Protected><ProfileStep2 /></Protected>} />
              <Route path="/onboarding/pro-gate" element={<Protected><ProGate /></Protected>} />
              <Route path="/onboarding/pro-book" element={<Protected><ProBook /></Protected>} />
              <Route path="/onboarding/pro-details" element={<Protected><ProDetails /></Protected>} />
              <Route path="/onboarding/profile-step-3-hair" element={<Protected><ProfileStep3Hair /></Protected>} />
              <Route path="/onboarding/profile-step-4-colour" element={<Protected><ProfileStep4Colour /></Protected>} />
              <Route path="/onboarding/blood-timing" element={<Protected><BloodTiming /></Protected>} />
              <Route path="/onboarding/blood-iron-vitamins" element={<Protected><BloodIronVitamins /></Protected>} />
              <Route path="/onboarding/blood-minerals" element={<Protected><BloodMinerals /></Protected>} />
              <Route path="/onboarding/blood-thyroid" element={<Protected><BloodThyroid /></Protected>} />
              <Route path="/onboarding/blood-hormones" element={<Protected><BloodHormones /></Protected>} />
              <Route path="/onboarding/blood-ai-summary" element={<Protected><BloodAiSummary /></Protected>} />
              <Route path="/onboarding/photos" element={<Protected><ProfileStepPhotos /></Protected>} />
              <Route path="/onboarding/strand-summary" element={<Protected><StrandSummary /></Protected>} />
              <Route path="/onboarding/success" element={<Protected><SuccessScreen /></Protected>} />

              {/* Main app */}
              <Route path="/home" element={<Paid><Home /></Paid>} />
              <Route path="/profile/personal" element={<Protected><PersonalDetailsReview /></Protected>} />
              <Route path="/profile/health" element={<Protected><HealthReview /></Protected>} />
              <Route path="/profile/hair" element={<Protected><HairReview /></Protected>} />
              <Route path="/profile/colour" element={<Protected><ColourReview /></Protected>} />
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
              <Route path="/profile" element={<Protected><Profile /></Protected>} />
              <Route path="/profile/milestones" element={<Protected><MilestoneGallery /></Protected>} />
              <Route path="/blood-history" element={<Protected><BloodHistory /></Protected>} />
              <Route path="/blood-upload" element={<Protected><BloodUpload /></Protected>} />
              <Route path="/blood-panel/:id" element={<Protected><BloodPanelReview /></Protected>} />

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
                path="/pro/clients/:consumerId"
                element={
                  <RoleGate allow={["professional", "admin"]}>
                    <ProSubGate><ProClientPassport /></ProSubGate>
                  </RoleGate>
                }
              />


              <Route path="/profile/enquiries" element={<Paid><MyEnquiries /></Paid>} />
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
              <Route path="/admin/settings" element={<RoleGate allow={["admin"]}><AdminSettings /></RoleGate>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
                </Routes>

              </div>
            </div>
          </PhoneShell>
        </BackButtonProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
