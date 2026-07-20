// Removes absolute date references from AI-generated wash-day insights so they
// stay accurate when the user later edits `wash_date`. Insights are generated
// once at save time — if we let hardcoded dates like "June 28" leak into the
// UI, they contradict the wash day's actual date after any edit.
const MONTHS =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
const WEEKDAYS = "(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)[a-z]*";

export function stripStaleDates(input: string): string {
  if (!input) return input;
  return input
    .replace(
      new RegExp(
        `\\b(on|by|for|until|before|after|around|circa)?\\s*${WEEKDAYS}(,)?\\s*(the\\s+)?\\d{1,2}(st|nd|rd|th)?\\s*(of\\s+)?${MONTHS}(\\s+\\d{2,4})?`,
        "gi",
      ),
      "on your next wash day",
    )
    .replace(
      new RegExp(
        `\\b(on|by|for|until|before|after|around|circa)?\\s*${WEEKDAYS}(,)?\\s*${MONTHS}\\s*\\d{1,2}(st|nd|rd|th)?(,?\\s*\\d{2,4})?`,
        "gi",
      ),
      "on your next wash day",
    )
    .replace(
      new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(st|nd|rd|th)?(,?\\s*\\d{2,4})?\\b`, "gi"),
      "your next wash day",
    )
    .replace(
      new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(of\\s+)?${MONTHS}(\\s+\\d{2,4})?\\b`, "gi"),
      "your next wash day",
    )
    .replace(new RegExp(`\\b(this|next|by|on|come)\\s+${WEEKDAYS}\\b`, "gi"), "on your next wash day")
    .replace(/\s+/g, " ")
    .replace(/(on your next wash day)(\s+\1)+/gi, "$1")
    .replace(/(your next wash day)(\s+\1)+/gi, "$1")
    .trim();
}
