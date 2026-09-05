import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Droplets,
  Scissors,
  Flame,
  Heart,
  Gauge,
  Clock,
  Package,
  ListOrdered,
  Sparkles,
  Mic,
  CalendarDays,
} from "lucide-react";
import { stylingHeatOf, describeStylingHeat } from "@/lib/stylingHeat";
import BrandTagControl from "@/components/brand/BrandTagControl";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import StatusCallout from "@/components/guidance/StatusCallout";
import {
  washStepLabel,
  anyStepUsedHeat,
  HEAT_COOLDOWN_TIP,
  type StepHeat,
} from "@/lib/washSteps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { WashDay } from "@/hooks/useWashDays";
import { toast } from "sonner";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import BrandLink from "@/components/BrandLink";
import ProductThumb from "@/components/ProductThumb";
import VoiceNoteBlock from "@/components/VoiceNoteBlock";
import VoiceNotePlayerRow from "@/components/voice/VoiceNotePlayerRow";
import TranscriptView from "@/components/voice/TranscriptView";
import { stripStaleDates } from "@/lib/stripStaleDates";
import { toParagraphs } from "@/lib/formatTranscript";
import AiProse from "@/components/tips/AiProse";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import LevelGate from "@/components/tips/LevelGate";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const daysAgoLabel = (iso: string) => {
  const then = new Date(iso).setHours(0, 0, 0, 0);
  const now = new Date().setHours(0, 0, 0, 0);
  const diff = Math.round((now - then) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 0) return `${diff} days ago`;
  if (diff === -1) return "Tomorrow";
  return `In ${-diff} days`;
};

const Stat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex-1 min-w-0 rounded-2xl bg-primary/5 border border-primary/10 px-3 py-2.5 text-center">
    <Icon className="size-4 text-primary mx-auto mb-1" />
    <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm font-semibold leading-tight truncate">{value}</p>
  </div>
);

const Chip = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "alert" }) => {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-foreground",
    good: "bg-[hsl(var(--good))]/15 text-[hsl(var(--good))]",
    warn: "bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]",
    alert: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
};

const scalpTone = (v: string | null): "good" | "warn" | "alert" | "neutral" => {
  if (!v) return "neutral";
  const s = v.toLowerCase();
  if (["clean", "balanced"].some((k) => s.includes(k))) return "good";
  if (["itchy", "tender", "dry", "flaky", "greasy"].some((k) => s.includes(k))) return "warn";
  return "neutral";
};
const breakageTone = (v: string | null): "good" | "warn" | "alert" | "neutral" => {
  if (!v) return "neutral";
  const s = v.toLowerCase();
  if (s.includes("none")) return "good";
  if (s.includes("minimal")) return "good";
  if (s.includes("moderate")) return "warn";
  if (s.includes("lot") || s.includes("concerned")) return "alert";
  return "neutral";
};
const stressTone = (v: number | null): "good" | "warn" | "alert" | "neutral" => {
  if (v == null) return "neutral";
  if (v <= 1) return "good";
  if (v <= 3) return "warn";
  return "alert";
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">{label}</p>
    <div className="text-sm">{value}</div>
  </div>
);

interface HeatTreatment {
  used?: boolean;
  product?: string;
  duration_min?: number;
  tools?: string[];
  tool_ids?: string[];
}
interface ProductLookup {
  id: string;
  name: string;
  brand: string | null;
  image_url?: string | null;
  storage_path?: string | null;
}

interface StylingSnapshot {
  style?: string[];
  productIds?: string[];
  productNames?: string[];
  duration?: string[];
  stress?: string[];
  note?: string;
  audioPath?: string | null;
  photoPaths?: string[];
  saveAsJournal?: boolean;
}



interface EditDraft {
  wash_date: string;
  scalp_feel: string;
  breakage: string;
  style_after: string;
  duration_min: string;
  stress_level: string;
  hair_feel_note: string;
}

const draftFromWashDay = (wd: WashDay): EditDraft => ({
  wash_date: wd.wash_date,
  scalp_feel: wd.scalp_feel ?? "",
  breakage: wd.breakage ?? "",
  style_after: wd.style_after ?? "",
  duration_min: wd.duration_min != null ? String(wd.duration_min) : "",
  stress_level: wd.stress_level != null ? String(wd.stress_level) : "",
  hair_feel_note: wd.hair_feel_note ?? "",
});

const WashDayDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wd, setWd] = useState<WashDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [styleVoiceUrl, setStyleVoiceUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [styling, setStyling] = useState<StylingSnapshot | null>(null);
  const [stylingProducts, setStylingProducts] = useState<ProductLookup[]>([]);
  const [stylingPhotoUrls, setStylingPhotoUrls] = useState<string[]>([]);
  const [stylingAudioUrl, setStylingAudioUrl] = useState<string | null>(null);
  const { hash } = useLocation();

  // Arriving from a card's "See all" lands on #transcript — scroll the full note
  // into view once it has rendered.
  useEffect(() => {
    if (hash !== "#transcript" || loading || !wd) return;
    const el = document.getElementById("transcript");
    if (!el) return;
    const t = window.setTimeout(
      () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
      120,
    );
    return () => window.clearTimeout(t);
  }, [hash, loading, wd]);


  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("wash_days")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        const next = (data as unknown as WashDay) ?? null;
        setWd(next);
        if (next) setDraft(draftFromWashDay(next));
        if (data?.hair_feel_voice_url) {
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(data.hair_feel_voice_url, 3600);
          setVoiceUrl(sig?.signedUrl ?? null);
        }
        if (data?.style_other_voice_url) {
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(data.style_other_voice_url, 3600);
          setStyleVoiceUrl(sig?.signedUrl ?? null);
        }
        // Resolve product_ids → names/brands for a clear "Products used" list
        const ids = (next?.product_ids ?? []).filter(Boolean);
        if (ids.length) {
          const { data: prods } = await supabase
            .from("user_products")
            .select("id, name, brand, image_url, storage_path")
            .in("id", ids);
          if (!cancelled) setProducts((prods as ProductLookup[]) ?? []);
        } else {
          setProducts([]);
        }

        // Styling snapshot (photos, styling products, note, voicenote)
        const s = ((data as unknown as { styling?: StylingSnapshot | null })?.styling) ?? null;
        setStyling(s);
        if (s?.productIds?.length) {
          const { data: sp } = await supabase
            .from("user_products")
            .select("id, name, brand, image_url, storage_path")
            .in("id", s.productIds);
          if (!cancelled) setStylingProducts((sp as ProductLookup[]) ?? []);
        } else {
          setStylingProducts([]);
        }
        if (s?.photoPaths?.length) {
          const signed = await Promise.all(
            s.photoPaths.map(async (p) => {
              const { data: sig } = await supabase.storage
                .from("journal-photos")
                .createSignedUrl(p, 3600);
              return sig?.signedUrl ?? null;
            }),
          );
          if (!cancelled) setStylingPhotoUrls(signed.filter((u): u is string => !!u));
        } else {
          setStylingPhotoUrls([]);
        }
        if (s?.audioPath) {
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(s.audioPath, 3600);
          if (!cancelled) setStylingAudioUrl(sig?.signedUrl ?? null);
        } else {
          setStylingAudioUrl(null);
        }

        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, id]);


  const handleSave = async () => {
    if (!wd || !draft || !user) return;
    setSaving(true);
    try {
      const updates = {
        wash_date: draft.wash_date,
        scalp_feel: draft.scalp_feel.trim() || null,
        breakage: draft.breakage.trim() || null,
        style_after: draft.style_after.trim() || null,
        duration_min: draft.duration_min ? Number(draft.duration_min) : null,
        stress_level: draft.stress_level ? Number(draft.stress_level) : null,
        hair_feel_note: draft.hair_feel_note.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("wash_days")
        .update(updates)
        .eq("id", wd.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      setWd(data as unknown as WashDay);
      setDraft(draftFromWashDay(data as unknown as WashDay));
      setEditing(false);
      toast.success("Wash day updated");
    } catch (e) {
      console.error("wash_days update failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!wd || !user) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("wash_days")
        .delete()
        .eq("id", wd.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Wash day deleted");
      navigate("/wash-day");
    } catch (e) {
      console.error("wash_days delete failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
      </ScreenLayout>
    );
  }
  if (!wd) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Wash day not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
            ← Back to Wash Day
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  // Captured style attributes read as chips, not loose lines.
  const styleDetailChips = [
    wd.style_extensions != null
      ? wd.style_extensions
        ? "With extensions"
        : "Without extensions"
      : null,
    wd.style_tension
      ? `${wd.style_tension.charAt(0).toUpperCase()}${wd.style_tension.slice(1)} tension`
      : null,
    describeStylingHeat(stylingHeatOf((wd as unknown as { styling?: unknown }).styling))
      ? `Heat styling: ${describeStylingHeat(stylingHeatOf((wd as unknown as { styling?: unknown }).styling))}`
      : null,
  ].filter((c): c is string => !!c);



  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Wash Day" back />
      <div className="px-5 pb-8 space-y-4">
        {/* ── Header ─────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium flex items-center gap-1.5">
              <CalendarDays className="size-3" /> {daysAgoLabel(wd.wash_date)}
            </p>
            <h1 className="font-display text-xl font-bold leading-tight">{fmtDate(wd.wash_date)}</h1>
          </div>
          {!editing && (
            <button
              onClick={() => { setDraft(draftFromWashDay(wd)); setEditing(true); }}
              className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-primary px-3 py-2 rounded-full border border-primary/30 hover:bg-primary/5 shrink-0"
              aria-label="Edit wash day"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
        </div>

        {!editing && (
          <AddToCalendarButton
            event={{
              title: "Wash Day",
              date: wd.wash_date,
              description: wd.steps?.length
                ? `Steps: ${wd.steps.map((s) => washStepLabel(s.name)).join(" · ")}`
                : undefined,
              uid: `washday-${wd.id}@strand.app`,
            }}
          />
        )}

        {/* ── At-a-glance stats ──────────────── */}
        {!editing && (
          <div className="flex gap-2">
            <Stat icon={Package} label="Products" value={products.length || wd.product_ids?.length || 0} />
            <Stat icon={ListOrdered} label="Steps" value={wd.steps?.length ?? 0} />
            <Stat
              icon={Scissors}
              label="Style"
              value={wd.style_after ?? "—"}
            />
          </div>
        )}

        {/* Style attributes — only render what was actually captured. */}
        {!editing && (wd.style_extensions != null || wd.style_tension || wd.style_other_note ||
          stylingHeatOf((wd as unknown as { styling?: unknown }).styling)?.used != null) && (
          <SurfaceCard>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-2">
              Style detail
            </p>
            <div className="space-y-2.5">
              {styleVoiceUrl && (
                <VoiceNotePlayerRow url={styleVoiceUrl} mediaName="style note" />
              )}
              {wd.style_other_note && <TranscriptView text={wd.style_other_note} />}
              {styleDetailChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {styleDetailChips.map((c) => (
                    <span
                      key={c}
                      className="rounded-[20px] bg-secondary px-[11px] py-[5px] text-[12px] text-foreground font-body break-words"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SurfaceCard>
        )}

        {/* ── Health signals ─────────────────── */}
        {!editing && (wd.scalp_feel || wd.breakage || wd.stress_level != null) && (
          <SurfaceCard>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-2.5">
              How your hair felt
            </p>
            <div className="flex flex-wrap gap-1.5">
              {wd.scalp_feel && (
                <Chip tone={scalpTone(wd.scalp_feel)}>
                  <Droplets className="size-3" /> Scalp: {wd.scalp_feel}
                </Chip>
              )}
              {wd.breakage && (
                <Chip tone={breakageTone(wd.breakage)}>
                  <Heart className="size-3" /> Breakage: {wd.breakage}
                </Chip>
              )}
              {wd.stress_level != null && (
                <Chip tone={stressTone(wd.stress_level)}>
                  <Gauge className="size-3" /> Stress: {wd.stress_level}/5
                </Chip>
              )}
              {wd.duration_min != null && (
                <Chip>
                  <Clock className="size-3" /> {wd.duration_min} min
                </Chip>
              )}
            </div>
          </SurfaceCard>
        )}

        {/* ── Wash steps ─────────────────────── */}
        {!editing && wd.steps?.length > 0 && (
          <SurfaceCard padded={false} className="divide-y divide-border/60">
            <div className="p-3.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
              <ListOrdered className="size-3.5 text-primary" /> Steps taken
            </div>
            {wd.steps.map((s, i) => {
              const heat = (s as { heat?: StepHeat | null }).heat;
              return (
                <div key={i} className="p-3 flex items-start gap-3">
                  <span className="size-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{washStepLabel(s.name)}</p>
                    {s.product_name && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Product: {s.product_name}
                      </p>
                    )}
                    {/* Heat reads against the step it was used on. */}
                    {heat?.used && (
                      <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                        <Flame className="size-3" />
                        Heat
                        {heat.duration_min ? ` · ${heat.duration_min} min` : ""}
                        {heat.tools?.length ? ` · ${heat.tools.join(", ")}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </SurfaceCard>
        )}

        {/* ── Heat treatment ───────────────────
            Only for logs without per-step heat (logged before per-step heat
            existed) — otherwise the heat already shows on its own step. */}
        {!editing &&
          wd.heat_treatment &&
          (wd.heat_treatment as HeatTreatment).used !== false &&
          !(wd.steps ?? []).some((s) => (s as { heat?: StepHeat | null }).heat) &&
          (() => {
          const h = wd.heat_treatment as HeatTreatment;
          const tools = h.tools?.filter(Boolean) ?? [];
          const label = tools.length ? tools.join(", ") : h.product ?? "TT Heat Hat";
          return (
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Flame className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                    Heat treatment
                  </p>
                  <p className="text-sm font-medium leading-tight break-words">{label}</p>
                  {h.duration_min != null && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{h.duration_min} min</p>
                  )}
                </div>
              </div>
            </SurfaceCard>
          );
        })()}

        {/* Cool-down guidance, shown once whenever heat was used on this log. */}
        {!editing &&
          (anyStepUsedHeat((wd.steps ?? []) as Array<{ heat?: StepHeat | null }>) ||
            (wd.heat_treatment as HeatTreatment | null)?.used === true) && (
            <StatusCallout tone="gold" icon={Flame} label="Cool-down">
              {HEAT_COOLDOWN_TIP}
            </StatusCallout>
          )}


        {/* ── Products used ──────────────────── */}
        {!editing && products.length > 0 && (
          <SurfaceCard padded={false} className="divide-y divide-border/60">
            <div className="p-3.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
              <Package className="size-3.5 text-primary" /> Products used
            </div>
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/products/profile/${p.id}`}
                className="flex items-center gap-3 p-3 hover:bg-primary/5 transition"
              >
                <ProductThumb
                  imageUrl={p.image_url}
                  storagePath={p.storage_path}
                  brand={p.brand}
                  name={p.name}
                  alt={p.name}
                  cover
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight break-words">{p.name}</p>
                  {p.brand && (
                    <p className="text-[11px] text-muted-foreground mt-0.5"><BrandLink brand={p.brand} /></p>
                  )}
                </div>
                <span className="text-primary text-xs">›</span>
              </Link>
            ))}
          </SurfaceCard>
        )}

        {/* ── Styling ────────────────────────── */}
        {!editing && styling && (
          styling.style?.length ||
          styling.duration?.length ||
          styling.stress?.length ||
          styling.note?.trim() ||
          stylingPhotoUrls.length > 0 ||
          stylingProducts.length > 0 ||
          stylingAudioUrl
        ) ? (
          <SurfaceCard className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium flex items-center gap-1.5">
              <Scissors className="size-3" /> Styling
            </p>

            {(styling.style?.length || styling.duration?.length || styling.stress?.length) && (
              <div className="flex flex-wrap gap-1.5">
                {styling.style?.map((s) => (
                  <Chip key={`st-${s}`}>{s}</Chip>
                ))}
                {styling.duration?.map((d) => (
                  <Chip key={`d-${d}`}><Clock className="size-3" /> {d}</Chip>
                ))}
                {styling.stress?.map((v) => (
                  <Chip key={`s-${v}`} tone={v === "Low" ? "good" : v === "High" ? "alert" : "warn"}>
                    <Gauge className="size-3" /> Stress: {v}
                  </Chip>
                ))}
              </div>
            )}

            {stylingPhotoUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {stylingPhotoUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-muted">
                    <img src={url} alt="Style" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}

            {stylingProducts.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Products used to style</p>
                <div className="rounded-2xl border border-border/60 divide-y divide-border/60 overflow-hidden">
                  {stylingProducts.map((p) => (
                    <Link key={p.id} to={`/products/profile/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-primary/5 transition">
                      <ProductThumb
                        imageUrl={p.image_url}
                        storagePath={p.storage_path}
                        brand={p.brand}
                        name={p.name}
                        alt={p.name}
                        cover
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight break-words">{p.name}</p>
                        {p.brand && <p className="text-[11px] text-muted-foreground mt-0.5"><BrandLink brand={p.brand} /></p>}
                      </div>
                      <span className="text-primary text-xs">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <LevelGate min={2}>
              {(styling.note?.trim() || stylingAudioUrl) && (
                <VoiceNoteBlock
                  label="Styling note"
                  transcript={styling.note}
                  audioUrl={stylingAudioUrl}
                />
              )}

            </LevelGate>
          </SurfaceCard>
        ) : null}


        {/* ── Edit form ──────────────────────── */}
        {editing && draft && (
          <SurfaceCard className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">
              Edit details
            </p>

            <div>
              <Label htmlFor="wash_date" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Date</Label>
              <Input
                id="wash_date"
                type="date"
                value={draft.wash_date}
                onChange={(e) => setDraft({ ...draft, wash_date: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="scalp" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Scalp feel</Label>
                <Input id="scalp" value={draft.scalp_feel} onChange={(e) => setDraft({ ...draft, scalp_feel: e.target.value })} placeholder="e.g. Calm" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="breakage" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Breakage</Label>
                <Input id="breakage" value={draft.breakage} onChange={(e) => setDraft({ ...draft, breakage: e.target.value })} placeholder="e.g. Minimal" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="style" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Style after</Label>
                <Input id="style" value={draft.style_after} onChange={(e) => setDraft({ ...draft, style_after: e.target.value })} placeholder="e.g. Twist-out" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="duration" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Duration (min)</Label>
                <Input id="duration" type="number" inputMode="numeric" min={0} value={draft.duration_min} onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="stress" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Stress level (1–5)</Label>
                <Input id="stress" type="number" inputMode="numeric" min={1} max={5} value={draft.stress_level} onChange={(e) => setDraft({ ...draft, stress_level: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div>
              <Label htmlFor="feel" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Hair feel note</Label>
              <Textarea id="feel" value={draft.hair_feel_note} onChange={(e) => setDraft({ ...draft, hair_feel_note: e.target.value })} placeholder="How did your hair feel after this wash?" rows={3} className="mt-1" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="gold" size="pill" onClick={handleSave} disabled={saving} className="flex-1 min-w-0">
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="goldOutline" size="pill" onClick={() => { setDraft(draftFromWashDay(wd)); setEditing(false); }} disabled={saving} className="flex-1 min-w-0">
                Cancel
              </Button>
            </div>
          </SurfaceCard>
        )}

        {/* ── Hair feel note + voice ─────────── */}
        {!editing && (wd.hair_feel_note || voiceUrl) && (
          <SurfaceCard>
            <VoiceNoteBlock
              id="transcript"
              label="Your hair feel note"
              transcript={wd.hair_feel_note}
              audioUrl={voiceUrl}
            />
          </SurfaceCard>
        )}

        {/* ── AI insight ─────────────────────── */}
        {!editing && wd.ai_insight && (
          <GuidanceCard tone="insight" eyebrow="Strand observation" icon={Sparkles}>
            <AiProse text={stripStaleDates(wd.ai_insight)} />
          </GuidanceCard>
        )}




        {!editing && (
          <>
            <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
              ← Back to Wash Day
            </Button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full mt-2 flex items-center justify-center gap-2 text-xs text-destructive py-2.5 rounded-full border border-destructive/30 hover:bg-destructive/5"
            >
              <Trash2 className="size-3.5" />
              Delete this wash day
            </button>
          </>
        )}

        <div className="space-y-2 pt-2">
          <BrandTagControl taggableType="wash_day" taggableId={id} />
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this wash day?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the entry from your history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default WashDayDetail;
