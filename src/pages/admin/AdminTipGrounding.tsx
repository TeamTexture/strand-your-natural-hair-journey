// ADMIN — manuscript grounding audit.
//
// Every generated tip stores the evidence set it was written from, its coverage
// classification (explicit / extension / supplement), the governing manuscript
// principle where one applies, and any claims that came from established
// science rather than the book.
//
// The author's safeguard: a high SUPPLEMENT rate means retrieval is failing, not
// that the book is incomplete. Anything above SUPPLEMENT_THRESHOLD on a surface
// is flagged here as a retrieval problem.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { smartBack } from "@/lib/smartBack";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

/** The author's threshold: above this share of supplement on a surface, flag it. */
const SUPPLEMENT_THRESHOLD = 15;

type Coverage = "explicit" | "extension" | "supplement";

interface EvidenceItem {
  chapter: number | null;
  chapter_title: string | null;
  page_start: number | null;
  page_end: number | null;
  passage: string;
  relevance: string;
  source?: string | null;
  constrained_by?: string | null;
}

interface ExternalClaim {
  claim: string;
  basis?: string;
  principle?: string;
}

/** POLICY B — the source class recorded for every claim in a sponsored tip. */
interface ClaimSource {
  text: string;
  source: "manuscript" | "industry" | "product_fact";
  basis?: string;
}

/** POLICY B — where industry consensus diverged from the author's position. */
interface ConflictRow {
  id: string;
  ingredient: string;
  topic: string | null;
  manuscript_position: string;
  manuscript_quote: string | null;
  chapter: number | null;
  page_start: number | null;
  industry_position: string;
  industry_source: string | null;
  surface: string | null;
  occurrences: number;
  last_seen_at: string;
}

interface EvidenceRow {
  id: string;
  surface: string;
  function_name: string;
  chapters: number[] | null;
  evidence: EvidenceItem[] | null;
  tip: unknown;
  verified: boolean;
  coverage: Coverage;
  coverage_reason: string | null;
  governing_principle: string | null;
  external_claims: ExternalClaim[] | null;
  policy: "A" | "B" | null;
  claim_sources: ClaimSource[] | null;
  created_at: string;
}


interface DistRow {
  surface: string;
  total: number;
  explicit_count: number;
  extension_count: number;
  supplement_count: number;
  supplement_pct: number;
  flagged: boolean;
}

interface RejectionRow {
  id: string;
  surface: string | null;
  function_name: string;
  stage: string;
  rule: string;
  detail: string | null;
  offending_text: string | null;
  created_at: string;
}

const COVERAGE_LABEL: Record<Coverage, string> = {
  explicit: "Explicit",
  extension: "Extension",
  supplement: "Supplement",
};

const COVERAGE_CLS: Record<Coverage, string> = {
  explicit: "bg-good/15 text-good",
  extension: "bg-warn/15 text-warn",
  supplement: "bg-alert-dark/15 text-alert-dark",
};

const humanSurface = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const tipText = (tip: unknown): string => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (v.trim().length > 2 && !v.startsWith("http")) out.push(v.trim());
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(tip);
  return out.join("\n");
};

const AdminTipGrounding = () => {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dist, setDist] = useState<DistRow[]>([]);
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [rejections, setRejections] = useState<RejectionRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  // "industry" is a POLICY B filter, not a coverage mode: it narrows to
  // sponsored generations that used established science, which are the ones
  // needing the author's review.
  const [filter, setFilter] = useState<"all" | Coverage | "industry">("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("tip_evidence_sets")
        .select(
          "id, surface, function_name, chapters, evidence, tip, verified, coverage, coverage_reason, governing_principle, external_claims, policy, claim_sources, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (filter === "industry") q = q.eq("policy", "B");
      else if (filter !== "all") q = q.eq("coverage", filter);
      const [d, e, r, c] = await Promise.all([
        supabase.rpc("admin_tip_coverage_distribution", { _days: 30 }),
        q,
        supabase
          .from("tip_generation_rejections")
          .select("id, surface, function_name, stage, rule, detail, offending_text, created_at")
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("industry_manuscript_conflicts")
          .select(
            "id, ingredient, topic, manuscript_position, manuscript_quote, chapter, page_start, industry_position, industry_source, surface, occurrences, last_seen_at",
          )
          .eq("status", "open")
          .order("last_seen_at", { ascending: false })
          .limit(25),
      ]);
      if (cancelled) return;
      setDist((d.data ?? []) as DistRow[]);
      const evidenceRows = (e.data ?? []) as unknown as EvidenceRow[];
      setRows(
        filter === "industry"
          ? evidenceRows.filter((row) =>
              (row.claim_sources ?? []).some((cs) => cs.source === "industry"),
            )
          : evidenceRows,
      );
      setRejections((r.data ?? []) as RejectionRow[]);
      setConflicts((c.data ?? []) as unknown as ConflictRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);


  const totals = useMemo(() => {
    const t = dist.reduce(
      (a, d) => ({
        total: a.total + Number(d.total),
        explicit: a.explicit + Number(d.explicit_count),
        extension: a.extension + Number(d.extension_count),
        supplement: a.supplement + Number(d.supplement_count),
      }),
      { total: 0, explicit: 0, extension: 0, supplement: 0 },
    );
    const pct = (n: number) => (t.total ? Math.round((1000 * n) / t.total) / 10 : 0);
    return { ...t, pctSupplement: pct(t.supplement), pct };
  }, [dist]);

  return (
    <ScreenLayout>
      <TitleBar title="Grounding audit" onBack={smartBack(nav, "/admin")} />

      {loading ? (
        <LoadingDot label="Loading grounding audit…" fullScreen={false} />
      ) : (
        <div className="space-y-6 pb-10">
          <SurfaceCard className="space-y-3">
            <SectionLabel>Coverage — last 30 days</SectionLabel>
            <p className="text-sm text-muted-foreground">
              {totals.total} generations · {totals.pct(totals.explicit)}% explicit ·{" "}
              {totals.pct(totals.extension)}% extension · {totals.pctSupplement}% supplement
            </p>
            <p className="text-xs text-muted-foreground">
              Supplement means the book did not cover the subject and established science was
              used under one of your principles. Above {SUPPLEMENT_THRESHOLD}% on a surface is
              treated as a retrieval problem, not a gap in the book.
            </p>
          </SurfaceCard>

          <div className="space-y-3">
            <SectionLabel>By surface</SectionLabel>
            {dist.length === 0 ? (
              <EmptyState message="No generations recorded yet" />
            ) : (
              dist.map((d) => (
                <SurfaceCard key={d.surface} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-base">{humanSurface(d.surface)}</p>
                    <span className="text-xs text-muted-foreground">{d.total} generations</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-pill bg-muted">
                    <div
                      className="bg-good"
                      style={{ width: `${(100 * Number(d.explicit_count)) / Math.max(Number(d.total), 1)}%` }}
                    />
                    <div
                      className="bg-warn"
                      style={{ width: `${(100 * Number(d.extension_count)) / Math.max(Number(d.total), 1)}%` }}
                    />
                    <div
                      className="bg-alert-dark"
                      style={{ width: `${(100 * Number(d.supplement_count)) / Math.max(Number(d.total), 1)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.explicit_count} explicit · {d.extension_count} extension ·{" "}
                    {d.supplement_count} supplement ({d.supplement_pct}%)
                  </p>
                  {d.flagged && (
                    <p className="rounded-2xl bg-alert-dark/10 p-3 text-xs text-alert-dark">
                      Supplement is above {SUPPLEMENT_THRESHOLD}% here. Check retrieval for this
                      surface before accepting the output — the chapters mapped to it may be wrong.
                    </p>
                  )}
                </SurfaceCard>
              ))
            )}
          </div>

          <div className="space-y-3">
            <SectionLabel>Recent generations</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {(["all", "explicit", "extension", "supplement", "industry"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="rounded-pill"
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? "All"
                    : f === "industry"
                      ? "Industry claims"
                      : COVERAGE_LABEL[f]}
                </Button>
              ))}
            </div>
            {filter === "industry" && (
              <p className="text-xs text-muted-foreground">
                Sponsored product copy that used established cosmetic science for an ingredient
                the book does not cover. These are the claims to review.
              </p>
            )}


            {rows.length === 0 ? (
              <EmptyState message="Nothing to review" />
            ) : (
              rows.map((row) => {
                const isOpen = open === row.id;
                const manuscript = (row.evidence ?? []).filter((i) => i.source !== "external");
                const external = (row.evidence ?? []).filter((i) => i.source === "external");
                return (
                  <SurfaceCard key={row.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-base">{humanSurface(row.surface)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                          {row.chapters?.length ? ` · chapters ${row.chapters.join(", ")}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-pill px-3 py-1 text-xs",
                          COVERAGE_CLS[row.coverage] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {COVERAGE_LABEL[row.coverage] ?? row.coverage}
                      </span>
                    </div>

                    {row.coverage_reason && (
                      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {row.coverage_reason}
                      </p>
                    )}
                    {row.governing_principle && (
                      <p className="rounded-2xl bg-muted/50 p-3 text-sm [overflow-wrap:anywhere]">
                        <span className="font-medium">Governing principle: </span>
                        {row.governing_principle}
                      </p>
                    )}

                    <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">
                      {tipText(row.tip).slice(0, isOpen ? 4000 : 220) ||
                        "No copy stored for this generation."}
                    </p>

                    <button
                      type="button"
                      className="text-xs underline underline-offset-2"
                      onClick={() => setOpen(isOpen ? null : row.id)}
                    >
                      {isOpen ? "Hide evidence" : `Evidence (${manuscript.length}${external.length ? ` + ${external.length} external` : ""})`}
                    </button>

                    {isOpen && (
                      <div className="space-y-3">
                        {manuscript.map((it, i) => (
                          <div key={`m${i}`} className="rounded-2xl bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              {it.chapter ? `Chapter ${it.chapter}` : "Manuscript"}
                              {it.chapter_title ? ` — ${it.chapter_title}` : ""}
                              {it.page_start ? `, p.${it.page_start}` : ""}
                            </p>
                            <p className="mt-1 text-sm [overflow-wrap:anywhere]">{it.passage}</p>
                            {it.relevance && (
                              <p className="mt-1 text-xs text-muted-foreground">{it.relevance}</p>
                            )}
                          </div>
                        ))}
                        {external.map((it, i) => (
                          <div
                            key={`x${i}`}
                            className="rounded-2xl border border-alert-dark/30 bg-alert-dark/5 p-3"
                          >
                            <p className="text-xs text-alert-dark">External — established science</p>
                            <p className="mt-1 text-sm [overflow-wrap:anywhere]">{it.passage}</p>
                            {it.relevance && (
                              <p className="mt-1 text-xs text-muted-foreground">{it.relevance}</p>
                            )}
                            {it.constrained_by && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Constrained by: {it.constrained_by}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <SectionLabel>Rejection log</SectionLabel>
            {rejections.length === 0 ? (
              <EmptyState message="Nothing rejected recently" />
            ) : (
              rejections.map((r) => (
                <SurfaceCard key={r.id} className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {humanSurface(r.surface ?? r.function_name)} ·{" "}
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} · {r.rule}
                  </p>
                  {r.offending_text && (
                    <p className="text-sm [overflow-wrap:anywhere]">“{r.offending_text}”</p>
                  )}
                  {r.detail && (
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {r.detail}
                    </p>
                  )}
                </SurfaceCard>
              ))
            )}
          </div>
        </div>
      )}
    </ScreenLayout>
  );
};

export default AdminTipGrounding;
