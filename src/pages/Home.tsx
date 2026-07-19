import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductThumb from "@/components/ProductThumb";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useHomeAlerts } from "@/hooks/useHomeAlerts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { useGoals } from "@/hooks/useGoals";
import { useGoalTip } from "@/hooks/useGoalTip";
import { Ruler, Sparkles, Droplet } from "lucide-react";
import {
  loadClinicalContext,
  loadClinicalContextLocal,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";


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

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const greeting = getTimeBasedGreeting();
  const [firstName, setFirstName] = useState<string>("");
  const { visibleAlerts, loading: alertsLoading, dismiss, dismissAll } = useHomeAlerts();
  const { products: shelfProducts, loading: shelfLoading } = useUserProducts("shelf");
  const { last: lastWash, daysSinceLast } = useWashDays();
  const { lengthGoal } = useGoals();
  const { data: goalTip, isLoading: tipLoading } = useGoalTip(lengthGoal);
  const [nextAppt, setNextAppt] = useState<{ date: string; pro: string } | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<ProfileStyle>(() => {
    // Hydrate instantly from the local snapshot so the Home card never
    // flashes empty on first paint.
    const local = loadClinicalContextLocal();
    return {
      current_hairstyle: local.style?.current_hairstyle ?? undefined,
      style_set_at: local.style?.style_set_at ?? undefined,
      planned_next_style: local.style?.planned_next_style ?? undefined,
    };
  });
  const [water, setWater] = useState<{
    band: string | null; mg_l: number | null; supplier: string | null; postcode: string | null;
  }>(() => {
    const local = loadClinicalContextLocal();
    return {
      band: local.basic?.water_hardness_band ?? null,
      mg_l: local.basic?.water_hardness_mg_l ?? null,
      supplier: local.basic?.water_supplier ?? null,
      postcode: local.basic?.postcode ?? null,
    };
  });
  const [waterDialogOpen, setWaterDialogOpen] = useState(false);

  // Re-fetch style from DB (with localStorage fallback) whenever the user
  // lands on Home, regains focus, the tab becomes visible again, OR an
  // in-tab "strand:style-updated" event fires (dispatched by onboarding
  // Step 4 and SetCurrentStyle the moment they save). The custom event
  // matters because the native `storage` event only fires in OTHER tabs.
  useEffect(() => {
    let cancelled = false;
    const refresh = async (forceFresh: boolean) => {
      if (forceFresh) invalidateClinicalContextCache();
      const ctx = await loadClinicalContext();
      if (cancelled) return;
      setStyle({
        current_hairstyle: ctx.style?.current_hairstyle ?? undefined,
        style_set_at: ctx.style?.style_set_at ?? undefined,
        planned_next_style: ctx.style?.planned_next_style ?? undefined,
      });
      setWater({
        band: ctx.basic?.water_hardness_band ?? null,
        mg_l: ctx.basic?.water_hardness_mg_l ?? null,
        supplier: ctx.basic?.water_supplier ?? null,
        postcode: ctx.basic?.postcode ?? null,
      });
    };
    // Initial mount: use the (possibly cached) edge-function result so
    // navigations back to Home don't pay a full decrypt round-trip.
    void refresh(false);
    const onEvt = () => void refresh(true);

    window.addEventListener("focus", onEvt);
    window.addEventListener("storage", onEvt);
    window.addEventListener("strand:style-updated", onEvt);
    document.addEventListener("visibilitychange", onEvt);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onEvt);
      window.removeEventListener("storage", onEvt);
      window.removeEventListener("strand:style-updated", onEvt);
      document.removeEventListener("visibilitychange", onEvt);
    };
  }, [location.key]);

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

  // First "before" photo for the current style card thumbnail.
  useEffect(() => {
    if (!user) { setBeforePhotoUrl(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_before_photos")
        .select("storage_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      const path = (data?.[0] as { storage_path?: string } | undefined)?.storage_path;
      if (!path) return;
      const { data: signed } = await supabase.storage
        .from("before-photos")
        .createSignedUrl(path, 3600);
      if (!cancelled && signed?.signedUrl) setBeforePhotoUrl(signed.signedUrl);
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
          {water.band && (
            <button
              onClick={() => navigate("/profile")}
              title={`${water.supplier ?? "Your area"} · ${water.mg_l ?? "?"} mg/L CaCO₃`}
              aria-label={`Water in your area is ${water.band.replace("_", " ")}`}
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] border ${
                water.band === "very_hard" || water.band === "hard"
                  ? "bg-alert-dark/10 text-alert-dark border-alert-dark/30"
                  : water.band === "moderate"
                    ? "bg-warn/10 text-warn border-warn/30"
                    : "bg-good/10 text-good border-good/30"
              }`}
            >
              <Droplet className="size-3" />
              {water.band.replace("_", " ")} water
            </button>
          )}
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
            className="size-11 rounded-full overflow-hidden shadow-sm"
          >
            <UserAvatar name={firstName || "there"} size="size-11" editable={false} />
          </button>
        </div>
      </header>

      <div className="px-5 space-y-4 pb-6">
        {/* current style */}
        <SurfaceCard>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Current style</p>
          {style.current_hairstyle ? (
            <>
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
                {beforePhotoUrl && (
                  <button
                    onClick={() => navigate("/onboarding/strand-summary")}
                    aria-label="See My Strand Summary"
                    className="size-24 rounded-md overflow-hidden border border-border shrink-0 bg-muted"
                  >
                    <img
                      src={beforePhotoUrl}
                      alt="Your hair"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                <button
                  onClick={() => navigate("/home/style")}
                  className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
                >
                  Edit
                </button>
              </div>
              <button
                onClick={() => navigate("/onboarding/strand-summary")}
                className="mt-3 w-full flex items-center justify-between text-xs uppercase tracking-[0.15em] text-primary font-medium border-t border-border pt-2"
              >
                <span>See My Strand Summary</span>
                <span aria-hidden>→</span>
              </button>
            </>
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

        {/* length goal — populated from the user's primary length-retention
            goal so the home screen reflects what they actually committed to.
            Falls back to a CTA when no goal exists yet. */}
        <SurfaceCard>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Length goal
            </p>
            <button
              onClick={() => navigate("/journal")}
              className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
            >
              {lengthGoal ? "Edit" : "Set"}
            </button>
          </div>
          {lengthGoal ? (
            (() => {
              const unit = lengthGoal.unit || "inches";
              const current = lengthGoal.current_value ?? 0;
              const target = lengthGoal.target_value;
              const start = lengthGoal.start_value ?? 0;
              const pct = target && target > start
                ? Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
                : null;
              const targetDate = lengthGoal.target_date
                ? new Date(lengthGoal.target_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                : null;
              // The user's own words come first — challenge is the free-text
              // they wrote in the editor, target_text is what success looks
              // like to them. Fall back to a numeric summary only if neither
              // exists.
              const userText =
                lengthGoal.challenge?.trim() ||
                lengthGoal.target_text?.trim() ||
                lengthGoal.title?.trim() ||
                null;
              return (
                <div className="w-full">
                  <button
                    onClick={() => navigate("/journal")}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                        <Ruler className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base font-semibold leading-snug">
                          {userText ?? `${current} ${unit}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {target != null
                            ? `${current} / ${target} ${unit}${targetDate ? ` · by ${targetDate}` : ""}`
                            : targetDate
                              ? `Target: ${targetDate}`
                              : "Tap to update progress"}
                        </p>
                      </div>
                    </div>
                    {pct != null && (
                      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </button>

                  {/* AI tip — pulled from the goal-tip edge function using
                      the user's full profile. Cached per goal id+updated_at
                      so it loads instantly after the first generation. */}
                  <div className="mt-3 rounded-[12px] bg-primary/10 border border-primary/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="size-3.5 text-primary" />
                      <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">
                        Strand tip
                      </p>
                    </div>
                    {tipLoading && !goalTip ? (
                      <p className="text-xs text-muted-foreground italic">
                        Personalising a tip for this goal…
                      </p>
                    ) : goalTip ? (
                      <>
                        <p className="text-sm font-medium leading-snug">
                          {goalTip.headline}
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed mt-1">
                          {goalTip.body}
                        </p>
                        {goalTip.actions?.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {goalTip.actions.slice(0, 3).map((a, i) => (
                              <li
                                key={i}
                                className="text-xs text-foreground/80 leading-snug flex gap-1.5"
                              >
                                <span className="text-primary">•</span>
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Tip will appear once your profile has a little more detail.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <button
              onClick={() => navigate("/journal")}
              className="text-left w-full"
            >
              <p className="text-sm text-muted-foreground">
                No length goal set. Tap to add your starting length and target.
              </p>
            </button>
          )}
        </SurfaceCard>
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
                    onClick={() => {
                      if (a.id === "water-hardness") setWaterDialogOpen(true);
                      else navigate(a.to);
                    }}
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
          <p className="text-sm font-medium font-body leading-tight">Style Journal</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Document your favourite styles</p>
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
            <>
              {shelfProducts.slice(0, 4).map((s) => {
                const aiStars = typeof s.match_score === "number"
                  ? Math.max(1, Math.min(5, Math.round(s.match_score / 20)))
                  : (s.rating ?? 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/products/profile/${s.id}`)}
                    className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-primary/5 transition-colors first:rounded-t-[14px]"
                  >
                    <ProductThumb
                      imageUrl={s.image_url}
                      storagePath={s.storage_path}
                      alt={s.name}
                      cover
                      wrapperClassName="size-11 rounded-[10px] overflow-hidden bg-primary/15 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-body leading-tight truncate">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.brand}</p>
                      <Stars n={aiStars} />
                    </div>
                  </button>
                );
              })}
              {shelfProducts.length > 4 && (
                <button
                  onClick={() => navigate("/products")}
                  className="w-full p-3.5 flex items-center justify-center gap-2 text-left text-xs uppercase tracking-[0.15em] text-primary font-medium hover:bg-primary/5 transition-colors rounded-b-[14px]"
                >
                  <span>See Full Shelf</span>
                  <span aria-hidden>→</span>
                </button>
              )}
            </>
          )}
        </SurfaceCard>
      </div>

      <Dialog open={waterDialogOpen} onOpenChange={setWaterDialogOpen}>
        <DialogContent className="max-w-[92%] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {water.band === "very_hard"
                ? "Very hard water"
                : water.band === "hard"
                  ? "Hard water"
                  : water.band === "moderate"
                    ? "Moderately hard water"
                    : "Soft water"}{" "}
              in your area
            </DialogTitle>
            <DialogDescription className="text-xs">
              {water.postcode ? (
                <>Based on your postcode <span className="font-semibold text-foreground">{water.postcode}</span>{water.supplier ? <> — supplied by <span className="font-semibold text-foreground">{water.supplier}</span></> : null}.</>
              ) : (
                <>Add your postcode to your profile so STRAND can tailor water advice.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postcode</span>
                <span className="font-medium">{water.postcode ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium">{water.supplier ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mineral content</span>
                <span className="font-medium">
                  {water.mg_l != null ? `${Math.round(water.mg_l)} mg/L CaCO₃` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Band</span>
                <span className="font-medium capitalize">
                  {(water.band ?? "unknown").replace("_", " ")}
                </span>
              </div>
            </div>

            <div>
              <p className="font-semibold mb-1">What this means for your hair</p>
              {water.band === "hard" || water.band === "very_hard" ? (
                <ul className="list-disc pl-4 space-y-1 text-[13px] text-muted-foreground">
                  <li>Mineral build-up on the cuticle can cause dryness, dullness and colour fade.</li>
                  <li>Add a clarifying wash every 4–5 washes; use a chelating rinse monthly.</li>
                  <li>Follow with a deep condition under a TT Heat Hat.</li>
                  <li>Consider an in-shower filter to reduce calcium and magnesium exposure.</li>
                </ul>
              ) : water.band === "moderate" ? (
                <ul className="list-disc pl-4 space-y-1 text-[13px] text-muted-foreground">
                  <li>Some mineral load — occasional clarifying still helps.</li>
                  <li>Deep condition weekly to keep porosity balanced.</li>
                </ul>
              ) : (
                <ul className="list-disc pl-4 space-y-1 text-[13px] text-muted-foreground">
                  <li>Low mineral load — kind to colour and strand integrity.</li>
                  <li>Focus on protein/moisture balance rather than clarifying.</li>
                </ul>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setWaterDialogOpen(false)}
              className="rounded-pill"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setWaterDialogOpen(false);
                navigate("/profile");
              }}
              className="rounded-pill"
            >
              Update postcode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

export default Home;
