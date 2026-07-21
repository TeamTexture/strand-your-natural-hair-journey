import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = { key: string; value: unknown };

const PRICE_KEYS: { key: string; label: string; help: string }[] = [
  { key: "consumer_monthly_price_gbp", label: "Consumer price (£/mo)", help: "STRAND Membership monthly price." },
  { key: "pro_monthly_price_gbp", label: "Pro price (£/mo)", help: "STRAND Pro subscription monthly price." },
  { key: "stripe_consumer_price_id", label: "Stripe consumer price id", help: "Recurring GBP price for the membership." },
  { key: "stripe_pro_price_id", label: "Stripe pro price id", help: "Recurring GBP price for the pro subscription." },
];

const AdminSettings = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "platform_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", PRICE_KEYS.map((p) => p.key));
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const current = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      const v = r.value;
      m[r.key] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
    return m;
  }, [rows]);

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase
        .from("platform_settings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ key, value } as any, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["admin", "platform_settings"] });
    },
    onError: (err) => toast.error((err as Error).message ?? "Save failed."),
  });

  const onSave = (key: string) => {
    const raw = drafts[key] ?? current[key] ?? "";
    let value: unknown = raw;
    if (key.endsWith("_gbp")) {
      const n = parseFloat(raw);
      if (!isFinite(n) || n < 0) {
        toast.error("Enter a valid price.");
        return;
      }
      value = n;
    }
    save.mutate({ key, value });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Settings" onBack={() => nav("/admin")} />

      <div className="px-5 pb-8 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-foreground/60 py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          PRICE_KEYS.map((k) => (
            <SurfaceCard key={k.key}>
              <p className="text-sm font-body font-semibold">{k.label}</p>
              <p className="text-[11px] text-muted-foreground mb-2">{k.help}</p>
              <div className="flex gap-2">
                <Input
                  value={drafts[k.key] ?? current[k.key] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))}
                  placeholder={k.key.endsWith("_gbp") ? "9.99" : "price_..."}
                />
                <Button size="sm" onClick={() => onSave(k.key)} disabled={save.isPending}>
                  Save
                </Button>
              </div>
            </SurfaceCard>
          ))
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminSettings;
