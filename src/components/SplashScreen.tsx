import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import HairStrandIcon from "./HairStrandIcon";
import { useNavigate, useSearchParams } from "react-router-dom";

const SplashScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("strand_last_display_name");
      if (stored) setFirstName(stored);
    } catch {}
  }, []);

  const nextParam = searchParams.get("next");
  const memberNext = nextParam
    ? `?mode=signin&next=${encodeURIComponent(nextParam)}`
    : "?mode=signin&next=/home";
  const joinNext = nextParam
    ? `?next=${encodeURIComponent(nextParam)}`
    : "?next=/onboarding/profile-step-1";

  return (
    <div className="flex flex-col h-full px-7 pt-16 pb-10 bg-background">
      {/* Top: logo block */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <HairStrandIcon className="w-16 h-16 text-primary mb-8" />

        <h1 className="font-display text-primary text-6xl font-semibold tracking-strand uppercase">
          Strand
        </h1>

        <div className="mt-8 max-w-[260px] text-foreground/75 text-sm leading-relaxed space-y-1">
          <p>
            Built with insights from
            <br />
            <span className="font-display italic text-foreground text-base">
              "How To Love Your Afro"
            </span>
          </p>
          {firstName && (
            <p className="font-body text-foreground text-base">
              Welcome back {firstName}
            </p>
          )}
        </div>
      </div>

      {/* Bottom: CTAs */}
      <div className="flex flex-col gap-3">
        <Button
          variant="gold"
          size="pill"
          onClick={() => navigate(`/auth${firstName ? memberNext : joinNext}`)}
        >
          Sign Up
        </Button>
      </div>
    </div>
  );
};

export default SplashScreen;
