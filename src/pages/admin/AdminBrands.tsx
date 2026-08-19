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
import { useSetBrandBloodVerification } from "@/hooks/useBloodTestBrands";
import { Droplet, Pill, Eye, EyeOff, Ban, Undo2, Trash2, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  blood_claimed: boolean;
  blood_verified: boolean;
  supplements_claimed: boolean;
  supplements_verified: boolean;
  hidden: boolean;
  access_restricted: boolean;
}

const AdminBrands = () => {
  const nav = useNavigate();
  
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [restrictTarget, setRestrictTarget] = useState<BrandRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "brands"],
    staleTime: 30_000,
    queryFn: async (): Promise<BrandRow[]> => {
      const [brandsRes, subsRes, profilesRes, offersRes] = await Promise.all([
        supabase.from("brand_profiles").select("*").order("brand_name"),
        supabase.from("brand_subscriptions").select("brand_user_id, status, current_period_end"),
        supabase.from("profiles").select("user_id, complimentary_access, access_restricted"),
        supabase.from("brand_offers").select("id, brand_user_id, status, submitted_at, ends_on"),
      ]);
      const subs = new Map<string, { status: string; current_period_end: string | null }>();
      (subsRes.data ?? []).forEach((r) => subs.set(r.brand_user_id, r));
      const comps = new Map<string, boolean>();
      const restricted = new Map<string, boolean>();
      (profilesRes.data ?? []).forEach((r) => {
        comps.set(r.user_id, !!r.complimentary_access);
        restricted.set(r.user_id, !!(r as { access_restricted?: boolean }).access_restricted);
      });
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
          blood_claimed:
            (b as { offers_at_home_blood_tests_claimed?: boolean }).offers_at_home_blood_tests_claimed === true,
          blood_verified:
            (b as { offers_at_home_blood_tests_verified?: boolean }).offers_at_home_blood_tests_verified === true,
          supplements_claimed:
            (b as { sells_supplements_claimed?: boolean }).sells_supplements_claimed === true,
          supplements_verified:
            (b as { sells_supplements_verified?: boolean }).sells_supplements_verified === true,
          hidden: (b as { hidden_from_directory?: boolean }).hidden_from_directory === true,
          access_restricted: restricted.get(b.user_id) ?? false,
        };
      });
    },
  });

  const start = useStartAdminSupportThread();
  const setBloodVerified = useSetBrandBloodVerification();
  const qc = useQueryClient();
  const setSupplementsVerified = useMutation({
    mutationFn: async ({ brandUserId, verified }: { brandUserId: string; verified: boolean }) => {
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("brand_profiles")
        .update({
          sells_supplements_verified: verified,
          supplements_verified_at: verified ? new Date().toISOString() : null,
          supplements_verified_by: verified ? me.user?.id ?? null : null,
        } as never)
        .eq("user_id", brandUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["brand-profile"] });
    },
  });

  /** Hide a brand's listing from members. Enforced in the database too — while
   *  hidden, no member can read the brand_profiles row, so the brand disappears
   *  from the directory, brand pages and verified vendor lists. */
  const setHidden = useMutation({
    mutationFn: async ({ brandUserId, hidden }: { brandUserId: string; hidden: boolean }) => {
      const { error } = await supabase
        .from("brand_profiles")
        .update({ hidden_from_directory: hidden } as never)
        .eq("user_id", brandUserId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["consumer", "brands-directory"] });
      qc.invalidateQueries({ queryKey: ["brand-profile"] });
      toast.success(v.hidden ? "Brand hidden from members" : "Brand visible to members again");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update visibility"),
  });

  const restrict = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke("admin-restrict-user", { body: { user_id: userId } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      toast.success("Access restricted and any subscription cancelled.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not restrict"),
  });

  const unrestrict = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_unrestrict_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      toast.success("Access restored. They can resubscribe themselves.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not unrestrict"),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: userId } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
      qc.invalidateQueries({ queryKey: ["consumer", "brands-directory"] });
      toast.success("Brand account deleted. All their data has been removed.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete account"),
  });

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
      const id = await start.mutateAsync({ subjectUserId: userId, subjectRole: "brand" });
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
                      "text-[9px] uppercase tracking-[0.06em] whitespace-nowrap px-2 py-0.5 rounded-full font-body font-medium shrink-0",
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

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.hidden && (
                    <span className="text-[9px] uppercase tracking-[0.06em] whitespace-nowrap px-2 py-0.5 rounded-full font-body font-medium bg-muted text-muted-foreground">
                      Hidden from members
                    </span>
                  )}
                  {r.access_restricted && (
                    <span className="text-[9px] uppercase tracking-[0.06em] whitespace-nowrap px-2 py-0.5 rounded-full font-body font-medium bg-destructive/15 text-destructive">
                      Restricted
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-body text-foreground/70">
                  <span>{r.offers_total} campaign{r.offers_total === 1 ? "" : "s"}</span>
                  <span>{r.offers_live} live</span>
                  <span>{r.offers_past} past</span>
                  {r.last_offer_at && <span>Last submitted {formatDistanceToNow(new Date(r.last_offer_at), { addSuffix: true })}</span>}
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-body">
                    Category
                  </p>
                  <p className="mt-1 text-sm font-body">
                    {r.category ?? <span className="text-muted-foreground italic">Not set by brand yet</span>}
                  </p>
                </div>

                {(r.blood_claimed || r.blood_verified) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-body">
                      At-home blood tests
                    </p>
                    <p className="text-[11.5px] font-body text-foreground/80 leading-snug">
                      {r.blood_verified
                        ? "Verified — this brand's panels can appear in the retest flow."
                        : "Claimed. Confirm this brand genuinely sells an at-home blood testing kit before verifying."}
                    </p>
                    <Button
                      variant={r.blood_verified ? "outline" : "gold"}
                      size="sm"
                      className="h-9 rounded-pill text-[12px]"
                      disabled={setBloodVerified.isPending}
                      onClick={() =>
                        setBloodVerified.mutate(
                          { brandUserId: r.user_id, verified: !r.blood_verified },
                          {
                            onSuccess: () =>
                              toast.success(
                                r.blood_verified ? "Verification removed" : "Blood tests verified",
                              ),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Could not update"),
                          },
                        )
                      }
                    >
                      <Droplet className="size-3.5 mr-1.5" />
                      {r.blood_verified ? "Remove verification" : "Verify blood tests"}
                    </Button>
                  </div>
                )}

                {(r.supplements_claimed || r.supplements_verified) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-body">
                      Supplements
                    </p>
                    <p className="text-[11.5px] font-body text-foreground/80 leading-snug">
                      {r.supplements_verified
                        ? "Verified — this brand is confirmed as selling supplements."
                        : "Claimed. Confirm this brand genuinely sells supplements before verifying."}
                    </p>
                    <Button
                      variant={r.supplements_verified ? "outline" : "gold"}
                      size="sm"
                      className="h-9 rounded-pill text-[12px]"
                      disabled={setSupplementsVerified.isPending}
                      onClick={() =>
                        setSupplementsVerified.mutate(
                          { brandUserId: r.user_id, verified: !r.supplements_verified },
                          {
                            onSuccess: () =>
                              toast.success(
                                r.supplements_verified ? "Verification removed" : "Supplements verified",
                              ),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Could not update"),
                          },
                        )
                      }
                    >
                      <Pill className="size-3.5 mr-1.5" />
                      {r.supplements_verified ? "Remove verification" : "Verify supplements"}
                    </Button>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-body">
                    Visibility &amp; access
                  </p>
                  <p className="text-[11.5px] font-body text-foreground/70 leading-snug">
                    {r.hidden
                      ? "Hidden — members cannot see this brand anywhere in the app."
                      : "Visible to members in the brands directory."}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full min-w-0 h-9 px-2 rounded-pill text-[11.5px]"
                      disabled={setHidden.isPending}
                      onClick={() => setHidden.mutate({ brandUserId: r.user_id, hidden: !r.hidden })}
                    >
                      {r.hidden ? <Eye className="size-3.5 mr-1.5 shrink-0" /> : <EyeOff className="size-3.5 mr-1.5 shrink-0" />}
                      <span className="truncate">{r.hidden ? "Show to members" : "Hide from members"}</span>
                    </Button>
                    {r.access_restricted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0 h-9 px-2 rounded-pill text-[11.5px]"
                        disabled={unrestrict.isPending}
                        onClick={() => unrestrict.mutate(r.user_id)}
                      >
                        <Undo2 className="size-3.5 mr-1.5 shrink-0" /> <span className="truncate">Unrestrict</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0 h-9 px-2 rounded-pill text-[11.5px] text-destructive border-destructive/40 hover:bg-destructive/10"
                        disabled={restrict.isPending}
                        onClick={() => setRestrictTarget(r)}
                      >
                        <Ban className="size-3.5 mr-1.5 shrink-0" /> <span className="truncate">Restrict access</span>
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-9 rounded-pill text-[12px] text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setDeleteConfirm("");
                      setDeleteTarget(r);
                    }}
                  >
                    <Trash2 className="size-3.5 mr-1.5" /> Delete account
                  </Button>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 rounded-pill text-[12px]"
                    onClick={() => nav(`/admin/brands/${r.user_id}/edit`)}
                  >
                    <Pencil className="size-3.5 mr-1.5" /> Edit profile
                  </Button>
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

      <AlertDialog open={!!restrictTarget} onOpenChange={(o) => !o && setRestrictTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restrict access?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This blocks <span className="font-semibold">{restrictTarget?.brand_name ?? "this brand"}</span> from
                  using the app. They'll only see the "Access restricted" screen.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-foreground/75">
                  <li>Their brand subscription is cancelled.</li>
                  <li>Unrestricting later restores access, but does not resubscribe anything.</li>
                  <li>Use "Hide from members" if you only want their listing taken down.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (restrictTarget) {
                  restrict.mutate(restrictTarget.user_id);
                  setRestrictTarget(null);
                }
              }}
            >
              Restrict
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this brand account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This permanently deletes <span className="font-semibold">{deleteTarget?.brand_name ?? "this brand"}</span>{" "}
                  and everything they own — profile, products, campaigns and subscription. This cannot be undone.
                </p>
                <p>
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm:
                </p>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConfirm !== "DELETE" || deleteUser.isPending}
              onClick={(e) => {
                if (deleteConfirm !== "DELETE") {
                  e.preventDefault();
                  return;
                }
                if (deleteTarget) {
                  deleteUser.mutate(deleteTarget.user_id);
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default AdminBrands;
