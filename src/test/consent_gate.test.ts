import { describe, it, expect } from "vitest";
import {
  CONSENT_DOCUMENT_VERSION,
  MANDATORY_KEYS,
  OPTIONAL_KEYS,
  outstandingMandatory,
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
