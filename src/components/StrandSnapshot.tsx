import { useEffect, useState } from "react";
import {
  Activity,
  CalendarClock,
  Droplet,
  Layers,
  Ruler,
  ShieldCheck,
  Stethoscope,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGoals } from "@/hooks/useGoals";
import { titleCase } from "@/lib/humanise";
import { cn } from "@/lib/utils";

/**
 * StrandSnapshot — the "at a glance" header of the Strand Summary.
 *
 * Presentation only: it re-states the profile facts the AI reasoned from
 * (goal, hair type/texture, porosity, density, length, current style and blood
 * work status) as scannable stat tiles, so the summary opens with structure
 * rather than a paragraph.
 */
interface Stat {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "gold" | "warn" | "good";
  /** Where the user originally entered this fact, so tapping the tile edits it. */
  href?: string;
}

const first = (v: unknown): string | null => {
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

const StrandSnapshot = ({ className }: { className?: string }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { goals } = useGoals();
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [hairRes, styleRes, panelsRes] = await Promise.all([
        supabase
          .from("user_hair_profile")
          .select("surface_texture, density, porosity, length_inches, length_bucket")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_style_profile")
          .select("current_hairstyle, planned_next_style")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("blood_panels")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "logged")
          .order("panel_date", { ascending: false })
          .limit(1),
      ]);

      const hair = (hairRes.data ?? {}) as Record<string, unknown>;
      const style = (styleRes.data ?? {}) as Record<string, unknown>;
      const panelId = (panelsRes.data?.[0] as { id?: string } | undefined)?.id;

      let bloodStat: Stat | null = null;
      if (panelId) {
        const { data: results } = await supabase
          .from("blood_results")
          .select("marker, status")
          .eq("user_id", user.id)
          .eq("panel_id", panelId);
        const rows = (results ?? []) as Array<{ marker: string; status: string | null }>;
        const flagged = rows.filter((r) => r.status === "low" || r.status === "high");
        if (rows.length > 0) {
          bloodStat = flagged.length
            ? {
                label: "Blood work",
                value: `${flagged.length} flagged · ${flagged
                  .slice(0, 2)
                  .map((f) => titleCase(f.marker.replace(/_/g, " ")))
                  .join(", ")}`,
                icon: Stethoscope,
                tone: "warn",
              }
            : {
                label: "Blood work",
                value: `${rows.length} markers all in range`,
                icon: Stethoscope,
                tone: "good",
              };
        }
      }

      const next: Stat[] = [];
      const goal = goals[0];
      if (goal?.title) {
        next.push({ label: "Main goal", value: goal.title, icon: Target, tone: "gold" });
      }
      const texture = first(hair.surface_texture);
      if (texture) next.push({ label: "Hair type", value: titleCase(texture), icon: Activity });
      const porosity = first(hair.porosity);
      if (porosity) next.push({ label: "Porosity", value: titleCase(porosity), icon: Droplet });
      const density = first(hair.density);
      if (density) next.push({ label: "Density", value: titleCase(density), icon: Layers });
      const inches = typeof hair.length_inches === "number" ? hair.length_inches : null;
      const lengthLabel = inches
        ? `${inches}"`
        : first(hair.length_bucket)
          ? titleCase(String(first(hair.length_bucket)))
          : null;
      if (lengthLabel) next.push({ label: "Length", value: lengthLabel, icon: Ruler });
      const currentStyle = first(style.current_hairstyle);
      if (currentStyle) {
        next.push({
          label: "Current style",
          value: titleCase(currentStyle),
          icon: ShieldCheck,
          href: "/profile/colour?edit=current_style",
        });
        const nextStyle = first(style.planned_next_style);
        next.push({
          label: "Next style",
          value: nextStyle ? titleCase(nextStyle) : "Not set yet — tap to add",
          icon: CalendarClock,
          href: "/profile/colour?edit=planned_next_style",
        });
      }
      if (bloodStat) next.push(bloodStat);

      if (!cancelled) setStats(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, goals.length]);

  if (stats.length === 0) return null;

  return (
    <ul className={cn("grid grid-cols-2 gap-2", className)}>
      {stats.map((s) => {
        const Icon = s.icon;
        const wide = s.label === "Main goal" || s.label === "Blood work";
        return (
          <li
            key={s.label}
            className={cn(
              "rounded-[12px] border p-2.5 min-w-0",
              wide && "col-span-2",
              s.tone === "warn"
                ? "border-warn/30 bg-warn/10"
                : s.tone === "good"
                  ? "border-good/30 bg-good/10"
                  : s.tone === "gold"
                    ? "border-primary/30 bg-primary/10"
                    : "border-border bg-background/60",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon className="size-3 text-primary shrink-0" aria-hidden />
              <p className="text-[8.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground font-body truncate">
                {s.label}
              </p>
            </div>
            <p className="mt-1 text-[12px] font-semibold leading-snug text-foreground break-words">
              {s.value}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

export default StrandSnapshot;
