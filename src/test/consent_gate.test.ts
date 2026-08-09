import { describe, it, expect } from "vitest";
import {
  CONSENT_DOCUMENT_VERSION,
  MANDATORY_KEYS,
  OPTIONAL_KEYS,
  outstandingMandatory,
  mandatoryKeysForRoles,
  optionalKeysForRoles,
  type ConsentRow,
} from "@/lib/consent";

const row = (key: string, granted: boolean, version = CONSENT_DOCUMENT_VERSION, at = "2026-08-07T10:00:00Z"): ConsentRow => ({
  consent_key: key,
  granted,
  document_version: version,
  granted_at: at,
});

const allMandatory = () => MANDATORY_KEYS.map((k) => row(k, true));

describe("consent gate logic", () => {
  it("treats a member with no rows as outstanding on every mandatory key", () => {
    expect(outstandingMandatory([])).toEqual(MANDATORY_KEYS);
  });

  it("clears the gate when all mandatory consents are granted at the current version", () => {
    expect(outstandingMandatory(allMandatory())).toEqual([]);
  });

  it("optional consents never gate access", () => {
    const rows = [...allMandatory(), ...OPTIONAL_KEYS.map((k) => row(k, false))];
    expect(outstandingMandatory(rows)).toEqual([]);
  });

  it("re-gates only the keys whose accepted version is stale", () => {
    const rows = [...allMandatory().filter((r) => r.consent_key !== "privacy"), row("privacy", true, "old-version")];
    expect(outstandingMandatory(rows)).toEqual(["privacy"]);
  });

  it("a withdrawal (newer granted=false row) re-opens the gate", () => {
    const rows = [...allMandatory(), row("health_data", false, CONSENT_DOCUMENT_VERSION, "2026-08-08T10:00:00Z")];
    expect(outstandingMandatory(rows)).toEqual(["health_data"]);
  });
});

describe("role-aware requirement matrix", () => {
  it("a brand is never asked for health data or the medical disclaimer", () => {
    expect(mandatoryKeysForRoles(["brand"])).toEqual(["terms", "privacy", "age_18"]);
    expect(optionalKeysForRoles(["brand"])).toEqual(["marketing_email"]);
  });

  it("a brand can complete with the three base keys only", () => {
    const rows = ["terms", "privacy", "age_18"].map((k) => row(k, true));
    expect(outstandingMandatory(rows, ["brand"])).toEqual([]);
  });

  it("a professional gets the undertaking, not health data consent", () => {
    expect(mandatoryKeysForRoles(["professional"])).toEqual([
      "terms",
      "privacy",
      "age_18",
      "medical_disclaimer",
      "professional_data_handling",
    ]);
    expect(optionalKeysForRoles(["professional"])).toEqual(["marketing_email"]);
  });

  it("a consumer keeps the full member matrix", () => {
    expect(mandatoryKeysForRoles(["consumer"])).toEqual(MANDATORY_KEYS);
    expect(optionalKeysForRoles(["consumer"])).toEqual(OPTIONAL_KEYS);
  });

  it("dual roles take the union — a pro who is also a member gets both", () => {
    expect(mandatoryKeysForRoles(["professional", "consumer"])).toEqual([
      "terms",
      "privacy",
      "age_18",
      "medical_disclaimer",
      "health_data",
      "professional_data_handling",
    ]);
  });

  it("admin + brand needs the disclaimer but not health data", () => {
    expect(mandatoryKeysForRoles(["admin", "brand"])).toEqual([
      "terms",
      "privacy",
      "age_18",
      "medical_disclaimer",
    ]);
  });

  it("an account with no roles yet is treated as a member", () => {
    expect(mandatoryKeysForRoles([])).toEqual(MANDATORY_KEYS);
  });
});
