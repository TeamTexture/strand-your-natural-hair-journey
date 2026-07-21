import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface ViewRow {
  id: string;
  pro_user_id: string;
  consumer_id: string;
  section: string | null;
  viewed_at: string;
}

interface EnquiryRow {
  id: string;
  consumer_id: string;
  pro_user_id: string;
  status: string;
  created_at: string;
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-warn/15 text-warn",
  accepted: "bg-good/15 text-good",
  declined: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

const AdminAudit = () => {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [v, e] = await Promise.all([
        supabase.from("pro_passport_views").select("*").order("viewed_at", { ascending: false }).limit(50),
        supabase.from("pro_enquiries").select("id, consumer_id, pro_user_id, status, created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      const vRows = (v.data ?? []) as ViewRow[];
      const eRows = (e.data ?? []) as EnquiryRow[];
      setViews(vRows);
      setEnquiries(eRows);

      const ids = Array.from(new Set([
        ...vRows.flatMap((r) => [r.pro_user_id, r.consumer_id]),
        ...eRows.flatMap((r) => [r.pro_user_id, r.consumer_id]),
      ]));
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", ids);
        if (!cancelled && profiles) {
          const map: Record<string, string> = {};
          for (const p of profiles) map[p.user_id] = p.display_name;
          setNames(map);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const name = (id: string) => names[id] ?? id.slice(0, 8);

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Audit" onBack={() => nav("/admin/applications")} />
        <LoadingDot label="Loading audit…" fullScreen={false} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Audit" onBack={() => nav("/admin/applications")} />

      <div className="px-5 pb-8 space-y-3">
        <SectionLabel>Recent passport views</SectionLabel>
        {views.length === 0 ? (
          <EmptyState icon="👁️" message="No passport views yet" hint={undefined} />
        ) : (
          views.map((v) => (
            <SurfaceCard key={v.id}>
              <p className="text-sm font-body">
                <span className="font-semibold">{name(v.pro_user_id)}</span>
                <span className="text-muted-foreground"> viewed </span>
                <span className="font-semibold">{name(v.consumer_id)}</span>
                {v.section && <span className="text-muted-foreground"> · {v.section}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true })}
              </p>
            </SurfaceCard>
          ))
        )}

        <SectionLabel>Recent enquiries</SectionLabel>
        {enquiries.length === 0 ? (
          <EmptyState icon="✉️" message="No enquiries yet" hint={undefined} />
        ) : (
          enquiries.map((e) => (
            <SurfaceCard key={e.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body">
                    <span className="font-semibold">{name(e.consumer_id)}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-semibold">{name(e.pro_user_id)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </p>
                </div>
                <span className={cn(
                  "text-[10px] font-medium px-2 py-1 rounded-full uppercase",
                  STATUS_CLS[e.status] ?? "bg-muted text-muted-foreground",
                )}>
                  {e.status}
                </span>
              </div>
            </SurfaceCard>
          ))
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminAudit;
