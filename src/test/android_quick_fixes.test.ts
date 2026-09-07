import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("android quick fixes", () => {
  it("bottom nav clears the Android gesture bar", () => {
    expect(read("src/components/BottomNav.tsx")).toContain(
      "max(env(safe-area-inset-bottom), 8px)",
    );
  });

  const pickers: [string, string][] = [
    ["src/components/journal/ProgressPhotosCard.tsx", "environment"],
    ["src/components/treatment/CheckinPhotos.tsx", "environment"],
    ["src/components/treatment/PlanProgressPhotos.tsx", "environment"],
    ["src/components/style/MainPhotoPicker.tsx", "environment"],
    ["src/components/UserAvatar.tsx", "user"],
  ];

  it.each(pickers)("%s opens the camera and keeps its accept list", (file, capture) => {
    const src = read(file);
    expect(src).toContain(`capture="${capture}"`);
    expect(src).toMatch(/accept="image\/\*,\.heic/i);
  });

  it("no picker accepting PDFs uses capture", () => {
    const src = read("src/pages/BloodUpload.tsx");
    const pdfInput = src.slice(
      src.lastIndexOf("<input", src.indexOf('accept="application/pdf,image/*"')),
      src.indexOf("/>", src.indexOf('accept="application/pdf,image/*"')),
    );
    expect(pdfInput).toContain('accept="application/pdf,image/*"');
    expect(pdfInput).not.toContain("capture=");
  });

  it("hover is gated to hover-capable devices", async () => {
    const config = (await import("../../tailwind.config")).default as {
      future?: { hoverOnlyWhenSupported?: boolean };
    };
    expect(config.future?.hoverOnlyWhenSupported).toBe(true);
  });

  it("fonts preconnect and load from the document head", () => {
    const html = read("index.html");
    expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com"');
    expect(html).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*display=swap"/);
    expect(read("src/index.css").split("\n")[0].startsWith("@import")).toBe(false);
  });
});
