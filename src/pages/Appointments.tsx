import { useNavigate } from "react-router-dom";
import { Shield, ChevronRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Appointments = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar
        title="Appointments"
        right={
          <button onClick={() => toast("Log new appointment")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            + Log
          </button>
        }
        onBack={() => navigate("/profile")}
      />

      <SectionLabel>Upcoming</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          <p className="text-[11px] text-muted-foreground mb-2">Trichologist · 15 May 2026</p>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-[10px] bg-good/15 flex items-center justify-center">
              <Shield className="size-5 text-good" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base font-semibold leading-tight">Dr. Adaeze Okafor</p>
              <p className="text-[11px] text-muted-foreground">Dr Eve Skin · Chelsea · Follow-up scalp assessment</p>
            </div>
            <span className="bg-primary/15 text-primary text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded">
              Soon
            </span>
          </div>
        </SurfaceCard>
      </div>

      <SectionLabel>Past</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        <SurfaceCard>
          <p className="text-[11px] text-muted-foreground mb-2">Dermatologist · 10 Mar 2026</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 rounded-[10px] bg-good/15 flex items-center justify-center">
              <Shield className="size-5 text-good" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold">Dr. Adaeze Okafor</p>
              <p className="text-[11px] text-muted-foreground">Dr Eve Skin · Scalp & hair assessment · Blood referral</p>
            </div>
            <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">Verified</span>
          </div>
          <p className="text-[11px] text-foreground/80 leading-relaxed border-t border-border pt-2">
            Traction alopecia (temples). High porosity confirmed. Referred for blood work — ferritin and vitamin D deficiency. Reduce tension styles, increase cleansing frequency.
          </p>
        </SurfaceCard>

        <SurfaceCard>
          <p className="text-[11px] text-muted-foreground mb-2">Curl Specialist · 2 Feb 2026</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center text-lg">✂️</div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold">Erica Liburd</p>
              <p className="text-[11px] text-muted-foreground">The Muse Salon · Trim + curl assessment</p>
            </div>
          </div>
          <p className="text-[11px] text-foreground/80 leading-relaxed border-t border-border pt-2">
            Spiky ends caused by overuse of oils + daily steaming. Oils only in formulations, not raw.
          </p>
        </SurfaceCard>

        <SurfaceCard>
          <p className="text-[11px] text-muted-foreground mb-2">Braider · 15 Jan 2026</p>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center text-lg">💆</div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold">Yemi Braids Studio</p>
              <p className="text-[11px] text-muted-foreground">Box braids — medium size · Low tension confirmed ✓</p>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="px-5 pb-4">
        <Button variant="goldOutline" size="pill" onClick={() => toast("Log new appointment")}>
          + Log Appointment
        </Button>
      </div>

      <div className="px-5 pb-8">
        <button
          onClick={() => navigate("/directory")}
          className="w-full p-4 rounded-[14px] bg-secondary border border-border flex items-center gap-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">🔍 Find Recommended Professionals</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Verified trichologists, dermatologists & curl specialists</p>
          </div>
          <ChevronRight className="size-5 text-primary shrink-0" />
        </button>
      </div>
    </ScreenLayout>
  );
};

export default Appointments;
