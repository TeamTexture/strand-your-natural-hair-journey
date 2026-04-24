import { Navigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";

const Index = () => {
  // Setup guide first run only
  if (typeof window !== "undefined") {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      // @ts-expect-error - non-standard
      window.navigator.standalone === true;
    const setupDone = localStorage.getItem("strand_setup_complete") === "true";
    if (!standalone && !setupDone) {
      return <Navigate to="/setup" replace />;
    }
  }

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
