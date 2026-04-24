import { useNavigate } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { toast } from "sonner";

interface Alert {
  emoji: string;
  title: string;
  body: string;
  to: string;
}
const alerts: Alert[] = [
  { emoji: "💧", title: "Wash day overdue — Day 9 in braids", body: "Product build-up begins now. Log a cleanse.", to: "/wash-day" },
  { emoji: "🧪", title: "Blood retest due in 72 days", body: "Order your Daye kit — code STRAND20", to: "/onboarding/blood-iron-vitamins" },
  { emoji: "📅", title: "Appointment in 21 days", body: "Dr. Adaeze Okafor · 15 May", to: "/appointments" },
];

interface QA { emoji: string; title: string; sub: string; to: string }
const quickActions: QA[] = [
  { emoji: "💧", title: "Log Wash Day", sub: "Last: 9 days ago", to: "/wash-day" },
  { emoji: "📸", title: "Add Product", sub: "Scan or screenshot", to: "/products/wishlist" },
  { emoji: "📖", title: "Hair Journal", sub: "3 entries", to: "/journal" },
  { emoji: "📅", title: "Appointments", sub: "Next: 15 May", to: "/appointments" },
];

interface Shelf { emoji: string; name: string; brand: string; stars: number; score: number }
const shelf: Shelf[] = [
  { emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose", stars: 5, score: 92 },
  { emoji: "🌿", name: "Scalp Serum", brand: "Mielle", stars: 4, score: 88 },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight" aria-label={`${n} stars`}>
    {"★".repeat(n)}
    <span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const getTimeBasedGreeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 5) return "Good evening"; // late night → still "evening" feels natural
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good evening";
};

const Home = () => {
  const navigate = useNavigate();
  const greeting = getTimeBasedGreeting();

  return (
    <ScreenLayout bottomNav>
      {/* greeting */}
      <header className="px-5 pt-3 pb-4 flex items-start justify-between">
        <div>
          <p className="font-body text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-display text-[24px] font-bold leading-tight">Paige</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/help")}
            aria-label="Help & Support"
            className="size-11 rounded-full bg-card border border-border text-foreground/80 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-colors"
          >
            <HelpCircle className="size-5" />
          </button>
          <button
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            className="size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg shadow-sm"
          >
            ✨
          </button>
        </div>
      </header>

      <div className="px-5 space-y-4 pb-6">
        {/* current style */}
        <SurfaceCard>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Current style</p>
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-[10px] bg-primary/15 flex items-center justify-center text-xl">🌀</div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base font-semibold leading-tight">Box Braids</p>
              <p className="text-xs text-muted-foreground">Day 9 · Take-down in ~5 weeks</p>
            </div>
            <button
              onClick={() => navigate("/onboarding/profile-step-4-colour")}
              className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
            >
              Edit
            </button>
          </div>
        </SurfaceCard>

        {/* alerts */}
        <SurfaceCard tone="dark" padded={false}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-alert-dark-foreground font-medium">
              🔔 Alerts
            </span>
            <button
              onClick={() => toast("All alerts cleared")}
              className="text-[11px] uppercase tracking-[0.15em] text-primary"
            >
              Clear all
            </button>
          </div>
          <div className="px-3 pb-3 space-y-2">
            {alerts.map((a) => (
              <button
                key={a.title}
                onClick={() => navigate(a.to)}
                className="w-full text-left p-3 rounded-[10px] border border-primary/30 bg-alert-dark/40 hover:border-primary/60 transition-colors"
              >
                <p className="text-xs font-medium text-alert-dark-foreground leading-tight">
                  {a.emoji} {a.title}
                </p>
                <p className="text-[11px] text-alert-dark-foreground/70 mt-1">{a.body}</p>
              </button>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <SectionLabel>Quick actions</SectionLabel>
      <div className="px-5 grid grid-cols-2 gap-3">
        {quickActions.map((qa) => (
          <button
            key={qa.title}
            onClick={() => navigate(qa.to)}
            className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
          >
            <div className="text-2xl mb-2">{qa.emoji}</div>
            <p className="text-sm font-medium font-body leading-tight">{qa.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{qa.sub}</p>
          </button>
        ))}
      </div>

      <SectionLabel>My shelf</SectionLabel>
      <div className="px-5 pb-6">
        <SurfaceCard padded={false} className="divide-y divide-border/60">
          {shelf.map((s) => (
            <button
              key={s.name}
              onClick={() => navigate("/products/ingredient")}
              className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-primary/5 transition-colors first:rounded-t-[14px] last:rounded-b-[14px]"
            >
              <div className="size-11 rounded-[10px] bg-primary/15 flex items-center justify-center text-xl">{s.emoji}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-body leading-tight truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground">{s.brand}</p>
                <Stars n={s.stars} />
              </div>
              <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold">
                {s.score}
              </div>
            </button>
          ))}
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default Home;
