import { ReactNode, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBackButtonContext } from "@/components/BackButtonContext";
import { safeBack } from "@/lib/smartBack";
import { pinnedBackTarget, RESUME_PATH } from "@/lib/onboardingLock";
import NotificationsBell from "@/components/NotificationsBell";
import { onboardingStepLabel } from "@/components/onboarding/OnboardingGuide";

interface Props {
  /** Centre title text */
  title?: string;
  /** Right-side small label or node. Onboarding pages leave this unset — the
   *  counter is read from OnboardingGuide's map so the two cannot drift. */
  right?: ReactNode;
  /** Show back arrow. Defaults true; set false on profile etc. */
  back?: boolean;
  /** Custom back behaviour */
  onBack?: () => void;
  /** Where to go when there is no in-app history to pop (deep link / refresh) */
  backFallback?: string;
  /** Deprecated: tips control is now rendered globally in the app shell. */
  tips?: boolean;
}

const TitleBar = ({ title, right, back = true, onBack, backFallback = "/home", tips = false }: Props) => {

  const navigate = useNavigate();
  const location = useLocation();
  const { register, unregister } = useBackButtonContext();
  // Pages opened from a specific place (a style-record step, a wash-day step)
  // carry that place in nav state. Back must return there, whatever route
  // redirects happened on the way in.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? null;

  // Tell the global menu that this page already has a back button so it
  // doesn't render a duplicate.
  useEffect(() => {
    if (!back) return;
    register();
    return () => unregister();
  }, [back, register, unregister]);

  const handleBack = () => {
    // While the member is locked to the resume screen, back is pinned to it.
    const pinned = pinnedBackTarget(location.pathname + location.search, null);
    if (pinned === "") return;
    if (pinned) {
      navigate(RESUME_PATH, { replace: true });
      return;
    }
    if (onBack) onBack();
    else if (returnTo) navigate(returnTo, { replace: true });
    else safeBack(navigate, backFallback);
  };


  return (
    <div className="relative px-4 pt-2 pb-1 shrink-0">
      <div className="h-10 flex items-center">
        <div className="flex-1 flex items-center">
          {back && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="-ml-2 p-2 min-h-[44px] min-w-[44px] flex items-center text-foreground/80 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center justify-end gap-1.5 text-xs text-muted-foreground font-body">
          {right ?? onboardingStepLabel(location.pathname)}
          <NotificationsBell />
        </div>

      </div>
      {title && (
        <h1 className="text-center font-display text-2xl font-semibold text-foreground px-2 leading-tight break-words [overflow-wrap:anywhere]">
          {title}
        </h1>
      )}
    </div>
  );
};

export default TitleBar;
