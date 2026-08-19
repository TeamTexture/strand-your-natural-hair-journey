import { useNavigate } from "react-router-dom";
import PassportView from "@/components/passport/PassportView";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "@/components/LoadingDot";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";

/**
 * Member-facing preview of their own passport, rendered in "pro" mode so it
 * inherits the exact same per-section visibility filtering a professional gets.
 * Read-only — no edit controls, no view logging.
 */
const PassportPreview = () => {
  const nav = useNavigate();
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <ScreenLayout>
        <TitleBar title="Passport preview" onBack={() => nav("/profile/passport-visibility")} />
        <LoadingDot label="Loading preview…" fullScreen={false} />
      </ScreenLayout>
    );
  }

  return (
    <PassportView
      userId={user.id}
      mode="pro"
      selfPreview
      backTo="/profile/passport-visibility"
      active
      accessEndedAction={() => nav("/profile/passport-visibility")}
    />
  );
};

export default PassportPreview;
