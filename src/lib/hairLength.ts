// Shared hair length buckets for afro/curly-haired users.
//
// These ranges describe the STRETCHED (pulled-straight) length in inches — the
// only fair way to measure highly-textured hair, because coils shrink 40–75%
// when dry and unstretched. Wardle et al.'s trichology literature and Andre
// Walker's typing system both note that Type 3–4 hair loses roughly half its
// visible length to shrinkage; a chin-grazing coil can pull down to shoulder.
// The bucket boundaries below use published averages for a 5'5" adult, so a
// user can eyeball where their hair reaches when pulled taut against the head.

export interface HairLengthBucket {
  key: string;
  label: string;
  guide: string;         // where it falls when pulled straight
  minIn: number;
  maxIn: number;         // upper bound (exclusive) — Infinity for the last one
}

export const HAIR_LENGTH_BUCKETS: HairLengthBucket[] = [
  { key: "twa",       label: "TWA / Above the ears", guide: "Pulled straight, hair sits above the top of the ears",  minIn: 1,  maxIn: 3 },
  { key: "ear",       label: "Ear length",            guide: "Reaches around the middle of the ear when stretched",   minIn: 3,  maxIn: 6 },
  { key: "chin",      label: "Chin length",           guide: "Reaches the chin / jawline when stretched",             minIn: 6,  maxIn: 10 },
  { key: "shoulder",  label: "Shoulder length",       guide: "Grazes the tops of the shoulders when stretched",       minIn: 10, maxIn: 14 },
  { key: "armpit",    label: "Armpit length (APL)",   guide: "Reaches the underarms when stretched",                  minIn: 14, maxIn: 18 },
  { key: "midback",   label: "Mid-back length (MBL)", guide: "Reaches the middle of the back when stretched",         minIn: 18, maxIn: 22 },
  { key: "waist",     label: "Waist length",          guide: "Reaches the natural waistline when stretched",          minIn: 22, maxIn: 28 },
  { key: "hip",       label: "Hip / tailbone",        guide: "Reaches the hips or lower when stretched",              minIn: 28, maxIn: Infinity },
];

export function bucketFromInches(inches: number | null | undefined): string | null {
  if (inches == null || !Number.isFinite(inches) || inches <= 0) return null;
  const b = HAIR_LENGTH_BUCKETS.find((x) => inches >= x.minIn && inches < x.maxIn);
  return b?.label ?? null;
}

export function bucketByLabel(label: string | null | undefined): HairLengthBucket | null {
  if (!label) return null;
  return HAIR_LENGTH_BUCKETS.find((b) => b.label === label) ?? null;
}
