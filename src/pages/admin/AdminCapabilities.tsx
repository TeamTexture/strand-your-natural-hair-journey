import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Stethoscope, Droplet, Check, X, Loader2, ExternalLink } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { smartBack } from "@/lib/smartBack";
import { cn } from "@/lib/utils";
import { bloodsSettingLabel, CLAIM_STATUS_LABEL, type ClaimStatus } from "@/lib/proCapabilities";

/**
 * Capability verification queue.
 *
 * The two capabilities are reviewed INDEPENDENTLY: approving "can take bloods"
 * says nothing about the doctor claim, and vice versa. Every decision goes
 * through `set_pro_capability_verification`, which writes the audit row and
 * notifies the professional — the UI never touches a `_verified` column itself.
 */

type Capability = "doctor" | "bloods";

interface CapRow {
  user_id: string;
  display_name: string;
  discipline: string;
  is_published: boolean;
  is_doctor_claimed: boolean;
  is_doctor_verified: boolean;
  doctor_verification_status: ClaimStatus;
  doctor_verification_note: string | null;
  gmc_number: string | null;
  can_take_bloods_claimed: boolean;
  can_take_bloods_verified: boolean;
  bloods_verification_status: ClaimStatus;
  bloods_verification_note: string | null;
  bloods_setting: string | null;
}

const KEY = ["admin_pro_capabilities"] as const;

const StatusChip = ({ status }: { status: ClaimStatus }) => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-body font-semibold",
      status === "verified"
        ? "bg-good/15 text-good"
        : status === "pending"
          ? "bg-warn/15 text-warn"
          : status === "rejected"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
    )}
  >
    {CLAIM_STATUS_LABEL[status]}
  </span>
);

const CapabilityReviewBlock = ({
  pro,
  capability,
  onDecide,
  deciding,
}: {
  pro: CapRow;
  capability: Capability;
  onDecide: (capability: Capability, approve: boolean, note: string) => void;
  deciding: boolean;
}) => {
  const [note, setNote] = useState("");
  const isDoctor = capability === "doctor";
  const status = isDoctor ? pro.doctor_verification_status : pro.bloods_verification_status;
  const savedNote = isDoctor ? pro.doctor_verification_note : pro.bloods_verification_note;
  const verified = isDoctor ? pro.is_doctor_verified : pro.can_take_bloods_verified;
  const Icon = isDoctor ? Stethoscope : Droplet;

  const evidence = isDoctor
    ? pro.gmc_number
      ? `GMC ${pro.gmc_number}`
      : "No GMC number given"
    : pro.bloods_setting
      ? bloodsSettingLabel(pro.bloods_setting)
      : "No setting given";

  return (
    <div className="rounded-[10px] border border-border/70 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <p className="flex-1 text-[12px] font-body font-semibold">
          {isDoctor ? "Registered doctor" : "Can take bloods in person"}
        </p>
        <StatusChip status={status} />
      </div>

      <p className="text-[11px] font-body text-foreground/80">{evidence}</p>

      {isDoctor && pro.gmc_number && (
        <a
          href={`https://www.gmc-uk.org/registration-and-licensing/the-medical-register?query=${encodeURIComponent(pro.gmc_number)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-body text-primary underline"
        >
          Check the GMC register
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}

      {savedNote && (
        <p className="text-[11px] font-body text-muted-foreground leading-snug">
          Last note: {savedNote}
        </p>
      )}

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (shown to the professional if you reject)"
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={deciding || verified}
          onClick={() => onDecide(capability, true, note)}
        >
          {deciding ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 mr-1" />}
          {verified ? "Verified" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={deciding}
          onClick={() => onDecide(capability, false, note)}
        >
          <X className="size-3.5 mr-1" />
          {verified ? "Revoke" : "Reject"}
        </Button>
      </div>
    </div>
  );
};

const AdminCapabilities = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select(
          "user_id,display_name,discipline,is_published,is_doctor_claimed,is_doctor_verified,doctor_verification_status,doctor_verification_note,gmc_number,can_take_bloods_claimed,can_take_bloods_verified,bloods_verification_status,bloods_verification_note,bloods_setting",
        )
        .or("is_doctor_claimed.eq.true,can_take_bloods_claimed.eq.true")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CapRow[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const decide = useMutation({
    mutationFn: async (args: {
      pro: string;
      capability: Capability;
      approve: boolean;
      note: string;
    }) => {
      const { error } = await supabase.rpc("set_pro_capability_verification", {
        _pro: args.pro,
        _capability: args.capability,
        _approve: args.approve,
        _note: args.note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["pro_directory"] });
    },
  });

  const rows = data ?? [];
  const pending = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.doctor_verification_status === "pending" || r.bloods_verification_status === "pending",
      ),
    [rows],
  );
  const settled = useMemo(() => rows.filter((r) => !pending.includes(r)), [rows, pending]);

  const run = async (pro: CapRow, capability: Capability, approve: boolean, note: string) => {
    const busyKey = `${pro.user_id}:${capability}`;
    setBusy(busyKey);
    try {
      await decide.mutateAsync({ pro: pro.user_id, capability, approve, note });
      toast.success(approve ? "Capability verified." : "Capability not approved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save decision");
    } finally {
      setBusy(null);
    }
  };

  const Card = ({ pro }: { pro: CapRow }) => (
    <SurfaceCard className="space-y-2.5">
      <div>
        <p className="font-display text-[15px] font-semibold leading-tight">{pro.display_name}</p>
        <p className="text-[11px] font-body text-muted-foreground">
          {pro.discipline}
          {pro.is_published ? " · Live in directory" : " · Not published"}
        </p>
      </div>
      {pro.is_doctor_claimed && (
        <CapabilityReviewBlock
          pro={pro}
          capability="doctor"
          deciding={busy === `${pro.user_id}:doctor`}
          onDecide={(cap, approve, note) => run(pro, cap, approve, note)}
        />
      )}
      {pro.can_take_bloods_claimed && (
        <CapabilityReviewBlock
          pro={pro}
          capability="bloods"
          deciding={busy === `${pro.user_id}:bloods`}
          onDecide={(cap, approve, note) => run(pro, cap, approve, note)}
        />
      )}
    </SurfaceCard>
  );

  return (
    <ScreenLayout>
      <TitleBar title="Capability verification" onBack={() => smartBack(nav, "/admin")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[11px] font-body text-muted-foreground leading-snug">
          Each capability is approved on its own. Badges appear in the directory only
          once you approve, and every decision is written to the audit log.
        </p>

        {isLoading ? (
          <LoadingDot />
        ) : rows.length === 0 ? (
          <EmptyState message="No capability claims" hint="Nothing is waiting for review." />
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <SectionLabel>Awaiting review ({pending.length})</SectionLabel>
                <div className="space-y-3">
                  {pending.map((p) => (
                    <Card key={p.user_id} pro={p} />
                  ))}
                </div>
              </>
            )}
            {settled.length > 0 && (
              <>
                <SectionLabel>Already decided</SectionLabel>
                <div className="space-y-3">
                  {settled.map((p) => (
                    <Card key={p.user_id} pro={p} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminCapabilities;
