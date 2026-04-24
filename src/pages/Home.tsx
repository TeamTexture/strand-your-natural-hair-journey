import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useHomeAlerts } from "@/hooks/useHomeAlerts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { Ruler } from "lucide-react";

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight" aria-label={`${n} stars`}>
    {"★".repeat(n)}
    <span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const getTimeBasedGreeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

interface ProfileStyle {
  current_hairstyle?: string;
  style_set_at?: string;
  planned_next_style?: string;
}
const readStyle = (): ProfileStyle => {
  try { return JSON.parse(localStorage.getItem("strand_current_style") ?? "{}"); }
  catch { return {}; }
};

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const greeting = getTimeBasedGreeting();
  const [firstName, setFirstName] = useState<string>("");
  const { visibleAlerts, loading: alertsLoading, dismiss, dismissAll } = useHomeAlerts();
  const { products: shelfProducts, loading: shelfLoading } = useUserProducts("shelf");
  const { last: lastWash, daysSinceLast } = useWashDays();
  const [nextAppt, setNextAppt] = useState<{ date: string; pro: string } | null>(null);
  const [style, setStyle] = useState<ProfileStyle>(readStyle());

  // Re-read localStorage whenever the user lands on Home, regains focus, the
  // tab becomes visible again, OR an in-tab "strand:style-updated" event fires
  // (dispatched by onboarding Step 4 and the SetCurrentStyle screen the moment
  // they save). The native `storage` event does not fire in the same tab that
  // wrote the value, which is why the custom event is essential.
  useEffect(() => {
    setStyle(readStyle());
  }, [location.key]);

  useEffect(() => {
    const refresh = () => setStyle(readStyle());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("strand:style-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("strand:style-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Resolve the display name from the profiles table first
  useEffect(() => {
    if (!user) { setFirstName(""); return; }
    let cancelled = false;
    const fallback =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "";
    setFirstName(fallback.split(" ")[0]);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.display_name) {
        setFirstName(data.display_name.split(" ")[0]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Next appointment
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("appointment_date, professional_name")
        .eq("user_id", user.id)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .limit(1);
      if (!cancelled && data && data[0]) {
        setNextAppt({ date: data[0].appointment_date, pro: data[0].professional_name });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Days in style
  const daysInStyle = style.style_set_at
    ? Math.max(0, Math.floor((Date.now() - new Date(style.style_set_at).getTime()) / 86_400_000))
    : null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const lastWashSub = lastWash
    ? `Last: ${daysSinceLast === 0 ? "today" : `${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago`}`
    : "Tap to log your first wash day";

  const apptSub = nextAppt ? `Next: ${fmtDate(nextAppt.date)}` : "No upcoming appointments";

  return (
    <ScreenLayout bottomNav>
      {/* greeting */}
      <header className="px-5 pt-3 pb-4 flex items-start justify-between">
        <div>
          <p className="font-body text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-display text-[24px] font-bold leading-tight">
            {firstName || "there"}
          </h1>
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
          {style.current_hairstyle ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-semibold leading-tight">
                  {style.current_hairstyle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {daysInStyle != null ? `Day ${daysInStyle}` : "Just set"}
                  {style.planned_next_style && ` · Next: ${style.planned_next_style}`}
                </p>
              </div>
              <button
                onClick={() => navigate("/home/style")}
                className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/home/style")}
              className="text-left w-full"
            >
              <p className="text-sm text-muted-foreground">
                No style logged yet. Tap to add your current style.
              </p>
            </button>
          )}
        </SurfaceCard>

        {/* alerts */}
        <SurfaceCard tone="dark" padded={false}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-alert-dark-foreground font-medium">
              🔔 Alerts {visibleAlerts.length > 0 && `(${visibleAlerts.length})`}
            </span>
            {visibleAlerts.length > 0 && (
              <button
                onClick={() => {
                  dismissAll();
                  toast("All alerts cleared");
                }}
                className="text-[11px] uppercase tracking-[0.15em] text-primary"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="px-3 pb-3 space-y-2">
            {alertsLoading ? (
              <p className="px-2 py-3 text-[11px] text-alert-dark-foreground/60">
                Checking your data…
              </p>
            ) : visibleAlerts.length === 0 ? (
              <div className="mx-1 my-1 p-3 rounded-[10px] border border-good/40 bg-good/10">
                <p className="text-xs text-good font-medium">
                  No alerts right now. Your hair is on track ✓
                </p>
              </div>
            ) : (
              visibleAlerts.map((a) => (
                <div
                  key={a.id}
                  className="relative w-full p-3 pr-9 rounded-[10px] border border-primary/30 bg-alert-dark/40 hover:border-primary/60 transition-colors"
                >
                  <button
                    onClick={() => navigate(a.to)}
                    className="w-full text-left"
                  >
                    <p className="text-xs font-medium text-alert-dark-foreground leading-tight">
                      {a.emoji} {a.title}
                    </p>
                    <p className="text-[11px] text-alert-dark-foreground/70 mt-1">{a.body}</p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(a.id);
                      toast("Alert cleared");
                    }}
                    aria-label="Dismiss alert"
                    className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center text-alert-dark-foreground/50 hover:text-alert-dark-foreground transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </SurfaceCard>
      </div>

      <SectionLabel>Quick actions</SectionLabel>
      <div className="px-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/wash-day")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">💧</div>
          <p className="text-sm font-medium font-body leading-tight">Log Wash Day</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{lastWashSub}</p>
        </button>
        <button
          onClick={() => navigate("/products")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📸</div>
          <p className="text-sm font-medium font-body leading-tight">Add Product</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Scan or screenshot</p>
        </button>
        <button
          onClick={() => navigate("/journal")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📖</div>
          <p className="text-sm font-medium font-body leading-tight">Hair Journal</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Reflect & document</p>
        </button>
        <button
          onClick={() => navigate("/appointments")}
          className="text-left p-4 rounded-[14px] border border-border bg-card hover:border-primary/50 transition-colors"
        >
          <div className="text-2xl mb-2">📅</div>
          <p className="text-sm font-medium font-body leading-tight">Appointments</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{apptSub}</p>
        </button>
      </div>

      <SectionLabel>My shelf</SectionLabel>
      <div className="px-5 pb-6">
        <SurfaceCard padded={false} className="divide-y divide-border/60">
          {shelfLoading ? (
            <div className="p-4 text-[11px] text-muted-foreground">Loading…</div>
          ) : shelfProducts.length === 0 ? (
            <button
              onClick={() => navigate("/products")}
              className="w-full p-4 text-left text-xs text-muted-foreground hover:bg-primary/5 transition-colors rounded-[14px]"
            >
              Your shelf is empty. Tap + to add your first product.
            </button>
          ) : (
            shelfProducts.slice(0, 4).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/products/ingredient?key=${encodeURIComponent(s.product_key)}&name=${encodeURIComponent(s.name)}&brand=${encodeURIComponent(s.brand ?? "")}`)}
                className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-primary/5 transition-colors first:rounded-t-[14px] last:rounded-b-[14px]"
              >
                <div className="size-11 rounded-[10px] overflow-hidden bg-primary/15 flex items-center justify-center text-xl">
                  {s.image_url ? <img src={s.image_url} alt="" className="size-full object-cover" /> : "🧴"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-body leading-tight truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.brand}</p>
                  <Stars n={s.rating ?? 0} />
                </div>
                {s.match_score != null && (
                  <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold">
                    {s.match_score}
                  </div>
                )}
              </button>
            ))
          )}
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default Home;
