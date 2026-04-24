// Mock journal entries used by both the list and detail screens.
// These are display-only; voicenotes attached to an entry are persisted
// via ProductVoicenotes using the key `journal:<id>`.

export interface JournalEntry {
  id: string;
  gradient: string;
  emoji: string;
  date: string;
  title: string;
  note: string;
  productKeys?: string[]; // references to keys in src/pages/Products.tsx
}

export const journalEntries: JournalEntry[] = [
  {
    id: "wash-go-day1",
    gradient: "from-[#C8B89A] to-[#D4B96A]",
    emoji: "🌿",
    date: "14 Apr 2026",
    title: "Wash & Go — Day 1",
    note: "Best curl definition I have had. Camille Rose gel first time.",
    productKeys: ["camille-rose-moisture-retention", "mielle-scalp-serum"],
  },
  {
    id: "twist-out-day3",
    gradient: "from-[#D4AA52] to-[#C49A3C]",
    emoji: "✨",
    date: "2 Apr 2026",
    title: "Twist Out — Day 3",
    note: "Frizzy by midday. Humidity + no sealant = lesson learned.",
    productKeys: ["briogeo-honey-whip"],
  },
];

export const getJournalEntry = (id: string) =>
  journalEntries.find((e) => e.id === id);
