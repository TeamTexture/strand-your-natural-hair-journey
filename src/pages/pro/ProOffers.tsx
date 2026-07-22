import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Offer = Database["public"]["Tables"]["pro_offers"]["Row"];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const emptyDraft = () => ({
  title: "",
  description: "",
  code: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
});

const ProOffers = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<null | ReturnType<typeof emptyDraft>>(null);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["pro_offers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pro_offers")
        .select("*")
        .eq("pro_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Offer[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user || !draft) return;
      if (!draft.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("pro_offers").insert({
        pro_user_id: user.id,
        title: draft.title.trim(),
        description: draft.description || null,
        code: draft.code || null,
        starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
        ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
        is_active: draft.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offer created");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["pro_offers", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("pro_offers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pro_offers", user?.id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pro_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offer removed");
      qc.invalidateQueries({ queryKey: ["pro_offers", user?.id] });
    },
  });

  if (isLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Offers" onBack={smartBack(nav, "/pro")} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-xs text-foreground/70 font-body">
          One-off promotions on your public profile. No permanent platform-wide discounts.
        </p>

        {draft ? (
          <SurfaceCard>
            <div className="space-y-3">
              <Field label="Title">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Description">
                <Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <Field label="Code (optional)">
                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="STRAND10" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <Input type="date" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
                </Field>
                <Field label="Ends">
                  <Input type="date" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm font-body">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                Active
              </label>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Save offer"}
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </div>
          </SurfaceCard>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4 mr-1" /> New offer
          </Button>
        )}

        {offers.length === 0 && !draft && <EmptyState message="No offers yet" />}

        {offers.map((o) => (
          <SurfaceCard key={o.id}>
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-base leading-tight">{o.title}</p>
                  {o.code && (
                    <p className="text-[11px] uppercase tracking-[0.14em] text-primary mt-0.5">Code · {o.code}</p>
                  )}
                </div>
                <button
                  onClick={() => remove.mutate(o.id)}
                  className="p-1 text-muted-foreground hover:text-alert-dark"
                  aria-label="Remove offer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {o.description && (
                <p className="text-[13px] text-foreground/80 font-body leading-snug">{o.description}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">
                  {o.starts_at ? new Date(o.starts_at).toLocaleDateString() : "Any time"}
                  {" – "}
                  {o.ends_at ? new Date(o.ends_at).toLocaleDateString() : "no end"}
                </span>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={o.is_active}
                    onCheckedChange={(v) => toggle.mutate({ id: o.id, is_active: v })}
                  />
                  {o.is_active ? "Active" : "Paused"}
                </label>
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </ScreenLayout>
  );
};

export default ProOffers;
