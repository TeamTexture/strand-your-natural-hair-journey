// Style Playbook — per-hairstyle guidance drawn from "How To Love Your Afro"
// (Chapters 11 Styling: Best Practices, 13 How Often To Wash, 14 Moisture
// Retention, 15 Reading Ingredients, 16 How Your Hair Grows, 17 DIY Care,
// 18 Chemical Services). This module renders a system-prompt block that
// personalises AI advice to the exact style the user is wearing right now,
// how long they've been in it, and the style they're planning next.
//
// The playbook is the single source of truth for style-specific guidance
// across every AI function. It never contradicts the manuscript; where
// the book is direct on a number (e.g. braids 4–6 weeks max, silk press
// no more than 4×/year), that number appears here so the model can't
// improvise a different one.
//
// Not a replacement for the general knowledge topics — it augments them
// with a style lens. Injected into build-prompt.ts for every advice
// function, and into the two functions that bypass build-prompt
// (goal-tip, hair-strand-summary) via buildStylePlaybookBlock().

export interface StylePlaybookEntry {
  /** Canonical label as shown in the app UI (matches HAIRSTYLE_OPTIONS). */
  label: string;
  /** How the manuscript classifies this style — protective/low-tension,
   *  high-manipulation, chemical, natural-worn, etc. */
  category:
    | "worn-natural"
    | "protective-installed"
    | "protective-own-hair"
    | "extension-covering"
    | "loc"
    | "chemical-relaxed"
    | "chemical-curly"
    | "heat-styled";
  /** Max wear window in weeks before scalp/tension damage starts to
   *  outweigh the protection. NULL when the manuscript doesn't set a
   *  hard limit (worn-natural styles). */
  maxWearWeeks: number | null;
  /** Point at which the user should be actively planning takedown. Used
   *  to phrase the time-in-style status. */
  refreshWeeks: number | null;
  /** Core protocol lines. These are the mechanism-level teachings the
   *  model must reason FROM — not slogans to quote verbatim. */
  playbook: string[];
}

const PLAYBOOK: Record<string, StylePlaybookEntry> = {
  "Box braids": {
    label: "Box braids",
    category: "protective-installed",
    maxWearWeeks: 6,
    refreshWeeks: 4,
    playbook: [
      "Wear window is 4–6 weeks maximum. Beyond six weeks, new growth at the roots creates matting, the braid weight pulls harder on the follicle, and moisture reaches the strand less and less — the protection turns into damage.",
      "Tension check is the single biggest lever. If the braids were painfully tight on install, that is traction on every follicle at the hairline and part. Small bumps, tenderness, or a headache in the first 48 hours are signs the style should be loosened at the front by the braider — not left to settle.",
      "The scalp still needs cleansing on a regular rhythm. Diluted shampoo applied directly to the scalp with an applicator bottle, or a leave-on scalp cleanser (micellar-style), keeps sebum and product residue from turning into flake and folliculitis. Never skip washing for the whole install.",
      "Moisture goes to the natural hair inside the braid, not the extension fibre. A light water + leave-in mist to the scalp and length 2–3× per week keeps the underlying strand supple; heavy creams cause build-up.",
      "Nightly satin/silk. The friction of a cotton pillow against synthetic hair splits ends and lifts the cuticle on the natural hair inside.",
      "Edges and hairline are the vulnerable zone. Never re-tighten the front, avoid gels that flake and drag, and stop wearing high tight ponytail-style updos on top of the braids.",
      "Before install: deep-condition and hydrate. Before wearing extensions, the manuscript recommends a heat treatment under the TT Heat Hat so the cuticle is sealed and moisture is fully absorbed. After takedown: an extended detangling session in slippery conditioner, section by section, then another moisture-focused deep condition under the TT Heat Hat before the next style.",
    ],
  },
  "Faux locs": {
    label: "Faux locs",
    category: "protective-installed",
    maxWearWeeks: 6,
    refreshWeeks: 4,
    playbook: [
      "Same 4–6 week ceiling as box braids. The manuscript is explicit that faux-loc installs carry the same risk profile — natural hair is pulled tightly into the extension on install, and synthetic fibres rubbing against the cuticle can dehydrate the strand.",
      "Weight matters. Long or heavy faux locs pull harder at the roots. If the scalp is sore for more than 24 hours, that is traction — not the style 'settling in'.",
      "Scalp cleansing continues while installed. Dilute shampoo at the scalp with an applicator bottle, or a spray-in scalp refresher, on the user's normal wash rhythm.",
      "Moisture: light water + leave-in mist at the roots and along the natural hair inside the loc. Heavy oils will not penetrate the wrap and create build-up.",
      "Before install: deep condition and TT Heat Hat treatment so the strand is fully hydrated going in. After takedown: unravel gently in sections, expect shed hair (that is 4–6 weeks of normal shed collected in one place, not breakage), then a full moisture-focused deep condition under the TT Heat Hat before the next style.",
    ],
  },
  "Cornrows": {
    label: "Cornrows",
    category: "protective-installed",
    maxWearWeeks: 3,
    refreshWeeks: 2,
    playbook: [
      "Cornrows on their own hair are shorter-window than box braids — 2–3 weeks before new growth loosens the base and frizz sets in. Reinstalling on tired hair is worse than washing and refreshing first.",
      "Chunky, well-parted cornrows with medium-to-loose tension are the low-manipulation ideal the book endorses. Micro-cornrows scraped tight at the base are high-tension — the risk is at the hairline and along the part.",
      "Scalp is easy to access — cleansing on the user's normal wash rhythm is straightforward. Apply diluted shampoo directly along each part, rinse, apply a leave-in and a light oil to seal.",
      "Nightly satin/silk scarf preserves the front and reduces frizz between wash days.",
    ],
  },
  "Locs": {
    label: "Locs",
    category: "loc",
    maxWearWeeks: null,
    refreshWeeks: 4,
    playbook: [
      "Locs are a long-term commitment, not a temporary install. Retightening rhythm is typically every 4–6 weeks, and the manuscript is clear that aggressive interlocking or parts too small to support the weight causes the same follicle damage as tight braids.",
      "Wash on a regular rhythm — locs should not go months unwashed. Diluted clarifying shampoo, thorough rinse, and a low-heat air-dry (a warm hood or the TT Heat Hat on a gentle setting) prevents mildew inside the loc.",
      "Weight and length: as locs grow, the pull on the roots increases. If the parts start feeling sore or the user sees the scalp visible at each part, weight is the driver — not the style itself.",
      "No heavy waxes or beeswax build-up products. They lock lint and residue into the shaft and are near-impossible to remove without stripping.",
    ],
  },
  "Wig / unit": {
    label: "Wig / unit",
    category: "extension-covering",
    maxWearWeeks: 6,
    refreshWeeks: 3,
    playbook: [
      "The natural hair underneath is the priority — the wig is just cover. If the braid-down base is scraped tight, or the wig comb grips the perimeter, the damage is happening under the wig where the user can't see it.",
      "Take the wig OFF at night. Continuous 24/7 wear traps sweat, product, and heat against the scalp and prevents any moisture reaching the hair below.",
      "The braid-down base needs a mid-install refresh. Every 2–3 weeks, take the wig off, spray a diluted leave-in and light oil onto the cornrows underneath, and rebraid any that have loosened. A full wash of the natural hair should happen at least every 4–6 weeks.",
      "Glue and long-term lace adhesive around the hairline are the biggest risk factor for edge loss. Any glue applied should be lifted the same day, never worn multiple days.",
      "Between installs, the natural hair needs recovery — a wash, a moisture-focused deep condition under the TT Heat Hat, and at least one wash cycle worn out (loose natural, twist-out) before the next install.",
    ],
  },
  "Weave": {
    label: "Weave",
    category: "extension-covering",
    maxWearWeeks: 8,
    refreshWeeks: 4,
    playbook: [
      "Sew-in weaves live longer than braids (6–8 weeks maximum) but the manuscript is direct that the natural hair underneath is still under tension the entire time — from the thread, the tightness of the cornrow base, and the weight of the wefts.",
      "Access to the scalp is the challenge. Diluted shampoo through the parts with a nozzle applicator, or a spray-in scalp cleanser, keeps folliculitis at bay. The user should never skip cleansing for the full install.",
      "Weight is the silent damage factor. Adding more wefts, longer wefts, or heavier hair increases pull on the braid-down. If the natural hair is fine or thinning, keep the weave short and light or choose a different style entirely.",
      "Takedown protocol: cut the thread carefully, unbraid slowly, detangle in slippery conditioner section by section, then a full moisture-focused deep condition under the TT Heat Hat before the next style. Expect the shed hair from the whole install to come out in one go — that is not breakage.",
    ],
  },
  "Wash and go": {
    label: "Wash and go",
    category: "worn-natural",
    maxWearWeeks: 1,
    refreshWeeks: 1,
    playbook: [
      "One of the lowest-manipulation styles the manuscript endorses — apply styler at wash, then let the hair rest practically untouched until the next wash.",
      "The design brief is: pack all the moisture in at wash day, seal it well, and touch the hair as little as possible between washes. Refresh sprays (water + leave-in) at the roots only, not the length.",
      "For high-porosity hair the wash-and-go can dry out fast — a moisture-focused deep condition under the TT Heat Hat every 2–3 wash days keeps the curl pattern springy for longer.",
      "Nightly pineapple + satin/silk bonnet preserves the curl definition and avoids friction on the length.",
      "This is where product consistency matters most: 3–4 wash cycles with the same leave-in and styler before judging whether it works. Switching products every wash is the biggest reason wash-and-gos 'stop working'.",
    ],
  },
  "Loose natural": {
    label: "Loose natural",
    category: "worn-natural",
    maxWearWeeks: null,
    refreshWeeks: null,
    playbook: [
      "Wearing the Afro in its natural state with a light leave-in or curl cream — the book names this as one of the lowest-manipulation, lowest-tension styles there is.",
      "The tradeoff is single-strand knots and tangle at the ends over the week. Nightly satin/silk bonnet or a loose pineapple keeps the length from friction.",
      "Detangle only when hair is wet and saturated with slippery conditioner. Dry-detangling loose natural hair is where most breakage happens.",
      "Ends need attention — a light seal (butter or oil) on the ends nightly reduces splits over time.",
    ],
  },
  "Twist-out": {
    label: "Twist-out",
    category: "protective-own-hair",
    maxWearWeeks: 1,
    refreshWeeks: 1,
    playbook: [
      "Twist-outs (and braid-outs) from the user's own hair, no extensions, no tight base tension — the book puts these firmly in the low-manipulation column.",
      "The twist set itself is where breakage happens if the hair isn't wet and slippery. Twist section by section on damp hair with a creamy styler, then take down gently after full air-dry.",
      "Pineapple + satin/silk bonnet at night. Re-twisting the front only (not the whole head) refreshes definition without daily manipulation.",
      "For a longer wear window, the initial set should be done on freshly deep-conditioned hair — the moisture has to last the whole 5–7 days.",
    ],
  },
  "Finger comb coils": {
    label: "Finger comb coils",
    category: "protective-own-hair",
    maxWearWeeks: 2,
    refreshWeeks: 1,
    playbook: [
      "Comb coils or finger coils from the user's own hair with a twisting cream or styling foam — another low-tension, low-manipulation option in the manuscript.",
      "Hair must be saturated with slippery conditioner or styler during the coiling — friction on dry hair is where the ends split.",
      "Nightly satin/silk bonnet, no re-manipulation. The set lasts 1–2 weeks; after that, re-wash and re-set rather than dry-recoiling.",
    ],
  },
  "Silk press": {
    label: "Silk press",
    category: "heat-styled",
    maxWearWeeks: 2,
    refreshWeeks: 1,
    playbook: [
      "The manuscript treats silk press as a high-manipulation, high-heat service — not everyday styling. Frequent silk pressing (more than 3–4 times a year on the same hair) is a common route to heat damage where the curl pattern no longer reverts.",
      "Never on hair that isn't fully clean, fully conditioned, and fully dry before the flat iron touches it. Water on hot metal is what causes bubble breakage.",
      "Iron temperature: the lowest setting that will get the job done. Coarser strands tolerate more heat than fine strands; heat-damaged hair tolerates none.",
      "Between silk presses the hair needs a moisture reset: at least one full wash cycle worn curly, and a moisture-focused deep condition under the TT Heat Hat, before the next straight style.",
      "The single biggest silk-press mistake is stretching the wear window with more heat — dry flat-ironing to 'freshen it up' 5 days in is heat-damage territory. If it looks tired, wash and go back to curly.",
    ],
  },
  "Relaxed": {
    label: "Relaxed",
    category: "chemical-relaxed",
    maxWearWeeks: null,
    refreshWeeks: 8,
    playbook: [
      "Relaxed hair is chemically weakened — the disulfide bonds that give afro-textured hair its structure have been broken. The manuscript treats relaxed hair as a service the user is choosing, not as neutral styling, and the care shifts accordingly.",
      "Never overlap a relaxer onto previously-relaxed hair. Touch-ups at 8–12 weeks on the new growth ONLY, and only when the scalp is intact — no scratching, no scabs, no active irritation in the days before.",
      "Moisture retention is the whole game. Relaxed hair is more porous and more prone to breakage — a moisture-focused deep condition under the TT Heat Hat on a regular rhythm is the baseline, not an occasional treat.",
      "Combining relaxer with colour or heat straightening on the same head compounds damage exponentially. If the user is doing both, the priority is spacing them out and keeping the strand hydrated between services.",
      "Ends are the oldest, weakest part. Trim regularly — held-onto damaged ends are what makes relaxed hair look thin and stringy.",
    ],
  },
  "Curly perm": {
    label: "Curly perm",
    category: "chemical-curly",
    maxWearWeeks: null,
    refreshWeeks: 8,
    playbook: [
      "A curly perm (texturiser / Jheri / soft curl) is a chemical service that reshapes the curl pattern. Like a relaxer, the disulfide bonds have been rearranged and the strand is more porous and more fragile than virgin hair.",
      "Never overlap the chemical onto previously-treated hair. Refresh on new growth only.",
      "Moisture and slip are the daily practice — curl activators, leave-in mist, a moisture-focused deep condition under the TT Heat Hat on a regular rhythm.",
      "Do not layer heat straightening on top of a curly perm. That combination is where the pattern permanently loosens and breakage sets in.",
    ],
  },
};

/** Case-insensitive lookup that tolerates minor label variation. */
function lookupPlaybook(style: string | null | undefined): StylePlaybookEntry | null {
  if (!style) return null;
  const norm = style.trim().toLowerCase();
  for (const key of Object.keys(PLAYBOOK)) {
    if (key.toLowerCase() === norm) return PLAYBOOK[key];
  }
  // Loose matches for common phrasings the user might type in freeform fields.
  if (/\bbraid/.test(norm)) return PLAYBOOK["Box braids"];
  if (/\bfaux/.test(norm)) return PLAYBOOK["Faux locs"];
  if (/\bcornrow/.test(norm)) return PLAYBOOK["Cornrows"];
  if (/\bloc/.test(norm) && !/faux/.test(norm)) return PLAYBOOK["Locs"];
  if (/\bwig|unit\b/.test(norm)) return PLAYBOOK["Wig / unit"];
  if (/\bweave|sew[- ]?in\b/.test(norm)) return PLAYBOOK["Weave"];
  if (/\bwash[- ]?and[- ]?go|\bwng\b/.test(norm)) return PLAYBOOK["Wash and go"];
  if (/\bloose\b|\bafro\b/.test(norm)) return PLAYBOOK["Loose natural"];
  if (/\btwist[- ]?out\b/.test(norm)) return PLAYBOOK["Twist-out"];
  if (/\bcoil/.test(norm)) return PLAYBOOK["Finger comb coils"];
  if (/silk press|blow[- ]?out|straighten/.test(norm)) return PLAYBOOK["Silk press"];
  if (/relax/.test(norm)) return PLAYBOOK["Relaxed"];
  if (/curly perm|texturi[sz]er|jheri/.test(norm)) return PLAYBOOK["Curly perm"];
  return null;
}

/** Return a status line describing how long the user has been in this
 *  style relative to the manuscript's recommended wear window. */
function wearStatus(entry: StylePlaybookEntry, daysInStyle: number | null): string {
  if (daysInStyle == null) return "";
  const weeks = Math.floor(daysInStyle / 7);
  const max = entry.maxWearWeeks;
  if (max == null) {
    return `TIME IN STYLE: ${daysInStyle} days (~${weeks} weeks). This style has no hard wear ceiling — care rhythm is what matters, not takedown timing.`;
  }
  if (weeks >= max) {
    return `TIME IN STYLE: ${daysInStyle} days (~${weeks} weeks). This is AT OR PAST the ${max}-week ceiling — the priority conversation right now is takedown and recovery, not extension. Do not suggest keeping this style in longer.`;
  }
  if (entry.refreshWeeks != null && weeks >= entry.refreshWeeks) {
    return `TIME IN STYLE: ${daysInStyle} days (~${weeks} weeks). Approaching the ${max}-week ceiling. Actively plan takedown within the next 1–2 weeks — do not push past ${max} weeks.`;
  }
  return `TIME IN STYLE: ${daysInStyle} days (~${weeks} weeks). Comfortably inside the ${max}-week wear window. Focus is on scalp cleansing, moisture, and tension right now — not takedown yet.`;
}

/** Render the personalised system-prompt block. Returns an empty string
 *  when there is no current style to anchor the guidance to. */
export function buildStylePlaybookBlock(args: {
  current_hairstyle?: string | null;
  planned_next_style?: string | null;
  days_in_style?: number | null;
}): string {
  const current = lookupPlaybook(args.current_hairstyle ?? null);
  const planned = lookupPlaybook(args.planned_next_style ?? null);
  if (!current && !planned) return "";

  const lines: string[] = ["STYLE PLAYBOOK — MANUSCRIPT-DERIVED, PERSONAL TO THIS USER"];
  lines.push(
    "The following protocols are drawn directly from How To Love Your Afro's styling chapters. When your advice touches wash-day, heat, scalp, tension, product choice, or takedown, it MUST reason from this playbook. Do not invent a different wear window or contradict any protocol below. Never name the manuscript or chapters in your output.",
  );

  if (current) {
    lines.push("");
    lines.push(`CURRENT STYLE: ${current.label} (${current.category.replace(/-/g, " ")})`);
    const status = wearStatus(current, args.days_in_style ?? null);
    if (status) lines.push(status);
    lines.push("Protocol:");
    for (const line of current.playbook) lines.push(`- ${line}`);
  }

  if (planned && planned.label !== current?.label) {
    lines.push("");
    lines.push(`PLANNED NEXT STYLE: ${planned.label} (${planned.category.replace(/-/g, " ")})`);
    lines.push("Transition guidance:");
    for (const line of planned.playbook.slice(0, 3)) lines.push(`- ${line}`);
    lines.push(
      "- Between the current style and the next one, the priority is recovery: an extended detangling session in slippery conditioner, a moisture-focused deep condition under the TT Heat Hat, and at least one wash worn out (loose natural, twist-out, or wash-and-go) before the new install goes in.",
    );
  }

  lines.push("");
  lines.push(
    "WHEN THE USER'S BLOODWORK OR HEALTH SIGNALS ARE FLAGGED (low ferritin, low vitamin D, thyroid out of range, high-stress life stage), the style playbook still holds — but the framing shifts. Traction on a stressed follicle recovers slower; moisture demand goes up; and the ceiling on high-tension installs comes DOWN, not up. Say so directly when it applies.",
  );
  lines.push(
    "WHEN THE USER'S GOAL is length retention, the highest-leverage moves in the playbook are: staying inside the wear ceiling, keeping the base tension low, protecting the ends throughout the install, and the recovery protocol between styles — not a new product.",
  );

  return lines.join("\n");
}
