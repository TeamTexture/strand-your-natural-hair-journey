import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { safeBack } from "@/lib/smartBack";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";

interface Row {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  country: string;
  ip_detected_country: string | null;
  blocked_at: string | null;
  created_at: string;
  klaviyo_synced_at: string | null;
  klaviyo_error: string | null;
}

const friendlyDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const useInternationalAccounts = () =>
  useQuery({
    queryKey: ["admin", "international"],
    staleTime: 30_000,
    queryFn: () =>
      fetchAllRows<Row>((from, to) =>
        supabase
          .from("country_waitlist")
          .select(
            "id, user_id, name, email, country, ip_detected_country, blocked_at, created_at, klaviyo_synced_at, klaviyo_error",
          )
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
  });

/**
 * International / Blocked accounts — registrations from outside the UK. These
 * accounts are deliberately kept out of normal member lists, counts and search.
 */
const AdminInternational = () => {
  const navigate = useNavigate();
  const { data, isLoading, error } = useInternationalAccounts();
  const rows = data ?? [];
  const byCountry = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.country] = (acc[r.country] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <ScreenLayout>
      <TitleBar title="International" onBack={safeBack(navigate, "/admin")} />

      <div className="px-5 pb-10 space-y-5">
        <SurfaceCard className="p-4">
          <div className="flex items-start gap-3">
            <Globe className="size-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Accounts that registered from outside the UK. They're blocked from onboarding
              and the app, kept on the international waitlist, and excluded from member
              lists and counts.
            </p>
          </div>
        </SurfaceCard>

        {isLoading ? (
          <LoadingDot fullScreen={false} label="Loading accounts" />
        ) : error ? (
          <SurfaceCard className="p-4">
            <p className="text-sm text-foreground/80">
              Couldn't load the international list. Please try again.
            </p>
          </SurfaceCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SurfaceCard className="p-4">
                <p className="font-display text-2xl text-foreground">{rows.length}</p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mt-1">
                  Blocked accounts
                </p>
              </SurfaceCard>
              <SurfaceCard className="p-4">
                <p className="font-display text-2xl text-foreground">
                  {Object.keys(byCountry).length}
                </p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mt-1">
                  Countries
                </p>
              </SurfaceCard>
            </div>

            <SectionLabel>Waitlist</SectionLabel>
            {rows.length === 0 ? (
              <SurfaceCard className="p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  No international registrations yet.
                </p>
              </SurfaceCard>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <SurfaceCard key={r.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-base text-foreground leading-tight">
                        {r.name || "Unnamed"}
                      </p>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-primary shrink-0">
                        {r.country}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{r.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Blocked {friendlyDate(r.blocked_at ?? r.created_at)}
                      {r.klaviyo_synced_at
                        ? " · added to the international mailing list"
                        : r.klaviyo_error
                          ? " · mailing list sync failed"
                          : ""}
                    </p>
                  </SurfaceCard>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminInternational;
