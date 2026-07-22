import { smartBack } from "@/lib/smartBack";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import ProClientNotes from "@/components/pro/ProClientNotes";
import { useProClients } from "@/hooks/useProClients";

const shortDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
};

/**
 * Past-client view — for consumers who revoked access. Access to their
 * passport is severed, but the pro's private notes remain (their own work
 * product). Only name + relationship dates are shown alongside notes.
 */
const ProPastClient = () => {
  const nav = useNavigate();
  const { consumerId } = useParams<{ consumerId: string }>();
  const { data = [] } = useProClients();
  const record = useMemo(
    () => data.find((c) => c.consumer_id === consumerId),
    [data, consumerId],
  );

  if (!consumerId) return null;
  const name = (record?.display_name ?? "").trim().split(/\s+/)[0] || "Client";

  return (
    <ScreenLayout>
      <TitleBar title="Past client" onBack={smartBack(nav, "/pro/clients")} />
      <div className="px-5 pt-3 space-y-4">
        <SurfaceCard>
          <p className="font-display text-lg font-semibold leading-tight">{name}</p>
          <p className="text-[12px] text-muted-foreground font-body mt-1">
            Access from {shortDate(record?.granted_at ?? null)} to {shortDate(record?.revoked_at ?? null)}
          </p>
        </SurfaceCard>

        <SurfaceCard tone="gold">
          <div className="flex items-start gap-2.5">
            <ShieldOff className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[12px] font-body text-foreground/80 leading-snug">
              Passport access has ended. Your private notes below remain — they're
              your own work product and never leave your account.
            </p>
          </div>
        </SurfaceCard>
      </div>

      <ProClientNotes consumerId={consumerId} />
    </ScreenLayout>
  );
};

export default ProPastClient;
