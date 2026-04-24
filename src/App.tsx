import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PhoneShell from "@/components/PhoneShell";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

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
import SuccessScreen from "./pages/onboarding/SuccessScreen";

// Main app
import Home from "./pages/Home";
import WashDayHub from "./pages/WashDayHub";
import WashStep1 from "./pages/wash/WashStep1";
import WashStep2 from "./pages/wash/WashStep2";
import WashStep3 from "./pages/wash/WashStep3";
import WashStep4 from "./pages/wash/WashStep4";
import Products from "./pages/Products";
import IngredientDetail from "./pages/IngredientDetail";
import Wishlist from "./pages/Wishlist";
import Avoidlist from "./pages/Avoidlist";
import Journal from "./pages/Journal";
import MoodboardList from "./pages/MoodboardList";
import MoodboardBoard from "./pages/MoodboardBoard";
import Appointments from "./pages/Appointments";
import Directory from "./pages/Directory";
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PhoneShell>
          <Routes>
            <Route path="/" element={<Index />} />

            {/* Onboarding */}
            <Route path="/onboarding/profile-step-1" element={<ProfileStep1 />} />
            <Route path="/onboarding/profile-step-2" element={<ProfileStep2 />} />
            <Route path="/onboarding/pro-gate" element={<ProGate />} />
            <Route path="/onboarding/pro-book" element={<ProBook />} />
            <Route path="/onboarding/pro-details" element={<ProDetails />} />
            <Route path="/onboarding/profile-step-3-hair" element={<ProfileStep3Hair />} />
            <Route path="/onboarding/profile-step-4-colour" element={<ProfileStep4Colour />} />
            <Route path="/onboarding/blood-timing" element={<BloodTiming />} />
            <Route path="/onboarding/blood-iron-vitamins" element={<BloodIronVitamins />} />
            <Route path="/onboarding/blood-minerals" element={<BloodMinerals />} />
            <Route path="/onboarding/blood-thyroid" element={<BloodThyroid />} />
            <Route path="/onboarding/blood-hormones" element={<BloodHormones />} />
            <Route path="/onboarding/success" element={<SuccessScreen />} />

            {/* Main app */}
            <Route path="/home" element={<Home />} />
            <Route path="/wash-day" element={<WashDayHub />} />
            <Route path="/wash/step-1" element={<WashStep1 />} />
            <Route path="/wash/step-2" element={<WashStep2 />} />
            <Route path="/wash/step-3" element={<WashStep3 />} />
            <Route path="/wash/step-4" element={<WashStep4 />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/ingredient" element={<IngredientDetail />} />
            <Route path="/products/wishlist" element={<Wishlist />} />
            <Route path="/products/avoidlist" element={<Avoidlist />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/moodboards" element={<MoodboardList />} />
            <Route path="/journal/moodboards/:id" element={<MoodboardBoard />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/profile" element={<Profile />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PhoneShell>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
