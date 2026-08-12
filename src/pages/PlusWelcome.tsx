import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";
import HairStrandIcon from "@/components/HairStrandIcon";
import ActivatingMembership from "@/components/ActivatingMembership";
import { useMembershipActivation } from "@/hooks/useMembershipActivation";

const PlusWelcome = () => {
  const nav = useNavigate();
  // Verify with Stripe directly — do not wait for the webhook, and do not
  // navigate into a gated route until access is confirmed.
  const { state, retry } = useMembershipActivation(true);

  if (state !== "active") {
    return <ActivatingMembership stuck={state === "stuck"} onRetry={retry} />;
  }

  return (
    <ScreenLayout>
      <div className="px-5 pt-10 pb-10 text-center space-y-5">
        <div className="mx-auto size-20 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center">
          <HairStrandIcon className="h-9 w-auto" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 mx-auto">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
            Welcome to STRAND+
          </span>
        </div>
        <h1 className="font-display text-[30px] font-semibold leading-[1.1]">
          You're in the <span className="italic text-primary">circle</span>.
        </h1>
        <p className="font-body text-[13.5px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
          The community, courses, events and members-only chat are all live for you now.
        </p>
        <Button variant="gold" size="pill" className="w-full" onClick={() => nav("/nutrition-plan")}>
          <span className="inline-flex items-center gap-2">Continue to STRAND <ArrowRight className="size-4" /></span>
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default PlusWelcome;
