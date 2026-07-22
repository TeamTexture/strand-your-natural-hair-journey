import { smartBack } from "@/lib/smartBack";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo } from "react";
import { Search, MessageSquarePlus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useStartAdminSupportThread } from "@/hooks/useChat";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BRAND_CATEGORIES } from "@/lib/brandCategories";

interface BrandRow {
  id: string;
  user_id: string;
  brand_name: string;
  contact_name: string | null;
  contact_email: string | null;
  website: string | null;
  category: string | null;
  about: string | null;
  logo_path: string | null;
  created_at: string;
  offers_total: number;
  offers_live: number;
  offers_past: number;
  last_offer_at: string | null;
  sub_active: boolean;
  complimentary: boolean;
}

const AdminBrands = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "brands"],
    staleTime: 30_000,
    queryFn: async (): Promise<BrandRow[]> => {
      const [brandsRes, subsRes, profilesRes, offersRes] = await Promise.all([
        supabase.from("brand_profiles").select("*").order("brand_name"),
        supabase.from("brand_subscriptions").select("brand_user_id, status, current_period_end"),
        supabase.from("profiles").select("user_id, complimentary_access"),
        supabase.from("brand_offers").select("id, brand_user_id, status, submitted_at, ends_on"),
      ]);
      const subs = new Map<string, { status: string; current_period_end: string | null }>();
      (subsRes.data ?? []).forEach((r) => subs.set(r.brand_user_id, r));
      const comps = new Map<string, boolean>();
      (profilesRes.data ?? []).forEach((r) => comps.set(r.user_id, !!r.complimentary_access));
      const offersBy = new Map<string, Array<{ status: string; submitted_at: string | null; ends_on: string | null }>>();
      (offersRes.data ?? []).forEach((o) => {
        const arr = offersBy.get(o.brand_user_id) ?? [];
        arr.push(o);
        offersBy.set(o.brand_user_id, arr);
      });
      return (brandsRes.data ?? []).map((b): BrandRow => {
        const sub = subs.get(b.user_id);
        const active = sub ? ["active", "trialing"].includes(sub.status) && (!sub.current_period_end || new Date(sub.current_period_end) > new Date()) : false;
        const offers = offersBy.get(b.user_id) ?? [];
        const live = offers.filter((o) => o.status === "live" || o.status === "paid_scheduled").length;
        const past = offers.filter((o) => ["ended", "cancelled", "rejected"].includes(o.status)).length;
        const lastAt = offers
          .map((o) => o.submitted_at)
          .filter((v): v is string => !!v)
          .sort()
          .slice(-1)[0] ?? null;
        return {
          id: b.id,
          user_id: b.user_id,
          brand_name: b.brand_name ?? "Untitled",
          contact_name: b.contact_name ?? null,
          contact_email: (b as { contact_email?: string | null }).contact_email ?? null,
          website: b.website ?? null,
          category: (b as { category?: string | null }).category ?? null,
          about: (b as { about?: string | null }).about ?? null,
          logo_path: b.logo_path ?? null,
          created_at: b.created_at,
          offers_total: offers.length,
          offers_live: live,
          offers_past: past,
          last_offer_at: lastAt,
          sub_active: active,
          complimentary: comps.get(b.user_id) ?? false,
        };
      });
    },
  });

  const start = useStartAdminSupportThread();

  // Category is owned and edited by the brand from their own profile —
  // admins see it read-only. The category filter above stays for browsing.

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat && (r.category ?? "") !== cat) return false;
      if (!term) return true;
      return (
        r.brand_name.toLowerCase().includes(term) ||
        (r.contact_name ?? "").toLowerCase().includes(term) ||
        (r.contact_email ?? "").toLowerCase().includes(term) ||
        (r.website ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, cat]);

  const message = async (userId: string) => {
    try {
      const id = await start.mutateAsync(userId);
      nav(`/messages/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open chat");
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Brands" onBack={smartBack(nav, "/admin")} />
      <div className="px-5 pb-8 space-y-3">
        <div className="relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setCat(null)}
            className={cn(
              "text-[10.5px] uppercase tracking-[0.14em] px-2.5 py-1 rounded-full font-body",
              cat === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            All · {rows.length}
          </button>
          {BRAND_CATEGORIES.map((c) => {
            const n = rows.filter((r) => (r.category ?? "") === c).length;
            if (n === 0 && cat !== c) return null;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  "text-[10.5px] uppercase tracking-[0.14em] px-2.5 py-1 rounded-full font-body",
                  cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {c} · {n}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <LoadingDot />
        ) : filtered.length === 0 ? (
          <EmptyState icon="✦" message="No brands match" tone="card" />
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <SurfaceCard key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight truncate">{r.brand_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.category ?? "Uncategorised"}
                      {r.contact_name ? ` · ${r.contact_name}` : ""}
                    </p>
                    {r.contact_email && (
                      <p className="text-[10.5px] text-muted-foreground truncate">{r.contact_email}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full font-body font-medium shrink-0",
                      r.complimentary
                        ? "bg-primary/15 text-primary"
                        : r.sub_active
                          ? "bg-good/15 text-good"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.complimentary ? "Complimentary" : r.sub_active ? "Active" : "No sub"}
                  </span>
                </div>

                <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-body text-foreground/70">
                  <span>{r.offers_total} campaign{r.offers_total === 1 ? "" : "s"}</span>
                  <span>{r.offers_live} live</span>
                  <span>{r.offers_past} past</span>
                  {r.last_offer_at && <span>Last submitted {formatDistanceToNow(new Date(r.last_offer_at), { addSuffix: true })}</span>}
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-body">
                    Category
                  </label>
                  <select
                    value={r.category ?? ""}
                    onChange={(e) => setCategory.mutate({ user_id: r.user_id, category: e.target.value })}
                    className="mt-1 w-full text-sm p-2 rounded-[10px] border border-border bg-card"
                  >
                    <option value="">(uncategorised)</option>
                    {BRAND_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-9 rounded-pill text-[12px]" onClick={() => message(r.user_id)}>
                    <MessageSquarePlus className="size-3.5 mr-1.5" /> Message
                  </Button>
                  {r.website && (
                    <Button variant="ghost" size="sm" className="flex-1 h-9 rounded-pill text-[12px]" asChild>
                      <a href={r.website} target="_blank" rel="noopener noreferrer">Website</a>
                    </Button>
                  )}
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBrands;
