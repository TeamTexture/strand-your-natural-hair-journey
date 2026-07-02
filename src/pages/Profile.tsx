import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Calendar, Droplet, Sparkles, AlertCircle, Pill, Pencil, RefreshCw, HelpCircle, User, Heart, Palette, FlaskConical, Activity, ChevronRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import UserAvatar from "@/components/UserAvatar";
import FontScaleControl from "@/components/FontScaleControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useBloodValues } from "@/hooks/useBloodValues";
import { BLOOD_RANGES, evaluate, statusLabel, type BloodStatus } from "@/data/bloodRanges";

import { generateFullProfilePdf } from "@/lib/fullProfilePdf";
import { generateProfessionalSnapshotPdf } from "@/lib/professionalSnapshotPdf";
import { loadClinicalContext, loadClinicalContextLocal } from "@/lib/clinicalContext";

// ---------- Types ----------
interface BasicProfile {
  name?: string;
  age?: string | number;
  postcode?: string;
}
interface HairProfile {
  diameter?: string | string[];
  texture?: string | string[];
  density?: string | string[];
  porosity?: string | string[];
  scalp?: string | string[];
  diagnosed?: string[];
}
interface HealthProfile {
  conditions?: string[];
  medications?: string[];
  diet?: string;
  smoke?: string;
  alcohol?: string;
}
interface Appt {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  professional_name: string;
  professional_type: string | null;
  status: string;
}


const formatShortDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch { return iso; }
};

// ---------- Sub-components ----------
const InitialAvatar = ({ name }: { name: string }) => {
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);
  return (
    <div className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold">
      {initials}
    </div>
  );
};

interface AlertItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  tone: "warn" | "info" | "good";
  onClick?: () => void;
}

const AlertCard = ({ alert }: { alert: AlertItem }) => (
  <button
    onClick={alert.onClick}
    disabled={!alert.onClick}
    className={cn(
      "w-full text-left flex items-center gap-3 p-3.5 rounded-[12px] border min-h-[64px] transition-colors",
      alert.tone === "warn" && "bg-warn/10 border-warn/40 hover:bg-warn/15",
      alert.tone === "info" && "bg-primary/10 border-primary/30 hover:bg-primary/15",
      alert.tone === "good" && "bg-good/10 border-good/30 hover:bg-good/15",
      !alert.onClick && "cursor-default",
    )}
  >
    <div className={cn(
      "size-10 rounded-full flex items-center justify-center shrink-0",
      alert.tone === "warn" && "bg-warn/20 text-warn",
      alert.tone === "info" && "bg-primary/20 text-primary",
      alert.tone === "good" && "bg-good/20 text-good",
    )}>
      {alert.icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold leading-tight truncate">{alert.label}</p>
      <p className="text-[11px] text-foreground/70 mt-0.5 truncate">{alert.detail}</p>
    </div>
  </button>
);

// Section label with an inline "Edit" affordance routing to the right onboarding screen.
const EditableSectionLabel = ({
  children,
  onEdit,
  editLabel = "Edit",
}: { children: React.ReactNode; onEdit: () => void; editLabel?: string }) => (
  <div className="px-5 pt-2 pb-1.5 flex items-end justify-between">
    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
      {children}
    </span>
    <button
      onClick={onEdit}
      className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium inline-flex items-center gap-1 px-2 -mr-2 min-h-[36px]"
    >
      <Pencil className="size-3" /> {editLabel}
    </button>
  </div>
);


// ---------- Page ----------
const Profile = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { values: bloodValues } = useBloodValues();

  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingSnapshot, setExportingSnapshot] = useState(false);

  // Quick-jump destinations for the edit picker.
  const editTargets = useMemo(
    () => [
      { key: "basic", label: "Basic details", hint: "Name, age, postcode", icon: User, route: "/onboarding/profile-step-1" },
      { key: "health", label: "Health & lifestyle", hint: "Conditions, diet, habits", icon: Heart, route: "/onboarding/profile-step-2" },
      { key: "hair", label: "Hair profile", hint: "Diameter, porosity, density", icon: Activity, route: "/onboarding/profile-step-3-hair" },
      { key: "colour", label: "Colour & styling", hint: "Treatments & products", icon: Palette, route: "/onboarding/profile-step-4-colour" },
      { key: "meds", label: "Medications", hint: "Prescriptions & supplements", icon: Pill, route: "/onboarding/profile-step-2" },
      { key: "blood-iv", label: "Iron & vitamins", hint: "Ferritin, B12, vit D", icon: Droplet, route: "/onboarding/blood-iron-vitamins" },
      { key: "blood-thy", label: "Thyroid", hint: "TSH, T3, T4", icon: FlaskConical, route: "/onboarding/blood-thyroid" },
      { key: "blood-min", label: "Minerals", hint: "Zinc, magnesium", icon: FlaskConical, route: "/onboarding/blood-minerals" },
      { key: "blood-horm", label: "Hormones", hint: "Oestrogen, testosterone", icon: FlaskConical, route: "/onboarding/blood-hormones" },
      { key: "blood-sum", label: "Blood AI summary", hint: "View interpretation", icon: Sparkles, route: "/onboarding/blood-ai-summary" },
    ],
    [],
  );

  const jumpTo = (route: string) => {
    setEditPickerOpen(false);
    navigate(route);
  };

  // Cache clinical fragments so navigating away/back is instant.
  // staleTime: Infinity — invalidated by the onboarding edit screens after save.
  const { data: clinical } = useQuery({
    queryKey: ["profile", "clinical", user?.id ?? "anon"],
    queryFn: () => loadClinicalContext(),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    // Render immediately from the local snapshot so fields aren't blank on
    // first paint; the DB overlay refreshes the cache in the background.
    initialData: loadClinicalContextLocal,
    initialDataUpdatedAt: 0,
  });

  const basic: BasicProfile = useMemo(() => ({
    name: clinical?.basic?.name ?? undefined,
    age: clinical?.basic?.age ?? undefined,
    postcode: clinical?.basic?.postcode ?? undefined,
  }), [clinical]);
  const hair: HairProfile = useMemo(() => ({
    diameter: clinical?.hair?.diameter,
    texture: clinical?.hair?.texture,
    density: clinical?.hair?.density,
    porosity: clinical?.hair?.porosity,
    scalp: clinical?.hair?.scalp,
    diagnosed: clinical?.hair?.diagnosed,
  }), [clinical]);
  const health: HealthProfile = useMemo(() => ({
    conditions: clinical?.health?.conditions,
    medications: clinical?.health?.medications,
    diet: clinical?.health?.diet,
    smoke: clinical?.health?.smoke?.[0],
    alcohol: clinical?.health?.alcohol,
  }), [clinical]);

  const lastWashRaw =
    typeof window !== "undefined"
      ? localStorage.getItem("strand_last_wash_date")
      : null;

  // Cached profile display_name lookup.
  const { data: profileName = null } = useQuery({
    queryKey: ["profile", "display_name", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.display_name ?? null;
    },
  });

  // Cached upcoming appointments.
  const { data: appts = [], isSuccess: apptsLoaded } = useQuery({
    queryKey: ["profile", "appts", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, professional_name, professional_type, status")
        .eq("user_id", user!.id)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .limit(2);
      return (data ?? []) as Appt[];
    },
  });



  // Backend blood results — source-of-truth for flagged markers so alerts
  // still fire on a fresh device/session where localStorage is empty.
  const { data: dbBloodRows = [] } = useQuery({
    queryKey: ["profile", "blood_results", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data } = await supabase
        .from("blood_results")
        .select("marker, value, status, unit")
        .eq("user_id", user!.id);
      return (data ?? []) as Array<{ marker: string; value: number | null; status: string | null; unit: string | null }>;
    },
  });

  // ---------- Derived: only present if real data exists ----------
  // Name priority: onboarding "basic" name → DB display_name → auth metadata → titlecased email prefix.
  // We only fall back to the email prefix as an absolute last resort, and we
  // titlecase it (and replace dots/underscores with spaces) so it doesn't look like a login.
  const titleCase = (s: string) =>
    s
      .replace(/[._-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

  const rawName =
    (basic.name && basic.name.trim()) ||
    (profileName && profileName.trim()) ||
    (user?.user_metadata?.display_name as string | undefined)?.trim() ||
    "";
  const displayName = rawName || (user?.email ? titleCase(user.email.split("@")[0]) : "");
  const ageDisplay = basic.age !== undefined && basic.age !== "" ? `Age ${basic.age}` : "";

  

  // Flagged blood markers (low/high) — merge local onboarding values with
  // backend rows so a signed-in user always sees their persisted results.
  const flaggedBlood = useMemo(() => {
    const map = new Map<string, { marker: string; value: number; status: BloodStatus; unit: string }>();
    for (const [marker, value] of Object.entries(bloodValues)) {
      if (value === null || value === undefined || Number.isNaN(value)) continue;
      const status = evaluate(marker, value as number);
      if (status === "low" || status === "high") {
        map.set(marker, { marker, value: value as number, status, unit: BLOOD_RANGES[marker]?.unit ?? "" });
      }
    }
    for (const row of dbBloodRows) {
      if (map.has(row.marker)) continue;
      if (row.value === null || row.value === undefined) continue;
      // Prefer computed evaluation for consistency; fall back to stored status.
      const computed = evaluate(row.marker, row.value);
      const status: BloodStatus = computed !== "untested"
        ? computed
        : (row.status === "low" || row.status === "high" || row.status === "normal")
          ? (row.status as BloodStatus)
          : "untested";
      if (status === "low" || status === "high") {
        map.set(row.marker, {
          marker: row.marker,
          value: row.value,
          status,
          unit: row.unit ?? BLOOD_RANGES[row.marker]?.unit ?? "",
        });
      }
    }
    return Array.from(map.values());
  }, [bloodValues, dbBloodRows]);

  // Wash day alert: due if last wash was 7+ days ago.
  const washAlert = useMemo(() => {
    if (!lastWashRaw) return null;
    const last = new Date(lastWashRaw);
    if (isNaN(last.getTime())) return null;
    const days = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (days >= 7) return { days, lastDate: last };
    return null;
  }, [lastWashRaw]);

  // Build chips list — ONLY from real data
  const chips = useMemo(() => {
    const out: string[] = [];
    flaggedBlood.slice(0, 3).forEach((b) => {
      out.push(`🩸 ${b.status === "low" ? "Low" : "High"} ${b.marker.toLowerCase()}`);
    });
    if (Array.isArray(health.medications) && health.medications.length === 0) {
      out.push("💊 No medications");
    } else if (Array.isArray(health.medications) && health.medications.length > 0) {
      out.push(`💊 ${health.medications.length} medication${health.medications.length === 1 ? "" : "s"}`);
    }
    if (Array.isArray(hair.diagnosed)) {
      hair.diagnosed.slice(0, 2).forEach((d) => out.push(`🩺 ${d}`));
    }
    return out;
  }, [flaggedBlood, health.medications, hair.diagnosed]);

  // Build alerts list (priority: blood > wash > appointments)
  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];

    // Most-flagged blood marker first
    if (flaggedBlood.length > 0) {
      const worst = flaggedBlood[0];
      out.push({
        key: "blood",
        icon: <AlertCircle className="size-5" />,
        label: `${worst.status === "low" ? "Low" : "High"} ${worst.marker}`,
        detail: `${worst.value} ${worst.unit} · ${flaggedBlood.length > 1 ? `+${flaggedBlood.length - 1} more flagged` : "View blood summary"}`,
        tone: "warn",
        onClick: () => navigate("/onboarding/blood-ai-summary"),
      });
    }

    // Wash day overdue
    if (washAlert) {
      out.push({
        key: "wash",
        icon: <Droplet className="size-5" />,
        label: "Wash day due",
        detail: `${washAlert.days} days since last wash`,
        tone: washAlert.days >= 14 ? "warn" : "info",
        onClick: () => navigate("/wash"),
      });
    }

    // Next 1-2 upcoming appointments
    appts.slice(0, 2).forEach((a) => {
      out.push({
        key: `appt-${a.id}`,
        icon: <Calendar className="size-5" />,
        label: `${a.professional_name}`,
        detail: `${formatShortDate(a.appointment_date)}${a.appointment_time ? ` · ${a.appointment_time}` : ""}${a.professional_type ? ` · ${a.professional_type}` : ""}`,
        tone: "info",
        onClick: () => navigate("/appointments"),
      });
    });

    return out;
  }, [flaggedBlood, washAlert, appts, navigate]);

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const { blob, fileName } = await generateFullProfilePdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Profile PDF downloaded");
    } catch (e) {
      console.error("Profile PDF export failed", e);
      toast.error("Could not export PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const hasAnyProfileData = displayName || hair.diameter || flaggedBlood.length > 0 || health.medications;

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Profile"
        back={false}
        right={
          <button onClick={() => toast("Profile link copied")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]">
            Share ↗
          </button>
        }
      />

      {/* Identity */}
      <div className="px-5 pb-4 flex items-center gap-3">
        <UserAvatar name={displayName || "?"} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg font-semibold leading-tight truncate">
            {displayName || "Welcome"}
          </p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium truncate">
            STRAND Member{ageDisplay ? ` · ${ageDisplay}` : ""}
          </p>
        </div>
        <button
          onClick={() => setEditPickerOpen(true)}
          aria-label="Edit profile"
          className="size-10 rounded-full border border-border bg-card flex items-center justify-center text-foreground/80 hover:text-primary hover:border-primary/50 transition-colors shrink-0"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {/* Edit picker: jump straight to any section */}
      <Dialog open={editPickerOpen} onOpenChange={setEditPickerOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-[360px] sm:max-w-md rounded-[20px] p-5 gap-3 overflow-hidden max-h-[80vh] overflow-y-auto">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-display text-lg">What would you like to edit?</DialogTitle>
            <DialogDescription className="text-[12px]">
              Tap a bubble to jump straight to that section.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 pt-1">
            {editTargets.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => jumpTo(t.route)}
                  className="group inline-flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full border border-border bg-card hover:border-primary/60 hover:bg-primary/10 transition-colors min-h-[40px]"
                >
                  <span className="size-6 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-[13px] font-medium leading-none">{t.label}</span>
                </button>
              );
            })}
          </div>
          <div className="pt-2 mt-1 border-t border-border/60 -mx-5 px-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground pt-3 pb-1">Or browse all</p>
            <div className="space-y-1">
              {editTargets.map((t) => (
                <button
                  key={`row-${t.key}`}
                  onClick={() => jumpTo(t.route)}
                  className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-secondary/60 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{t.hint}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update after appointment CTA — go straight to the section being updated */}
      <div className="px-5 pb-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/onboarding/profile-step-3-hair")}
          className="flex flex-col items-start gap-2 p-3.5 rounded-[12px] bg-primary/10 border border-primary/30 hover:bg-primary/15 transition-colors min-h-[88px] text-left"
        >
          <div className="size-9 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <RefreshCw className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Update hair details</p>
            <p className="text-[11px] text-foreground/70 mt-0.5 leading-snug">
              Diameter, porosity, density &amp; scalp.
            </p>
          </div>
        </button>
        <button
          onClick={() => navigate("/onboarding/blood-iron-vitamins")}
          className="flex flex-col items-start gap-2 p-3.5 rounded-[12px] bg-primary/10 border border-primary/30 hover:bg-primary/15 transition-colors min-h-[88px] text-left"
        >
          <div className="size-9 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <RefreshCw className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Update blood results</p>
            <p className="text-[11px] text-foreground/70 mt-0.5 leading-snug">
              Just had a test? Refresh your markers.
            </p>
          </div>
        </button>
      </div>

      {/* Help & Support — always-visible entry point */}
      <div className="px-5 pb-4">
        <button
          onClick={() => navigate("/help")}
          className="w-full flex items-center gap-3 p-3.5 rounded-[12px] bg-card border border-border hover:border-primary/50 transition-colors min-h-[56px] text-left"
        >
          <div className="size-10 rounded-full bg-secondary text-foreground/80 flex items-center justify-center shrink-0">
            <HelpCircle className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Help & Support</p>
            <p className="text-[11px] text-foreground/70 mt-0.5">
              Install guide, FAQs and how to reach us.
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium pr-1">Open ›</span>
        </button>
      </div>

      {/* Accessibility — global text size */}
      <SectionLabel>Accessibility</SectionLabel>
      <div className="px-5 pb-4">
        <div className="p-4 rounded-[12px] bg-card border border-border">
          <FontScaleControl />
        </div>
      </div>


      {/* Alerts — replaces the chips area when data exists */}
      <SectionLabel>Alerts & Upcoming</SectionLabel>
      <div className="px-5 pb-4">
        {!apptsLoaded ? (
          <div className="h-[64px] rounded-[12px] bg-card border border-border animate-pulse" />
        ) : alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((a) => <AlertCard key={a.key} alert={a} />)}
          </div>
        ) : (
          <div className="p-4 rounded-[12px] bg-good/10 border border-good/30 flex items-center gap-3">
            <Sparkles className="size-5 text-good shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">All clear</p>
              <p className="text-[11px] text-foreground/70 mt-0.5">
                No flagged blood markers, wash days, or upcoming appointments.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Context chips — only render if there's something real */}
      {chips.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="bg-secondary text-foreground/80 text-[11px] px-2.5 py-1.5 rounded-full">{c}</span>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="px-5 grid grid-cols-2 gap-3 pb-2">
        <button onClick={() => navigate("/appointments")} className="text-left p-4 rounded-[14px] border border-border bg-card min-h-[44px]">
          <div className="text-2xl mb-1.5">📅</div>
          <p className="text-sm font-medium leading-tight">Appointments</p>
          <p className="text-[11px] text-muted-foreground">{appts.length > 0 ? `${appts.length} upcoming` : "Tap to log"}</p>
        </button>
        <button onClick={() => navigate("/directory")} className="text-left p-4 rounded-[14px] border border-border bg-card min-h-[44px]">
          <div className="text-2xl mb-1.5">🩺</div>
          <p className="text-sm font-medium leading-tight">Find Professionals</p>
          <p className="text-[11px] text-muted-foreground">Verified directory</p>
        </button>
        <button onClick={() => navigate("/nutrition-plan")} className="text-left p-4 rounded-[14px] border border-border bg-card min-h-[44px]">
          <div className="text-2xl mb-1.5">🥗</div>
          <p className="text-sm font-medium leading-tight">Nutrition Plan</p>
          <p className="text-[11px] text-muted-foreground">Personalised</p>
        </button>
        <button onClick={() => navigate("/onboarding/blood-ai-summary")} className="text-left p-4 rounded-[14px] border border-border bg-card min-h-[44px]">
          <div className="text-2xl mb-1.5">🧪</div>
          <p className="text-sm font-medium leading-tight">Blood Summary</p>
          <p className="text-[11px] text-muted-foreground">
            {flaggedBlood.length > 0 ? `${flaggedBlood.length} flagged` : "AI-generated"}
          </p>
        </button>
      </div>

      {/* Hair Profile — only if user filled it in */}
      {(hair.diameter || hair.porosity || hair.density || hair.scalp || (hair.diagnosed?.length ?? 0) > 0) && (
        <>
          <EditableSectionLabel onEdit={() => navigate("/onboarding/profile-step-3-hair")}>
            Hair Profile
          </EditableSectionLabel>
          <div className="px-5 pb-2">
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {(() => {
                // Some onboarding steps store multi-select values as arrays;
                // older entries are plain strings. Normalize before rendering.
                const toStr = (v: unknown): string =>
                  Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
                const diameter = toStr(hair.diameter);
                const porosity = toStr(hair.porosity);
                const density = toStr(hair.density);
                const scalp = toStr(hair.scalp);
                return (
                  <>
                    {diameter && <ProfileRow icon="🧬" label="Strand diameter" value={diameter} />}
                    {porosity && <ProfileRow icon="💧" label="Porosity" value={porosity} tone={porosity.toLowerCase().includes("high") ? "warn" : undefined} />}
                    {density && <ProfileRow icon="🌾" label="Density" value={density} />}
                    {scalp && <ProfileRow icon="💆" label="Scalp condition" value={scalp} tone={scalp.toLowerCase().includes("dry") || scalp.toLowerCase().includes("oily") ? "warn" : undefined} />}
                  </>
                );
              })()}
              {hair.diagnosed && hair.diagnosed.length > 0 && (
                <ProfileRow icon="🩺" label="Diagnosed" value={hair.diagnosed.join(", ")} tone="warn" />
              )}
            </SurfaceCard>
          </div>
        </>
      )}

      {/* Blood Results — only if user entered any */}
      {flaggedBlood.length > 0 ? (
        <>
          <EditableSectionLabel onEdit={() => navigate("/onboarding/blood-iron-vitamins")} editLabel="Update">
            Flagged Blood Results
          </EditableSectionLabel>
          <div className="px-5 pb-4">
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {flaggedBlood.map((b) => (
                <ProfileRow
                  key={b.marker}
                  icon={b.status === "low" ? "🩸" : "⚠️"}
                  label={b.marker}
                  value={`${b.value} ${b.unit} — ${statusLabel(b.status)}`}
                  tone="warn"
                />
              ))}
            </SurfaceCard>
          </div>
        </>
      ) : Object.values(bloodValues).some((v) => v !== null && v !== undefined && !Number.isNaN(v)) ? (
        <>
          <EditableSectionLabel onEdit={() => navigate("/onboarding/blood-iron-vitamins")} editLabel="Update">
            Blood Results
          </EditableSectionLabel>
          <div className="px-5 pb-4">
            <div className="p-4 rounded-[14px] bg-good/10 border border-good/30 flex items-center gap-3">
              <Sparkles className="size-5 text-good shrink-0" />
              <p className="text-sm">All blood markers in normal range</p>
            </div>
          </div>
        </>
      ) : null}

      {/* Medications — only if user added any */}
      {Array.isArray(health.medications) && health.medications.length > 0 && (
        <>
          <EditableSectionLabel onEdit={() => navigate("/onboarding/profile-step-2")}>
            Medications
          </EditableSectionLabel>
          <div className="px-5 pb-4">
            <SurfaceCard padded={false} className="divide-y divide-border/60">
              {health.medications.slice(0, 5).map((m) => (
                <div key={m} className="flex items-center gap-3 px-4 py-3">
                  <Pill className="size-4 text-primary shrink-0" />
                  <span className="flex-1 text-sm font-body truncate">{m}</span>
                </div>
              ))}
            </SurfaceCard>
          </div>
        </>
      )}

      {/* Progress photos shortcut */}
      <SectionLabel>Progress Photos</SectionLabel>
      <div className="px-5 pb-4">
        <button
          onClick={() => navigate("/profile/milestones")}
          className="w-full flex items-center gap-3 p-3.5 rounded-[12px] bg-card border border-border hover:border-primary/50 transition-colors min-h-[56px] text-left"
        >
          <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-lg">📸</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Milestone gallery</p>
            <p className="text-[11px] text-foreground/70 mt-0.5">
              6-week check-ins so real progress is visible.
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </button>
      </div>


      {!hasAnyProfileData && (
        <div className="px-5 py-6">
          <EmptyState
            icon="✨"
            message="Let's set up your profile"
            hint="Complete onboarding to see your alerts and recommendations here."
          />
          <div className="mt-4">
            <Button variant="gold" size="pill" onClick={() => navigate("/onboarding/profile-step-1")}>
              Start Onboarding
            </Button>
          </div>
        </div>
      )}

      <div className="px-5 pb-6 space-y-3 mt-4">
        <Button variant="gold" size="pill" onClick={() => handleExportPdf()} disabled={exportingPdf}>
          {exportingPdf ? "Generating PDF…" : "Download full profile (PDF)"}
        </Button>
        <button
          onClick={async () => { await signOut(); navigate("/", { replace: true }); }}
          className="w-full flex items-center justify-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground py-3 min-h-[44px]"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>
    </ScreenLayout>
  );
};

// ---------- Local row helper ----------
const ProfileRow = ({
  icon, label, value, tone,
}: { icon: string; label: string; value: string; tone?: "warn" | "good" }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <span className="text-lg w-6 text-center">{icon}</span>
    <span className="flex-1 text-sm text-foreground font-body truncate">{label}</span>
    <span className={cn(
      "text-xs font-medium text-right max-w-[55%] truncate",
      tone === "warn" && "text-warn",
      tone === "good" && "text-good",
      !tone && "text-foreground/80",
    )}>
      {value}
    </span>
  </div>
);

export default Profile;
