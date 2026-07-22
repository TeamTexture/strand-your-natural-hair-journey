import { smartBack } from "@/lib/smartBack";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HealthFieldsSection from "@/components/profile-review/HealthFieldsSection";

const HealthReview = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Health profile" onBack={smartBack(navigate, "/profile")} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-[13px] text-muted-foreground leading-snug pb-1">
          Tap the pencil to update just one field at a time.
        </p>
        <HealthFieldsSection />
      </div>
    </ScreenLayout>
  );
};

export default HealthReview;
