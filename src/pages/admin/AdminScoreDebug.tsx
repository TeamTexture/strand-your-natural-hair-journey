// ADMIN — analysis score debug trail (internal QA, never member-facing).
//
// Answers the question that previously needed raw log access: for a given scan,
// which tiers of her data travelled, which profile fields actually reached the
// scoring prompt (and in what order — order is audited because it drove the old
// porosity bias), and how the final number was arrived at: the model's own
// quality axis, the base after the fit-first pass, the signed concern/challenge
// bonus, whether a ceiling was applied, and the final score.
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
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface DebugRow {
  id: string;
  created_at: string;
  user_id: string;
  function_name: string;
  subject: string | null;
  brand: string | null;
  health_tier_mode: string | null;
  tier_included: string[] | null;
  tier_withheld: string[] | null;
  profile_fields: Record<string, unknown> | null;
  score_breakdown: Record<string, unknown> | null;
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

const humanField = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bAreas Of Concern\b/, "Areas of concern");

const tierLabel = (raw: string) => {
  const [tier, ...rest] = raw.split(":");
  const name = humanField(rest.join(":") || tier);
  const n = tier.replace("tier", "");
  return { tier: /^\d$/.test(n) ? `Tier ${n}` : "Tier", name };
};

const scoreTone = (score: number | null) =>
  score == null
    ? "text-muted-foreground"
    : score >= 85
    ? "text-good"
    : score >= 65
    ? "text-primary"
    : score >= 50
    ? "text-warn"
    : "text-alert-dark";

export default function AdminScoreDebug() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DebugRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("analysis_score_debug")
        .select(
          "id, created_at, user_id, function_name, subject, brand, health_tier_mode, tier_included, tier_withheld, profile_fields, score_breakdown",
        )
        .order("created_at", { ascending: false })
        .limit(120);
      if (live) setRows((data ?? []) as unknown as DebugRow[]);
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Distribution across the last 120 runs — the clustering check. */
  const spread = useMemo(() => {
    const scores = (rows ?? [])
      .map((r) => num(r.score_breakdown?.final_score))
      .filter((n): n is number => n != null);
    const bands = [
      { label: "Under 50", test: (s: number) => s < 50 },
      { label: "50–64", test: (s: number) => s >= 50 && s < 65 },
      { label: "65–79", test: (s: number) => s >= 65 && s < 80 },
      { label: "80–89", test: (s: number) => s >= 80 && s < 90 },
      { label: "90 and above", test: (s: number) => s >= 90 },
    ];
    return {
      total: scores.length,
      bands: bands.map((b) => {
        const count = scores.filter(b.test).length;
        return {
          label: b.label,
          count,
          pct: scores.length ? Math.round((count / scores.length) * 100) : 0,
        };
      }),
    };
  }, [rows]);

  if (rows === null) {
    return (
      <ScreenLayout>
        <TitleBar title="Score debug" onBack={() => smartBack(navigate, "/admin")} />
        <div className="flex justify-center py-16">
          <LoadingDot />
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Score debug" onBack={() => smartBack(navigate, "/admin")} />

      <p className="px-1 pb-4 text-xs leading-relaxed text-muted-foreground">
        Internal QA only. One row per analysis run: the tiers of member data that
        travelled, the profile fields that reached the scoring prompt in the exact
        order they were sent, and how the final number was reached.
      </p>

      <SectionLabel>Score spread — last {spread.total} runs</SectionLabel>
      <SurfaceCard className="mb-6 space-y-2">
        {spread.total === 0
          ? <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          : spread.bands.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-pill bg-muted">
                <div
                  className="h-full rounded-pill bg-primary"
                  style={{ width: `${b.pct}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-body text-xs tabular-nums">
                {b.count} · {b.pct}%
              </span>
            </div>
          ))}
      </SurfaceCard>

      <SectionLabel>Runs</SectionLabel>
      {rows.length === 0
        ? <EmptyState title="Nothing recorded yet" body="Run a product analysis and it will appear here." />
        : (
          <div className="space-y-3">
            {rows.map((r) => {
              const sb = r.score_breakdown ?? {};
              const open = openId === r.id;
              const final = num(sb.final_score);
              const order = arr(r.profile_fields?.hair_profile_order);
              const recorded = new Set(arr(r.profile_fields?.hair_profile_recorded));
              const bonus = num(sb.concern_fit_bonus) ?? 0;
              return (
                <SurfaceCard key={r.id} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm font-medium break-words [overflow-wrap:anywhere]">
                        {r.subject || "Untitled product"}
                      </p>
                      {r.brand && (
                        <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                          {r.brand}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {humanField(r.function_name.replace(/-/g, " "))} ·{" "}
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <span className={cn("font-display text-xl tabular-nums", scoreTone(final))}>
                      {final ?? "—"}
                    </span>
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-border pt-3">
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          How the number was reached
                        </p>
                        <dl className="space-y-1 text-xs">
                          {[
                            ["Model quality/safety axis", num(sb.model_quality_score)],
                            ["Model's own match figure", num(sb.model_match_score)],
                            ["Base after reason alignment", num(sb.base_score)],
                            ["Concern/challenge bonus", bonus > 0 ? `+${bonus}` : bonus],
                            ["Final", final],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{label}</dt>
                              <dd className="tabular-nums">{value ?? "not set"}</dd>
                            </div>
                          ))}
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Ceiling applied</dt>
                            <dd>{sb.ceiling_applied ? "Yes" : "No"}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Centrality / breadth</dt>
                            <dd className="tabular-nums">
                              {num(sb.centrality) ?? "—"} / {num(sb.breadth) ?? "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Pluses / conflicts</dt>
                            <dd className="tabular-nums">
                              {num(sb.supportive_pluses) ?? 0} / {num(sb.conflicts) ?? 0}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Relevance note</dt>
                            <dd>{sb.relevance_note_present ? "Present" : "None"}</dd>
                          </div>
                        </dl>
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Profile fields sent, in prompt order
                        </p>
                        {order.length === 0
                          ? <p className="text-xs text-muted-foreground">None recorded.</p>
                          : (
                            <ol className="space-y-1 text-xs">
                              {order.map((key, i) => (
                                <li key={key} className="flex gap-2">
                                  <span className="w-4 shrink-0 text-muted-foreground tabular-nums">
                                    {i + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 break-words">
                                    {humanField(key)}
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0",
                                      recorded.has(key) ? "text-good" : "text-muted-foreground",
                                    )}
                                  >
                                    {recorded.has(key) ? "on file" : "empty"}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Tiers
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {arr(r.tier_included).map((t) => {
                            const { tier, name } = tierLabel(t);
                            return (
                              <span
                                key={t}
                                className="rounded-pill bg-muted px-2 py-0.5 text-[11px]"
                              >
                                {tier} · {name}
                              </span>
                            );
                          })}
                        </div>
                        {arr(r.tier_withheld).length > 0 && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Withheld (guidance only): {arr(r.tier_withheld).map(humanField).join(", ")}
                          </p>
                        )}
                        {r.health_tier_mode && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Health data: {r.health_tier_mode === "full"
                              ? "full panel included"
                              : r.health_tier_mode === "compact"
                              ? "reduced slice only"
                              : "deliberately omitted"}
                          </p>
                        )}
                      </div>

                      {[
                        ["Reason directions", arr(sb.reason_directions)],
                      ].map(([label, list]) => (
                        (list as string[]).length > 0 && (
                          <div key={String(label)}>
                            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {label as string}
                            </p>
                            <ul className="space-y-0.5 text-xs text-muted-foreground">
                              {(list as string[]).map((v, i) => (
                                <li key={i} className="break-words">{v}</li>
                              ))}
                            </ul>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </SurfaceCard>
              );
            })}
          </div>
        )}
    </ScreenLayout>
  );
}
