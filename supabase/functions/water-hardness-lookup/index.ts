// UK water-hardness lookup by postcode.
// Flow:
//   1. Resolve postcode → admin_district (LAD) via postcodes.io.
//   2. Map LAD → water supplier (curated static map).
//   3. Map supplier → typical hardness + water-quality profile.
//
// Bands (5 tiers, aligned with widely-used UK softener retailer scales):
//   soft:             <50   mg/L CaCO3
//   slightly_hard:    50-99
//   moderately_hard:  100-199
//   hard:             200-299
//   very_hard:        300+
//
// `is_hard` is true iff band is "moderately_hard" or above — the threshold
// where hair advice around mineral build-up starts to matter.
//
// NOTE: values are supplier-average heuristics for guidance, not a licensed
// address-level dataset. The dialog surfaces the supplier so the user can
// verify against their own water report if precise numbers matter.

import { corsHeaders, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

interface WaterProfile {
  mg_l: number;
  calcium_mg_l: number;      // typical Ca2+
  magnesium_mg_l: number;    // typical Mg2+
  ph_range: [number, number];
  chlorine_note: string;
}

// Supplier → typical water quality profile. mg_l is CaCO3 hardness; Ca/Mg
// split is roughly 80/20 in UK groundwater areas, closer to 90/10 in
// chalk/limestone regions. pH ranges from each supplier's published
// water-quality reports (Ofwat compliance data).
const SUPPLIER_PROFILE: Record<string, WaterProfile> = {
  "Thames Water":            { mg_l: 283, calcium_mg_l: 105, magnesium_mg_l: 6,  ph_range: [7.2, 7.8], chlorine_note: "Chloramine-treated; residual 0.3–0.5 mg/L" },
  "Affinity Water":          { mg_l: 300, calcium_mg_l: 112, magnesium_mg_l: 5,  ph_range: [7.3, 7.9], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "Southern Water":          { mg_l: 275, calcium_mg_l: 100, magnesium_mg_l: 6,  ph_range: [7.1, 7.7], chlorine_note: "Chlorinated; residual 0.3–0.6 mg/L" },
  "South East Water":        { mg_l: 285, calcium_mg_l: 105, magnesium_mg_l: 5,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual ~0.5 mg/L" },
  "Anglian Water":           { mg_l: 275, calcium_mg_l: 98,  magnesium_mg_l: 8,  ph_range: [7.2, 7.9], chlorine_note: "Chloraminated in most zones" },
  "Essex & Suffolk Water":   { mg_l: 270, calcium_mg_l: 96,  magnesium_mg_l: 8,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "Cambridge Water":         { mg_l: 320, calcium_mg_l: 118, magnesium_mg_l: 6,  ph_range: [7.3, 7.9], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "SES Water":               { mg_l: 290, calcium_mg_l: 108, magnesium_mg_l: 5,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual 0.3–0.5 mg/L" },
  "Portsmouth Water":        { mg_l: 270, calcium_mg_l: 100, magnesium_mg_l: 5,  ph_range: [7.1, 7.7], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "South Staffs Water":      { mg_l: 250, calcium_mg_l: 90,  magnesium_mg_l: 7,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "Severn Trent Water":      { mg_l: 200, calcium_mg_l: 72,  magnesium_mg_l: 8,  ph_range: [7.0, 7.8], chlorine_note: "Chlorinated; residual 0.3–0.5 mg/L" },
  "Bristol Water":           { mg_l: 240, calcium_mg_l: 86,  magnesium_mg_l: 7,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "Wessex Water":            { mg_l: 220, calcium_mg_l: 80,  magnesium_mg_l: 7,  ph_range: [7.1, 7.7], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "South West Water":        { mg_l: 60,  calcium_mg_l: 20,  magnesium_mg_l: 3,  ph_range: [6.8, 7.4], chlorine_note: "Chlorinated; residual 0.2–0.4 mg/L" },
  "Yorkshire Water":         { mg_l: 90,  calcium_mg_l: 30,  magnesium_mg_l: 4,  ph_range: [7.0, 7.6], chlorine_note: "Chlorinated; residual ~0.3 mg/L" },
  "United Utilities":        { mg_l: 60,  calcium_mg_l: 20,  magnesium_mg_l: 3,  ph_range: [6.8, 7.4], chlorine_note: "Chlorinated; residual 0.2–0.4 mg/L" },
  "Northumbrian Water":      { mg_l: 55,  calcium_mg_l: 18,  magnesium_mg_l: 3,  ph_range: [6.8, 7.4], chlorine_note: "Chlorinated; residual ~0.3 mg/L" },
  "Hartlepool Water":        { mg_l: 260, calcium_mg_l: 94,  magnesium_mg_l: 7,  ph_range: [7.2, 7.8], chlorine_note: "Chlorinated; residual ~0.4 mg/L" },
  "Dŵr Cymru Welsh Water":   { mg_l: 65,  calcium_mg_l: 22,  magnesium_mg_l: 3,  ph_range: [6.8, 7.4], chlorine_note: "Chlorinated; residual ~0.3 mg/L" },
  "Hafren Dyfrdwy":          { mg_l: 100, calcium_mg_l: 34,  magnesium_mg_l: 5,  ph_range: [7.0, 7.6], chlorine_note: "Chlorinated; residual ~0.3 mg/L" },
  "Scottish Water":          { mg_l: 50,  calcium_mg_l: 16,  magnesium_mg_l: 3,  ph_range: [6.7, 7.3], chlorine_note: "Chlorinated; residual 0.2–0.4 mg/L" },
  "NI Water":                { mg_l: 55,  calcium_mg_l: 18,  magnesium_mg_l: 3,  ph_range: [6.8, 7.4], chlorine_note: "Chlorinated; residual ~0.3 mg/L" },
};

// Local Authority District → supplier (main supply footprints).
const LAD_TO_SUPPLIER: Record<string, string> = {
  "Westminster": "Thames Water", "Camden": "Thames Water", "Islington": "Thames Water",
  "Hackney": "Thames Water", "Tower Hamlets": "Thames Water", "Southwark": "Thames Water",
  "Lambeth": "Thames Water", "Wandsworth": "Thames Water", "Hammersmith and Fulham": "Thames Water",
  "Kensington and Chelsea": "Thames Water", "City of London": "Thames Water",
  "Newham": "Thames Water", "Greenwich": "Thames Water", "Lewisham": "Thames Water",
  "Ealing": "Thames Water", "Brent": "Thames Water", "Harrow": "Thames Water",
  "Hillingdon": "Affinity Water", "Hounslow": "Thames Water", "Richmond upon Thames": "Thames Water",
  "Kingston upon Thames": "Thames Water", "Merton": "Thames Water", "Sutton": "SES Water",
  "Croydon": "SES Water", "Bromley": "Thames Water", "Bexley": "Thames Water",
  "Redbridge": "Essex & Suffolk Water", "Havering": "Essex & Suffolk Water",
  "Barking and Dagenham": "Essex & Suffolk Water", "Waltham Forest": "Thames Water",
  "Enfield": "Thames Water", "Haringey": "Thames Water", "Barnet": "Affinity Water",
  "Watford": "Affinity Water", "Three Rivers": "Affinity Water", "Hertsmere": "Affinity Water",
  "St Albans": "Affinity Water", "Dacorum": "Affinity Water", "Welwyn Hatfield": "Affinity Water",
  "Broxbourne": "Affinity Water", "East Hertfordshire": "Affinity Water",
  "North Hertfordshire": "Affinity Water", "Stevenage": "Affinity Water",
  "Peterborough": "Anglian Water", "Norwich": "Anglian Water",
  "King's Lynn and West Norfolk": "Anglian Water", "North Norfolk": "Anglian Water",
  "South Norfolk": "Anglian Water", "Broadland": "Anglian Water", "Great Yarmouth": "Anglian Water",
  "Ipswich": "Anglian Water", "Cambridge": "Cambridge Water",
  "South Cambridgeshire": "Cambridge Water", "East Cambridgeshire": "Cambridge Water",
  "Brighton and Hove": "Southern Water", "Portsmouth": "Portsmouth Water",
  "Southampton": "Southern Water", "Isle of Wight": "Southern Water",
  "Canterbury": "South East Water", "Dover": "South East Water", "Ashford": "South East Water",
  "Maidstone": "South East Water", "Tunbridge Wells": "South East Water",
  "Bristol, City of": "Bristol Water", "Bath and North East Somerset": "Wessex Water",
  "North Somerset": "Bristol Water", "South Gloucestershire": "Bristol Water",
  "Plymouth": "South West Water", "Exeter": "South West Water", "Torbay": "South West Water",
  "Cornwall": "South West Water", "Mid Devon": "South West Water", "North Devon": "South West Water",
  "Birmingham": "Severn Trent Water", "Coventry": "Severn Trent Water",
  "Solihull": "Severn Trent Water", "Nottingham": "Severn Trent Water",
  "Derby": "Severn Trent Water", "Leicester": "Severn Trent Water",
  "Wolverhampton": "South Staffs Water", "Sandwell": "South Staffs Water",
  "Dudley": "South Staffs Water", "Walsall": "South Staffs Water",
  "Manchester": "United Utilities", "Liverpool": "United Utilities",
  "Salford": "United Utilities", "Trafford": "United Utilities",
  "Wigan": "United Utilities", "Bolton": "United Utilities", "Bury": "United Utilities",
  "Oldham": "United Utilities", "Rochdale": "United Utilities", "Stockport": "United Utilities",
  "Tameside": "United Utilities", "Preston": "United Utilities", "Blackburn with Darwen": "United Utilities",
  "Blackpool": "United Utilities",
  "Leeds": "Yorkshire Water", "Sheffield": "Yorkshire Water", "Bradford": "Yorkshire Water",
  "Kirklees": "Yorkshire Water", "Wakefield": "Yorkshire Water", "York": "Yorkshire Water",
  "Newcastle upon Tyne": "Northumbrian Water", "Gateshead": "Northumbrian Water",
  "Sunderland": "Northumbrian Water", "North Tyneside": "Northumbrian Water",
  "South Tyneside": "Northumbrian Water", "Hartlepool": "Hartlepool Water",
  "Middlesbrough": "Northumbrian Water",
};

function fallbackSupplierByCountry(country: string | null, region: string | null): string {
  if (country === "Scotland") return "Scottish Water";
  if (country === "Northern Ireland") return "NI Water";
  if (country === "Wales") return "Dŵr Cymru Welsh Water";
  if (region === "North West" || region === "North East") return "United Utilities";
  if (region === "Yorkshire and The Humber") return "Yorkshire Water";
  if (region === "South West") return "South West Water";
  if (region === "London" || region === "South East" || region === "East of England") {
    return "Thames Water";
  }
  return "Severn Trent Water";
}

function bandFor(mg_l: number): { band: string; is_hard: boolean } {
  if (mg_l < 50) return { band: "soft", is_hard: false };
  if (mg_l < 100) return { band: "slightly_hard", is_hard: false };
  if (mg_l < 200) return { band: "moderately_hard", is_hard: true };
  if (mg_l < 300) return { band: "hard", is_hard: true };
  return { band: "very_hard", is_hard: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireAuthedUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const rawPostcode = String(body?.postcode ?? "").trim().toUpperCase();
    if (rawPostcode.length < 3) {
      return json(400, { error: "postcode required" });
    }

    let admin_district: string | null = null;
    let country: string | null = null;
    let region: string | null = null;

    const pcRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(rawPostcode)}`,
    );
    if (pcRes.ok) {
      const pcData = await pcRes.json();
      admin_district = pcData?.result?.admin_district ?? null;
      country = pcData?.result?.country ?? null;
      region = pcData?.result?.region ?? null;
    } else {
      const outward = rawPostcode.split(" ")[0];
      const outRes = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(outward)}`,
      );
      if (!outRes.ok) {
        await outRes.text();
        return json(422, { error: "postcode not found" });
      }
      const outData = await outRes.json();
      admin_district = outData?.result?.admin_district?.[0] ?? null;
      country = outData?.result?.country?.[0] ?? null;
      region = outData?.result?.region?.[0] ?? null;
    }

    const supplier =
      (admin_district && LAD_TO_SUPPLIER[admin_district]) ||
      fallbackSupplierByCountry(country, region);
    const profile = SUPPLIER_PROFILE[supplier] ?? SUPPLIER_PROFILE["Severn Trent Water"];
    const { band, is_hard } = bandFor(profile.mg_l);

    return json(200, {
      postcode: rawPostcode,
      admin_district,
      supplier,
      mg_l: profile.mg_l,
      calcium_mg_l: profile.calcium_mg_l,
      magnesium_mg_l: profile.magnesium_mg_l,
      ph_min: profile.ph_range[0],
      ph_max: profile.ph_range[1],
      chlorine_note: profile.chlorine_note,
      band,
      is_hard,
    });
  } catch (err) {
    console.error("water-hardness-lookup error", err);
    return json(500, { error: String((err as Error)?.message ?? err) });
  }
});
