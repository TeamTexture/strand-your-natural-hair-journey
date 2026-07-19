// Blood test history — lists every previously-saved blood panel newest-first,
// with a delta view comparing the latest panel to the previous one so the user
// can see which markers moved and in which direction.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight, Minus, Plus, FlaskConical } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearBloodDraft } from "@/hooks/useBloodValues";
import { BLOOD_RANGES } from "@/data/bloodRanges";

interface PanelRow {
  id: string;
  panel_date: string | null;
  label: string | null;
}
interface ResultRow {
  marker: string;
  value: number | null;
  unit: string | null;
  status: string | null;
  panel_id: string | null;
}

const formatDate = (iso: string | null) => {
  if (!iso) return "Undated test";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const BloodHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["blood-history", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: panels } = await supabase
        .from("blood_panels" as never)
        .select("id, panel_date, label")
        .eq("user_id", user!.id)
        .order("panel_date", { ascending: false })
        .order("created_at", { ascending: false });
      const panelRows = (panels ?? []) as unknown as PanelRow[];
      if (panelRows.length === 0) return { panels: [], results: [] as ResultRow[] };
      const { data: results } = await supabase
        .from("blood_results")
        .select("marker, value, unit, status, panel_id")
        .eq("user_id", user!.id)
        .in("panel_id" as never, panelRows.map((p) => p.id) as never);
      return { panels: panelRows, results: (results ?? []) as unknown as ResultRow[] };
    },
  });

  const panels = data?.panels ?? [];
  const results = data?.results ?? [];

  const rowsByPanel = useMemo(() => {
    const m = new Map<string, ResultRow[]>();
    for (const r of results) {
      const key = String(r.panel_id ?? "");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [results]);

  const latest = panels[0];
  const previous = panels[1];

  const deltas = useMemo(() => {
    if (!latest || !previous) return [];
    const cur = rowsByPanel.get(latest.id) ?? [];
    const prev = rowsByPanel.get(previous.id) ?? [];
    const prevByMarker = new Map(prev.map((r) => [r.marker, r]));
    return cur
      .map((r) => {
        const p = prevByMarker.get(r.marker);
        if (!p || p.value == null || r.value == null) return null;
        const diff = Number(r.value) - Number(p.value);
        return {
          marker: r.marker,
          unit: r.unit ?? BLOOD_RANGES[r.marker]?.unit ?? "",
          previous: Number(p.value),
          current: Number(r.value),
          diff,
          prevStatus: p.status,
          curStatus: r.status,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [latest, previous, rowsByPanel]);

  const startNew = () => {
    clearBloodDraft();
    navigate("/onboarding/blood-timing");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Blood test history" />
      <div className="px-5 pt-2 pb-10 space-y-4">
        <p className="text-sm text-foreground/80 font-body leading-relaxed">
          Every blood test you log is kept, so STRAND can spot how your markers move over
          time and adjust its guidance to the direction of travel.
        </p>

        <Button variant="gold" size="pill" onClick={startNew} className="w-full">
          <Plus className="size-4" />
          Log a new blood test
        </Button>

        {isLoading ? (
          <SurfaceCard>
            <p className="text-sm font-body text-muted-foreground">Loading your history…</p>
          </SurfaceCard>
        ) : panels.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm font-body">
              You haven't logged a blood test yet. Tap <em>Log a new blood test</em> to add
              your first one.
            </p>
          </SurfaceCard>
        ) : (
          <>
            {deltas.length > 0 && (
              <>
                <SectionLabel>Movement since your last test</SectionLabel>
                <SurfaceCard padded={false}>
                  <ul className="divide-y divide-border/60">
                    {deltas.map((d) => {
                      const up = d.diff > 0;
                      const flat = d.diff === 0;
                      const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
                      const tone = flat
                        ? "text-muted-foreground"
                        : d.curStatus === "normal" && d.prevStatus !== "normal"
                          ? "text-good"
                          : d.curStatus && d.curStatus !== "normal" && d.prevStatus === "normal"
                            ? "text-warn"
                            : "text-foreground/80";
                      return (
                        <li key={d.marker} className="flex items-center gap-3 px-4 py-3">
                          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <FlaskConical className="size-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-medium truncate">{d.marker}</p>
                            <p className="text-xs text-muted-foreground font-body">
                              {d.previous} → {d.current} {d.unit}
                            </p>
                          </div>
                          <span className={`flex items-center gap-1 text-xs font-body ${tone}`}>
                            <Icon className="size-4" />
                            {flat ? "no change" : `${up ? "+" : ""}${d.diff.toFixed(1)}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </SurfaceCard>
              </>
            )}

            <SectionLabel>All tests</SectionLabel>
            <div className="space-y-2">
              {panels.map((p, idx) => {
                const rows = rowsByPanel.get(p.id) ?? [];
                const flagged = rows.filter((r) => r.status === "low" || r.status === "high").length;
                return (
                  <div
                    key={p.id}
                    className="bg-card border border-border rounded-[14px] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-body font-semibold">
                          {formatDate(p.panel_date)}
                          {idx === 0 && (
                            <span className="ml-2 text-[10px] tracking-[0.2em] uppercase text-primary">
                              Latest
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground font-body mt-0.5">
                          {p.label ?? "Blood test"} · {rows.length} markers
                          {flagged > 0 ? ` · ${flagged} flagged` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BloodHistory;
