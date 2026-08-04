/**
 * Professional capability claims — CLAIM IS NOT VERIFICATION.
 *
 * A professional may tick "I am a registered doctor" or "I can take bloods in
 * person" all day long; nothing shows publicly until an admin approves the
 * claim and the database sets the `_verified` column. Every badge and filter
 * in the app reads the `_verified` columns ONLY — never the `_claimed` ones.
 */

export type BloodsSetting = "clinic" | "home" | "both";
export type ClaimStatus = "none" | "pending" | "verified" | "rejected";

export const BLOODS_SETTINGS: Array<{ value: BloodsSetting; label: string }> = [
  { value: "clinic", label: "Clinic only" },
  { value: "home", label: "Home visits" },
  { value: "both", label: "Clinic and home visits" },
];

export const bloodsSettingLabel = (v: string | null | undefined): string =>
  BLOODS_SETTINGS.find((s) => s.value === v)?.label ?? "";

/**
 * UK GMC reference numbers are 7 digits. Format-only validation — no live
 * register lookup in this phase, which is exactly why a ticked box can never
 * be enough to publish the badge.
 */
export const GMC_PATTERN = /^\d{7}$/;

export const normaliseGmc = (raw: string): string =>
  (raw ?? "").replace(/[^0-9]/g, "").slice(0, 7);

export const isValidGmc = (raw: string | null | undefined): boolean =>
  GMC_PATTERN.test(normaliseGmc(raw ?? ""));

export const GMC_HINT = "7 digits, as printed on the GMC register.";

/** The claim fields a professional owns and may edit. */
export interface CapabilityClaim {
  is_doctor_claimed: boolean;
  gmc_number: string;
  can_take_bloods_claimed: boolean;
  bloods_setting: BloodsSetting | "";
}

export const emptyCapabilityClaim = (): CapabilityClaim => ({
  is_doctor_claimed: false,
  gmc_number: "",
  can_take_bloods_claimed: false,
  bloods_setting: "",
});

/** Reads a profile row into the claim form shape. */
export function claimFromRow(row: Record<string, unknown> | null | undefined): CapabilityClaim {
  if (!row) return emptyCapabilityClaim();
  return {
    is_doctor_claimed: row.is_doctor_claimed === true,
    gmc_number: typeof row.gmc_number === "string" ? row.gmc_number : "",
    can_take_bloods_claimed: row.can_take_bloods_claimed === true,
    bloods_setting: (row.bloods_setting as BloodsSetting | null) ?? "",
  };
}

/** The claim columns to write on a profile save. Never a `_verified` column. */
export function claimPayload(c: CapabilityClaim) {
  return {
    is_doctor_claimed: c.is_doctor_claimed,
    gmc_number: c.is_doctor_claimed ? normaliseGmc(c.gmc_number) || null : null,
    can_take_bloods_claimed: c.can_take_bloods_claimed,
    bloods_setting: c.can_take_bloods_claimed ? c.bloods_setting || null : null,
  };
}

/** Returns an error message when a claim is incomplete, otherwise null. */
export function validateCapabilityClaim(c: CapabilityClaim): string | null {
  if (c.is_doctor_claimed && !isValidGmc(c.gmc_number)) {
    return "Add your GMC registration number — 7 digits.";
  }
  if (c.can_take_bloods_claimed && !c.bloods_setting) {
    return "Choose where you can take bloods.";
  }
  return null;
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  none: "Not claimed",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Not approved",
};

/** Public verification state, as read by badges and filters. */
export interface CapabilityVerification {
  isDoctorVerified: boolean;
  canTakeBloodsVerified: boolean;
  bloodsSetting: BloodsSetting | null;
}

export const DOCTOR_TOOLTIP = "Verified on the GMC register.";
export const BLOODS_TOOLTIP = "Can take bloods in person.";

/** Tooltip / accessible-name copy. Factual verification statements only. */
export function doctorTooltip(): string {
  return DOCTOR_TOOLTIP;
}

export function bloodsTooltip(setting: string | null | undefined): string {
  const label = bloodsSettingLabel(setting);
  return label ? `${BLOODS_TOOLTIP} ${label}.` : BLOODS_TOOLTIP;
}
