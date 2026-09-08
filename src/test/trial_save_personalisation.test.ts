import { describe, it, expect } from "vitest";
import {
  chooseTrialSavePersonalisation,
  humanise,
  type TrialSaveSignals,
} from "../../supabase/functions/_shared/trial-save-personalisation";

const base: TrialSaveSignals = {
  porosity: "high",
  scalpCondition: "Dry",
  areasOfConcern: ["edges", "crown"],
  curlPattern: "type_4c",
  washDayCount: 2,
  productScanCount: 1,
};

describe("trial save personalisation", () => {
  it("screen 1 prefers porosity + scalp", () => {
    const r = chooseTrialSavePersonalisation(base, { screen: 1 });
    expect(r.category).toBe("porosity_scalp");
    expect(r.factLine).toContain("high porosity");
    expect(r.noActivity).toBe(false);
  });

  it("screen 2 never repeats the fact screen 1 used", () => {
    const r = chooseTrialSavePersonalisation(base, { screen: 2, exclude: "porosity_scalp" });
    expect(r.category).toBe("areas_of_concern");
    expect(r.factLine).toContain("edges");
  });

  it("skips a fact that is missing or 'Not sure'", () => {
    const r = chooseTrialSavePersonalisation(
      { ...base, porosity: "Not sure", areasOfConcern: [] },
      { screen: 1 },
    );
    expect(r.category).toBe("curl_pattern");
    expect(r.factLine).toContain("Type 4C");
  });

  it("falls back when nothing has been logged", () => {
    const r = chooseTrialSavePersonalisation(
      { ...base, washDayCount: 0, productScanCount: 0 },
      { screen: 1 },
    );
    expect(r.noActivity).toBe(true);
    expect(r.factLine).toBeNull();
    expect(r.action).toBe("log_wash_day");
  });

  it("offers a scan when wash days exist but no products do", () => {
    const r = chooseTrialSavePersonalisation({ ...base, productScanCount: 0 }, { screen: 1 });
    expect(r.action).toBe("scan_product");
  });

  it("offers no action once both are logged", () => {
    expect(chooseTrialSavePersonalisation(base, { screen: 1 }).action).toBeNull();
  });

  it("never shows a raw enum", () => {
    expect(humanise("type_4c")).toBe("Type 4C");
    expect(humanise("low_porosity")).toBe("low porosity");
  });
});

describe("stored value unwrapping", () => {
  it("never shows brackets or quotes from an encrypted JSON field", () => {
    const r = chooseTrialSavePersonalisation(
      {
        porosity: "high",
        scalpCondition: '["[\\"normal\\"]"]',
        areasOfConcern: [],
        curlPattern: "type_4c",
        washDayCount: 1,
        productScanCount: 1,
      },
      { screen: 1 },
    );
    expect(r.factLine).toBe("You told us your hair is high porosity and your scalp feels normal.");
  });
});
