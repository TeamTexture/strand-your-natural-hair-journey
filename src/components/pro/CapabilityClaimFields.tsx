import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Clock, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLOODS_SETTINGS,
  CLAIM_STATUS_LABEL,
  GMC_HINT,
  isValidGmc,
  normaliseGmc,
  type BloodsSetting,
  type CapabilityClaim,
  type ClaimStatus,
} from "@/lib/proCapabilities";

/**
 * The two capability claims, shared by the pro onboarding flow and the profile
 * editor. Ticking a box is a CLAIM ONLY — the copy says so, and the status pill
 * shows the professional exactly where the claim stands with the STRAND team.
 */

const StatusPill = ({ status }: { status: ClaimStatus }) => {
  if (status === "none") return null;
  const map = {
    pending: { cls: "bg-warn/15 text-warn", Icon: Clock },
    verified: { cls: "bg-good/15 text-good", Icon: ShieldCheck },
    rejected: { cls: "bg-destructive/10 text-destructive", Icon: XCircle },
  } as const;
  const { cls, Icon } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-body font-semibold shrink-0",
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {CLAIM_STATUS_LABEL[status]}
    </span>
  );
};

const ClaimRow = ({
  id,
  label,
  checked,
  onChange,
  status,
  note,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  status: ClaimStatus;
  note?: string | null;
  children?: React.ReactNode;
}) => (
  <div className="rounded-[10px] border border-border/70 bg-background/60 p-3 space-y-2">
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <label
        htmlFor={id}
        className="flex-1 text-[12px] font-body font-medium leading-snug cursor-pointer"
      >
        {label}
      </label>
      <StatusPill status={status} />
    </div>
    {status === "rejected" && note && (
      <p className="text-[11px] font-body text-destructive leading-snug">{note}</p>
    )}
    {checked && children}
  </div>
);

const CapabilityClaimFields = ({
  value,
  onChange,
  doctorStatus = "none",
  bloodsStatus = "none",
  doctorNote,
  bloodsNote,
}: {
  value: CapabilityClaim;
  onChange: (next: CapabilityClaim) => void;
  doctorStatus?: ClaimStatus;
  bloodsStatus?: ClaimStatus;
  doctorNote?: string | null;
  bloodsNote?: string | null;
}) => {
  const set = (patch: Partial<CapabilityClaim>) => onChange({ ...value, ...patch });
  const gmcBad = value.is_doctor_claimed && !isValidGmc(value.gmc_number);

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-body text-muted-foreground leading-snug">
        Ticking a box submits a claim for review. Nothing appears on your public
        listing until the STRAND team has checked it.
      </p>

      <ClaimRow
        id="claim-doctor"
        label="I am a registered doctor"
        checked={value.is_doctor_claimed}
        onChange={(v) => set({ is_doctor_claimed: v, gmc_number: v ? value.gmc_number : "" })}
        status={doctorStatus}
        note={doctorNote}
      >
        <div className="space-y-1 pl-7">
          <label
            htmlFor="claim-gmc"
            className="text-[11px] font-body font-medium text-foreground/80"
          >
            GMC registration number
          </label>
          <Input
            id="claim-gmc"
            inputMode="numeric"
            value={value.gmc_number}
            onChange={(e) => set({ gmc_number: normaliseGmc(e.target.value) })}
            placeholder="1234567"
            aria-invalid={gmcBad}
            aria-describedby="claim-gmc-hint"
          />
          <p
            id="claim-gmc-hint"
            className={cn(
              "text-[10px] font-body leading-snug",
              gmcBad ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {GMC_HINT}
          </p>
        </div>
      </ClaimRow>

      <ClaimRow
        id="claim-bloods"
        label="I can take bloods in person"
        checked={value.can_take_bloods_claimed}
        onChange={(v) =>
          set({ can_take_bloods_claimed: v, bloods_setting: v ? value.bloods_setting : "" })
        }
        status={bloodsStatus}
        note={bloodsNote}
      >
        <fieldset className="space-y-1.5 pl-7">
          <legend className="text-[11px] font-body font-medium text-foreground/80 mb-1">
            Where can you take bloods?
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {BLOODS_SETTINGS.map((s) => {
              const active = value.bloods_setting === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ bloods_setting: s.value as BloodsSetting })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-body border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-foreground/80",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </ClaimRow>
    </div>
  );
};

export default CapabilityClaimFields;
