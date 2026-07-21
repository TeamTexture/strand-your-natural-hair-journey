import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, ShieldOff, Shield, Play, Sparkles, AlertTriangle, FlaskConical, Pill, Package, ListChecks, Clock, Mic, Heart, Leaf, Ban, User, Scissors, Droplet, Camera, Palette, Target, Apple, PenLine, CalendarDays, ImageIcon, Stamp } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePassportData, type PassportDataset } from "./usePassportData";
import SignedImage from "./SignedImage";
import { lookupHardWater } from "@/lib/hardWater";
import { humaniseKey, humaniseValue, valueTone, shouldHideField, cleanTitle, titleCase } from "@/lib/humanise";
import { formatDate, formatDateTime, formatMonth, formatRelative } from "@/lib/formatPassportDate";
import { formatTime12h } from "@/lib/formatTime";


// ================================================================
// Section registry — priority order tuned for consultation prep.
// ================================================================

type Section =
  | "profile" | "routine" | "products" | "nutrition"
  | "appointments" | "journal" | "photos" | "goals";

interface SectionSpec {
  key: Section;
  label: string;
  count: (d: PassportDataset) => number;
}

const SECTIONS: SectionSpec[] = [
  { key: "profile", label: "Profile", count: () => 0 },
  { key: "routine", label: "Routine", count: (d) => d.washDays.length },
  { key: "products", label: "Products", count: (d) => d.shelf.length },
  { key: "appointments", label: "Appts", count: (d) => d.appointments.length },
  { key: "nutrition", label: "Nutrition", count: (d) => d.nutritionSummaries.length },
  { key: "journal", label: "Journal", count: (d) => d.journal.length },
  { key: "photos", label: "Photos", count: (d) => d.milestonePhotos.length + d.beforePhotos.length + d.moodboards.length },
  { key: "goals", label: "Goals", count: (d) => d.goals.length },
];

const PAGE = 15;

// ================================================================
// Cross-cutting primitives (retained, cleaned up)
// ================================================================

interface ImagePreviewState {
  url: string | null;
  title: string;
  meta?: React.ReactNode;
}
const ImagePreviewContext = createContext<((preview: ImagePreviewState) => void) | null>(null);

type PassportProduct = Record<string, unknown> & { id: string; name: string };
const OpenProductContext = createContext<((p: PassportProduct) => void) | null>(null);

const logView = async (consumerId: string, section: Section) => {
  try { await supabase.functions.invoke("passport-view-log", { body: { consumer_id: consumerId, section } }); } catch { /* best-effort */ }
};

/** Compact humanised key/value row — replaces old Row + AllFields dumps. */
const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3 text-[13px] leading-relaxed">
    <span className="text-muted-foreground w-[128px] shrink-0 font-body">{label}</span>
    <span className="flex-1 break-words text-foreground">{value ?? "—"}</span>
  </div>
);

/**
 * Humanised object renderer — replaces AllFields.
 * Filters ids/paths/enc/hash automatically, humanises keys and values,
 * routes dates through the formatter, and outputs nothing at all when empty.
 */
const HumanFields = ({ obj, exclude = [] }: { obj: Record<string, unknown> | null | undefined; exclude?: string[] }) => {
  if (!obj) return null;
  const entries: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (shouldHideField(k, exclude)) continue;
    if (v == null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v)) continue; // structured objects handled bespokely
    entries.push([k, v]);
  }
  if (entries.length === 0) return null;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => {
        // Route timestamps through the formatter.
        let rendered: React.ReactNode;
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
          rendered = v.includes("T") ? formatDateTime(v) : formatDate(v);
        } else {
          rendered = humaniseValue(v) ?? "—";
        }
        return <Field key={k} label={humaniseKey(k)} value={rendered} />;
      })}
    </div>
  );
};

const Thumb = ({ bucket, path, alt, className, title, meta }: {
  bucket: string;
  path: string | null | undefined;
  alt?: string;
  className?: string;
  title: string;
  meta?: React.ReactNode;
}) => {
  const openPreview = useContext(ImagePreviewContext);
  const open = async (url: string | null) => {
    if (!openPreview) return;
    openPreview({ url, title, meta });
    if (!url && path) {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (data?.signedUrl) openPreview({ url: data.signedUrl, title, meta });
    }
  };
  return (
    <SignedImage
      bucket={bucket}
      path={path}
      alt={alt ?? title}
      className={className}
      onClick={openPreview ? open : undefined}
    />
  );
};

const Collapsible = ({ summary, children, defaultOpen = false, className }: {
  summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SurfaceCard className={className}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="flex-1 min-w-0">{summary}</div>
        {open ? <ChevronUp className="size-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {open && <div className="mt-4 pt-4 border-t border-border">{children}</div>}
    </SurfaceCard>
  );
};

const LoadMore = ({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) => {
  if (shown >= total) return null;
  return (
    <button type="button" onClick={onMore} className="w-full py-2.5 rounded-full border border-border text-xs font-body text-primary hover:bg-primary/5 transition-colors">
      Load {Math.min(PAGE, total - shown)} more · {shown}/{total}
    </button>
  );
};

const EmptyLine = ({ msg }: { msg: string }) => (
  <SurfaceCard><p className="text-[12px] text-muted-foreground font-body">{msg}</p></SurfaceCard>
);

const Chip = ({ tone = "neutral", children, icon: Icon }: {
  tone?: "good" | "warn" | "alert" | "neutral" | "gold";
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <span className={cn(
    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-body font-semibold border whitespace-nowrap",
    tone === "good" && "bg-good/10 text-good border-good/25",
    tone === "warn" && "bg-warn/10 text-warn border-warn/30",
    tone === "alert" && "bg-destructive/10 text-destructive border-destructive/30",
    tone === "gold" && "bg-primary/12 text-primary border-primary/30",
    tone === "neutral" && "bg-muted text-foreground/75 border-foreground/10",
  )}>
    {Icon && <Icon className="size-3" />}
    <span>{children}</span>
  </span>
);

const AudioPlayer = ({ bucket, path, transcript, label = "Voice note" }: {
  bucket: string; path: string | null | undefined; transcript?: string | null; label?: string;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!path && !transcript) return null;
  const load = async () => {
    if (!path || url) return;
    setLoading(true);
    if (path.startsWith("http")) { setUrl(path); setLoading(false); return; }
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrl(data.signedUrl);
    setLoading(false);
  };
  return (
    <div className="mt-2 space-y-1.5">
      {path && !url && (
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-body text-primary hover:underline">
          <Play className="size-3.5" /> {loading ? "Loading…" : `Play ${label.toLowerCase()}`}
        </button>
      )}
      {url && <audio controls src={url} className="w-full h-9" />}
      {transcript && <p className="text-[11px] italic text-muted-foreground leading-snug">"{transcript}"</p>}
    </div>
  );
};

/** Section heading — engraved-passport eyebrow with gold hairline. */
const SectionHeader = ({ icon: Icon, title, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
}) => (
  <div className="px-5 mt-6 mb-4">
    <div className="flex items-center gap-2 mb-1.5">
      <Icon className="size-3.5 text-primary" />
      <span className="text-[9.5px] uppercase tracking-[0.32em] font-body font-semibold text-primary/80">
        Section
      </span>
      <span className="flex-1 h-px bg-gradient-to-r from-primary/40 via-primary/15 to-transparent" />
    </div>
    <h2 className="font-display text-[22px] leading-[1.05] text-foreground tracking-[-0.01em]">{title}</h2>
    {sub && <p className="text-[11px] font-body text-muted-foreground leading-snug mt-1">{sub}</p>}
  </div>
);


/** Named subsection label — smaller, quieter than SectionHeader. */
const SubLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-5 mt-5 mb-2 text-[10.5px] uppercase tracking-[0.22em] font-body font-semibold text-primary">
    {children}
  </p>
);

const PaginatedList = <T,>({ items, render, empty, pageSize = PAGE }: {
  items: T[]; render: (t: T, i: number) => React.ReactNode; empty: string; pageSize?: number;
}) => {
  const [n, setN] = useState(pageSize);
  if (items.length === 0) return <EmptyLine msg={empty} />;
  return (
    <>
      {items.slice(0, n).map(render)}
      <LoadMore shown={Math.min(n, items.length)} total={items.length} onMore={() => setN(x => x + pageSize)} />
    </>
  );
};

// ================================================================
// Helpers — critical flags computed from PassportDataset
// ================================================================

interface CriticalFlags {
  chemicalReaction: { details: string | null; audio: string | null } | null;
  bloodOutOfRange: number;
  medicationsCount: number;
  medicalConditions: string | null;
  hasProfessional: boolean;
}

const computeFlags = (d: PassportDataset): CriticalFlags => {
  const style = d.style ?? {};
  const reactionOn = style.colour_reaction === true || String(style.colour_reaction ?? "").toLowerCase() === "yes";
  const outOfRange = d.bloodResults.filter(r => ["low", "high", "borderline"].includes(String(r.status ?? "").toLowerCase())).length;
  const conds = d.health?.medical_conditions;
  const medicalConditions = humaniseValue(conds);
  return {
    chemicalReaction: reactionOn ? {
      details: humaniseValue(style.colour_reaction_details),
      audio: (style.colour_reaction_audio_path as string | null) ?? null,
    } : null,
    bloodOutOfRange: outOfRange,
    medicationsCount: d.medications.length,
    medicalConditions,
    hasProfessional: !!d.professional,
  };
};

// ================================================================
// Section: Profile — comprehensive personal, health, hair, blood dossier
// ================================================================

const ProfileSection = ({ d }: { d: PassportDataset }) => {
  const flags = computeFlags(d);
  const hardWater = d.profile?.postcode ? lookupHardWater(d.profile.postcode) : null;
  const avatarUrl = d.profile?.avatar_url ?? null;
  const avatarIsHttp = typeof avatarUrl === "string" && /^https?:\/\//.test(avatarUrl);
  const latestStrand = d.strandSummaries[0] ?? null;

  const p = d.profile ?? null;

  return (
    <>
      {/* ============ PASSPORT COVER ============ */}
      <div className="px-5 mt-2">
        <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[hsl(var(--foreground))] to-[hsl(var(--foreground)/0.88)] text-primary shadow-[0_10px_30px_-14px_hsl(var(--foreground)/0.55)]">
          {/* Guilloche pattern — very subtle security-print aesthetic */}
          <svg aria-hidden className="absolute inset-0 w-full h-full opacity-[0.12] pointer-events-none" viewBox="0 0 300 200" preserveAspectRatio="none">
            <defs>
              <pattern id="guilloche" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M0 15 Q7.5 0 15 15 T30 15" fill="none" stroke="currentColor" strokeWidth="0.4" />
                <path d="M0 15 Q7.5 30 15 15 T30 15" fill="none" stroke="currentColor" strokeWidth="0.4" />
              </pattern>
            </defs>
            <rect width="300" height="200" fill="url(#guilloche)" />
          </svg>

          <div className="relative px-5 pt-5 pb-4">
            {/* Lockup */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" className="text-primary">
                  <path d="M12 2 L14.5 8 L21 8.5 L16 12.8 L17.6 19.4 L12 15.8 L6.4 19.4 L8 12.8 L3 8.5 L9.5 8 Z"
                    fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <p className="font-display font-bold text-[12px] uppercase tracking-[0.32em] text-primary leading-none">
                  Strand · Client Passport
                </p>
              </div>
              <span className="text-[10px] font-body font-semibold uppercase tracking-[0.22em] text-primary/80">
                UK · {p?.country ? (humaniseValue(p.country) ?? "").slice(0, 3).toUpperCase() : "GBR"}
              </span>
            </div>

            {/* Avatar + engraved name */}
            <div className="flex flex-col items-center gap-3">
              {avatarIsHttp ? (
                <img src={avatarUrl!} alt="" className="size-[204px] rounded-[16px] object-cover border border-primary/40" />
              ) : avatarUrl ? (
                <SignedImage bucket="avatars" path={avatarUrl} alt="" className="size-[204px] rounded-[16px] overflow-hidden border border-primary/40" />
              ) : (
                <div className="size-[204px] rounded-[16px] border border-primary/40 bg-primary/10 flex items-center justify-center text-primary font-display text-6xl">
                  {d.clientName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="text-center">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.26em] font-body text-primary/75 mb-1">Client</p>
                <p className="font-display font-bold text-[24px] leading-[1.05] text-primary tracking-[0.005em]">
                  {d.clientName}
                </p>
              </div>
            </div>

            {/* Passport data strip */}
            <div className="mt-4 pt-4 border-t border-primary/25 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.22em] font-body text-primary/70 mb-0.5">Issued</p>
                <p className="text-[12.5px] font-body font-semibold text-primary leading-tight">
                  {d.memberSince ? formatMonth(d.memberSince) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.22em] font-body text-primary/70 mb-0.5">Age</p>
                <p className="text-[12.5px] font-body font-semibold text-primary leading-tight">
                  {p?.age != null ? `${p.age} yrs` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.22em] font-body text-primary/70 mb-0.5">Region</p>
                <p className="text-[12.5px] font-body font-semibold text-primary leading-tight truncate">
                  {p?.postcode ?? humaniseValue(p?.country) ?? "—"}
                </p>
              </div>
            </div>

            {/* MRZ-style bottom band */}
            <div className="mt-4 -mx-5 px-5 py-2 bg-primary/[0.12] border-t border-primary/25">
              <p className="text-[10px] font-mono font-semibold tracking-[0.14em] text-primary/85 truncate">
                {`STR<<${d.clientName.replace(/\s+/g, "<").toUpperCase()}<<`.slice(0, 44).padEnd(44, "<")}
              </p>
            </div>
          </div>
        </div>

      </div>


      {/* Personal information */}
      <SubLabel>Personal information</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          {p ? (
            <div className="divide-y divide-border">
              {([
                ["Full name", p.display_name],
                ["Age", p.age != null ? `${p.age} years` : null],
                ["Year of birth", p.birth_year],
                ["Heritage", p.heritage?.length ? p.heritage.join(", ") : null],
                ["Country", humaniseValue(p.country)],
                ["Postcode", p.postcode],
                ["Email", d.authEmail],
                ["Member since", d.memberSince ? formatMonth(d.memberSince) : null],
                ["Onboarded", p.onboarding_completed_at ? formatDate(p.onboarding_completed_at) : null],
              ] as Array<[string, React.ReactNode]>).map(([label, v]) => v == null || v === "" ? null : (
                <div key={label} className="flex gap-3 py-2.5 text-[13px] font-body">
                  <span className="text-muted-foreground w-[130px] shrink-0">{label}</span>
                  <span className="flex-1 break-words text-foreground">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground font-body">No profile on file.</p>
          )}
        </SurfaceCard>
      </div>

      {/* Health & lifestyle */}
      <SubLabel>Health & lifestyle</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          {d.health ? (
            <>
              <HumanFields obj={d.health} exclude={["notes"]} />
              {typeof d.health.notes === "string" && d.health.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-1">Notes</p>
                  <p className="text-[12.5px] font-body leading-relaxed">{d.health.notes}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground font-body">No health context recorded.</p>
          )}
        </SurfaceCard>
      </div>

      {/* Current medications — full details, no counts */}
      <SubLabel>Current medications</SubLabel>
      <div className="px-5 space-y-2">
        {d.medications.length === 0 ? (
          <EmptyLine msg="No medications recorded." />
        ) : d.medications.map(m => (
          <SurfaceCard key={m.id}>
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                <Pill className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-body font-semibold text-foreground">{humaniseValue(m.name) ?? "Medication"}</p>
                {m.category && (
                  <p className="text-[11.5px] text-muted-foreground font-body mt-0.5">{humaniseValue(m.category)}</p>
                )}
                <p className="text-[11px] text-muted-foreground font-body mt-0.5">
                  Added {formatDate(m.created_at)}
                </p>
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>

      {/* Hair characteristics */}
      <SubLabel>Hair characteristics</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          {(() => {
            const hair = d.hair ?? {};
            const rows: Array<{ label: string; value: React.ReactNode; tone?: "warn" }> = [];
            const push = (label: string, key: string, tone?: "warn") => {
              const v = humaniseValue(hair[key]);
              if (v) rows.push({ label, value: v, tone });
            };
            push("Texture", "curl_pattern");
            push("Porosity", "porosity", valueTone(hair.porosity) === "alert" ? "warn" : undefined);
            push("Density", "density");
            push("Diameter", "hair_width");
            push("Elasticity", "elasticity");
            push("Length", "current_length");
            push("Scalp condition", "scalp_condition");
            const diagnosed = humaniseValue(hair.diagnosed_conditions);
            if (diagnosed) rows.push({ label: "Diagnoses", value: diagnosed, tone: "warn" });
            push("Areas of concern", "areas_of_concern");
            push("Wash frequency", "wash_frequency");
            if (rows.length === 0) return <p className="text-[12px] text-muted-foreground font-body">No hair profile recorded.</p>;
            return (
              <div className="space-y-3">
                {rows.map(r => (
                  <div key={r.label}>
                    <p className={cn("text-[9px] uppercase tracking-[0.28em] font-body mb-0.5",
                      r.tone === "warn" ? "text-warn/80" : "text-primary/70")}>
                      {r.label}
                    </p>
                    <p className={cn("text-[14px] font-display leading-tight",
                      r.tone === "warn" ? "text-warn" : "text-foreground")}>
                      {r.value}
                    </p>
                    <div className="mt-2 h-px bg-gradient-to-r from-primary/25 via-primary/10 to-transparent" />
                  </div>
                ))}
              </div>
            );

          })()}
        </SurfaceCard>
      </div>

      {/* Colour & chemical history — part of the profile dossier */}
      <ColourSection d={d} />

      {/* Latest Strand summary — most recent only */}
      {latestStrand && (
        <>
          <SubLabel>Latest Strand summary</SubLabel>
          <div className="px-5">
            <SurfaceCard>
              <p className="text-[10.5px] font-body text-muted-foreground uppercase tracking-wider mb-2">
                Updated {formatDate(latestStrand.created_at)} · {formatRelative(latestStrand.created_at)}
              </p>
              {latestStrand.overview && (
                <p className="text-[13.5px] leading-relaxed text-foreground font-body whitespace-pre-wrap">
                  {latestStrand.overview}
                </p>
              )}
              {Array.isArray(latestStrand.action_plan) && (latestStrand.action_plan as unknown[]).length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Action plan</p>
                  <ul className="space-y-1.5">
                    {(latestStrand.action_plan as unknown[]).map((a, i) => (
                      <li key={i} className="text-[13px] font-body leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-primary">
                        {typeof a === "string" ? a : humaniseValue(a) ?? ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SurfaceCard>
          </div>
        </>
      )}

      {/* Blood work — full details, embedded in Profile */}
      <BloodSection d={d} />

      {/* Preferred professional */}
      {flags.hasProfessional && (
        <>
          <SubLabel>Preferred professional</SubLabel>
          <div className="px-5">
            <SurfaceCard>
              <HumanFields obj={d.professional} />
            </SurfaceCard>
          </div>
        </>
      )}
    </>
  );
};


// ================================================================
// Section: Goals & concerns — "why they're here"
// ================================================================

const GoalsSection = ({ d }: { d: PassportDataset }) => {
  const updatesByGoal = useMemo(() => {
    const m = new Map<string, typeof d.goalUpdates>();
    d.goalUpdates.forEach(u => {
      const arr = m.get(u.goal_id) ?? [];
      arr.push(u);
      m.set(u.goal_id, arr);
    });
    return m;
  }, [d.goalUpdates]);

  const concerns = humaniseValue(d.hair?.areas_of_concern);

  return (
    <>
      {concerns && (
        <>
          <SubLabel>Areas of concern</SubLabel>
          <div className="px-5">
            <SurfaceCard>
              <p className="text-[13.5px] font-body leading-relaxed">{concerns}</p>
            </SurfaceCard>
          </div>
        </>
      )}

      <SubLabel>Goals</SubLabel>
      <div className="px-5 space-y-2">
        {d.goals.length === 0 ? <EmptyLine msg="No goals set yet." /> : d.goals.map(g => {
          const updates = updatesByGoal.get(g.id) ?? [];
          const title = humaniseValue(g.title) ?? humaniseValue(g.challenge) ?? "Goal";
          const target = humaniseValue(g.target_text) ?? humaniseValue(g.target);
          const status = humaniseValue(g.status) ?? "Active";
          return (
            <Collapsible key={g.id} summary={
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-body font-semibold text-foreground leading-tight">{title}</p>
                  <Chip tone={valueTone(g.status) === "good" ? "good" : "gold"}>{status}</Chip>
                </div>
                {target && <p className="text-[12px] text-muted-foreground font-body mt-1">Target: {target}</p>}
                {updates.length > 0 && (
                  <p className="text-[11px] text-muted-foreground font-body mt-1">
                    {updates.length} progress update{updates.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            }>
              <HumanFields obj={g as Record<string, unknown>} exclude={["title", "challenge", "target_text", "target", "status", "challenge_voice_url", "target_voice_url"]} />
              <AudioPlayer bucket="voicenotes" path={(g.challenge_voice_url as string | null) ?? null} label="Challenge voice note" />
              <AudioPlayer bucket="voicenotes" path={(g.target_voice_url as string | null) ?? null} label="Target voice note" />
              {updates.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Progress timeline</p>
                  <div className="space-y-3">
                    {updates.map(u => (
                      <div key={u.id} className="border-l-2 border-primary/30 pl-3">
                        <p className="text-[11px] text-muted-foreground font-body">
                          {formatDate(u.created_at)} · {formatRelative(u.created_at)}
                        </p>
                        {u.note && <p className="text-[12.5px] font-body leading-relaxed mt-0.5">{u.note}</p>}
                        <AudioPlayer bucket="voicenotes" path={u.voice_url} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Collapsible>
          );
        })}
      </div>
    </>
  );
};

// ================================================================
// Section: Hair profile — mirror the consumer Profile screen
// ================================================================

const HairSection = ({ d }: { d: PassportDataset }) => {
  const hair = d.hair ?? {};
  const rows: Array<{ label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "warn" }> = [];
  const push = (label: string, key: string, tone?: "warn") => {
    const v = humaniseValue(hair[key]);
    if (v) rows.push({ label, value: v, tone });
  };
  push("Texture", "curl_pattern");
  push("Porosity", "porosity", valueTone(hair.porosity) === "alert" ? "warn" : undefined);
  push("Density", "density");
  push("Diameter", "hair_width");
  push("Elasticity", "elasticity");
  push("Length", "current_length");
  push("Scalp condition", "scalp_condition");
  const diagnosed = humaniseValue(hair.diagnosed_conditions);
  if (diagnosed) rows.push({ label: "Diagnoses", value: diagnosed, tone: "warn" });
  push("Areas of concern", "areas_of_concern");
  push("Wash frequency", "wash_frequency");

  return (
    <>
      <SubLabel>Hair profile</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          {rows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground font-body">No hair profile recorded.</p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <div key={r.label} className="flex gap-3 py-2.5 text-[13px] font-body">
                  <span className={cn("w-[130px] shrink-0", r.tone === "warn" ? "text-warn font-medium" : "text-muted-foreground")}>{r.label}</span>
                  <span className={cn("flex-1 break-words", r.tone === "warn" ? "text-warn font-medium" : "text-foreground")}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      <SubLabel>Health context</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          <HumanFields obj={d.health} exclude={["notes"]} />
          {d.health?.notes && typeof d.health.notes === "string" && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-1">Notes</p>
              <p className="text-[12.5px] font-body leading-relaxed">{d.health.notes}</p>
            </div>
          )}
          {!d.health && <p className="text-[12px] text-muted-foreground font-body">No health context recorded.</p>}
        </SurfaceCard>
      </div>
    </>
  );
};

// ================================================================
// Section: Colour & chemistry — safety-critical for stylists
// ================================================================

const ColourSection = ({ d }: { d: PassportDataset }) => {
  const style = d.style ?? {};
  const history = Array.isArray(style.colour_history) ? style.colour_history as Array<Record<string, unknown>> : [];
  const chem = Array.isArray(style.chemical_history) ? (style.chemical_history as unknown[]).map(String) : [];
  const reactionOn = style.colour_reaction === true || String(style.colour_reaction ?? "").toLowerCase() === "yes";

  return (
    <>
      {reactionOn && (
        <>
          <SubLabel>Chemical reaction — flagged</SubLabel>
          <div className="px-5">
            <SurfaceCard className="border-destructive/40 bg-destructive/[0.05]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-body font-semibold text-destructive">The client has reported a chemical reaction.</p>
                  {style.colour_reaction_details && (
                    <p className="text-[13px] font-body text-foreground/95 mt-2 leading-relaxed">
                      "{humaniseValue(style.colour_reaction_details)}"
                    </p>
                  )}
                  <AudioPlayer bucket="voicenotes" path={(style.colour_reaction_audio_path as string | null) ?? null} label="Reaction voice note" />
                </div>
              </div>
            </SurfaceCard>
          </div>
        </>
      )}

      <SubLabel>Current colour & style</SubLabel>
      <div className="px-5">
        <SurfaceCard>
          <div className="divide-y divide-border">
            {[
              ["Status", style.current_colour_status],
              ["Current style", style.current_hairstyle],
              ["Colour type", style.colour_type],
              ["Product", style.colour_product],
              ["Last treated", style.colour_last_treated],
              ["Reaction on record?", style.colour_reaction],
            ].map(([label, v]) => {
              const val = humaniseValue(v);
              if (!val) return null;
              return (
                <div key={label as string} className="flex gap-3 py-2.5 text-[13px] font-body">
                  <span className="text-muted-foreground w-[130px] shrink-0">{label as string}</span>
                  <span className="flex-1 break-words text-foreground">{val}</span>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      <SubLabel>Chemical history</SubLabel>
      <div className="px-5">
        {chem.length === 0 ? <EmptyLine msg="No chemical treatments recorded." /> : (
          <SurfaceCard>
            <div className="flex flex-wrap gap-2">
              {chem.map((c, i) => (
                <Chip key={i} tone="warn" icon={FlaskConical}>{humaniseValue(c) ?? c}</Chip>
              ))}
            </div>
          </SurfaceCard>
        )}
      </div>

      <SubLabel>Colour history</SubLabel>
      <div className="px-5 space-y-2">
        {history.length === 0 ? <EmptyLine msg="No colour history entries." /> : history.map((c, i) => (
          <Collapsible key={i} summary={
            <div>
              <p className="text-[13.5px] font-body font-semibold text-foreground">{humaniseValue(c.type) ?? "Colour treatment"}</p>
              <p className="text-[11.5px] font-body text-muted-foreground mt-0.5">
                {humaniseValue(c.timeframe) ?? "—"}
                {c.product ? ` · ${humaniseValue(c.product)}` : ""}
              </p>
            </div>
          }>
            <HumanFields obj={c} />
          </Collapsible>
        ))}
      </div>
    </>
  );
};

// ================================================================
// Section: Blood work — consumer-style visuals
// ================================================================

type Status = "low" | "normal" | "warn" | "untested";
const toRowStatus = (s: string | null): Status => {
  const v = String(s ?? "").toLowerCase();
  if (v === "low") return "low";
  if (v === "high" || v === "borderline") return "warn";
  if (v === "in_range" || v === "normal") return "normal";
  return "untested";
};
const dotColor: Record<Status, string> = { low: "bg-warn", warn: "bg-warn", normal: "bg-good", untested: "bg-muted-foreground/40" };
const valueColor: Record<Status, string> = { low: "text-warn", warn: "text-warn", normal: "text-good", untested: "text-muted-foreground" };

const MarkerRow = ({ marker, value, unit, status }: { marker: string; value: number | null; unit: string | null; status: string | null }) => {
  const s = toRowStatus(status);
  // Visual gauge: position derived from status band since numeric reference range isn't
  // stored per row — in-range centres, low sits left, high sits right. Untested = flat rail.
  const pos = s === "low" ? 18 : s === "warn" ? 82 : s === "normal" ? 50 : 50;
  const barTint = s === "normal" ? "bg-good" : s === "untested" ? "bg-muted-foreground/30" : "bg-warn";
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[12.5px] font-body text-foreground min-w-0 truncate flex-1">
          {humaniseValue(marker) ?? marker}
        </span>
        <span className={cn("text-[12.5px] font-display tabular-nums text-right shrink-0", valueColor[s])}>
          {value != null ? `${value}${unit ? ` ${unit}` : ""}` : "Not tested"}
        </span>
      </div>
      <div className="relative h-[6px] rounded-full bg-muted overflow-visible">
        {/* Reference rail */}
        <div className="absolute inset-y-0 left-[25%] right-[25%] rounded-full bg-primary/12" />
        {/* Marker dot */}
        <div
          className={cn("absolute -top-[3px] size-[12px] rounded-full border-2 border-background shadow-sm", barTint)}
          style={{ left: `calc(${pos}% - 6px)` }}
        />
      </div>
      {s !== "untested" && (
        <p className={cn("text-[9.5px] uppercase tracking-[0.22em] font-body mt-1.5",
          s === "normal" ? "text-good/80" : "text-warn/85")}>
          {s === "normal" ? "In range" : s === "low" ? "Below range" : "Flagged"}
        </p>
      )}
    </div>
  );
};



const BloodSection = ({ d }: { d: PassportDataset }) => {
  const resultsByPanel = useMemo(() => {
    const m = new Map<string, typeof d.bloodResults>();
    d.bloodResults.forEach(r => {
      const key = r.panel_id ?? "__loose__";
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    });
    return m;
  }, [d.bloodResults]);

  
  const outOfRange = d.bloodResults.filter(r => ["low", "high", "borderline"].includes(String(r.status ?? "").toLowerCase())).length;
  const inRange = d.bloodResults.filter(r => ["in_range", "normal"].includes(String(r.status ?? "").toLowerCase())).length;
  const total = d.bloodResults.length;

  return (
    <>
      {/* Summary bar */}
      {total > 0 && (
        <div className="px-5 mt-2">
          <SurfaceCard>
            <div className="flex items-center gap-4 text-[12px] font-body">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-good" />
                <span className="text-foreground"><strong>{inRange}</strong> in range</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warn" />
                <span className="text-foreground"><strong>{outOfRange}</strong> flagged</span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-muted-foreground">{total} marker{total === 1 ? "" : "s"}</span>
              </div>
            </div>
          </SurfaceCard>
        </div>
      )}


      <SubLabel>Panels</SubLabel>
      <div className="px-5 space-y-2">
        {d.bloodPanels.length === 0 && resultsByPanel.size === 0 ? (
          <EmptyLine msg="No blood panels recorded." />
        ) : (
          <>
            {d.bloodPanels.map((panel) => {
              const rows = resultsByPanel.get(panel.id) ?? [];
              const flagged = rows.filter(r => ["low", "high", "borderline"].includes(String(r.status ?? "").toLowerCase())).length;
              const panelLabel = titleCase(humaniseValue(panel.label) ?? humaniseValue(panel.test_type) ?? "Blood panel");
              const labLabel = panel.lab_name ? titleCase(humaniseValue(panel.lab_name) ?? String(panel.lab_name)) : null;
              return (
                <Collapsible key={panel.id} defaultOpen={false} summary={
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-display font-semibold text-foreground leading-tight">
                        {panelLabel}
                      </p>
                      {flagged > 0 && <Chip tone="warn">{flagged} flagged</Chip>}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-primary/70 font-body mt-1">
                      {panel.panel_date ? formatDate(panel.panel_date) : "Undated"}
                      {labLabel ? ` · ${labLabel}` : ""}
                    </p>
                    <p className="text-[11px] font-body text-muted-foreground mt-0.5">
                      {rows.length} marker{rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                }>
                  {panel.notes && (
                    <p className="text-[12.5px] italic text-muted-foreground font-body mb-3 leading-relaxed">"{panel.notes}"</p>
                  )}
                  {rows.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground font-body">No markers recorded on this panel.</p>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {rows.map(r => (
                        <MarkerRow key={r.id} marker={r.marker} value={r.value} unit={r.unit} status={r.status} />
                      ))}
                    </div>
                  )}
                </Collapsible>
              );
            })}

            {resultsByPanel.get("__loose__") && (
              <Collapsible summary={
                <div>
                  <p className="text-[14px] font-body font-semibold text-foreground">Standalone markers</p>
                  <p className="text-[11.5px] text-muted-foreground font-body">
                    {(resultsByPanel.get("__loose__") ?? []).length} entries not linked to a panel
                  </p>
                </div>
              }>
                <div className="divide-y divide-border">
                  {(resultsByPanel.get("__loose__") ?? []).map(r => (
                    <MarkerRow key={r.id} marker={r.marker} value={r.value} unit={r.unit} status={r.status} />
                  ))}
                </div>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </>
  );
};

// ================================================================
// Section: Routine — wash days + product shelf
// ================================================================

const WashDaySummary = ({ w }: { w: PassportDataset["washDays"][number] }) => {
  const products = Array.isArray(w.product_ids) ? (w.product_ids as unknown[]).length : 0;
  const steps = Array.isArray(w.steps) ? (w.steps as unknown[]).filter((s: any) => s?.name?.trim?.()).length : 0;
  const style = humaniseValue(w.style_after) ?? "Wash & condition";
  const dur = typeof w.duration_min === "number" && w.duration_min > 0 ? w.duration_min : null;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-body font-semibold text-foreground leading-tight">
            {formatDate(w.wash_date)}
          </p>
          <p className="text-[12px] text-foreground/85 font-body mt-0.5 truncate">{style}</p>
        </div>
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-body shrink-0 mt-1">
          {formatRelative(w.wash_date)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-lg bg-primary/[0.06] border border-primary/15 px-2.5 py-1.5">
          <div className="flex items-center gap-1 text-primary">
            <Package className="size-3" />
            <span className="font-display text-[15px]">{products}</span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/60 font-body">
            Product{products === 1 ? "" : "s"}
          </span>
        </div>
        <div className="rounded-lg bg-primary/[0.06] border border-primary/15 px-2.5 py-1.5">
          <div className="flex items-center gap-1 text-primary">
            <ListChecks className="size-3" />
            <span className="font-display text-[15px]">{steps}</span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/60 font-body">
            Step{steps === 1 ? "" : "s"}
          </span>
        </div>
        <div className="rounded-lg bg-primary/[0.06] border border-primary/15 px-2.5 py-1.5">
          <div className="flex items-center gap-1 text-primary">
            <Clock className="size-3" />
            <span className="font-display text-[13px]">{dur ? `${dur}m` : "—"}</span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/60 font-body">
            Duration
          </span>
        </div>
      </div>
      {(w.scalp_feel || w.breakage || w.hair_feel_voice_url) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {w.scalp_feel && <Chip tone={valueTone(w.scalp_feel) as any}>Scalp: {humaniseValue(w.scalp_feel)}</Chip>}
          {w.breakage && <Chip tone={valueTone(w.breakage) as any}>Breakage: {humaniseValue(w.breakage)}</Chip>}
          {w.hair_feel_voice_url && <Mic className="size-3.5 text-primary" />}
        </div>
      )}
    </div>
  );
};

const RoutineSection = ({ d }: { d: PassportDataset }) => {
  const productsById = useMemo(() => {
    const m = new Map<string, PassportDataset["shelf"][number]>();
    d.shelf.forEach(p => m.set(p.id, p));
    return m;
  }, [d.shelf]);
  const photosByKey = useMemo(() => {
    const m = new Map<string, string>();
    d.productPhotos.forEach(p => { if (p.product_key && p.storage_path) m.set(p.product_key, p.storage_path); });
    return m;
  }, [d.productPhotos]);

  const openProduct = useContext(OpenProductContext);
  const renderProductRow = (p: PassportDataset["shelf"][number], size: "sm" | "md" = "sm") => {
    const key = (p as Record<string, unknown>).product_key as string | undefined;
    const photo = ((p as Record<string, unknown>).storage_path as string | null | undefined) ?? (key ? photosByKey.get(key) : null);
    return (
      <button
        type="button"
        onClick={() => openProduct?.(p as PassportProduct)}
        className="w-full flex items-start gap-3 text-left hover:opacity-90 active:opacity-75 transition-opacity"
      >
        <Thumb bucket="product-photos" path={photo ?? null} className={size === "sm" ? "size-11 shrink-0 rounded-lg" : "size-14 shrink-0 rounded-lg"} title={String(p.name ?? "Product image")} />
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-body font-semibold text-foreground break-words leading-snug">{p.name}</p>
          <p className="text-[11px] text-muted-foreground font-body truncate">
            {humaniseValue(p.brand) ?? "—"}{p.category ? ` · ${humaniseValue(p.category)}` : ""}
          </p>
          {p.rating != null && (
            <p className="text-[10.5px] uppercase tracking-[0.15em] text-primary font-body font-semibold mt-0.5">
              ★ {String(p.rating)}
            </p>
          )}
        </div>
      </button>
    );
  };


  const ProductInner = ({ p }: { p: PassportDataset["shelf"][number] }) => {
    const key = (p as Record<string, unknown>).product_key as string | undefined;
    const voicenotes = key ? d.productVoicenotes.filter(v => v.product_key === key) : [];
    const ingredients = Array.isArray((p as Record<string, unknown>).ingredients) ? ((p as Record<string, unknown>).ingredients as unknown[]).map(String) : [];
    return (
      <>
        <HumanFields obj={p as Record<string, unknown>} exclude={["name", "brand", "category", "rating", "off_shelf_voice_url", "ingredients"]} />
        {ingredients.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-1.5">Ingredients</p>
            <p className="text-[12px] font-body leading-relaxed text-foreground/85">{ingredients.join(", ")}</p>
          </div>
        )}
        {voicenotes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Voice notes</p>
            <div className="space-y-2">
              {voicenotes.map(v => (
                <div key={v.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-[11px] text-muted-foreground font-body">{formatDate(v.created_at)}</p>
                  <AudioPlayer bucket="voicenotes" path={v.audio_url} transcript={v.transcript} />
                </div>
              ))}
            </div>
          </div>
        )}
        <AudioPlayer bucket="voicenotes" path={((p as Record<string, unknown>).off_shelf_voice_url as string | null) ?? null} label="Off-shelf voice note" />
      </>
    );
  };

  const favourites = d.shelf.filter(p => p.on_favourite);
  const onShelf = d.shelf.filter(p => !p.on_favourite && p.on_shelf);
  const wishlist = d.shelf.filter(p => !p.on_favourite && !p.on_shelf && p.on_wishlist);
  const offShelf = d.shelf.filter(p => !p.on_favourite && !p.on_shelf && !p.on_wishlist);

  const ProductGroup = ({ title, list }: { title: string; list: PassportDataset["shelf"] }) => {
    const [n, setN] = useState(8);
    if (list.length === 0) return null;
    return (
      <div>
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-primary font-body font-semibold mb-2">
          {title} · {list.length}
        </p>
        <div className="space-y-2">
          {list.slice(0, n).map(p => (
            <Collapsible key={p.id} summary={renderProductRow(p)}>
              <ProductInner p={p} />
            </Collapsible>
          ))}
          <LoadMore shown={Math.min(n, list.length)} total={list.length} onMore={() => setN(x => x + 8)} />
        </div>
      </div>
    );
  };

  return (
    <>
      <SubLabel>Wash days</SubLabel>
      <div className="px-5 space-y-2">
        <PaginatedList
          items={d.washDays}
          empty="No wash days logged yet."
          render={(w) => {
            const productIds = Array.isArray(w.product_ids) ? w.product_ids.map(String) : [];
            const steps = Array.isArray(w.steps) ? w.steps as Array<Record<string, unknown>> : [];
            const styling = (w.styling && typeof w.styling === "object") ? w.styling as Record<string, unknown> : null;
            const heatTreatment = (w.heat_treatment && typeof w.heat_treatment === "object") ? w.heat_treatment as Record<string, unknown> : null;
            const stylingPhotos = Array.isArray(styling?.photoPaths) ? styling.photoPaths.map(String) : [];
            const stylingProductIds = Array.isArray(styling?.productIds) ? styling.productIds.map(String) : [];
            return (
              <Collapsible key={w.id} summary={<WashDaySummary w={w} />}>
                <HumanFields obj={w as Record<string, unknown>} exclude={["wash_date", "steps", "product_ids", "heat_treatment", "styling", "hair_feel_voice_url", "scalp_feel", "breakage", "style_after", "duration_min"]} />
                {productIds.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Products used</p>
                    <div className="space-y-2">
                      {productIds.map(id => {
                        const p = productsById.get(id);
                        if (!p) return null;
                        return (
                          <SurfaceCard key={id} className="py-2.5">
                            {renderProductRow(p)}
                          </SurfaceCard>
                        );
                      })}
                    </div>
                  </div>
                )}
                {steps.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Wash steps</p>
                    <ol className="space-y-1.5">
                      {steps.map((s, i) => (
                        <li key={i} className="text-[12.5px] font-body leading-snug pl-6 relative">
                          <span className="absolute left-0 top-0 size-4 rounded-full bg-primary/12 text-primary text-[10px] flex items-center justify-center font-semibold">{i + 1}</span>
                          {humaniseValue(s.name) ?? humaniseValue(s.step) ?? `Step ${i + 1}`}
                          {s.product_name && <span className="text-muted-foreground"> — {humaniseValue(s.product_name)}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {heatTreatment && Object.values(heatTreatment).some(v => v != null && v !== "") && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Heat treatment</p>
                    <HumanFields obj={heatTreatment} />
                  </div>
                )}
                {styling && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Styling</p>
                      <HumanFields obj={styling} exclude={["audioPath", "photoPaths", "productIds", "transcript"]} />
                    </div>
                    {stylingProductIds.length > 0 && (
                      <div className="space-y-2">
                        {stylingProductIds.map(id => {
                          const p = productsById.get(id);
                          if (!p) return null;
                          return (
                            <Collapsible key={id} summary={renderProductRow(p)}>
                              <ProductInner p={p} />
                            </Collapsible>
                          );
                        })}
                      </div>
                    )}
                    {stylingPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {stylingPhotos.map((p, i) => (
                          <Thumb key={p} bucket="journal-photos" path={p} className="aspect-square rounded-lg" title={`Styling photo ${i + 1}`} />
                        ))}
                      </div>
                    )}
                    <AudioPlayer bucket="voicenotes" path={(styling.audioPath as string | null) ?? null} transcript={(styling.transcript as string | null) ?? null} label="Styling voice note" />
                  </div>
                )}
                <AudioPlayer bucket="voicenotes" path={(w.hair_feel_voice_url as string | null) ?? null} label="Hair feel voice note" />
              </Collapsible>
            );
          }}
          pageSize={8}
        />
      </div>

    </>
  );
};

// ================================================================
// Section: Products — shelf, favourites, wishlist, off-shelf + tools
// ================================================================

const ProductsSection = ({ d }: { d: PassportDataset }) => {
  const photosByKey = useMemo(() => {
    const m = new Map<string, string>();
    d.productPhotos.forEach(p => { if (p.product_key && p.storage_path) m.set(p.product_key, p.storage_path); });
    return m;
  }, [d.productPhotos]);

  const renderProductRow = (p: PassportDataset["shelf"][number]) => {
    const key = (p as Record<string, unknown>).product_key as string | undefined;
    const photo = ((p as Record<string, unknown>).storage_path as string | null | undefined) ?? (key ? photosByKey.get(key) : null);
    return (
      <div className="flex items-start gap-3">
        <Thumb bucket="product-photos" path={photo ?? null} className="size-11 shrink-0 rounded-lg" title={String(p.name ?? "Product image")} />
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-body font-semibold text-foreground break-words leading-snug">{p.name}</p>
          <p className="text-[11px] text-muted-foreground font-body truncate">
            {humaniseValue(p.brand) ?? "—"}{p.category ? ` · ${humaniseValue(p.category)}` : ""}
          </p>
          {p.rating != null && (
            <p className="text-[10.5px] uppercase tracking-[0.15em] text-primary font-body font-semibold mt-0.5">
              ★ {String(p.rating)}
            </p>
          )}
        </div>
      </div>
    );
  };

  const ProductInner = ({ p }: { p: PassportDataset["shelf"][number] }) => {
    const key = (p as Record<string, unknown>).product_key as string | undefined;
    const voicenotes = key ? d.productVoicenotes.filter(v => v.product_key === key) : [];
    const ingredients = Array.isArray((p as Record<string, unknown>).ingredients) ? ((p as Record<string, unknown>).ingredients as unknown[]).map(String) : [];
    return (
      <>
        <HumanFields obj={p as Record<string, unknown>} exclude={["name", "brand", "category", "rating", "off_shelf_voice_url", "ingredients"]} />
        {ingredients.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-1.5">Ingredients</p>
            <p className="text-[12px] font-body leading-relaxed text-foreground/85">{ingredients.join(", ")}</p>
          </div>
        )}
        {voicenotes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">Voice notes</p>
            <div className="space-y-2">
              {voicenotes.map(v => (
                <div key={v.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-[11px] text-muted-foreground font-body">{formatDate(v.created_at)}</p>
                  <AudioPlayer bucket="voicenotes" path={v.audio_url} transcript={v.transcript} />
                </div>
              ))}
            </div>
          </div>
        )}
        <AudioPlayer bucket="voicenotes" path={((p as Record<string, unknown>).off_shelf_voice_url as string | null) ?? null} label="Off-shelf voice note" />
      </>
    );
  };

  const favourites = d.shelf.filter(p => p.on_favourite);
  const onShelf = d.shelf.filter(p => !p.on_favourite && p.on_shelf);
  const wishlist = d.shelf.filter(p => !p.on_favourite && !p.on_shelf && p.on_wishlist);
  const offShelf = d.shelf.filter(p => !p.on_favourite && !p.on_shelf && !p.on_wishlist);

  const ProductGroup = ({ title, list }: { title: string; list: PassportDataset["shelf"] }) => {
    const [n, setN] = useState(8);
    if (list.length === 0) return null;
    return (
      <div>
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-primary font-body font-semibold mb-2">
          {title} · {list.length}
        </p>
        <div className="space-y-2">
          {list.slice(0, n).map(p => (
            <Collapsible key={p.id} summary={renderProductRow(p)}>
              <ProductInner p={p} />
            </Collapsible>
          ))}
          <LoadMore shown={Math.min(n, list.length)} total={list.length} onMore={() => setN(x => x + 8)} />
        </div>
      </div>
    );
  };

  return (
    <>
      <SubLabel>Product shelf</SubLabel>
      <div className="px-5 space-y-5">
        {d.shelf.length === 0 ? <EmptyLine msg="No products on this client's shelf." /> : (
          <>
            <ProductGroup title="On shelf" list={onShelf} />
            <ProductGroup title="Favourites" list={favourites} />
            <ProductGroup title="Wishlist" list={wishlist} />
            <ProductGroup title="Avoid list" list={offShelf} />
          </>
        )}
      </div>

      <SubLabel>Tools</SubLabel>
      <div className="px-5 space-y-2">
        {d.tools.length === 0 ? <EmptyLine msg="No tools recorded." /> : d.tools.map(t => (
          <Collapsible key={t.id} summary={
            <div className="flex items-center gap-3">
              <Thumb bucket="product-photos" path={(t.storage_path as string | null) ?? null} className="size-11 shrink-0 rounded-lg" title={String(t.name ?? "Tool")} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-body font-semibold text-foreground truncate">{humaniseValue(t.name) ?? "Tool"}</p>
                <p className="text-[11px] text-muted-foreground font-body truncate">
                  {humaniseValue(t.brand) ?? "—"}{t.category ? ` · ${humaniseValue(t.category)}` : ""}
                </p>
              </div>
            </div>
          }>
            <HumanFields obj={t as Record<string, unknown>} exclude={["name", "brand", "category"]} />
          </Collapsible>
        ))}
      </div>
    </>
  );
};


// ================================================================
// Section: Journal & photos
// ================================================================

const JournalSection = ({ d }: { d: PassportDataset }) => {
  return (
    <>
      <SubLabel>Journal entries</SubLabel>
      <div className="px-5 space-y-2">
        <PaginatedList
          items={d.journal}
          empty="No journal entries."
          render={(j) => {
            const photos = Array.isArray(j.photo_paths) ? j.photo_paths : [];
            const products = Array.isArray(j.products_used) ? j.products_used : [];
            const cleanedTitle = cleanTitle(j.title) || "Journal entry";
            return (
              <Collapsible key={j.id} summary={
                <div className="flex gap-3">
                  {photos.length > 0 && (
                    <Thumb bucket="journal-photos" path={photos[0]} className="size-14 shrink-0 rounded-lg" title={cleanedTitle} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-body font-semibold text-foreground leading-tight truncate">{cleanedTitle}</p>
                    <p className="text-[11px] text-muted-foreground font-body mt-0.5">
                      {formatDate(j.entry_date)} · {formatRelative(j.entry_date)}
                    </p>
                    {j.mood && (
                      <div className="mt-1"><Chip tone={valueTone(j.mood) as "good" | "warn" | "alert" | "neutral"}>{humaniseValue(j.mood)}</Chip></div>
                    )}
                  </div>
                </div>
              }>
                {j.note && (
                  <p className="text-[13px] font-body leading-relaxed whitespace-pre-wrap">{j.note}</p>
                )}
                {products.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-1.5">Products used</p>
                    <p className="text-[12px] font-body text-foreground/85">
                      {products.map(id => humaniseValue(id) ?? String(id)).join(", ")}
                    </p>
                  </div>
                )}
                {photos.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2">
                    {photos.map((p, i) => (
                      <Thumb key={i} bucket="journal-photos" path={p} className="aspect-square rounded-lg" title={`${cleanedTitle} photo ${i + 1}`} />
                    ))}
                  </div>
                )}
              </Collapsible>
            );
          }}
          pageSize={8}
        />
      </div>
    </>
  );
};

// ================================================================
// Section: Photos — milestones, before, moodboards
// ================================================================

const PhotosSection = ({ d }: { d: PassportDataset }) => {
  const boardImages = useMemo(() => {
    const m = new Map<string, typeof d.moodboardImages>();
    d.moodboardImages.forEach(img => {
      const arr = m.get(img.board_id) ?? [];
      arr.push(img);
      m.set(img.board_id, arr);
    });
    return m;
  }, [d.moodboardImages]);

  const empty = d.milestonePhotos.length === 0 && d.beforePhotos.length === 0 && d.moodboards.length === 0;

  return (
    <>
      {empty && (
        <div className="px-5 mt-2"><EmptyLine msg="No photos or moodboards yet." /></div>
      )}
      {d.milestonePhotos.length > 0 && (
        <>
          <SubLabel>Milestone photos</SubLabel>
          <div className="px-5">
            <div className="grid grid-cols-3 gap-2">
              {d.milestonePhotos.map(p => (
                <div key={p.id}>
                  <Thumb bucket="milestone-photos" path={p.storage_path} className="aspect-square rounded-lg" title={p.caption ?? "Milestone"} />
                  <p className="text-[10px] text-muted-foreground font-body mt-1 truncate">
                    {p.taken_on ? formatDate(p.taken_on) : "—"}
                  </p>
                  {p.caption && <p className="text-[10.5px] text-foreground/80 font-body leading-snug">{p.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {d.beforePhotos.length > 0 && (
        <>
          <SubLabel>Before photos</SubLabel>
          <div className="px-5">
            <div className="grid grid-cols-3 gap-2">
              {d.beforePhotos.map(p => (
                <div key={p.id}>
                  <Thumb bucket="before-photos" path={p.storage_path} className="aspect-square rounded-lg" title={p.caption ?? "Before photo"} />
                  <p className="text-[10px] text-muted-foreground font-body mt-1">{formatDate(p.created_at)}</p>
                  {p.caption && <p className="text-[10.5px] text-foreground/80 font-body leading-snug">{p.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {d.moodboards.length > 0 && (
        <>
          <SubLabel>Moodboards</SubLabel>
          <div className="px-5 space-y-2">
            {d.moodboards.map(b => {
              const imgs = boardImages.get(b.id) ?? [];
              return (
                <Collapsible key={b.id} defaultOpen={imgs.length > 0 && imgs.length <= 6} summary={
                  <div>
                    <p className="text-[13.5px] font-body font-semibold text-foreground">
                      {b.emoji ?? "🎨"} {b.name ?? "Moodboard"}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-body mt-0.5">
                      {imgs.length} image{imgs.length === 1 ? "" : "s"}{b.is_favourites ? " · Favourites" : ""}
                    </p>
                  </div>
                }>
                  {imgs.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground font-body">Empty board.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {imgs.map(i => (
                        <div key={i.id}>
                          <Thumb bucket="moodboard-images" path={i.storage_path} className="aspect-square rounded-lg" title={i.caption ?? "Moodboard image"} />
                          {i.caption && <p className="text-[10px] text-muted-foreground font-body mt-1 leading-snug">{i.caption}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Collapsible>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};


// ================================================================
// Section: Lifestyle — nutrition, medications, tools
// ================================================================

const NutritionAdviceCard = ({ payload, when, defaultOpen = false }: { payload: unknown; when: string; defaultOpen?: boolean }) => {
  const p = typeof payload === "object" && payload ? payload as Record<string, unknown> : null;
  const summary = typeof p?.summary === "string" ? p.summary : (typeof payload === "string" ? payload : null);
  const supplements = Array.isArray(p?.supplements) ? p.supplements as Array<Record<string, unknown>> : [];
  const diet = Array.isArray(p?.diet) ? p.diet as Array<Record<string, unknown>> : [];
  const avoid = Array.isArray(p?.avoid) ? p.avoid as Array<Record<string, unknown>> : [];

  return (
    <Collapsible defaultOpen={defaultOpen} summary={
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="text-[14px] font-body font-semibold text-foreground">Nutrition & supplement guidance</p>
        </div>
        <p className="text-[11px] text-muted-foreground font-body mt-0.5">
          {formatDate(when)} · {formatRelative(when)}
        </p>
      </div>
    }>
      {summary && (
        <p className="text-[13px] font-body leading-relaxed whitespace-pre-wrap text-foreground/90">{summary}</p>
      )}
      {supplements.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2 flex items-center gap-1.5">
            <Pill className="size-3.5" /> Supplement guidance
          </p>
          <div className="space-y-2">
            {supplements.map((s, i) => (
              <SurfaceCard key={i} className="border-l-4 border-l-primary">
                <div className="flex gap-2.5">
                  <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center text-lg shrink-0">
                    {String(s.emoji ?? "💊")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight">{humaniseValue(s.name) ?? humaniseValue(s.title) ?? "Supplement"}</p>
                    {s.dose && (
                      <p className="text-[11px] font-body font-medium text-primary mt-0.5">{humaniseValue(s.dose)}</p>
                    )}
                    {s.body && (
                      <p className="text-[12.5px] font-body leading-relaxed mt-1.5 whitespace-pre-wrap">{humaniseValue(s.body)}</p>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      )}
      {diet.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2 flex items-center gap-1.5">
            <Leaf className="size-3.5" /> Dietary guidance
          </p>
          <div className="space-y-2">
            {diet.map((c, i) => (
              <SurfaceCard key={i} className="border-l-4 border-l-good">
                <div className="flex gap-2.5">
                  <div className="size-9 rounded-full bg-good/15 flex items-center justify-center text-lg shrink-0">
                    {String(c.emoji ?? "🥗")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight">{humaniseValue(c.name) ?? "Recommendation"}</p>
                    {c.body && (
                      <p className="text-[12.5px] font-body leading-relaxed mt-1 whitespace-pre-wrap">{humaniseValue(c.body)}</p>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      )}
      {avoid.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2 flex items-center gap-1.5">
            <Ban className="size-3.5" /> Foods to limit
          </p>
          <div className="space-y-2">
            {avoid.map((c, i) => (
              <SurfaceCard key={i} className="border-l-4 border-l-warn">
                <div className="flex gap-2.5">
                  <div className="size-9 rounded-full bg-warn/15 flex items-center justify-center text-lg shrink-0">
                    {String(c.emoji ?? "⚠️")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight">{humaniseValue(c.name) ?? "Watch for"}</p>
                    {c.body && (
                      <p className="text-[12.5px] font-body leading-relaxed mt-1 whitespace-pre-wrap">{humaniseValue(c.body)}</p>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      )}
    </Collapsible>
  );
};

const NutritionSection = ({ d }: { d: PassportDataset }) => {
  const latest = d.nutritionSummaries[0];
  if (!latest) {
    return (
      <div className="px-5 mt-2">
        <EmptyLine msg="No nutrition guidance generated yet." />
      </div>
    );
  }
  return (
    <>
      <SubLabel>Nutrition & supplement guidance</SubLabel>
      <div className="px-5">
        <NutritionAdviceCard payload={latest.payload} when={latest.created_at} defaultOpen />
      </div>
    </>
  );
};



// ================================================================
// Section: Appointments — consumer AppointmentCard styling
// ================================================================

const AppointmentsSection = ({ d }: { d: PassportDataset }) => {
  const photosByAppt = useMemo(() => {
    const m = new Map<string, typeof d.appointmentPhotos>();
    d.appointmentPhotos.forEach(p => {
      const arr = m.get(p.appointment_id) ?? [];
      arr.push(p);
      m.set(p.appointment_id, arr);
    });
    return m;
  }, [d.appointmentPhotos]);

  const now = Date.now();
  const upcoming = d.appointments.filter(a => new Date(a.appointment_date).getTime() >= now);
  const past = d.appointments.filter(a => new Date(a.appointment_date).getTime() < now);

  const renderCard = (a: PassportDataset["appointments"][number], variant: "upcoming" | "past") => {
    const photos = photosByAppt.get(a.id) ?? [];
    const kicker = humaniseValue(a.professional_type) ?? "Appointment";
    const time = a.appointment_time ? formatTime12h(String(a.appointment_time)) : "";
    const isUpcoming = variant === "upcoming";
    return (
      <div key={a.id} className={cn(
        "rounded-[20px] border overflow-hidden",
        isUpcoming
          ? "border-primary/30 bg-[hsl(30_25%_18%)] text-primary-foreground"
          : "border-border bg-secondary/60",
      )}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className={cn("text-[10px] uppercase tracking-[0.2em] font-body font-semibold",
                isUpcoming ? "text-primary/80" : "text-muted-foreground")}>{kicker}</p>
              <p className={cn("font-display text-[18px] leading-tight mt-0.5",
                isUpcoming ? "text-primary-foreground" : "text-foreground")}>
                {formatDate(a.appointment_date)}
              </p>
              {time && (
                <p className={cn("text-[12px] font-body font-bold mt-0.5",
                  isUpcoming ? "text-primary" : "text-foreground/80")}>{time}</p>
              )}
            </div>
            <Chip tone={isUpcoming ? "gold" : (a.status === "completed" ? "good" : "neutral")}>
              {isUpcoming ? formatRelative(a.appointment_date) : (humaniseValue(a.status) ?? "Past")}
            </Chip>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <ProAvatar
              name={String(a.professional_name ?? "Professional")}
              size="size-11"
              className={isUpcoming ? "bg-primary/20 text-primary rounded-[12px]" : "bg-muted text-muted-foreground rounded-[12px]"}
            />
            <div className="flex-1 min-w-0">
              <p className={cn("font-display text-[15px] font-semibold leading-tight truncate",
                isUpcoming ? "text-primary-foreground" : "text-foreground")}>
                {humaniseValue(a.professional_name) ?? "—"}
              </p>
              <p className={cn("text-[11.5px] font-body truncate",
                isUpcoming ? "text-primary-foreground/75" : "text-muted-foreground")}>
                {[humaniseValue(a.clinic_name), humaniseValue(a.reason)].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>

          {(a.notes || a.outcome_notes) && (
            <div className={cn("pt-3 mt-3 border-t space-y-1.5",
              isUpcoming ? "border-primary/20" : "border-border")}>
              {a.outcome_notes && (
                <p className={cn("text-[12px] font-body leading-relaxed",
                  isUpcoming ? "text-primary-foreground/90" : "text-foreground/85")}>
                  <span className={cn("font-semibold", isUpcoming ? "text-primary" : "text-foreground")}>How it went: </span>
                  {a.outcome_notes as string}
                </p>
              )}
              {a.notes && (
                <p className={cn("text-[12px] font-body leading-relaxed",
                  isUpcoming ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {a.notes as string}
                </p>
              )}
            </div>
          )}

          <AudioPlayer bucket="voicenotes" path={(a.outcome_audio_path as string | null) ?? null} label="Outcome voice note" />

          {photos.length > 0 && (
            <div className={cn("mt-3 pt-3 border-t grid grid-cols-3 gap-2",
              isUpcoming ? "border-primary/20" : "border-border")}>
              {photos.map(p => (
                <div key={p.id}>
                  <Thumb bucket="appointment-photos" path={p.storage_path} className="aspect-square rounded-lg" title="Appointment photo" />
                  {p.caption && <p className={cn("text-[10px] font-body mt-1 leading-snug",
                    isUpcoming ? "text-primary-foreground/70" : "text-muted-foreground")}>{p.caption}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {upcoming.length > 0 && (
        <>
          <SubLabel>Upcoming</SubLabel>
          <div className="px-5 space-y-2">
            {upcoming.map(a => renderCard(a, "upcoming"))}
          </div>
        </>
      )}

      <SubLabel>History</SubLabel>
      <div className="px-5 space-y-2">
        {past.length === 0 && upcoming.length === 0 ? (
          <EmptyLine msg="No appointments logged." />
        ) : past.length === 0 ? (
          <EmptyLine msg="No past appointments." />
        ) : (
          <PaginatedList
            items={past}
            empty="No past appointments."
            render={(a) => renderCard(a, "past")}
            pageSize={8}
          />
        )}
      </div>
    </>
  );
};

// ================================================================
// Main shell
// ================================================================

export interface PassportViewProps {
  userId: string;
  mode: "pro" | "admin";
  backTo: string;
  active: boolean; // gates fetching (e.g. pro must be subscribed)
  subLoading?: boolean;
  showAccessEnded?: boolean; // when pro sub inactive
  accessEndedAction: () => void;
}

const AccessEnded = ({ label, onAction }: { label: string; onAction: () => void }) => (
  <div className="px-5 py-8 space-y-4">
    <SurfaceCard tone="gold">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <ShieldOff className="size-5" />
        </div>
        <div className="flex-1">
          <p className="font-display text-base font-semibold leading-tight">Access ended</p>
          <p className="text-xs font-body text-muted-foreground mt-1 leading-snug">
            This client has revoked access or your subscription is not active. You can no
            longer view their Strand passport.
          </p>
          <Button className="mt-3 w-full" variant="outline" onClick={onAction}>{label}</Button>
        </div>
      </div>
    </SurfaceCard>
  </div>
);

const sectionIcon: Record<Section, React.ComponentType<{ className?: string }>> = {
  profile: User,
  routine: Droplet,
  products: Package,
  appointments: CalendarDays,
  nutrition: Leaf,
  journal: PenLine,
  photos: ImageIcon,
  goals: Target,
};

const sectionSub: Record<Section, string> = {
  profile: "Identity, health, medications, hair, colour and blood work",
  routine: "Wash days in full detail",
  products: "Shelf, favourites, wishlist and off-shelf",
  appointments: "Upcoming and past visits",
  nutrition: "Latest supplement and dietary guidance",
  journal: "Entries with notes, mood and photos",
  photos: "Milestones, before shots, moodboards",
  goals: "What they want and why they're here",
};


const PassportView = ({ userId, mode, active, subLoading, showAccessEnded, accessEndedAction }: PassportViewProps) => {
  const [section, setSection] = useState<Section>("profile");

  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const { data, loading, accessEnded } = usePassportData(userId, active);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active || accessEnded) return;
    logView(userId, section);
  }, [userId, section, active, accessEnded]);




  if (showAccessEnded) {
    return (
      <ScreenLayout>
        <TitleBar title="Client passport" onBack={accessEndedAction} />
        <AccessEnded label="Back to billing" onAction={accessEndedAction} />
      </ScreenLayout>
    );
  }
  if (loading || subLoading) {
    return (
      <ScreenLayout>
        <TitleBar title={mode === "admin" ? "Member passport" : "Client passport"} onBack={accessEndedAction} />
        <LoadingDot label="Loading passport…" fullScreen={false} />
      </ScreenLayout>
    );
  }
  if (accessEnded || !data) {
    return (
      <ScreenLayout>
        <TitleBar title={mode === "admin" ? "Member passport" : "Client passport"} onBack={accessEndedAction} />
        <AccessEnded label={mode === "admin" ? "Back to members" : "Back to enquiries"} onAction={accessEndedAction} />
      </ScreenLayout>
    );
  }

  const Icon = sectionIcon[section];

  return (
    <ImagePreviewContext.Provider value={setImagePreview}>
      <ScreenLayout>
        <TitleBar title={mode === "admin" ? "Member passport" : "Client passport"} onBack={accessEndedAction} />

        {/* Sticky tab strip — gold-edged passport pages */}
        <div ref={tabsRef} className="sticky top-0 z-10 bg-background/95 backdrop-blur-md pt-2.5 pb-3 px-5 border-b border-primary/15">

          <div className="overflow-x-auto scrollbar-hide -mx-5 px-5">
            <div className="flex gap-1.5 min-w-max">
              {SECTIONS.map((s) => {
                const count = s.count(data);
                const isActive = section === s.key;
                const TabIcon = sectionIcon[s.key];
                return (
                  <button
                    key={s.key}
                    onClick={() => setSection(s.key)}
                    aria-pressed={isActive}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10.5px] uppercase tracking-[0.16em] font-body font-semibold border transition-all min-h-[38px] inline-flex items-center gap-1.5 whitespace-nowrap",
                      isActive
                        ? "bg-foreground text-primary border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_4px_12px_-6px_hsl(var(--foreground)/0.4)]"
                        : "bg-card border-border/60 text-foreground/70 hover:text-foreground hover:border-primary/30",
                    )}
                  >
                    <TabIcon className={cn("size-3", isActive ? "text-primary" : "text-foreground/50")} />
                    <span>{s.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "px-1.5 min-w-[16px] h-[16px] rounded-full text-[9px] font-semibold flex items-center justify-center tracking-normal",
                        isActive ? "bg-primary/25 text-primary" : "bg-primary/10 text-primary/85",
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>


        <SectionHeader icon={Icon} title={SECTIONS.find(s => s.key === section)?.label ?? "Passport"} sub={sectionSub[section]} />

        <div className="pb-10 animate-fade-in" key={section}>
          {section === "profile" && <ProfileSection d={data} />}
          {section === "routine" && <RoutineSection d={data} />}
          {section === "products" && <ProductsSection d={data} />}
          {section === "appointments" && <AppointmentsSection d={data} />}
          {section === "nutrition" && <NutritionSection d={data} />}
          {section === "journal" && <JournalSection d={data} />}
          {section === "photos" && <PhotosSection d={data} />}
          {section === "goals" && <GoalsSection d={data} />}
        </div>



        <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
          <DialogContent className="w-[calc(100vw-32px)] max-w-[360px] rounded-[20px] p-4 gap-3 max-h-[82vh] overflow-y-auto">
            <DialogTitle className="font-display text-base leading-tight pr-8">{imagePreview?.title ?? "Image"}</DialogTitle>
            {imagePreview?.url ? (
              <img src={imagePreview.url} alt={imagePreview.title} className="w-full rounded-md object-contain max-h-[46vh] bg-muted" />
            ) : (
              <div className="aspect-square rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">Loading image…</div>
            )}
            {imagePreview?.meta && <div className="pt-2 border-t border-border">{imagePreview.meta}</div>}
          </DialogContent>
        </Dialog>
      </ScreenLayout>
    </ImagePreviewContext.Provider>
  );
};

export default PassportView;
