import { describe, expect, it } from "vitest";
import {
  memberRetrievalSignals,
  productRetrievalSignals,
  scanRetrievalQuery,
} from "../../supabase/functions/_shared/scan-rag-query";

const member = {
  hairProfile: {
    porosity: "high porosity",
    areas_of_concern: ["edges", "crown"],
    scalp_condition: "flaking",
  },
  currentGoal: { title: "length retention", challenges: ["breakage", "dryness"] },
  currentStyle: { current_hairstyle: "cornrows" },
};

describe("scan retrieval query", () => {
  it("leads with her recorded areas of concern", () => {
    const s = memberRetrievalSignals(member);
    expect(s[0]).toBe("edges");
    expect(s).toContain("breakage");
    expect(s).toContain("high porosity");
  });

  it("picks up only in-scope product vocabulary", () => {
    const s = productRetrievalSignals({
      ingredients: ["Water", "Cetearyl alcohol", "Hydrolyzed wheat protein", "Dimethicone"],
      category: "conditioner",
    });
    expect(s).toContain("protein");
    expect(s).toContain("conditioner");
    expect(s).not.toContain("water");
  });

  it("drops the raw URL and the old fixed keyword string", () => {
    const q = scanRetrievalQuery({
      context: member,
      pageText: "Full INCI: aqua, shea butter, glycerin. Adds moisture to the scalp.",
      productName: "https://brand.example.com/product/thing",
    });
    expect(q).not.toContain("http");
    expect(q).toContain("butter");
    expect(q).toContain("edges");
  });

  it("never returns an empty query for a brand-new member", () => {
    const q = scanRetrievalQuery({ context: {} });
    expect(q.length).toBeGreaterThan(20);
    expect(q).toContain("Afro and textured hair");
  });

  it("uses no hair typing terminology", () => {
    const q = scanRetrievalQuery({ context: member, ingredients: ["shea butter"] });
    expect(q).not.toMatch(/\b(3c|4c|type\s*4)\b/i);
  });
});
