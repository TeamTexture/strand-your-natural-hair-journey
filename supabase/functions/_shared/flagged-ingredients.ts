// FREQUENTLY-OWNED INGREDIENTS — WHAT history.flagged_ingredients ACTUALLY MEANS
//
// An ingredient lands in the member's ingredient list (list_kind = 'flag')
// purely because it appears in 3 or more of her saved products. It is a
// FREQUENCY COUNT of what she already owns and already uses — nothing more.
// It is not a warning, not an allergy, not an intolerance, not a bad
// ingredient, and not something she has asked to avoid.
//
// Real allergies, sensitivities and intolerances come from the separate
// allergy/sensitivity capture (see _shared/topical-sensitivity.ts). Those are
// the only ingredients that may ever be treated as something to avoid.
//
// Appended at the END of the system/task prompts of every AI function that
// receives ingredient context — the same stable tail position as
// NON_PRESCRIPTIVE_RULES and STYLE_WEIGHTING_RULES, so the cached prompt
// suffix is preserved.

export const FLAGGED_INGREDIENTS_RULES =
  `FREQUENTLY-OWNED INGREDIENTS — HOW history.flagged_ingredients MUST BE READ:
DEFINITION: an ingredient appears in this list only because it appears in 3 or more of the products she has saved. It is a frequency count of what she already owns and already uses. That is the whole meaning.

IT CARRIES NO JUDGEMENT. It says nothing about safety, quality or suitability. It is NOT a risk, NOT a concern, NOT a red flag, NOT something to watch, NOT something to avoid, and NEVER a reason a product is a worse pick.

BANNED in member-facing copy about these ingredients: the words "flagged", "flag", "risk", "higher-risk", "avoid", "watch out", "concern", "caution", "warning". Never write anything like "three ingredients consistently flagged in your history all appear in this formula, making it a higher-risk pick".
PREFERRED PLAIN FRAMING: "cetearyl alcohol appears in four of the products on your shelf", "you already use panthenol regularly", "this repeats the conditioning agents you already own".

SCORING: frequency must NEVER lower a match score, and never raise one either. It is not a fit signal in either direction. Do not list it as a score factor, a con, a concern or a negative. Do not give it a warning or alert icon, and never place it under a negative heading. If a frequency point appears in key_ingredients, its flag is "good" or "warn" on the ingredient's own chemistry alone — never "avoid" because of the count.

LEGITIMATE USES — worked examples:
• Consistent exposure: "Cetearyl alcohol appears in four products on your shelf, so your hair is already used to this kind of fatty-alcohol conditioning."
• Genuine cumulative build-up, ONLY where the ingredient's real chemistry supports it and the point is made about the ingredient's properties — never about the fact it was counted: "Cetrimonium chloride is a cationic conditioner that binds to the cuticle and doesn't rinse away completely, so if your hair starts feeling coated a gentle clarifying wash will reset it." Never: "you have three flagged ingredients, so expect build-up."
• Duplication: "This formula repeats the humectants you already own, so it may not add anything new to your shelf."

ALLERGIES AND SENSITIVITIES ARE A DIFFERENT DATASET. Only the member's declared topical sensitivities (and documented allergies/diagnoses in her health profile) may be treated as something to avoid, and those keep their direct, explicit treatment. Never conflate the two, and never describe a frequently-owned ingredient in sensitivity language.

LENGTH: this is an interpretation rule, not permission to write more. Keep every field within its existing word budget.`;
