// INGREDIENT NAME PRESENTATION
//
// Printed INCI panels carry footnote markers that belong to the bottle's
// legend, not to the ingredient name: "BUTYROSPERMUM PARKII (SHEA) BUTTER*♥"
// means "Certified Organic" and "Fair Trade" on that label. Those glyphs are
// never part of an ingredient name, so they are stripped before the name is
// shown, matched, looked up or sent anywhere.
//
// Panels are also set in full capitals for legibility on plastic. The app's
// ingredient rows use sentence-style casing, so an all-caps name is recased
// for display while acronyms, roman numerals and chemical codes are kept.

/** Footnote glyphs used on cosmetic packs (organic, fair trade, natural…). */
const FOOTNOTE_MARKERS = /[*\u2020\u2021\u00A7\u2665\u2666\u2663\u2660\u2726\u2727\u2605\u2606\u25CA\u25B2\u25B3\u25CF\u25CB\u00B0\u00BA\u00AA\u005E\u0023\u2295\u271A\u002B]+/g;

/** Strips footnote markers and tidies the spacing/punctuation left behind. */
export function cleanIngredientName(raw: string): string {
  return (raw ?? "")
    .replace(FOOTNOTE_MARKERS, " ")
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([),.])/g, "$1")
    .replace(/[\s,;.]+$/g, "")
    .trim();
}

const ACRONYMS = new Set([
  "PEG", "PPG", "EDTA", "DMDM", "SLS", "SLES", "PVP", "UV", "BHT", "BHA",
  "MEA", "TEA", "PCA", "CI", "SD", "PG", "PVM", "MA", "VP", "AMP", "HC",
]);

/** Sentence-style casing for a printed panel name; mixed case is left alone. */
export function formatIngredientName(raw: string): string {
  const name = cleanIngredientName(raw);
  if (!name) return "";
  // Already mixed case — the analyser wrote it, so keep it exactly.
  if (name !== name.toUpperCase()) return name;
  return name.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
    if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    if (/^[IVX]+$/.test(word) && word.length > 1) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}
