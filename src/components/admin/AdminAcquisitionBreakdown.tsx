import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Instagram,
  Music2,
  Facebook,
  Youtube,
  Podcast,
  Sparkles,
  Search,
  Smartphone,
  Newspaper,
  Users,
  MoreHorizontal,
  CircleHelp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { cn } from "@/lib/utils";

/**
 * Admin "How did you find STRAND?" breakdown — acquisition_source from the
 * onboarding attribution question, bucketed per source with a proportional
 * bar, filterable by signup window. Consumer accounts only (pros, brands and
 * admins never see the question and would just inflate "Not answered").
 */

const SOURCES: { value: string; label: string; icon: typeof Instagram }[] = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "tiktok", label: "TikTok", icon: Music2 },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "podcast", label: "Podcast", icon: Podcast },
  { value: "influencer", label: "Influencer / creator", icon: Sparkles },
  { value: "search", label: "Google / web search", icon: Search },
  { value: "app_store", label: "App Store / Google Play", icon: Smartphone },
  { value: "press", label: "Press / article", icon: Newspaper },
  { value: "friend_family", label: "Friend or family", icon: Users },
  { value: "other", label: "Other", icon: MoreHorizontal },
];

type RangeKey = "all" | "7d" | "30d" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

interface Row {
  user_id: string;
  acquisition_source: string | null;
  acquisition_asked_at: string | null;
  created_at: string;
}

const startOfDay = (iso: string) => new Date(`${iso}T00:00:00`);
const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999`);

const AdminAcquisitionBreakdown = () => {
  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "acquisition-breakdown"],
    staleTime: 60_000,
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        fetchAllRows<Row>((from, to) =>
          supabase
            .from("profiles")
            .select("user_id, acquisition_source, acquisition_asked_at, created_at")
            .range(from, to),
        ),
        fetchAllRows<{ user_id: string; role: string }>((from, to) =>
          supabase.from("user_roles").select("user_id, role").range(from, to),
        ),
      ]);
      const privileged = new Set(
        roles.filter((r) => r.role !== "consumer").map((r) => r.user_id),
      );
      return profiles.filter((p) => !privileged.has(p.user_id));
    },
  });

  const { rows, total } = useMemo(() => {
    const all = data ?? [];
    let from: Date | null = null;
    let to: Date | null = null;
    const now = new Date();
    if (range === "7d") from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (range === "custom") {
      if (customFrom) from = startOfDay(customFrom);
      if (customTo) to = endOfDay(customTo);
    }
    const windowed = all.filter((p) => {
      // The attribution timestamp is the moment she reached the question; fall
      // back to account creation for rows that pre-date the question.
      const when = new Date(p.acquisition_asked_at ?? p.created_at);
      if (from && when < from) return false;
      if (to && when > to) return false;
      return true;
    });

    const counts = new Map<string, number>();
    let unanswered = 0;
    windowed.forEach((p) => {
      if (p.acquisition_source) {
        counts.set(p.acquisition_source, (counts.get(p.acquisition_source) ?? 0) + 1);
      } else {
        unanswered += 1;
      }
    });

    const list = SOURCES.map((s) => ({ ...s, count: counts.get(s.value) ?? 0 }));
    // Any legacy value not in the current option set still shows, under Other.
    const known = new Set(SOURCES.map((s) => s.value));
    let legacy = 0;
    counts.forEach((n, key) => {
      if (!known.has(key)) legacy += n;
    });
    const other = list.find((s) => s.value === "other");
    if (other) other.count += legacy;

    list.push({
      value: "__none",
      label: "Not answered / skipped",
      icon: CircleHelp,
      count: unanswered,
    });
    list.sort((a, b) => b.count - a.count);
    return { rows: list, total: windowed.length };
  }, [data, range, customFrom, customTo]);

  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={cn(
              "px-2.5 h-7 rounded-full text-[11px] font-body font-medium border transition-colors",
              range === opt.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40",
            )}
          >
            {opt.label}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-1.5 w-full mt-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 flex-1 min-w-0 rounded-md border border-border bg-card px-2 text-[12px] font-body text-foreground"
              aria-label="From date"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 flex-1 min-w-0 rounded-md border border-border bg-card px-2 text-[12px] font-body text-foreground"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      <SurfaceCard className="py-3">
        {isLoading ? (
          <LoadingDot label="Loading sources…" fullScreen={false} />
        ) : total === 0 ? (
          <p className="text-[12px] font-body text-muted-foreground">
            No member signups in this window yet.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = total > 0 ? (r.count / total) * 100 : 0;
              const Icon = r.icon;
              return (
                <div key={r.value}>
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        r.value === "__none" ? "text-muted-foreground/60" : "text-primary",
                      )}
                    />
                    <span className="flex-1 min-w-0 text-[12px] font-body text-foreground break-words">
                      {r.label}
                    </span>
                    <span className="text-[12px] font-body font-semibold text-foreground tabular-nums shrink-0">
                      {r.count}
                    </span>
                    <span className="text-[11px] font-body text-muted-foreground tabular-nums w-[38px] text-right shrink-0">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        r.value === "__none" ? "bg-muted-foreground/40" : "bg-primary",
                      )}
                      style={{ width: `${(r.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[10.5px] font-body text-muted-foreground pt-1">
              {total} member signup{total === 1 ? "" : "s"} in this window · bars are relative to
              the biggest source
            </p>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};

export default AdminAcquisitionBreakdown;
