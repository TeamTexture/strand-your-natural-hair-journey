import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Card = ({ title, body, to, navigate }: { title: string; body: React.ReactNode; to: string; navigate: (s: string) => void }) => (
  <SurfaceCard>
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">{title}</p>
      <button onClick={() => navigate(to)} className="text-xs uppercase tracking-[0.15em] text-primary">Edit</button>
    </div>
    {body}
  </SurfaceCard>
);

const WashStep4 = () => {
  const navigate = useNavigate();
  const save = () => {
    toast("💧 Wash day saved!");
    navigate("/home");
  };
  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>4 of 4</span>} onBack={() => navigate("/wash/step-3")} />
      <ProgressDots total={4} current={4} />
      <ItalicSub>Your wash day summary. Tap any section to edit.</ItalicSub>

      <div className="px-5 pb-8 space-y-3">
        <Card
          title="Steps & Products"
          body={
            <p className="text-xs text-foreground/80 leading-relaxed">
              Pre-poo ✓ · Cleanse ✓ (Camille Rose shampoo) · Condition ✓ (TGIN deep cond + Heat Hat 25 mins) · Style ✓ (Camille Rose gel)
            </p>
          }
          to="/wash/step-1" navigate={navigate}
        />
        <Card
          title="Results"
          body={
            <p className="text-xs text-foreground/80 leading-relaxed">
              Scalp: Clean · Breakage: Minimal · Style: Wash &amp; go · Duration: 2-3 hours · Stress: Moderate
            </p>
          }
          to="/wash/step-2" navigate={navigate}
        />
        <Card
          title="How Your Hair Felt"
          body={
            <p className="font-script italic text-sm text-muted-foreground leading-snug">
              "Soft and bouncy after the heat hat. Curls feel really defined and the ends are not as dry as last time."
            </p>
          }
          to="/wash/step-3" navigate={navigate}
        />

        <SurfaceCard tone="green">
          <p className="text-sm leading-snug">
            <span className="font-semibold">🤖 </span>
            Heat treatment during conditioning is working well for your high-porosity hair. The Camille Rose gel is a strong match — no avoid-list ingredients flagged.
          </p>
        </SurfaceCard>

        <Button variant="gold" size="pill" className="mt-4" onClick={save}>
          Save Wash Day
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/home")}>
          Save & Exit
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep4;
