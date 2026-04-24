import { Navigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";

const Index = () => {
  // Setup guide is now triggered after first signup (see Auth + post-auth redirect),
  // not for unauthenticated visitors. The marketing/splash screen always lands here.
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
