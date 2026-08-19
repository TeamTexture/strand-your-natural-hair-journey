import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, MousePointerClick, Mail, CalendarCheck, Percent } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { smartBack } from "@/lib/smartBack";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tier = "full" | "listed_enquiry" | "external_link";

const TIER_LABEL: Record<Tier, string> = {
  full: "Tier A — Full subscriber",
  listed_enquiry: "Tier B — Listed + enquiry",
  external_link: "Tier C — Referral partner",
};

const TIER_CLS: Record<Tier, string> = {
  full: "bg-good/15 text-good",
  listed_enquiry: "bg-primary/15 text-primary",
  external_link: "bg-warn/20 text-warn",
};

interface ProRow {
  key: string;
  name: string;
  source: "directory" | "pro_profile";
  directoryId: string | null;
  proUserId: string | null;
  tier: Tier;
  feePercent: number | null;
  clicks: number;
  enquiries: number;
  bookings: number;
  bookingValue: number;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

const AdminReferrals = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async (): Promise<ProRow[]> => {
      const [dir, pros, clicks, attrs] = await Promise.all([
        supabase
          .from("professionals_directory")
          .select("id,name,clinic_name,listing_tier,referral_fee_percent"),
        supabase
          .from("pro_profiles")
          .select("user_id,display_name,listing_tier,referral_fee_percent"),
        supabase.from("pro_referral_clicks").select("directory_id,pro_user_id"),
        supabase
          .from("pro_referral_attributions")
          .select("directory_id,pro_user_id,event_type,booking_value"),
      ]);

      const rows = new Map<string, ProRow>();
      const put = (r: ProRow) => rows.set(r.key, r);

      (dir.data ?? []).forEach((d) => {
        put({
          key: `d:${d.id}`,
          name: d.name ?? d.clinic_name ?? "Unnamed listing",
          source: "directory",
          directoryId: d.id,
          proUserId: null,
          tier: (d.listing_tier as Tier) ?? "external_link",
          feePercent: d.referral_fee_percent != null ? Number(d.referral_fee_percent) : null,
          clicks: 0,
          enquiries: 0,
          bookings: 0,
          bookingValue: 0,
        });
      });
      (pros.data ?? []).forEach((p) => {
        put({
          key: `p:${p.user_id}`,
          name: p.display_name ?? "Unnamed professional",
          source: "pro_profile",
          directoryId: null,
          proUserId: p.user_id,
          tier: (p.listing_tier as Tier) ?? "full",
          feePercent: p.referral_fee_percent != null ? Number(p.referral_fee_percent) : null,
          clicks: 0,
          enquiries: 0,
          bookings: 0,
          bookingValue: 0,
        });
      });

      const bump = (
        directoryId: string | null,
        proUserId: string | null,
        fn: (row: ProRow) => void,
      ) => {
        const row =
          (proUserId && rows.get(`p:${proUserId}`)) ||
          (directoryId && rows.get(`d:${directoryId}`)) ||
          null;
        if (row) fn(row);
      };

      (clicks.data ?? []).forEach((c) =>
        bump(c.directory_id, c.pro_user_id, (r) => {
          r.clicks += 1;
        }),
      );
      (attrs.data ?? []).forEach((a) =>
        bump(a.directory_id, a.pro_user_id, (r) => {
          if (a.event_type === "booking") {
            r.bookings += 1;
            r.bookingValue += Number(a.booking_value ?? 0) || 0;
          } else {
            r.enquiries += 1;
          }
        }),
      );

      return [...rows.values()].sort(
        (a, b) =>
          b.clicks + b.enquiries + b.bookings - (a.clicks + a.enquiries + a.bookings) ||
          a.name.localeCompare(b.name),
      );
    },
  });

  const saveFee = useMutation({
    mutationFn: async ({ row, percent }: { row: ProRow; percent: number | null }) => {
      const { error } =
        row.source === "directory"
          ? await supabase
              .from("professionals_directory")
              .update({ referral_fee_percent: percent })
              .eq("id", row.directoryId!)
          : await supabase
              .from("pro_profiles")
              .update({ referral_fee_percent: percent })
              .eq("user_id", row.proUserId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Referral fee updated");
      void qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
    onError: () => toast.error("Could not update referral fee"),
  });

  const saveTier = useMutation({
    mutationFn: async ({ row, tier }: { row: ProRow; tier: Tier }) => {
      const { error } =
        row.source === "directory"
          ? await supabase
              .from("professionals_directory")
              .update({ listing_tier: tier })
              .eq("id", row.directoryId!)
          : await supabase
              .from("pro_profiles")
              .update({ listing_tier: tier })
              .eq("user_id", row.proUserId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Listing tier updated");
      void qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
    onError: () => toast.error("Could not update listing tier"),
  });

  const logBooking = useMutation({
    mutationFn: async ({ row, value }: { row: ProRow; value: number }) => {
      const owed = row.feePercent != null ? (value * row.feePercent) / 100 : null;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pro_referral_attributions").insert({
        consumer_id: auth.user!.id,
        directory_id: row.directoryId ?? undefined,
        pro_user_id: row.proUserId ?? undefined,
        event_type: "booking",
        booking_value: value,
        amount_owed: owed,
        notes: "Manually recorded by admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking recorded");
      void qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
    onError: () => toast.error("Could not record booking"),
  });

  const totals = useMemo(() => {
    const rows = data ?? [];
    return {
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      enquiries: rows.reduce((s, r) => s + r.enquiries, 0),
      bookings: rows.reduce((s, r) => s + r.bookings, 0),
      owed: rows.reduce(
        (s, r) => s + (r.feePercent != null ? (r.bookingValue * r.feePercent) / 100 : 0),
        0,
      ),
    };
  }, [data]);

  return (
    <ScreenLayout>
      <TitleBar title="Referrals" onBack={() => smartBack(navigate, "/admin")} />

      <div className="px-5 pb-10 space-y-4">
        <SurfaceCard tone="gold">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Clicks", value: totals.clicks },
              { label: "Enquiries", value: totals.enquiries },
              { label: "Bookings", value: totals.bookings },
              { label: "Owed", value: money(totals.owed) },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-display text-lg leading-none">{s.value}</p>
                <p className="text-[9px] uppercase tracking-[0.06em] whitespace-nowrap text-muted-foreground mt-1">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SectionLabel>Per professional</SectionLabel>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : (
          (data ?? []).map((r) => {
            const owed = r.feePercent != null ? (r.bookingValue * r.feePercent) / 100 : 0;
            return (
              <SurfaceCard key={r.key}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-sm leading-tight truncate">{r.name}</p>
                    <span
                      className={cn(
                        "inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.1em]",
                        TIER_CLS[r.tier],
                      )}
                    >
                      {TIER_LABEL[r.tier]}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-sm leading-none">{money(owed)}</p>
                    <p className="text-[9px] uppercase tracking-[0.06em] whitespace-nowrap text-muted-foreground mt-1">
                      Owed
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    { icon: MousePointerClick, label: "Clicks", value: r.clicks },
                    { icon: Mail, label: "Enquiries", value: r.enquiries },
                    { icon: CalendarCheck, label: "Bookings", value: r.bookings },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[10px] bg-secondary/60 py-2">
                      <s.icon className="size-3.5 mx-auto text-primary" />
                      <p className="text-sm font-medium mt-1 leading-none">{s.value}</p>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground mt-1">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-1">
                    {(["full", "listed_enquiry", "external_link"] as Tier[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => saveTier.mutate({ row: r, tier: t })}
                        className={cn(
                          "py-2 text-[10px] rounded-md font-medium transition-colors",
                          r.tier === t
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {t === "full" ? "Tier A" : t === "listed_enquiry" ? "Tier B" : "Tier C"}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        inputMode="decimal"
                        className="pl-8 h-9 text-sm"
                        placeholder="Fee %"
                        value={feeDraft[r.key] ?? (r.feePercent != null ? String(r.feePercent) : "")}
                        onChange={(e) => setFeeDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="goldGhost"
                      className="h-9"
                      onClick={() => {
                        const raw = feeDraft[r.key];
                        const val = raw === undefined || raw.trim() === "" ? null : Number(raw);
                        if (val != null && (!Number.isFinite(val) || val < 0 || val > 100)) {
                          toast.error("Fee must be between 0 and 100");
                          return;
                        }
                        saveFee.mutate({ row: r, percent: val });
                      }}
                    >
                      Save fee
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      className="h-9 text-sm flex-1"
                      placeholder="Booking value (£)"
                      value={valueDraft[r.key] ?? ""}
                      onChange={(e) => setValueDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        const val = Number(valueDraft[r.key]);
                        if (!Number.isFinite(val) || val <= 0) {
                          toast.error("Enter a booking value");
                          return;
                        }
                        logBooking.mutate({ row: r, value: val });
                        setValueDraft((d) => ({ ...d, [r.key]: "" }));
                      }}
                    >
                      Log booking
                    </Button>
                  </div>
                </div>
              </SurfaceCard>
            );
          })
        )}

        <p className="text-[10px] text-muted-foreground leading-snug">
          Amount owed is booking value × referral fee %. Booking values are entered manually —
          no payments are processed here. Last refreshed {format(new Date(), "d MMM yyyy, HH:mm")}.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default AdminReferrals;
