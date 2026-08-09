import { describe, it, expect } from "vitest";
import {
  CONSENT_DOCUMENT_VERSION,
  MANDATORY_KEYS,
  OPTIONAL_KEYS,
  outstandingMandatory,
  mandatoryKeysForView,
  optionalKeysForView,
  keyAllowedInView,
  resolveConsentView,
  unansweredOptional,
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

describe("view-scoped requirement matrix", () => {
  it("the brand view is never asked for health data or the medical disclaimer", () => {
    expect(mandatoryKeysForView("brand")).toEqual(["terms", "privacy", "age_18"]);
    expect(optionalKeysForView("brand")).toEqual(["marketing_email"]);
  });

  it("a brand can complete with the three base keys only", () => {
    const rows = ["terms", "privacy", "age_18"].map((k) => row(k, true));
    expect(outstandingMandatory(rows, "brand")).toEqual([]);
  });

  it("the professional view is NOT asked for the undertaking or health data at login", () => {
    expect(mandatoryKeysForView("pro")).toEqual([
      "terms",
      "privacy",
      "age_18",
      "medical_disclaimer",
    ]);
    expect(optionalKeysForView("pro")).toEqual(["marketing_email"]);
  });

  it("a professional can complete initial login without the undertaking", () => {
    const rows = ["terms", "privacy", "age_18", "medical_disclaimer"].map((k) => row(k, true));
    expect(outstandingMandatory(rows, "pro")).toEqual([]);
  });

  it("the consumer view keeps the full member matrix", () => {
    expect(mandatoryKeysForView("consumer")).toEqual(MANDATORY_KEYS);
    expect(optionalKeysForView("consumer")).toEqual(OPTIONAL_KEYS);
  });

  it("the admin view needs the disclaimer but not health data", () => {
    expect(mandatoryKeysForView("admin")).toEqual([
      "terms",
      "privacy",
      "age_18",
      "medical_disclaimer",
    ]);
  });
});

describe("no consent leaks across views", () => {
  const views = ["consumer", "pro", "brand", "admin"] as const;

  it("the professional undertaking is never mandatory in ANY view", () => {
    for (const v of views) {
      expect(mandatoryKeysForView(v)).not.toContain("professional_data_handling");
      expect(optionalKeysForView(v)).not.toContain("professional_data_handling");
      expect(outstandingMandatory([], v)).not.toContain("professional_data_handling");
    }
  });

  it("the undertaking is only ALLOWED to render in the professional view", () => {
    expect(keyAllowedInView("professional_data_handling", "pro")).toBe(true);
    expect(keyAllowedInView("professional_data_handling", "consumer")).toBe(false);
    expect(keyAllowedInView("professional_data_handling", "brand")).toBe(false);
    expect(keyAllowedInView("professional_data_handling", "admin")).toBe(false);
  });

  it("health data and personalised offers never reach the pro, brand or admin views", () => {
    for (const v of ["pro", "brand", "admin"] as const) {
      expect(keyAllowedInView("health_data", v)).toBe(false);
      expect(keyAllowedInView("personalised_offers", v)).toBe(false);
    }
  });

  it("the medical disclaimer never reaches the brand view", () => {
    expect(keyAllowedInView("medical_disclaimer", "brand")).toBe(false);
  });

  it("a four-role account gets ONLY the active view's keys, never the union", () => {
    const roles = ["consumer", "professional", "brand", "admin"] as const;
    expect(resolveConsentView("consumer", [...roles])).toBe("consumer");
    expect(mandatoryKeysForView(resolveConsentView("consumer", [...roles]))).toEqual(MANDATORY_KEYS);
    expect(mandatoryKeysForView(resolveConsentView("brand", [...roles]))).toEqual([
      "terms",
      "privacy",
      "age_18",
    ]);
    expect(mandatoryKeysForView(resolveConsentView("pro", [...roles]))).not.toContain("health_data");
  });

  it("an unheld view falls back to the member view rather than asking foreign consents", () => {
    expect(resolveConsentView("brand", ["consumer"])).toBe("consumer");
    expect(resolveConsentView("pro", ["consumer"])).toBe("consumer");
  });

  it("an account with no roles yet is treated as a member", () => {
    expect(resolveConsentView("consumer", [])).toBe("consumer");
    expect(mandatoryKeysForView("consumer")).toEqual(MANDATORY_KEYS);
  });
});

describe("answered consents are never re-asked", () => {
  it("an optional consent already granted is not outstanding", () => {
    const rows = [...allMandatory(), row("personalised_offers", true)];
    expect(unansweredOptional(rows, "consumer")).toEqual(["marketing_email"]);
  });

  it("an optional consent already DECLINED is not re-asked either", () => {
    const rows = [...allMandatory(), row("personalised_offers", false), row("marketing_email", false)];
    expect(unansweredOptional(rows, "consumer")).toEqual([]);
  });

  it("only genuinely unanswered optional keys are offered", () => {
    expect(unansweredOptional(allMandatory(), "consumer")).toEqual(OPTIONAL_KEYS);
  });
});
