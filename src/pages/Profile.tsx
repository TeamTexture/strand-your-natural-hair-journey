import { useNavigate } from "react-router-dom";
import { Shield, LogOut } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface Row { icon: string; label: string; value: string; tone?: "good" | "warn" | "default" }
const hair: Row[] = [
  { icon: "🧬", label: "Strand diameter", value: "Medium" },
  { icon: "💧", label: "Porosity", value: "High", tone: "warn" },
  { icon: "🌾", label: "Density", value: "High" },
  { icon: "💆", label: "Scalp condition", value: "Dry", tone: "warn" },
  { icon: "🩺", label: "Diagnosed", value: "Traction alopecia", tone: "warn" },
  { icon: "🎨", label: "Colour status", value: "Natural", tone: "good" },
];
const blood: Row[] = [
  { icon: "🩸", label: "Ferritin", value: "12 ng/mL — Low ⚠", tone: "warn" },
  { icon: "☀️", label: "Vitamin D", value: "28 nmol/L — Low ⚠", tone: "warn" },
  { icon: "🔬", label: "Vitamin B12", value: "342 pmol/L ✓", tone: "good" },
  { icon: "🫀", label: "Folate", value: "18.2 nmol/L ✓", tone: "good" },
];

const RowList = ({ rows }: { rows: Row[] }) => (
  <SurfaceCard padded={false} className="divide-y divide-border/60">
    {rows.map((r) => (
      <div key={r.label} className="flex items-center gap-3 px-4 py-3">
        <span className="text-lg w-6 text-center">{r.icon}</span>
        <span className="flex-1 text-sm text-foreground font-body">{r.label}</span>
        <span className={cn(
          "text-xs font-medium text-right",
          r.tone === "warn" && "text-warn",
          r.tone === "good" && "text-good",
          !r.tone && "text-foreground/80",
        )}>
          {r.value}
        </span>
      </div>
    ))}
  </SurfaceCard>
);

const Profile = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Profile"
        back={false}
        right={
          <button onClick={() => toast("Profile link copied")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            Share ↗
          </button>
        }
      />

      <div className="px-5 pb-4 flex items-center gap-3">
        <div className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl">✨</div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg font-semibold leading-tight">Paige Lewin</p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">TT Collective Pro · Age 35</p>
        </div>
      </div>

      <div className="px-5 pb-4 flex flex-wrap gap-2">
        {["⚠ Hard water", "🩸 Low ferritin", "☀️ Low vitamin D", "💊 No medications"].map((c) => (
          <span key={c} className="bg-secondary text-foreground/80 text-[11px] px-2.5 py-1.5 rounded-full">{c}</span>
        ))}
      </div>

      <div className="px-5 pb-4">
        <SurfaceCard tone="green" className="flex items-center gap-3">
          <Shield className="size-5 text-good shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-body">Dr. Adaeze Okafor</p>
            <p className="text-[11px] text-good">✓ GMC Verified Dermatologist · 10 Mar 2026</p>
          </div>
        </SurfaceCard>
      </div>

      <div className="px-5 grid grid-cols-2 gap-3 pb-2">
        <button onClick={() => navigate("/appointments")} className="text-left p-4 rounded-[14px] border border-border bg-card">
          <div className="text-2xl mb-1.5">📅</div>
          <p className="text-sm font-medium leading-tight">Appointments</p>
          <p className="text-[11px] text-muted-foreground">3 logged</p>
        </button>
        <button onClick={() => navigate("/directory")} className="text-left p-4 rounded-[14px] border border-border bg-card">
          <div className="text-2xl mb-1.5">🩺</div>
          <p className="text-sm font-medium leading-tight">Find Professionals</p>
          <p className="text-[11px] text-muted-foreground">Verified directory</p>
        </button>
      </div>

      <SectionLabel>Hair Profile</SectionLabel>
      <div className="px-5 pb-2"><RowList rows={hair} /></div>

      <SectionLabel>Blood Results</SectionLabel>
      <div className="px-5 pb-4"><RowList rows={blood} /></div>

      <div className="px-5 pb-4">
        <SurfaceCard tone="gold">
          <p className="text-sm font-semibold mb-1">Retest in 72 days — 25 Jun 2026</p>
          <p className="text-xs text-foreground/80">Order your Daye at-home kit when ready.</p>
          <span className="inline-block mt-3 bg-primary text-primary-foreground text-[11px] tracking-[0.2em] font-medium px-3 py-1.5 rounded">
            STRAND20
          </span>
        </SurfaceCard>
      </div>

      <div className="px-5 pb-6 space-y-3">
        <Button variant="gold" size="pill" onClick={() => toast("Profile PDF exported")}>
          Export as PDF
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => toast("Share link copied")}>
          Copy Share Link
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default Profile;
