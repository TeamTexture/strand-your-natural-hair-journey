import { Button } from "@/components/ui/button";
import HairStrandIcon from "./HairStrandIcon";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const SplashScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full px-7 pt-16 pb-10 bg-background">
      {/* Top: logo block */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <HairStrandIcon className="w-16 h-16 text-primary mb-8" />

        <h1 className="font-display text-primary text-6xl font-semibold tracking-strand uppercase">
          Strand
        </h1>

        <p className="mt-8 max-w-[260px] text-foreground/75 text-sm leading-relaxed">
          Built with insights from
          <br />
          <span className="font-display italic text-foreground text-base">
            "How To Love Your Afro"
          </span>
        </p>
      </div>

      {/* Bottom: CTAs */}
      <div className="flex flex-col gap-3">
        <Button
          variant="gold"
          size="pill"
          onClick={() => toast("Membership flow opening — £19.50/mo")}
        >
          Join TT Collective Pro — £19.50/mo
        </Button>

        <Button
          variant="goldOutline"
          size="pill"
          onClick={() => navigate("/onboarding/profile-step-1")}
        >
          I'm Already a Member
        </Button>

        <p className="mt-3 text-center font-script italic text-sm text-foreground/60">
          Exclusive to TT Collective members.
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
