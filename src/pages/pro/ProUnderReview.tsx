import { useNavigate } from "react-router-dom";
import { Clock, LogOut, Mail } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMyProProfile } from "@/hooks/useProProfileReview";

/** Holding screen shown while a submitted professional profile is with the
 *  Strand Council for review. */
const ProUnderReview = () => {
  const nav = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useMyProProfile();

  return (
    <ScreenLayout>
      <TitleBar title="Profile under review" back={false} />
      <div className="px-5 pb-10 space-y-4">
        <div className="pt-4 text-center">
          <div className="mx-auto size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Clock className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold mt-3 leading-tight">
            Thank you — your profile is with the Strand Council.
          </h1>
          <p className="text-[13px] font-body text-foreground/75 leading-relaxed mt-2">
            {profile?.display_name ? `${profile.display_name}, y` : "Y"}our
            submission is being read by a real person. We check every listing by
            hand so members can trust who they're being introduced to.
          </p>
        </div>

        <SurfaceCard tone="gold">
          <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
            What happens next
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] font-body text-foreground/80 leading-snug">
            <li>· We review your details, services and photographs.</li>
            <li>· If anything needs adjusting we'll send it back with a note.</li>
            <li>
              · Once approved, your listing goes live in the directory and your
              dashboard opens.
            </li>
          </ul>
        </SurfaceCard>

        <SurfaceCard>
          <p className="text-[12px] font-body text-foreground/80 leading-snug">
            Nothing is required from you right now. Your details are saved
            exactly as you submitted them.
          </p>
        </SurfaceCard>

        <div className="space-y-2 pt-2">
          <Button
            variant="goldOutline"
            className="w-full"
            onClick={() => nav("/contact")}
          >
            <Mail className="size-4 mr-1.5" /> Contact the Strand team
          </Button>
          <button
            onClick={async () => {
              await signOut();
              nav("/", { replace: true });
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-2"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProUnderReview;
