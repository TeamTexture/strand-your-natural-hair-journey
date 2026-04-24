import PhoneShell from "@/components/PhoneShell";
import SplashScreen from "@/components/SplashScreen";

const Index = () => {
  return (
    <>
      {/* SEO */}
      <title>STRAND — Hair Journal for TT Collective Pro</title>
      <meta
        name="description"
        content="STRAND: a hair journal and clinical companion for women on a natural hair care journey. Exclusive to TT Collective Pro members."
      />
      <PhoneShell>
        <SplashScreen />
      </PhoneShell>
    </>
  );
};

export default Index;
