// Dynamic UK water-hardness lookup by postcode.
// Flow:
//   1. Resolve postcode → admin_district (LAD) via postcodes.io (free, no auth).
//   2. Map LAD → water supplier (curated static map, covers the main UK
//      companies serving domestic customers).
//   3. Map supplier → typical hardness in mg/L CaCO3 and hardness band.
// Response shape:
//   { postcode, admin_district, supplier, mg_l, band, is_hard }
//
// Bands (English/Welsh convention):
//   soft:      0–100  mg/L
//   moderate:  100–200 mg/L
//   hard:      200–300 mg/L
//   very_hard: 300+   mg/L
//
// `is_hard` is true iff band is "hard" or "very_hard" — used as the boolean
// AiContext.location.is_hard_water_area flag.

import { corsHeaders, json } from "../_shared/cors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

// Supplier → representative average hardness (mg/L CaCO3). Values chosen from
// each supplier's published water-quality reports; where suppliers cover a
// wide range we take a mid-range figure that reflects the majority of their
// domestic supply zones.
const SUPPLIER_HARDNESS_MG_L: Record<string, number> = {
  "Thames Water": 283,
  "Affinity Water": 300,
  "Southern Water": 275,
  "South East Water": 285,
  "Anglian Water": 275,
  "Essex & Suffolk Water": 270,
  "Cambridge Water": 320,
  "SES Water": 290,
  "Portsmouth Water": 270,
  "South Staffs Water": 250,
  "Severn Trent Water": 200,
  "Bristol Water": 240,
  "Wessex Water": 220,
  "South West Water": 60,
  "Yorkshire Water": 90,
  "United Utilities": 60,
  "Northumbrian Water": 55,
  "Hartlepool Water": 260,
  "Dŵr Cymru Welsh Water": 65,
  "Hafren Dyfrdwy": 100,
  "Scottish Water": 50,
  "NI Water": 55,
};

// Local Authority District (postcodes.io admin_district) → supplier. This is
// the canonical LADs for the main supply footprints. Anything not listed
// falls back to a region-based heuristic below.
const LAD_TO_SUPPLIER: Record<string, string> = {
  // London / Thames Water
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

  // Home Counties / Affinity
  "Watford": "Affinity Water", "Three Rivers": "Affinity Water", "Hertsmere": "Affinity Water",
  "St Albans": "Affinity Water", "Dacorum": "Affinity Water", "Welwyn Hatfield": "Affinity Water",
  "Broxbourne": "Affinity Water", "East Hertfordshire": "Affinity Water",
  "North Hertfordshire": "Affinity Water", "Stevenage": "Affinity Water",

  // Anglian
  "Peterborough": "Anglian Water", "Norwich": "Anglian Water",
  "King's Lynn and West Norfolk": "Anglian Water", "North Norfolk": "Anglian Water",
  "South Norfolk": "Anglian Water", "Broadland": "Anglian Water", "Great Yarmouth": "Anglian Water",
  "Ipswich": "Anglian Water", "Cambridge": "Cambridge Water",
  "South Cambridgeshire": "Cambridge Water", "East Cambridgeshire": "Cambridge Water",

  // Southern
  "Brighton and Hove": "Southern Water", "Portsmouth": "Portsmouth Water",
  "Southampton": "Southern Water", "Isle of Wight": "Southern Water",
  "Canterbury": "South East Water", "Dover": "South East Water", "Ashford": "South East Water",
  "Maidstone": "South East Water", "Tunbridge Wells": "South East Water",

  // South West
  "Bristol, City of": "Bristol Water", "Bath and North East Somerset": "Wessex Water",
  "North Somerset": "Bristol Water", "South Gloucestershire": "Bristol Water",
  "Plymouth": "South West Water", "Exeter": "South West Water", "Torbay": "South West Water",
  "Cornwall": "South West Water", "Mid Devon": "South West Water", "North Devon": "South West Water",

  // Midlands
  "Birmingham": "Severn Trent Water", "Coventry": "Severn Trent Water",
  "Solihull": "Severn Trent Water", "Nottingham": "Severn Trent Water",
  "Derby": "Severn Trent Water", "Leicester": "Severn Trent Water",
  "Wolverhampton": "South Staffs Water", "Sandwell": "South Staffs Water",
  "Dudley": "South Staffs Water", "Walsall": "South Staffs Water",

  // North West
  "Manchester": "United Utilities", "Liverpool": "United Utilities",
  "Salford": "United Utilities", "Trafford": "United Utilities",
  "Wigan": "United Utilities", "Bolton": "United Utilities", "Bury": "United Utilities",
  "Oldham": "United Utilities", "Rochdale": "United Utilities", "Stockport": "United Utilities",
  "Tameside": "United Utilities", "Preston": "United Utilities", "Blackburn with Darwen": "United Utilities",
  "Blackpool": "United Utilities",

  // North East / Yorkshire
  "Leeds": "Yorkshire Water", "Sheffield": "Yorkshire Water", "Bradford": "Yorkshire Water",
  "Kirklees": "Yorkshire Water", "Wakefield": "Yorkshire Water", "York": "Yorkshire Water",
  "Newcastle upon Tyne": "Northumbrian Water", "Gateshead": "Northumbrian Water",
  "Sunderland": "Northumbrian Water", "North Tyneside": "Northumbrian Water",
  "South Tyneside": "Northumbrian Water", "Hartlepool": "Hartlepool Water",
  "Middlesbrough": "Northumbrian Water",
};

// Fallback by country / region when the specific LAD isn't in the map.
function fallbackSupplierByCountry(country: string | null, region: string | null): string {
  if (country === "Scotland") return "Scottish Water";
  if (country === "Northern Ireland") return "NI Water";
  if (country === "Wales") return "Dŵr Cymru Welsh Water";
  // England fallback — pick a middle-of-the-road hardness so we don't
  // over- or under-claim. Severn Trent sits around 200 mg/L (moderate).
  if (region === "North West" || region === "North East") return "United Utilities";
  if (region === "Yorkshire and The Humber") return "Yorkshire Water";
  if (region === "South West") return "South West Water";
  if (region === "London" || region === "South East" || region === "East of England") {
    return "Thames Water";
  }
  return "Severn Trent Water";
}

function bandFor(mg_l: number): { band: string; is_hard: boolean } {
  // Thresholds aligned with the widely-published UK water-supplier scale
  // (used by Aqua Cure and most UK softener retailers):
  //   soft:      <100 mg/L CaCO3
  //   moderate:  100–199
  //   hard:      200–275
  //   very_hard: 276+
  if (mg_l < 100) return { band: "soft", is_hard: false };
  if (mg_l < 200) return { band: "moderate", is_hard: false };
  if (mg_l < 276) return { band: "hard", is_hard: true };
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

    // Look up via postcodes.io (free, no auth, generous rate limits).
    const pcRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(rawPostcode)}`,
    );
    if (!pcRes.ok) {
      // Try outward-code endpoint as a fallback for partial postcodes.
      const outward = rawPostcode.split(" ")[0];
      const outRes = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(outward)}`,
      );
      if (!outRes.ok) {
        await outRes.text();
        return json(422, { error: "postcode not found" });
      }
      const outData = await outRes.json();
      const admin_district: string | null = outData?.result?.admin_district?.[0] ?? null;
      const country: string | null = outData?.result?.country?.[0] ?? null;
      const region: string | null = outData?.result?.region?.[0] ?? null;
      const supplier =
        (admin_district && LAD_TO_SUPPLIER[admin_district]) ||
        fallbackSupplierByCountry(country, region);
      const mg_l = SUPPLIER_HARDNESS_MG_L[supplier] ?? 200;
      const { band, is_hard } = bandFor(mg_l);
      return json(200, {
        postcode: rawPostcode, admin_district, supplier, mg_l, band, is_hard,
      });
    }

    const pcData = await pcRes.json();
    const admin_district: string | null = pcData?.result?.admin_district ?? null;
    const country: string | null = pcData?.result?.country ?? null;
    const region: string | null = pcData?.result?.region ?? null;
    const supplier =
      (admin_district && LAD_TO_SUPPLIER[admin_district]) ||
      fallbackSupplierByCountry(country, region);
    const mg_l = SUPPLIER_HARDNESS_MG_L[supplier] ?? 200;
    const { band, is_hard } = bandFor(mg_l);

    return json(200, {
      postcode: rawPostcode, admin_district, supplier, mg_l, band, is_hard,
    });
  } catch (err) {
    console.error("water-hardness-lookup error", err);
    return json(500, { error: String((err as Error)?.message ?? err) });
  }
});
