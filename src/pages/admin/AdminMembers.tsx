import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MemberRow {
  user_id: string;
  display_name: string | null;
  complimentary_access: boolean;
  created_at: string;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

function statusBadge(row: MemberRow) {
  if (row.complimentary_access) return { label: "Complimentary", cls: "bg-primary/15 text-primary" };
  const s = row.subscription_status;
  if (s === "active" || s === "trialing") return { label: "Active", cls: "bg-good/15 text-good" };
  if (s === "past_due" || s === "unpaid") return { label: "Past due", cls: "bg-warn/20 text-warn" };
  if (s === "canceled") return { label: "Cancelled", cls: "bg-muted text-muted-foreground" };
  return { label: "No sub", cls: "bg-muted text-muted-foreground" };
}

const AdminMembers = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "members"],
    queryFn: async (): Promise<MemberRow[]> => {
      const [profilesRes, subsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, complimentary_access, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("consumer_subscriptions")
          .select("user_id, status, current_period_end, cancel_at_period_end"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      const subMap = new Map(
        (subsRes.data ?? []).map((s) => [
          s.user_id,
          {
            subscription_status: s.status,
            current_period_end: s.current_period_end,
            cancel_at_period_end: s.cancel_at_period_end,
          },
        ]),
      );
      return (profilesRes.data ?? []).map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        complimentary_access: !!(p as { complimentary_access?: boolean }).complimentary_access,
        created_at: p.created_at,
        subscription_status: subMap.get(p.user_id)?.subscription_status ?? null,
        current_period_end: subMap.get(p.user_id)?.current_period_end ?? null,
        cancel_at_period_end: subMap.get(p.user_id)?.cancel_at_period_end ?? null,
      }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ complimentary_access: value })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Could not update");
    },
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.display_name ?? "").toLowerCase().includes(t) || r.user_id.includes(t));
  }, [rows, q]);

  return (
    <ScreenLayout>
      <TitleBar title="Members" onBack={() => nav("/admin")} />

      <div className="px-5 pb-4">
        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or id…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="px-5 pb-8 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-foreground/60 py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading members…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No members match.</p>
        ) : (
          filtered.map((r) => {
            const badge = statusBadge(r);
            return (
              <SurfaceCard key={r.user_id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold truncate">
                      {r.display_name ?? "Unnamed member"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Joined {new Date(r.created_at).toLocaleDateString("en-GB")} · {r.user_id.slice(0, 8)}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full uppercase ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-[12px] font-body font-medium">Complimentary access</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Free access. Overrides Stripe status.
                    </p>
                  </div>
                  <Switch
                    checked={r.complimentary_access}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ userId: r.user_id, value: v })}
                  />
                </div>
              </SurfaceCard>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminMembers;
