import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ShieldCheck, ShieldOff } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProSubscription } from "@/hooks/useProSubscription";

type Section = "overview" | "blood" | "colour" | "wash" | "journal" | "shelf" | "appointments";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "blood", label: "Blood work" },
  { key: "colour", label: "Colour history" },
  { key: "wash", label: "Wash days" },
  { key: "journal", label: "Style journal" },
  { key: "shelf", label: "Product shelf" },
  { key: "appointments", label: "Appointments" },
];

interface PassportData {
  clientName: string;
  hair: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
  goals: Array<{ id: string; title: string; status: string | null; target_text: string | null }>;
  bloodSummary: { payload: unknown; created_at: string } | null;
  bloodResults: Array<{ marker: string; value: number | null; unit: string | null; status: string | null; updated_at: string }>;
  washDays: Array<{ id: string; wash_date: string; steps: unknown; scalp_feel: string | null; breakage: string | null }>;
  journal: Array<{ id: string; entry_date: string; title: string | null; note: string | null; photo_paths: string[] | null }>;
  shelf: Array<{ id: string; name: string; brand: string | null; category: string | null; on_shelf: boolean | null; on_favourite: boolean | null; rating: number | null }>;
  appointments: Array<{ id: string; appointment_date: string; appointment_time: string | null; professional_type: string | null; professional_name: string | null; clinic_name: string | null; reason: string | null; outcome_notes: string | null; status: string | null }>;
}

const logView = async (consumerId: string, section: Section) => {
  try {
    await supabase.functions.invoke("passport-view-log", {
      body: { consumer_id: consumerId, section },
    });
  } catch {
    // best-effort — server enforces consent independently via RLS
  }
};

const usePassport = (consumerId: string | undefined, active: boolean) => {
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessEnded, setAccessEnded] = useState(false);

  useEffect(() => {
    if (!consumerId || !active) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Every read below is RLS-gated; when consent is revoked the queries
      // return empty rowsets automatically. We detect access-ended by looking
      // for a total absence of *any* passport data (profile + hair both empty).
      const [
        profile, hair, health, style, goals,
        bloodSum, blood, wash, journal, shelf, appts,
      ] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("user_id", consumerId).maybeSingle(),
        supabase.from("user_hair_profile").select("*").eq("user_id", consumerId).maybeSingle(),
        supabase.from("user_health_profile").select("*").eq("user_id", consumerId).maybeSingle(),
        supabase.from("user_style_profile").select("*").eq("user_id", consumerId).maybeSingle(),
        supabase.from("user_goals").select("id, title, status, target_text").eq("user_id", consumerId).order("created_at", { ascending: false }),
        supabase.from("ai_summaries").select("payload, created_at").eq("user_id", consumerId).eq("kind", "blood").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("blood_results").select("marker, value, unit, status, updated_at").eq("user_id", consumerId).in("status", ["low", "high", "borderline"]).order("updated_at", { ascending: false }).limit(30),
        supabase.from("wash_days").select("id, wash_date, steps, scalp_feel, breakage").eq("user_id", consumerId).order("wash_date", { ascending: false }).limit(10),
        supabase.from("journal_entries").select("id, entry_date, title, note, photo_paths").eq("user_id", consumerId).order("entry_date", { ascending: false }).limit(10),
        supabase.from("user_products").select("id, name, brand, category, on_shelf, on_favourite, rating").eq("user_id", consumerId).order("updated_at", { ascending: false }).limit(40),
        supabase.from("appointments").select("id, appointment_date, appointment_time, professional_type, professional_name, clinic_name, reason, outcome_notes, status").eq("user_id", consumerId).order("appointment_date", { ascending: false }).limit(15),
      ]);

      if (cancelled) return;

      const noAccess = !profile.data && !hair.data && !health.data && !style.data
        && (goals.data ?? []).length === 0 && (wash.data ?? []).length === 0
        && (appts.data ?? []).length === 0;

      if (noAccess) {
        setAccessEnded(true);
        setData(null);
        setLoading(false);
        return;
      }

      setData({
        clientName: (profile.data?.display_name as string) ?? "Client",
        hair: hair.data as Record<string, unknown> | null,
        health: health.data as Record<string, unknown> | null,
        style: style.data as Record<string, unknown> | null,
        goals: (goals.data ?? []) as PassportData["goals"],
        bloodSummary: bloodSum.data as PassportData["bloodSummary"],
        bloodResults: (blood.data ?? []) as PassportData["bloodResults"],
        washDays: (wash.data ?? []) as PassportData["washDays"],
        journal: (journal.data ?? []) as PassportData["journal"],
        shelf: (shelf.data ?? []) as PassportData["shelf"],
        appointments: (appts.data ?? []) as PassportData["appointments"],
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [consumerId, active]);

  return { data, loading, accessEnded };
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3 text-[13px]">
    <span className="text-muted-foreground w-[110px] shrink-0">{label}</span>
    <span className="flex-1">{value ?? "—"}</span>
  </div>
);

const oneOf = (v: unknown): string | null => {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || null;
  if (typeof v === "string") return v || null;
  if (typeof v === "number") return String(v);
  return null;
};

const AccessEnded = ({ onBack }: { onBack: () => void }) => (
  <div className="px-5 py-8 space-y-4">
    <SurfaceCard tone="gold">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-alert-dark/15 text-alert-dark flex items-center justify-center shrink-0">
          <ShieldOff className="size-5" />
        </div>
        <div className="flex-1">
          <p className="font-display text-base font-semibold leading-tight">Access ended</p>
          <p className="text-xs font-body text-muted-foreground mt-1 leading-snug">
            This client has revoked access or your subscription is not active. You can no
            longer view their Strand passport.
          </p>
          <Button className="mt-3 w-full" variant="outline" onClick={onBack}>
            Back to enquiries
          </Button>
        </div>
      </div>
    </SurfaceCard>
  </div>
);

const ProClientPassport = () => {
  const nav = useNavigate();
  const { consumerId } = useParams<{ consumerId: string }>();
  const { user } = useAuth();
  const { isActive, isLoading: subLoading } = useProSubscription();
  const [section, setSection] = useState<Section>("overview");

  const canView = !!user && !subLoading && isActive && !!consumerId;
  const { data, loading, accessEnded } = usePassport(consumerId, canView);

  // Log on mount + when section changes
  useEffect(() => {
    if (!canView || !consumerId || accessEnded) return;
    logView(consumerId, section);
  }, [canView, consumerId, section, accessEnded]);

  const bloodHtml = useMemo(() => {
    const p = data?.bloodSummary?.payload as { html?: string; summary?: string } | null | undefined;
    return p?.html ?? p?.summary ?? null;
  }, [data]);

  if (!subLoading && !isActive) {
    return (
      <ScreenLayout>
        <TitleBar title="Client passport" onBack={() => nav("/pro/enquiries")} />
        <AccessEnded onBack={() => nav("/pro/billing")} />
      </ScreenLayout>
    );
  }

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Client passport" onBack={() => nav("/pro/enquiries")} />
        <LoadingDot label="Loading passport…" fullScreen={false} />
      </ScreenLayout>
    );
  }

  if (accessEnded || !data) {
    return (
      <ScreenLayout>
        <TitleBar title="Client passport" onBack={() => nav("/pro/enquiries")} />
        <AccessEnded onBack={() => nav("/pro/enquiries")} />
      </ScreenLayout>
    );
  }

  const firstName = data.clientName.split(" ")[0];

  return (
    <ScreenLayout>
      <TitleBar title={firstName} onBack={() => nav("/pro/enquiries")} />

      <div className="px-5 pb-3">
        <SurfaceCard tone="gold">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-full bg-good/15 text-good flex items-center justify-center shrink-0">
              <ShieldCheck className="size-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-body font-semibold uppercase tracking-[0.15em] text-primary">
                Access granted
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Access granted by the client. They can revoke at any time. Every section
                you open is logged and visible to them.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="px-5 pb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px]",
                section === s.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8 space-y-3">
        {section === "overview" && (
          <>
            <SectionLabel>Hair profile</SectionLabel>
            <SurfaceCard>
              {data.hair ? (
                <div className="space-y-1.5">
                  <Row label="Texture" value={oneOf(data.hair.surface_texture)} />
                  <Row label="Density" value={oneOf(data.hair.density)} />
                  <Row label="Porosity" value={oneOf(data.hair.porosity)} />
                  <Row label="Elasticity" value={oneOf(data.hair.elasticity)} />
                  <Row label="Length" value={oneOf(data.hair.length_bucket)} />
                  <Row label="Concerns" value={oneOf(data.hair.areas_of_concern)} />
                </div>
              ) : (
                <EmptyState icon="—" message="No hair profile recorded" hint={undefined} />
              )}
            </SurfaceCard>

            <SectionLabel>Goals</SectionLabel>
            {data.goals.length === 0 ? (
              <SurfaceCard><p className="text-xs text-muted-foreground">No goals set.</p></SurfaceCard>
            ) : (
              data.goals.map((g) => (
                <SurfaceCard key={g.id}>
                  <p className="text-sm font-body font-semibold">{g.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                    {g.status ?? "active"}{g.target_text ? ` · ${g.target_text}` : ""}
                  </p>
                </SurfaceCard>
              ))
            )}
          </>
        )}

        {section === "blood" && (
          <>
            <SectionLabel>AI summary</SectionLabel>
            <SurfaceCard>
              {bloodHtml ? (
                <div
                  className="text-[13px] font-body leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: bloodHtml }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No AI summary yet.</p>
              )}
            </SurfaceCard>

            <SectionLabel>Flagged markers</SectionLabel>
            {data.bloodResults.length === 0 ? (
              <SurfaceCard><p className="text-xs text-muted-foreground">No flagged markers.</p></SurfaceCard>
            ) : (
              data.bloodResults.map((b, i) => (
                <SurfaceCard key={i}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-body font-semibold">{b.marker}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.value ?? "—"} {b.unit ?? ""}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium px-2 py-1 rounded-full uppercase",
                      b.status === "low" && "bg-alert-dark/15 text-alert-dark",
                      b.status === "high" && "bg-warn/15 text-warn",
                      b.status === "borderline" && "bg-warn/15 text-warn",
                    )}>
                      {b.status}
                    </span>
                  </div>
                </SurfaceCard>
              ))
            )}
          </>
        )}

        {section === "colour" && (
          <SurfaceCard>
            {data.style ? (
              <div className="space-y-1.5">
                <Row label="Status" value={oneOf(data.style.current_colour_status)} />
                <Row label="Current style" value={oneOf(data.style.current_style)} />
                <Row label="Colour history" value={
                  Array.isArray(data.style.colour_history) && data.style.colour_history.length
                    ? <div className="space-y-1">
                        {(data.style.colour_history as Array<Record<string, unknown>>).map((c, i) => (
                          <div key={i} className="text-[12px] leading-snug border-l-2 border-primary/30 pl-2">
                            {oneOf(c.type) ?? "—"} {c.product ? `· ${c.product}` : ""} {c.timeframe ? `· ${c.timeframe}` : ""}
                            {c.reaction ? <div className="text-alert-dark">Reaction: {String(c.reaction)}</div> : null}
                          </div>
                        ))}
                      </div>
                    : "—"
                } />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No colour history recorded.</p>
            )}
          </SurfaceCard>
        )}

        {section === "wash" && (
          data.washDays.length === 0 ? (
            <SurfaceCard><p className="text-xs text-muted-foreground">No wash days logged.</p></SurfaceCard>
          ) : (
            data.washDays.map((w) => (
              <SurfaceCard key={w.id}>
                <p className="text-sm font-body font-semibold">
                  {format(new Date(w.wash_date), "d MMM yyyy")}
                </p>
                <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                  {w.scalp_feel && <p>Scalp: {w.scalp_feel}</p>}
                  {w.breakage && <p>Breakage: {w.breakage}</p>}
                </div>
              </SurfaceCard>
            ))
          )
        )}

        {section === "journal" && (
          data.journal.length === 0 ? (
            <SurfaceCard><p className="text-xs text-muted-foreground">No journal entries.</p></SurfaceCard>
          ) : (
            data.journal.map((j) => (
              <SurfaceCard key={j.id}>
                <p className="text-sm font-body font-semibold">
                  {j.style_name ?? "Style entry"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(j.entry_date), "d MMM yyyy")}
                </p>
                {j.notes && <p className="text-[12px] mt-1.5 leading-snug">{j.notes}</p>}
              </SurfaceCard>
            ))
          )
        )}

        {section === "shelf" && (
          data.shelf.length === 0 ? (
            <SurfaceCard><p className="text-xs text-muted-foreground">No products on shelf.</p></SurfaceCard>
          ) : (
            data.shelf.map((p) => (
              <SurfaceCard key={p.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.brand ?? "—"} {p.category ? `· ${p.category}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-primary">{p.status ?? "shelf"}</p>
                    {p.user_rating != null && <p className="text-[11px]">★ {p.user_rating}</p>}
                  </div>
                </div>
              </SurfaceCard>
            ))
          )
        )}

        {section === "appointments" && (
          data.appointments.length === 0 ? (
            <SurfaceCard><p className="text-xs text-muted-foreground">No appointments logged.</p></SurfaceCard>
          ) : (
            data.appointments.map((a) => (
              <SurfaceCard key={a.id}>
                <p className="text-sm font-body font-semibold">
                  {a.pro_name ?? a.pro_type ?? "Appointment"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(a.scheduled_at), "d MMM yyyy, HH:mm")}
                  {a.clinic ? ` · ${a.clinic}` : ""}
                </p>
                {a.reason && <p className="text-[12px] mt-1.5">Reason: {a.reason}</p>}
                {a.outcome_notes && <p className="text-[12px] mt-1 italic">Outcome: {a.outcome_notes}</p>}
              </SurfaceCard>
            ))
          )
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProClientPassport;
