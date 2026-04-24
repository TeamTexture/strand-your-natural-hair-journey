// Curated UK hair-care professionals — sourced from Paige Lewin's
// "Recommended Dermatologists & Trichologists (UK)" cheat sheet.
// Used by the Professionals directory and the onboarding ProBook screen.

export type ProType = "Trichologist" | "Dermatologist" | "Curl Specialist";

export interface Professional {
  id: string;
  emoji: string;
  name: string;
  title: string;
  type: ProType;
  verified: string;
  clinic: string;
  location: string;
  specs: string[];
  bio: string;
  insta: string;
  instaUrl: string;
  website: string;
  bookCode: string;
  discount: string;
  /** Featured = surfaced on the onboarding "Recommended" screen. */
  featured?: boolean;
}

export const PROFESSIONALS: Professional[] = [
  // ───────────── Trichologists ─────────────
  {
    id: "fulham-scalp-hair",
    emoji: "🏥",
    name: "Teresa & Eleanor Richardson",
    title: "Certified Trichologists",
    type: "Trichologist",
    verified: "IOT Verified",
    clinic: "Fulham Scalp & Hair Clinic",
    location: "Fulham, London",
    specs: ["Afro Hair", "Hair Loss", "Scalp Health", "Traction Alopecia", "Electrotherapy"],
    bio:
      "Mother–daughter team of certified trichologists, founded 2011. Specialists in Afro and curly textured hair, known for honest, in-depth diagnosis and in-house scalp treatments using electrotherapy, infra-red and steaming. Featured in Texture Talks Season 2.",
    insta: "@fulhamscalpandhairclinic",
    instaUrl: "https://www.instagram.com/fulhamscalpandhairclinic/",
    website: "https://www.fulhamscalpandhair.com",
    bookCode: "STRAND15",
    discount: "STRAND15 — 15% off first consultation",
    featured: true,
  },
  {
    id: "spencer-clinic",
    emoji: "🏥",
    name: "Samantha Stewart",
    title: "Certified Trichologist",
    type: "Trichologist",
    verified: "IOT Verified",
    clinic: "The Spencer Clinic",
    location: "London",
    specs: ["Afro Hair", "Relaxers", "Scalp Stimulation", "Cultural Styling", "Hair Loss"],
    bio:
      "Operating since the 1950s, The Spencer Clinic is one of London's most trusted hair and scalp clinics. Samantha Stewart is a certified trichologist and Afro hair specialist who deeply understands cultural styling practices. Featured in Texture Talks Season 1.",
    insta: "@thespencerclinic",
    instaUrl: "https://www.instagram.com/thespencerclinic/",
    website: "https://www.thespencerclinic.co.uk",
    bookCode: "STRAND10",
    discount: "STRAND10 — 10% off consultation",
  },
  {
    id: "healthy-hair-studio",
    emoji: "🏥",
    name: "Enitan Agidee",
    title: "Clinical Trichologist · Afro Hair Coach",
    type: "Trichologist",
    verified: "IOT Verified",
    clinic: "Healthy Hair Studio by Enitan",
    location: "Hammersmith (W6), London",
    specs: ["Afro Hair", "Scalp Concerns", "Hair Care Plans", "Texlaxing", "Education"],
    bio:
      "The UK's first Afro Hair Coach and a qualified clinical trichologist. Founded 2014. Combines science with personalised care — from trichology consults and follow-ups to chemical treatments and a curated product shop. Featured in Texture Talks Season 1.",
    insta: "@healthyhairstudio",
    instaUrl: "https://www.instagram.com/healthyhairstudio/",
    website: "https://www.healthyhairstudio.co.uk",
    bookCode: "STRAND10",
    discount: "STRAND10 — 10% off first session",
  },

  // ───────────── Dermatologists ─────────────
  {
    id: "dr-eve-skin",
    emoji: "⚕️",
    name: "Dr Yvonne Abimbola",
    title: "Doctor-led Dermatology · BSc, MBBS, MRCGP, PGDip Derm",
    type: "Dermatologist",
    verified: "GMC Verified",
    clinic: "Dr Eve Skin",
    location: "Woolwich, South London",
    specs: ["Skin of Colour", "Scalp Dermatology", "Hair Loss", "Trichoscopy", "Chemical Peels"],
    bio:
      "CQC-registered, doctor-led clinic celebrating skin of colour. Long evidence-based consultations covering skin, hair and scalp, with trichologist Asha Downes (MSc) and aesthetic doctor Dr Azin Amin on the team. Paige's current dermatologist.",
    insta: "@dreveskin",
    instaUrl: "https://www.instagram.com/dreveskin/",
    website: "https://www.dreveskin.co.uk",
    bookCode: "STRAND20",
    discount: "STRAND20 — £20 off first assessment",
    featured: true,
  },
  {
    id: "dr-emma-amoafo-mensah",
    emoji: "⚕️",
    name: "Dr Emma Amoafo-Mensah",
    title: "Consultant Dermatologist",
    type: "Dermatologist",
    verified: "GMC Verified",
    clinic: "LIPS Healthcare, Battersea Power Station",
    location: "Battersea, London",
    specs: ["Skin of Colour", "Hair Loss", "Medical Education", "Mentorship", "General Dermatology"],
    bio:
      "Imperial College London trained (first-class intercalated degree). Consultant dermatologist blending clinical rigour with warmth, active in education and founder of not-for-profit House of Medics supporting under-represented health students.",
    insta: "@dr.emma.dermatology",
    instaUrl: "https://www.instagram.com/dr.emma.dermatology/",
    website: "https://www.lipshealthcare.com",
    bookCode: "STRAND10",
    discount: "STRAND10 — 10% off consultation",
  },
  {
    id: "dr-sharon-belmo",
    emoji: "⚕️",
    name: "Dr Sharon Belmo",
    title: "Consultant Dermatologist · Harley Street",
    type: "Dermatologist",
    verified: "GMC Verified",
    clinic: "Harley Street, London",
    location: "Harley Street, London",
    specs: ["Skin of Colour", "CCCA", "Traction Alopecia", "Keloids", "Hyperpigmentation"],
    bio:
      "Leading expert in skin of colour and Afro-textured hair loss. UK-trained with an ethnic skin and hair observership in Paris, plus 10+ years NHS experience. In 2021 pioneered the UK's first dermatology syllabus focused on skin of colour.",
    insta: "@drsharonbelmo",
    instaUrl: "https://www.instagram.com/drsharonbelmo/",
    website: "https://www.drsharonbelmo.com",
    bookCode: "STRAND10",
    discount: "STRAND10 — 10% off consultation",
  },
];

/** Filter helper used by the Directory and ProBook screens. */
export function searchProfessionals(query: string, type?: ProType | "All"): Professional[] {
  const q = query.trim().toLowerCase();
  return PROFESSIONALS.filter((p) => {
    if (type && type !== "All" && p.type !== type) return false;
    if (!q) return true;
    const haystack = [
      p.name, p.title, p.clinic, p.location, p.bio, p.insta, ...p.specs,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
