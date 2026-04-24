import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ProCard = ({
  emoji, name, type, verified, clinic, code, codeText,
}: { emoji: string; name: string; type: string; verified: string; clinic: string; code: string; codeText: string }) => (
  <SurfaceCard padded={false} className="overflow-hidden">
    <div className="p-4 flex gap-3">
      <div className="size-14 rounded-[12px] bg-primary/15 flex items-center justify-center text-2xl shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-base font-semibold leading-tight">{name}</h3>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">{type}</span>
          <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
            {verified} ✓
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{clinic}</p>
      </div>
    </div>
    <div className="bg-primary/15 px-4 py-2.5 text-xs font-body">
      <span className="font-semibold tracking-[0.1em] uppercase text-primary">{code}</span>
      <span className="text-foreground/80"> — {codeText}</span>
    </div>
  </SurfaceCard>
);

const ProBook = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Book a Professional" right={<span>3 of 9</span>} />
      <ProgressDots total={9} current={3} />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard tone="orange">
          <p className="text-sm leading-snug">
            Your app will unlock once you have had your appointment. Open Strand during or after your consultation to fill in your hair characteristics with your professional.
          </p>
        </SurfaceCard>

        <SectionLabel>Recommended professionals near you</SectionLabel>

        <ProCard
          emoji="🏥" name="Teresa Richardson" type="Trichologist · IOT Verified"
          verified="IOT Verified" clinic="Fulham Scalp & Hair Clinic"
          code="STRAND15" codeText="15% off first consultation"
        />
        <ProCard
          emoji="⚕️" name="Dr. Yvonne Abimbola" type="Dermatologist · GMC Verified"
          verified="GMC Verified" clinic="Dr Eve Skin"
          code="STRAND20" codeText="£20 off first assessment"
        />

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            placeholder="Search all professionals near me"
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>

        <SurfaceCard tone="gold">
          <p className="text-xs font-body">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">Tip — </span>
            Show your professional this app at your appointment. They can help you fill in your hair characteristics in real time.
          </p>
        </SurfaceCard>

        <Button variant="goldGhost" size="pill" onClick={() => navigate("/onboarding/pro-gate")}>
          ← I do have a recent appointment
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProBook;
