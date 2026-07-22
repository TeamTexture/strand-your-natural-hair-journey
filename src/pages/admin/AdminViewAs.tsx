// Admin: "View as user" picker.
// Lists every account (consumers + pros + brands + admins) with a search
// filter, so the admin can pick anyone and drop into their app view.
// Activating view-as swaps the id used by consumer read-hooks in `useAuth`
// so every screen loads that user's data.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Eye, User as UserIcon, LogIn } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/hooks/useViewAs";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Row {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
}

const roleChip = (role: string) => {
  const map: Record<string, string> = {
    admin: "bg-foreground text-primary",
    professional: "bg-primary/20 text-primary",
    brand: "bg-warn/20 text-warn",
    consumer: "bg-muted text-muted-foreground",
  };
  return map[role] ?? "bg-muted text-muted-foreground";
};

const AdminViewAs = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { actualUser, isViewingAs } = useAuth();
  const { startViewAs, stopViewAs, viewAsDisplayName, viewAsUserId } = useViewAs();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "view-as", "roster"],
    staleTime: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const [profilesRes, emailsRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name")
          .order("display_name", { ascending: true }),
        supabase.rpc("admin_list_member_emails"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const emails = new Map<string, string>();
      for (const r of (emailsRes.data ?? []) as { user_id: string; email: string }[]) {
        emails.set(r.user_id, r.email);
      }
      const roles = new Map<string, string[]>();
      for (const r of (rolesRes.data ?? []) as { user_id: string; role: string }[]) {
        const arr = roles.get(r.user_id) ?? [];
        arr.push(r.role);
        roles.set(r.user_id, arr);
      }
      return ((profilesRes.data ?? []) as { user_id: string; display_name: string | null }[]).map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        email: emails.get(p.user_id) ?? null,
        roles: roles.get(p.user_id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      (r.display_name ?? "").toLowerCase().includes(term) ||
      (r.email ?? "").toLowerCase().includes(term),
    );
  }, [q, rows]);

  const enter = (row: Row) => {
    if (!actualUser) return;
    if (row.user_id === actualUser.id) {
      // Viewing "as yourself" is a no-op — just stop any active view-as.
      stopViewAs();
      qc.clear();
      nav("/home");
      return;
    }
    startViewAs(row.user_id, row.display_name ?? row.email ?? "user");
    // Blow away cached queries scoped to previous user id so nothing bleeds.
    qc.clear();
    nav("/home");
  };

  return (
    <ScreenLayout>
      <TitleBar title="View as user" onBack={smartBack(nav, "/admin")} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-[12px] font-body text-muted-foreground leading-snug">
          Enter any user's app as if signed in as them. Reads only — writes to
          their data are blocked by row-level security. Exit anytime from the
          banner at the top of the screen.
        </p>

        {isViewingAs && viewAsUserId && (
          <SurfaceCard className="py-3 flex items-center gap-3 border-foreground/40 bg-foreground text-primary">
            <Eye className="size-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.12em] font-body opacity-80">Currently viewing as</p>
              <p className="font-display text-[15px] leading-tight truncate">
                {viewAsDisplayName ?? "user"}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                stopViewAs();
                qc.clear();
              }}
            >
              Exit
            </Button>
          </SurfaceCard>
        )}

        <div className="relative">
          <Search className="size-4 absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <LoadingDot label="Loading users…" fullScreen={false} />
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-center text-[12px] font-body text-muted-foreground py-6">
                No matches
              </p>
            )}
            {filtered.map((row) => {
              const isSelf = row.user_id === actualUser?.id;
              const isCurrent = viewAsUserId === row.user_id;
              return (
                <SurfaceCard key={row.user_id} className="py-3 flex items-center gap-3">
                  <span className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserIcon className="size-4 text-primary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] leading-tight truncate">
                      {row.display_name ?? "Unnamed"}
                      {isSelf && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-body">
                          you
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-body truncate">
                      {row.email ?? "—"}
                    </p>
                    {row.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.roles.map((r) => (
                          <span
                            key={r}
                            className={cn(
                              "px-1.5 py-[1px] rounded-full text-[9px] uppercase tracking-[0.1em] font-body font-semibold",
                              roleChip(r),
                            )}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={isCurrent ? "secondary" : "gold"}
                    size="sm"
                    onClick={() => enter(row)}
                    disabled={isSelf && !isViewingAs}
                  >
                    <LogIn className="size-3.5 mr-1" />
                    {isCurrent ? "Re-enter" : isSelf ? "You" : "View as"}
                  </Button>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminViewAs;
