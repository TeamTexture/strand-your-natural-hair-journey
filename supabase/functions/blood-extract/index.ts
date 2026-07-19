// Extracts blood-test marker values from an uploaded PDF or photo.
// Uses Lovable AI Gateway (google/gemini-2.5-flash) with multimodal input.
//
// Request: { file: { data: base64, mime: string, name?: string } }
// Response: { panel_date: string | null, results: Array<{ marker, value, unit, raw_marker, raw_value }> }
import { corsHeaders, json, preflight } from "../_shared/cors.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

const KNOWN_MARKERS: Array<{ marker: string; unit: string; aliases: string[] }> = [
  { marker: "Ferritin", unit: "ng/mL", aliases: ["ferritin"] },
  { marker: "Serum Iron", unit: "μmol/L", aliases: ["iron", "serum iron"] },
  { marker: "TIBC", unit: "μmol/L", aliases: ["tibc", "total iron binding capacity"] },
  { marker: "Transferrin Saturation", unit: "%", aliases: ["transferrin saturation", "tsat", "tf sat"] },
  { marker: "Vitamin D", unit: "nmol/L", aliases: ["vitamin d", "25-oh vitamin d", "25(oh)d", "vit d"] },
  { marker: "Vitamin B12", unit: "pmol/L", aliases: ["vitamin b12", "b12", "cobalamin"] },
  { marker: "Folate", unit: "nmol/L", aliases: ["folate", "serum folate"] },
  { marker: "Vitamin A", unit: "μmol/L", aliases: ["vitamin a", "retinol"] },
  { marker: "Vitamin E", unit: "μmol/L", aliases: ["vitamin e", "tocopherol"] },
  { marker: "Biotin", unit: "pg/mL", aliases: ["biotin", "vitamin b7"] },
  { marker: "Zinc", unit: "μmol/L", aliases: ["zinc"] },
  { marker: "Magnesium", unit: "mmol/L", aliases: ["magnesium"] },
  { marker: "Selenium", unit: "μmol/L", aliases: ["selenium"] },
  { marker: "Copper", unit: "μmol/L", aliases: ["copper"] },
  { marker: "CRP", unit: "mg/L", aliases: ["crp", "c-reactive protein"] },
  { marker: "Blood Glucose", unit: "mmol/L", aliases: ["glucose", "blood glucose", "fasting glucose"] },
  { marker: "Albumin", unit: "g/L", aliases: ["albumin"] },
  { marker: "HbA1c", unit: "mmol/mol", aliases: ["hba1c", "haemoglobin a1c", "hemoglobin a1c"] },
  { marker: "ESR", unit: "mm/hr", aliases: ["esr"] },
  { marker: "ANA", unit: "titre", aliases: ["ana", "antinuclear antibody"] },
  { marker: "TSH", unit: "mU/L", aliases: ["tsh", "thyroid stimulating hormone"] },
  { marker: "Free T3", unit: "pmol/L", aliases: ["free t3", "ft3"] },
  { marker: "Free T4", unit: "pmol/L", aliases: ["free t4", "ft4"] },
  { marker: "Thyroid Antibodies (TPO)", unit: "IU/mL", aliases: ["tpo", "anti-tpo", "thyroid peroxidase antibody"] },
  { marker: "Oestrogen / Oestradiol", unit: "pmol/L", aliases: ["oestradiol", "estradiol", "e2", "oestrogen", "estrogen"] },
  { marker: "Testosterone", unit: "nmol/L", aliases: ["testosterone"] },
  { marker: "DHEA-S", unit: "μmol/L", aliases: ["dhea-s", "dheas", "dhea sulfate"] },
  { marker: "Prolactin", unit: "mIU/L", aliases: ["prolactin"] },
  { marker: "FSH", unit: "IU/L", aliases: ["fsh", "follicle stimulating hormone"] },
  { marker: "LH", unit: "IU/L", aliases: ["lh", "luteinizing hormone"] },
  { marker: "Cortisol", unit: "nmol/L", aliases: ["cortisol"] },
];

const MARKER_LIST_FOR_PROMPT = KNOWN_MARKERS
  .map((m) => `- "${m.marker}" (target unit: ${m.unit}; also called: ${m.aliases.join(", ")})`)
  .join("\n");

const SYSTEM_PROMPT = `You are a clinical data extraction assistant. The user uploads a blood test report (PDF, scan, or photo). Extract every recognisable blood marker result and return them as structured JSON.

RULES:
- ONLY extract markers from the whitelist below. If a marker on the report is not in the whitelist, IGNORE it.
- For each match, return: canonical_marker (exact string from the whitelist), value (number), unit_reported (string as printed on the report), raw_marker (string as printed on the report), raw_value (string as printed).
- If the report shows a range like "5-10", return the numeric value only if it is a single measurement — never guess from a reference range.
- If a value cannot be parsed as a number, skip it.
- If you find a panel date (collection date, report date, sample date), return it as panel_date in YYYY-MM-DD format. If uncertain, return null.
- Never invent values. Only include markers where you actually see a numeric result on the report.
- If the image is not a blood test, return an empty results array.

Whitelist:
${MARKER_LIST_FOR_PROMPT}

Return ONLY valid JSON matching:
{
  "panel_date": "YYYY-MM-DD" | null,
  "results": [
    { "canonical_marker": string, "value": number, "unit_reported": string, "raw_marker": string, "raw_value": string }
  ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { error: "Missing authorization" });

    type InFile = { data?: string; mime?: string; name?: string };
    const body = await req.json().catch(() => null) as
      | { file?: InFile; files?: InFile[] }
      | null;
    const files: InFile[] = body?.files && Array.isArray(body.files) && body.files.length > 0
      ? body.files
      : body?.file
      ? [body.file]
      : [];
    if (files.length === 0) {
      return json(400, { error: "file(s) required" });
    }
    if (files.length > 10) {
      return json(400, { error: "Up to 10 files allowed" });
    }
    for (const f of files) {
      if (!f?.data || !f?.mime) {
        return json(400, { error: "each file needs data (base64) and mime" });
      }
      const isPdf = f.mime === "application/pdf";
      const isImage = f.mime.startsWith("image/");
      if (!isPdf && !isImage) {
        return json(400, { error: `Unsupported file type: ${f.mime}. Upload a PDF or image.` });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: files.length > 1
          ? `Extract blood test markers from these ${files.length} report pages/photos. Merge results across all images (deduplicate by marker, keep the clearest reading). Return JSON only.`
          : "Extract blood test markers from this report. Return JSON only.",
      },
    ];
    for (const f of files) {
      const dataUrl = `data:${f.mime};base64,${f.data}`;
      const isImage = (f.mime ?? "").startsWith("image/");
      if (isImage) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        userContent.push({
          type: "file",
          file: { filename: f.name ?? "blood-test.pdf", file_data: dataUrl },
        });
      }
    }

    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!gwRes.ok) {
      const errText = await gwRes.text();
      console.error(`blood-extract gateway error [${gwRes.status}]: ${errText}`);
      return json(gwRes.status, { error: "AI gateway error", details: errText });
    }

    const gwJson = await gwRes.json();
    const content = gwJson?.choices?.[0]?.message?.content;
    let parsed: { panel_date?: string | null; results?: Array<Record<string, unknown>> } = {};
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content ?? {};
    } catch (e) {
      console.error("blood-extract JSON parse failed:", content);
      return json(500, { error: "Model returned unparseable JSON" });
    }

    // Normalise results against the whitelist
    const whitelistSet = new Set(KNOWN_MARKERS.map((m) => m.marker));
    const results = (parsed.results ?? [])
      .map((r) => {
        const canonical = String(r.canonical_marker ?? "").trim();
        const value = typeof r.value === "number" ? r.value : Number(r.value);
        if (!whitelistSet.has(canonical)) return null;
        if (!Number.isFinite(value)) return null;
        const known = KNOWN_MARKERS.find((m) => m.marker === canonical)!;
        return {
          marker: canonical,
          value,
          unit: known.unit,
          unit_reported: String(r.unit_reported ?? known.unit),
          raw_marker: String(r.raw_marker ?? canonical),
          raw_value: String(r.raw_value ?? value),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const panel_date =
      typeof parsed.panel_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.panel_date)
        ? parsed.panel_date
        : null;

    return json(200, { panel_date, results });
  } catch (err) {
    console.error("blood-extract fatal:", err);
    return json(500, { error: (err as Error).message ?? "Unknown error" });
  }
});
