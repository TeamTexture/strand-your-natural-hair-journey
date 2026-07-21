import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, ShieldCheck, ShieldOff, Shield, Play } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePassportData, type PassportDataset } from "./usePassportData";
import SignedImage from "./SignedImage";

type Section =
  | "overview" | "blood" | "colour" | "wash" | "journal" | "shelf"
  | "appointments" | "medications" | "tools" | "photos" | "nutrition"
  | "moodboards" | "ingredients";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "blood", label: "Blood work" },
  { key: "colour", label: "Colour" },
  { key: "wash", label: "Wash days" },
  { key: "journal", label: "Journal" },
  { key: "shelf", label: "Shelf" },
  { key: "appointments", label: "Appointments" },
  { key: "medications", label: "Medications" },
  { key: "tools", label: "Tools" },
  { key: "photos", label: "Photos" },
  { key: "nutrition", label: "Nutrition" },
  { key: "moodboards", label: "Moodboards" },
  { key: "ingredients", label: "Ingredients" },
];

const PAGE = 20;

const logView = async (consumerId: string, section: Section) => {
  try { await supabase.functions.invoke("passport-view-log", { body: { consumer_id: consumerId, section } }); } catch { /* best-effort */ }
};

const oneOf = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return null;
  return String(v);
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3 text-[13px]">
    <span className="text-muted-foreground w-[120px] shrink-0">{label}</span>
    <span className="flex-1 break-words">{value ?? "—"}</span>
  </div>
);

const AllFields = ({ obj, exclude = [] }: { obj: Record<string, unknown> | null; exclude?: string[] }) => {
  if (!obj) return <p className="text-xs text-muted-foreground">Nothing recorded.</p>;
  const skip = new Set(["id", "user_id", "created_at", "updated_at", ...exclude, ...Object.keys(obj).filter(k => k.endsWith("_enc") || k.endsWith("_hash") || k.endsWith("_snapshot"))]);
  const entries = Object.entries(obj).filter(([k, v]) => !skip.has(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Nothing recorded.</p>;
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => {
        const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        let display: React.ReactNode;
        if (Array.isArray(v)) display = (v as unknown[]).map(String).join(", ");
        else if (typeof v === "object") display = <pre className="text-[11px] whitespace-pre-wrap break-words bg-muted/40 rounded p-2">{JSON.stringify(v, null, 2)}</pre>;
        else display = oneOf(v);
        return <Row key={k} label={label} value={display} />;
      })}
    </div>
  );
};

const Collapsible = ({ summary, children, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SurfaceCard>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="flex-1 min-w-0">{summary}</div>
        {open ? <ChevronUp className="size-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {open && <div className="mt-3 pt-3 border-t border-border">{children}</div>}
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

const EmptyCard = ({ msg }: { msg: string }) => (
  <SurfaceCard><p className="text-xs text-muted-foreground">{msg}</p></SurfaceCard>
);

const StatusChip = ({ status }: { status: string | null }) => {
  if (!status) return null;
  return (
    <span className={cn(
      "text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
      status === "low" && "bg-alert-dark/15 text-alert-dark",
      (status === "high" || status === "borderline") && "bg-warn/15 text-warn",
      status === "in_range" && "bg-good/15 text-good",
      !["low", "high", "borderline", "in_range"].includes(status) && "bg-muted text-muted-foreground",
    )}>{status.replace(/_/g, " ")}</span>
  );
};

const AudioButton = ({ bucket, path, transcriptFallback }: { bucket: string; path: string | null; transcriptFallback?: string | null }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!path || url) return;
    setLoading(true);
    // Some audio_url values are already full URLs — pass through.
    if (path.startsWith("http")) { setUrl(path); setLoading(false); return; }
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrl(data.signedUrl);
    setLoading(false);
  };
  if (!path && !transcriptFallback) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {path && !url && (
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-[11px] text-primary">
          <Play className="size-3" /> {loading ? "Loading…" : "Play voice note"}
        </button>
      )}
      {url && <audio controls src={url} className="w-full h-8" />}
      {transcriptFallback && <p className="text-[11px] italic text-muted-foreground leading-snug">“{transcriptFallback}”</p>}
    </div>
  );
};

// ================= Section renderers =================

const OverviewSection = ({ d }: { d: PassportDataset }) => {
  const goalsById = useMemo(() => {
    const m = new Map<string, typeof d.goalUpdates>();
    d.goalUpdates.forEach(u => {
      const arr = m.get(u.goal_id) ?? [];
      arr.push(u);
      m.set(u.goal_id, arr);
    });
    return m;
  }, [d.goalUpdates]);

  return (
    <>
      <SectionLabel>Identity</SectionLabel>
      <SurfaceCard>
        {d.profile ? (
          <div className="space-y-1.5">
            <Row label="Name" value={d.profile.display_name} />
            <Row label="Email" value={d.authEmail} />
            <Row label="Age" value={d.profile.age != null ? `${d.profile.age} (born ${d.profile.birth_year})` : null} />
            <Row label="Heritage" value={d.profile.heritage.length ? d.profile.heritage.join(", ") : null} />
            <Row label="Postcode" value={d.profile.postcode} />
            <Row label="Country" value={d.profile.country} />
            <Row label="Member since" value={d.profile.created_at ? format(new Date(d.profile.created_at), "d MMM yyyy") : null} />
            <Row label="Onboarded" value={d.profile.onboarding_completed_at ? format(new Date(d.profile.onboarding_completed_at), "d MMM yyyy") : null} />
          </div>
        ) : <p className="text-xs text-muted-foreground">No profile recorded.</p>}
      </SurfaceCard>

      <SectionLabel>Hair profile</SectionLabel>
      <SurfaceCard><AllFields obj={d.hair} /></SurfaceCard>

      <SectionLabel>Health profile</SectionLabel>
      <SurfaceCard><AllFields obj={d.health} /></SurfaceCard>

      <SectionLabel>Style profile</SectionLabel>
      <SurfaceCard><AllFields obj={d.style} exclude={["colour_history", "chemical_history", "colour_reaction_audio_path"]} /></SurfaceCard>

      <SectionLabel>Preferred professional</SectionLabel>
      <SurfaceCard><AllFields obj={d.professional} /></SurfaceCard>

      <SectionLabel>Strand summaries</SectionLabel>
      {d.strandSummaries.length === 0 ? <EmptyCard msg="No Strand summary yet." /> : d.strandSummaries.map(s => (
        <Collapsible key={s.id} summary={
          <div>
            <p className="text-sm font-body font-semibold">Strand summary</p>
            <p className="text-[11px] text-muted-foreground">{format(new Date(s.created_at), "d MMM yyyy")}</p>
          </div>
        }>
          {s.overview && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{s.overview}</p>}
          {Array.isArray(s.action_plan) && (s.action_plan as unknown[]).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Action plan</p>
              <ul className="text-[12px] list-disc pl-4 space-y-1">
                {(s.action_plan as unknown[]).map((a, i) => <li key={i}>{typeof a === "string" ? a : JSON.stringify(a)}</li>)}
              </ul>
            </div>
          )}
        </Collapsible>
      ))}

      <SectionLabel>Latest blood AI summary</SectionLabel>
      {d.bloodSummaries.length === 0 ? <EmptyCard msg="No blood AI summary yet." /> : (() => {
        const s = d.bloodSummaries[0];
        return (
          <Collapsible defaultOpen summary={
            <div>
              <p className="text-sm font-body font-semibold">Blood AI summary</p>
              <p className="text-[11px] text-muted-foreground">Updated {format(new Date(s.created_at), "d MMM yyyy")}</p>
            </div>
          }>
            <pre className="text-[12px] whitespace-pre-wrap break-words leading-relaxed">
              {typeof s.payload === "string" ? s.payload : JSON.stringify(s.payload, null, 2)}
            </pre>
          </Collapsible>
        );
      })()}

      <SectionLabel>Latest nutrition AI plan</SectionLabel>
      {d.nutritionSummaries.length === 0 ? <EmptyCard msg="No nutrition AI plan yet." /> : (() => {
        const s = d.nutritionSummaries[0];
        return (
          <Collapsible defaultOpen summary={
            <div>
              <p className="text-sm font-body font-semibold">Nutrition AI plan</p>
              <p className="text-[11px] text-muted-foreground">Updated {format(new Date(s.created_at), "d MMM yyyy")}</p>
            </div>
          }>
            <pre className="text-[12px] whitespace-pre-wrap break-words leading-relaxed">
              {typeof s.payload === "string" ? s.payload : JSON.stringify(s.payload, null, 2)}
            </pre>
          </Collapsible>
        );
      })()}

      <SectionLabel>Goals</SectionLabel>
      {d.goals.length === 0 ? <EmptyCard msg="No goals set." /> : d.goals.map(g => {
        const updates = goalsById.get(g.id) ?? [];
        return (
          <Collapsible key={g.id} summary={
            <div>
              <p className="text-sm font-body font-semibold">{String(g.title ?? "Goal")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {String(g.status ?? "active")}{g.target_text ? ` · ${String(g.target_text)}` : ""}
                {updates.length > 0 && ` · ${updates.length} update${updates.length === 1 ? "" : "s"}`}
              </p>
            </div>
          }>
            <AllFields obj={g as Record<string, unknown>} exclude={["challenge_voice_url", "target_voice_url"]} />
            {updates.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Progress timeline</p>
                <div className="space-y-2">
                  {updates.map(u => (
                    <div key={u.id} className="border-l-2 border-primary/30 pl-2.5">
                      <p className="text-[11px] text-muted-foreground">{format(new Date(u.created_at), "d MMM yyyy")}</p>
                      {u.note && <p className="text-[12px] leading-snug">{u.note}</p>}
                      <AudioButton bucket="voicenotes" path={u.voice_url} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Collapsible>
        );
      })}
    </>
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

  return (
    <>
      <SectionLabel>AI summaries · full history</SectionLabel>
      {d.bloodSummaries.length === 0 ? <EmptyCard msg="No AI summaries yet." /> : d.bloodSummaries.map(s => {
        const p = s.payload as { html?: string; summary?: string } | null;
        const body = p?.html ?? p?.summary ?? null;
        return (
          <Collapsible key={s.id} summary={
            <div>
              <p className="text-sm font-body font-semibold">Blood summary</p>
              <p className="text-[11px] text-muted-foreground">{format(new Date(s.created_at), "d MMM yyyy")}</p>
            </div>
          }>
            {body ? <div className="text-[13px] leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: body }} /> : <p className="text-xs text-muted-foreground">No content.</p>}
          </Collapsible>
        );
      })}

      <SectionLabel>Panels &amp; markers</SectionLabel>
      {d.bloodPanels.length === 0 && resultsByPanel.size === 0 ? <EmptyCard msg="No blood panels recorded." /> : (
        <>
          {d.bloodPanels.map(panel => {
            const rows = resultsByPanel.get(panel.id) ?? [];
            return (
              <Collapsible key={panel.id} defaultOpen summary={
                <div>
                  <p className="text-sm font-body font-semibold">{panel.label ?? panel.test_type ?? "Blood panel"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {panel.panel_date ? format(new Date(panel.panel_date), "d MMM yyyy") : "Undated"}
                    {panel.lab_name ? ` · ${panel.lab_name}` : ""}
                    {` · ${rows.length} marker${rows.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              }>
                {panel.notes && <p className="text-[12px] italic text-muted-foreground mb-2">{panel.notes}</p>}
                <div className="space-y-1.5">
                  {rows.length === 0 ? <p className="text-xs text-muted-foreground">No markers recorded on this panel.</p> :
                    rows.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="font-medium break-words flex-1">{r.marker}</span>
                        <span className="text-muted-foreground">{r.value ?? "—"} {r.unit ?? ""}</span>
                        <StatusChip status={r.status} />
                      </div>
                    ))
                  }
                </div>
              </Collapsible>
            );
          })}
          {resultsByPanel.get("__loose__") && (
            <Collapsible summary={
              <div>
                <p className="text-sm font-body font-semibold">Unlinked markers</p>
                <p className="text-[11px] text-muted-foreground">{(resultsByPanel.get("__loose__") ?? []).length} entries</p>
              </div>
            }>
              <div className="space-y-1.5">
                {(resultsByPanel.get("__loose__") ?? []).map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-medium break-words flex-1">{r.marker}</span>
                    <span className="text-muted-foreground">{r.value ?? "—"} {r.unit ?? ""}</span>
                    <StatusChip status={r.status} />
                  </div>
                ))}
              </div>
            </Collapsible>
          )}
        </>
      )}
    </>
  );
};

const ColourSection = ({ d }: { d: PassportDataset }) => {
  const style = d.style ?? {};
  const history = Array.isArray(style.colour_history) ? style.colour_history as Array<Record<string, unknown>> : [];
  const chem = Array.isArray(style.chemical_history) ? style.chemical_history as string[] : [];
  return (
    <>
      <SectionLabel>Current colour &amp; style</SectionLabel>
      <SurfaceCard>
        <div className="space-y-1.5">
          <Row label="Status" value={oneOf(style.current_colour_status)} />
          <Row label="Current style" value={oneOf(style.current_hairstyle)} />
          <Row label="Colour type" value={oneOf(style.colour_type)} />
          <Row label="Product" value={oneOf(style.colour_product)} />
          <Row label="Last treated" value={oneOf(style.colour_last_treated)} />
          <Row label="Reaction?" value={oneOf(style.colour_reaction)} />
          {style.colour_reaction_details ? <Row label="Reaction details" value={String(style.colour_reaction_details)} /> : null}
          <AudioButton bucket="voicenotes" path={style.colour_reaction_audio_path as string | null} />
        </div>
      </SurfaceCard>

      <SectionLabel>Chemical history</SectionLabel>
      {chem.length === 0 ? <EmptyCard msg="No chemical treatments recorded." /> : (
        <SurfaceCard><p className="text-[13px]">{chem.join(", ")}</p></SurfaceCard>
      )}

      <SectionLabel>Colour history</SectionLabel>
      {history.length === 0 ? <EmptyCard msg="No colour history entries." /> : history.map((c, i) => (
        <Collapsible key={i} summary={
          <div>
            <p className="text-sm font-body font-semibold">{oneOf(c.type) ?? "Colour entry"}</p>
            <p className="text-[11px] text-muted-foreground">{oneOf(c.timeframe) ?? "—"}{c.product ? ` · ${String(c.product)}` : ""}</p>
          </div>
        }>
          <AllFields obj={c} />
        </Collapsible>
      ))}
    </>
  );
};

const PaginatedList = <T,>({ items, render, empty }: { items: T[]; render: (t: T) => React.ReactNode; empty: string }) => {
  const [n, setN] = useState(PAGE);
  if (items.length === 0) return <EmptyCard msg={empty} />;
  return (
    <>
      {items.slice(0, n).map(render)}
      <LoadMore shown={Math.min(n, items.length)} total={items.length} onMore={() => setN(x => x + PAGE)} />
    </>
  );
};

const WashSection = ({ d }: { d: PassportDataset }) => (
  <PaginatedList
    items={d.washDays}
    empty="No wash days logged."
    render={(w) => {
      const steps = Array.isArray(w.steps) ? w.steps as Array<Record<string, unknown>> : [];
      return (
        <Collapsible key={w.id} summary={
          <div>
            <p className="text-sm font-body font-semibold">{format(new Date(w.wash_date), "EEE d MMM yyyy")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {w.scalp_feel ? `Scalp: ${String(w.scalp_feel)}` : ""}{w.breakage ? ` · Breakage: ${String(w.breakage)}` : ""}{w.duration_min ? ` · ${String(w.duration_min)}m` : ""}
            </p>
          </div>
        }>
          <AllFields obj={w as Record<string, unknown>} exclude={["steps", "product_ids", "heat_treatment", "styling", "hair_feel_voice_url", "wash_date"]} />
          {steps.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Steps</p>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="border-l-2 border-primary/30 pl-2.5">
                    <p className="text-[12px] font-medium">{String(s.name ?? s.step ?? `Step ${i + 1}`)}</p>
                    <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">{JSON.stringify(s, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AudioButton bucket="voicenotes" path={w.hair_feel_voice_url as string | null} />
        </Collapsible>
      );
    }}
  />
);

const JournalSection = ({ d }: { d: PassportDataset }) => (
  <PaginatedList
    items={d.journal}
    empty="No journal entries."
    render={(j) => (
      <Collapsible key={j.id} summary={
        <div>
          <p className="text-sm font-body font-semibold">{j.title ?? "Style entry"}</p>
          <p className="text-[11px] text-muted-foreground">{format(new Date(j.entry_date), "d MMM yyyy")}{j.mood ? ` · ${j.mood}` : ""}</p>
        </div>
      }>
        {j.note && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{j.note}</p>}
        {Array.isArray(j.products_used) && j.products_used.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">Products: {j.products_used.join(", ")}</p>
        )}
        {Array.isArray(j.photo_paths) && j.photo_paths.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {j.photo_paths.map((p, i) => <SignedImage key={i} bucket="journal-photos" path={p} className="aspect-square" />)}
          </div>
        )}
      </Collapsible>
    )}
  />
);

const ShelfSection = ({ d }: { d: PassportDataset }) => {
  const photosByKey = useMemo(() => {
    const m = new Map<string, string>();
    d.productPhotos.forEach(p => { if (p.product_key && p.storage_path) m.set(p.product_key, p.storage_path); });
    return m;
  }, [d.productPhotos]);
  const notesByKey = useMemo(() => {
    const m = new Map<string, typeof d.productVoicenotes>();
    d.productVoicenotes.forEach(v => {
      if (!v.product_key) return;
      const arr = m.get(v.product_key) ?? [];
      arr.push(v);
      m.set(v.product_key, arr);
    });
    return m;
  }, [d.productVoicenotes]);

  return (
    <PaginatedList
      items={d.shelf}
      empty="No products recorded."
      render={(p) => {
        const key = (p as Record<string, unknown>).product_key as string | undefined;
        const photo = key ? photosByKey.get(key) : null;
        const voicenotes = key ? notesByKey.get(key) ?? [] : [];
        const status = p.on_favourite ? "Favourite" : p.on_shelf ? "On shelf" : p.on_wishlist ? "Wishlist" : "Off shelf";
        return (
          <Collapsible key={p.id} summary={
            <div className="flex items-center gap-3">
              <SignedImage bucket="product-photos" path={photo ?? null} className="size-12 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-body font-semibold truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {String(p.brand ?? "—")}{p.category ? ` · ${String(p.category)}` : ""}
                </p>
                <p className="text-[10px] uppercase tracking-[0.1em] text-primary mt-0.5">
                  {status}{p.rating != null ? ` · ★ ${String(p.rating)}` : ""}
                </p>
              </div>
            </div>
          }>
            <AllFields obj={p as Record<string, unknown>} exclude={["off_shelf_voice_url", "image_url", "storage_path", "key_ingredients", "ingredients"]} />
            {voicenotes.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Voice notes</p>
                {voicenotes.map(v => (
                  <div key={v.id} className="border-l-2 border-primary/30 pl-2.5 mb-2">
                    <p className="text-[11px] text-muted-foreground">{format(new Date(v.created_at), "d MMM yyyy")}</p>
                    <AudioButton bucket="voicenotes" path={v.audio_url} transcriptFallback={v.transcript} />
                  </div>
                ))}
              </div>
            )}
            <AudioButton bucket="voicenotes" path={(p as Record<string, unknown>).off_shelf_voice_url as string | null} />
          </Collapsible>
        );
      }}
    />
  );
};

const AppointmentsSection = ({ d }: { d: PassportDataset }) => {
  const photosById = useMemo(() => {
    const m = new Map<string, typeof d.appointmentPhotos>();
    d.appointmentPhotos.forEach(p => {
      const arr = m.get(p.appointment_id) ?? [];
      arr.push(p);
      m.set(p.appointment_id, arr);
    });
    return m;
  }, [d.appointmentPhotos]);

  return (
    <PaginatedList
      items={d.appointments}
      empty="No appointments logged."
      render={(a) => {
        const photos = photosById.get(a.id) ?? [];
        return (
          <Collapsible key={a.id} summary={
            <div>
              <p className="text-sm font-body font-semibold">{String(a.professional_name ?? a.professional_type ?? "Appointment")}</p>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(a.appointment_date), "d MMM yyyy")}
                {a.appointment_time ? `, ${String(a.appointment_time)}` : ""}
                {a.clinic_name ? ` · ${String(a.clinic_name)}` : ""}
              </p>
            </div>
          }>
            <AllFields obj={a as Record<string, unknown>} exclude={["outcome_audio_path", "appointment_date"]} />
            <AudioButton bucket="voicenotes" path={a.outcome_audio_path as string | null} />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map(p => (
                  <div key={p.id}>
                    <SignedImage bucket="appointment-photos" path={p.storage_path} className="aspect-square" />
                    {p.caption && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{p.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </Collapsible>
        );
      }}
    />
  );
};

const MedicationsSection = ({ d }: { d: PassportDataset }) => (
  <PaginatedList
    items={d.medications}
    empty="No medications recorded."
    render={(m) => (
      <SurfaceCard key={m.id}>
        <p className="text-sm font-body font-semibold">{m.name ?? "Medication"}</p>
        <p className="text-[11px] text-muted-foreground">
          {m.category ?? "—"} · added {format(new Date(m.created_at), "d MMM yyyy")}
        </p>
      </SurfaceCard>
    )}
  />
);

const ToolsSection = ({ d }: { d: PassportDataset }) => (
  <PaginatedList
    items={d.tools}
    empty="No tools recorded."
    render={(t) => (
      <Collapsible key={t.id} summary={
        <div className="flex items-center gap-3">
          <SignedImage bucket="product-photos" path={(t.storage_path as string) ?? null} className="size-12 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-body font-semibold truncate">{t.name ?? "Tool"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{String(t.brand ?? "—")}{t.category ? ` · ${String(t.category)}` : ""}</p>
          </div>
        </div>
      }>
        <AllFields obj={t as Record<string, unknown>} exclude={["image_url", "storage_path", "ai_analysis"]} />
      </Collapsible>
    )}
  />
);

const PhotosSection = ({ d }: { d: PassportDataset }) => (
  <>
    <SectionLabel>Milestone photos</SectionLabel>
    {d.milestonePhotos.length === 0 ? <EmptyCard msg="No milestone photos." /> : (
      <div className="grid grid-cols-2 gap-2">
        {d.milestonePhotos.map(p => (
          <div key={p.id}>
            <SignedImage bucket="milestone-photos" path={p.storage_path} className="aspect-square" />
            <p className="text-[10px] text-muted-foreground mt-1">{p.taken_on ? format(new Date(p.taken_on), "d MMM yyyy") : "—"}{p.caption ? ` · ${p.caption}` : ""}</p>
          </div>
        ))}
      </div>
    )}

    <SectionLabel>Before photos</SectionLabel>
    {d.beforePhotos.length === 0 ? <EmptyCard msg="No before photos." /> : (
      <div className="grid grid-cols-2 gap-2">
        {d.beforePhotos.map(p => (
          <div key={p.id}>
            <SignedImage bucket="before-photos" path={p.storage_path} className="aspect-square" />
            <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(p.created_at), "d MMM yyyy")}{p.caption ? ` · ${p.caption}` : ""}</p>
          </div>
        ))}
      </div>
    )}
  </>
);

const NutritionSection = ({ d }: { d: PassportDataset }) => (
  <PaginatedList
    items={d.savedMeals}
    empty="No saved meals."
    render={(m) => (
      <Collapsible key={m.id} summary={
        <div>
          <p className="text-sm font-body font-semibold">{String(m.emoji ?? "🍲")} {m.name ?? "Meal"}</p>
          <p className="text-[11px] text-muted-foreground">{String(m.cuisine ?? "—")}{m.time_minutes ? ` · ${String(m.time_minutes)}m` : ""}</p>
        </div>
      }>
        <AllFields obj={m as Record<string, unknown>} exclude={["emoji"]} />
      </Collapsible>
    )}
  />
);

const MoodboardsSection = ({ d }: { d: PassportDataset }) => {
  const byBoard = useMemo(() => {
    const m = new Map<string, typeof d.moodboardImages>();
    d.moodboardImages.forEach(img => {
      const arr = m.get(img.board_id) ?? [];
      arr.push(img);
      m.set(img.board_id, arr);
    });
    return m;
  }, [d.moodboardImages]);

  if (d.moodboards.length === 0) return <EmptyCard msg="No moodboards." />;
  return (
    <>
      {d.moodboards.map(b => {
        const imgs = byBoard.get(b.id) ?? [];
        return (
          <Collapsible key={b.id} defaultOpen={imgs.length > 0} summary={
            <div>
              <p className="text-sm font-body font-semibold">{b.emoji ?? "🎨"} {b.name ?? "Moodboard"}</p>
              <p className="text-[11px] text-muted-foreground">{imgs.length} image{imgs.length === 1 ? "" : "s"}{b.is_favourites ? " · Favourites" : ""}</p>
            </div>
          }>
            {imgs.length === 0 ? <p className="text-xs text-muted-foreground">Empty board.</p> : (
              <div className="grid grid-cols-3 gap-2">
                {imgs.map(i => (
                  <div key={i.id}>
                    <SignedImage bucket="moodboard-images" path={i.storage_path} className="aspect-square" />
                    {i.caption && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{i.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </Collapsible>
        );
      })}
    </>
  );
};

const IngredientsSection = ({ d }: { d: PassportDataset }) => {
  const avoid = d.ingredientLists.filter(l => l.list_kind === "avoid");
  const favourite = d.ingredientLists.filter(l => l.list_kind === "favourite");
  const other = d.ingredientLists.filter(l => l.list_kind !== "avoid" && l.list_kind !== "favourite");
  const Section = ({ title, list }: { title: string; list: typeof d.ingredientLists }) => (
    <>
      <SectionLabel>{title}</SectionLabel>
      {list.length === 0 ? <EmptyCard msg="Nothing here." /> : (
        <SurfaceCard>
          <div className="space-y-1.5">
            {list.map(i => (
              <div key={i.id} className="text-[12px] flex justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words">{i.ingredient}</p>
                  {i.reason && <p className="text-[11px] text-muted-foreground leading-snug">{i.reason}</p>}
                </div>
                {i.product_count != null && <span className="text-[11px] text-muted-foreground">{i.product_count} prod</span>}
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}
    </>
  );
  return (
    <>
      <Section title="Avoid list" list={avoid} />
      <Section title="Favourites" list={favourite} />
      {other.length > 0 && <Section title="Other" list={other} />}
    </>
  );
};

// ================= Main =================

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
        <div className="size-10 rounded-full bg-alert-dark/15 text-alert-dark flex items-center justify-center shrink-0">
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

const PassportView = ({ userId, mode, backTo, active, subLoading, showAccessEnded, accessEndedAction }: PassportViewProps) => {
  const [section, setSection] = useState<Section>("overview");
  const { data, loading, accessEnded } = usePassportData(userId, active);

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

  const firstName = data.clientName.split(" ")[0];
  const counts = [
    `${data.washDays.length} wash${data.washDays.length === 1 ? "" : "es"}`,
    `${data.journal.length} journal`,
    `${data.shelf.length} products`,
    `${data.appointments.length} appts`,
  ].join(" · ");

  return (
    <ScreenLayout>
      <TitleBar title={firstName} onBack={accessEndedAction} />

      <div className="px-5 pb-3 space-y-3">
        <SurfaceCard tone="gold">
          <div className="flex items-start gap-3">
            <div className={cn("size-9 rounded-full flex items-center justify-center shrink-0",
              mode === "admin" ? "bg-primary/15 text-primary" : "bg-good/15 text-good")}>
              {mode === "admin" ? <Shield className="size-4" /> : <ShieldCheck className="size-4" />}
            </div>
            <div className="flex-1">
              <p className="text-xs font-body font-semibold uppercase tracking-[0.15em] text-primary">
                {mode === "admin" ? "Admin view" : "Access granted"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {mode === "admin"
                  ? "Read-only passport access as a STRAND admin. Every section you open is logged and visible to the member."
                  : "Access granted by the client. They can revoke at any time. Every section you open is logged and visible to them."}
              </p>
            </div>
          </div>
        </SurfaceCard>

        <div>
          <p className="text-sm font-body font-semibold">{data.clientName}</p>
          <p className="text-[11px] text-muted-foreground">
            {data.memberSince ? `Member since ${format(new Date(data.memberSince), "MMM yyyy")} · ` : ""}{counts}
          </p>
        </div>
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
        {section === "overview" && <OverviewSection d={data} />}
        {section === "blood" && <BloodSection d={data} />}
        {section === "colour" && <ColourSection d={data} />}
        {section === "wash" && <WashSection d={data} />}
        {section === "journal" && <JournalSection d={data} />}
        {section === "shelf" && <ShelfSection d={data} />}
        {section === "appointments" && <AppointmentsSection d={data} />}
        {section === "medications" && <MedicationsSection d={data} />}
        {section === "tools" && <ToolsSection d={data} />}
        {section === "photos" && <PhotosSection d={data} />}
        {section === "nutrition" && <NutritionSection d={data} />}
        {section === "moodboards" && <MoodboardsSection d={data} />}
        {section === "ingredients" && <IngredientsSection d={data} />}
      </div>
    </ScreenLayout>
  );
};

export default PassportView;
