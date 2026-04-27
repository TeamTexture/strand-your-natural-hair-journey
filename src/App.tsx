import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";
import { AuthProvider } from "@/hooks/useAuth";
import RequireAuth from "@/components/RequireAuth";
import { useKeyboardAwareInputs } from "@/hooks/useKeyboardAwareInputs";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth";
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

// Main app
import Home from "./pages/Home";
import SetCurrentStyle from "./pages/SetCurrentStyle";
import WashDayHub from "./pages/WashDayHub";
import WashDayDetail from "./pages/WashDayDetail";
import WashStep1 from "./pages/wash/WashStep1";
import WashStep2 from "./pages/wash/WashStep2";
import WashStep3 from "./pages/wash/WashStep3";
import WashStep4 from "./pages/wash/WashStep4";
import Products from "./pages/Products";
import IngredientDetail from "./pages/IngredientDetail";
import Wishlist from "./pages/Wishlist";
import Favourites from "./pages/Favourites";
import OffShelf from "./pages/OffShelf";
import Avoidlist from "./pages/Avoidlist";
import ProductScanning from "./pages/ProductScanning";
import ProductDetailNew from "./pages/ProductDetailNew";
import ProductRepository from "./pages/ProductRepository";
import ProductProfile from "./pages/ProductProfile";
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

const queryClient = new QueryClient();

// Helper to wrap protected routes
const Protected = ({ children }: { children: React.ReactNode }) => <RequireAuth>{children}</RequireAuth>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PhoneShell>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/setup" element={<Protected><SetupGuide /></Protected>} />
              <Route path="/auth" element={<Auth />} />
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
              <Route path="/onboarding/success" element={<Protected><SuccessScreen /></Protected>} />

              {/* Main app */}
              <Route path="/home" element={<Protected><Home /></Protected>} />
              <Route path="/home/style" element={<Protected><SetCurrentStyle /></Protected>} />
              <Route path="/wash-day" element={<Protected><WashDayHub /></Protected>} />
              <Route path="/wash-day/:id" element={<Protected><WashDayDetail /></Protected>} />
              <Route path="/wash/step-1" element={<Protected><WashStep1 /></Protected>} />
              <Route path="/wash/step-2" element={<Protected><WashStep2 /></Protected>} />
              <Route path="/wash/step-3" element={<Protected><WashStep3 /></Protected>} />
              <Route path="/wash/step-4" element={<Protected><WashStep4 /></Protected>} />
              <Route path="/products" element={<Protected><Products /></Protected>} />
              <Route path="/products/ingredient" element={<Protected><IngredientDetail /></Protected>} />
              <Route path="/products/wishlist" element={<Protected><Wishlist /></Protected>} />
              <Route path="/products/favourites" element={<Protected><Favourites /></Protected>} />
              <Route path="/products/off-shelf" element={<Protected><OffShelf /></Protected>} />
              <Route path="/products/avoidlist" element={<Protected><Avoidlist /></Protected>} />
              <Route path="/products/scanning" element={<Protected><ProductScanning /></Protected>} />
              <Route path="/products/detail-new" element={<Protected><ProductDetailNew /></Protected>} />
              <Route path="/products/repository" element={<Protected><ProductRepository /></Protected>} />
              <Route path="/products/profile/:id" element={<Protected><ProductProfile /></Protected>} />
              <Route path="/journal" element={<Protected><Journal /></Protected>} />
              <Route path="/journal/entry/:id" element={<Protected><JournalEntry /></Protected>} />
              <Route path="/journal/moodboards" element={<Protected><MoodboardList /></Protected>} />
              <Route path="/journal/moodboards/:id" element={<Protected><MoodboardBoard /></Protected>} />
              <Route path="/appointments" element={<Protected><Appointments /></Protected>} />
              <Route path="/appointments/log" element={<Protected><LogAppointment /></Protected>} />
              <Route path="/directory" element={<Protected><Directory /></Protected>} />
              <Route path="/profile" element={<Protected><Profile /></Protected>} />
              <Route path="/nutrition-plan" element={<Protected><NutritionPlan /></Protected>} />
              <Route path="/help" element={<Protected><Help /></Protected>} />
              <Route path="/contact" element={<Protected><Contact /></Protected>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PhoneShell>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
