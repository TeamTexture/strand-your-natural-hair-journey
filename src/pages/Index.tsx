import { Navigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "@/components/LoadingDot";

const Index = () => {
  const { user, loading } = useAuth();

  // While we're checking persisted session, don't flash the splash.
  if (loading) return <LoadingDot />;

  // Returning, signed-in users skip the splash and go straight to the app home —
  // no need to "sign in again" once they've authenticated on this device.
  if (user) return <Navigate to="/home" replace />;

  return (
    <>
      <title>STRAND — Hair Journal for TT Collective Pro</title>
      <meta
        name="description"
        content="STRAND: a hair journal and clinical companion for women on a natural hair care journey. Exclusive to TT Collective Pro members."
      />
      <SplashScreen />
    </>
  );
};

export default Index;
