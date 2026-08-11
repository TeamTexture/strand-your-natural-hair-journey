import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useProfileConfirmation } from "@/hooks/useProfileConfirmation";

/**
 * Shown above AI output while `profiles.profile_confirmed_at` is null. The
 * guidance still runs — we simply present it with lower confidence, because
 * part of the profile it is built on was filled in automatically.
 */
const ProvisionalProfileBanner = ({ className }: { className?: string }) => {
  const navigate = useNavigate();
  const { needsConfirmation } = useProfileConfirmation();
  if (!needsConfirmation) return null;
  return (
    <button
      type="button"
      onClick={() => navigate("/profile/hair")}
      className={`w-full flex items-start gap-2 rounded-[14px] border border-warn/40 bg-warn/10 px-3 py-2.5 text-left ${className ?? ""}`}
    >
      <AlertTriangle className="size-3.5 mt-[2px] text-warn shrink-0" />
      <span className="font-body text-[12px] leading-snug text-foreground">
        Provisional — some of your profile was filled in automatically. Confirm
        it to get guidance built on your hair.
      </span>
    </button>
  );
};

export default ProvisionalProfileBanner;
