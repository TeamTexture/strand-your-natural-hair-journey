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
  /** Optional direct booking URL — opens in new tab when present. */
  bookingUrl?: string;
  /** Featured = surfaced on the onboarding "Recommended" screen. */
  featured?: boolean;
  /** Optional headshot URL (square). When absent, initials avatar is used. */
  photoUrl?: string;
  /** GMC number (Dermatologists / GPs) — auto-filled in ProDetails when picked. */
  gmcNumber?: string;
  /** IOT membership number (Trichologists) — auto-filled in ProDetails when picked. */
  iotNumber?: string;
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
    iotNumber: "1247",
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
    website: "https://www.dreveskin.com/",
    bookingUrl: "https://www.dreveskin.com/",
    bookCode: "STRAND20",
    discount: "STRAND20 — £20 off first assessment",
    featured: true,
    gmcNumber: "7053519",
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

  // ───────────── Curl Specialists, Salons & Stylists ─────────────
  // Sourced from Paige Lewin's "Hair Care Professionals" cheat sheet.
  // Default discount code STRAND10 unless otherwise specified.
  ...([
    // ── LONDON ──
    ["the-muse-salon", "✂️", "The Muse Salon", "Textured hair salon for curls, kinks, waves & coils", "London", "themusesalon", ["Curls", "Kinks", "Waves", "Coils", "Textured Hair"]],
    ["erica-liburd", "✂️", "Erica Liburd", "Natural & textured hair specialist · Educator (The Muse Salon)", "London", "ericaliburdofficial", ["Natural Hair", "Textured Hair", "Education", "Curl Assessment"]],
    ["tribe-salons", "✂️", "Tribe Salons", "Inclusive textured hair salon", "London", "tribesalons", ["Textured Hair", "Inclusive", "Curls", "Coils"]],
    ["anneliese-hesse", "🏥", "Anneliese Hesse", "Certified Trichologist · Curl, Coil & Wave Specialist · Colourist · Educator", "London", "anneliese_hesse", ["Trichology", "Curls", "Coils", "Waves", "Colour", "Education"], "Trichologist", "IOT Verified"],
    ["texture-salon-london", "✂️", "Texture Salon London", "Curly, coily and wavy salon", "London", "texturesalonlondon", ["Curly", "Coily", "Wavy"]],
    ["hair-by-floria", "✂️", "Hair by Floria", "Curly & coily hair stylist (Texture Salon London)", "London", "hairbyfloria", ["Curly Hair", "Coily Hair", "Styling"]],
    ["originally-dee-hair", "✂️", "Originally Dee Hair", "Afro & textured hair specialist (Texture Salon London)", "London", "originallydeehair", ["Afro Hair", "Textured Hair"]],
    ["hair-by-trina-london", "✂️", "Hair by Trina London", "Curl & textured hair specialist (Texture Salon London)", "London", "hairbytrinalondon", ["Curls", "Textured Hair"]],
    ["yonkel-c-slays-hair", "✂️", "Yonkel C Slays Hair", "Textured hair stylist (Texture Salon London)", "London", "yonkelcslayshair", ["Textured Hair", "Styling"]],
    ["blue-tit-london", "✂️", "Blue Tit London", "Textured hair & curl specialist", "London", "bluetitlondon", ["Textured Hair", "Curls"]],
    ["pash-canel", "✂️", "Pash Canel", "Textured hair stylist (Blue Tit London)", "London", "pashcanel", ["Textured Hair", "Styling"]],
    ["cille-hebsi", "✂️", "Cille", "All textures & lengths (Blue Tit London)", "London", "cillhebsi", ["All Textures", "All Lengths"]],
    ["natural-hair-loc-bar", "✂️", "Natural Hair & Loc Bar", "Locs and natural hair specialist", "London", "naturalhairandlocbar", ["Locs", "Natural Hair"]],
    ["ama-hair-salon", "✂️", "Ama Hair Salon", "Afro and textured hair salon", "London", "amahairsalon", ["Afro Hair", "Textured Hair"]],
    ["simply-g-hair", "✂️", "Simply G Hair", "Curly & coily hair specialist", "London", "simplyg_hair", ["Curly Hair", "Coily Hair"]],
    ["entwined-curls", "✂️", "Entwined Curls", "Curly & coily hair specialist", "London", "entwined.curls", ["Curly Hair", "Coily Hair"]],
    ["the-curl-clinic", "✂️", "The Curl Clinic", "Curly & coily hair treatments and care", "London", "thecurlclinic", ["Curls", "Coils", "Treatments"]],
    ["moiso-london", "✂️", "Moïso London", "Textured hair salon", "London", "moiso_london", ["Textured Hair"]],
    ["purely-natural-salon", "✂️", "Purely Natural Salon", "Afro & mixed-texture salon in Stratford", "Stratford, London", "purelynaturalsalon", ["Afro Hair", "Mixed Texture"]],
    ["the-curl-bar-london", "✂️", "The Curl Bar London", "Curls, coils and waves", "London", "thecurlbarlondon", ["Curls", "Coils", "Waves"]],
    ["claire-the-curl-therapist", "✂️", "Claire the Curl Therapist", "Curl therapy & textured hair treatments", "London", "claire_the_curl_therapist", ["Curl Therapy", "Treatments"]],
    ["boombastic-braids", "✂️", "Boombastic Braids", "Braids and protective styles", "London", "boombasticbraids", ["Braids", "Protective Styles"]],
    ["dolly-curls", "✂️", "Dolly Curls", "Curly hair specialist", "London", "dolly_curls", ["Curly Hair"]],
    ["jdv-hair", "✂️", "JDV Hair", "Textured hair stylist", "London", "jdv_hair", ["Textured Hair"]],
    ["curl-talk", "✂️", "Curl Talk", "Curly hair community & specialist styling", "London", "curl.talk", ["Curly Hair", "Community"]],
    ["zateesha-hairstylist", "✂️", "Zateesha Hairstylist", "Natural & textured hair stylist", "London", "zateeshahairstylist", ["Natural Hair", "Textured Hair"]],
    ["hype-coiffure-salon", "✂️", "Hype Coiffure Salon", "Afro hair salon", "London", "hypecoiffureuk", ["Afro Hair", "Salon"]],
    ["aminata-creative", "✂️", "Aminata Creative", "Creative hairstylist for textured hair", "London", "aminatacreative", ["Textured Hair", "Creative Styling"]],
    ["afro-hair-coach", "✂️", "Afro Hair Coach", "Hair health educator and textured hair expert", "London", "afrohaircoach", ["Hair Health", "Education", "Textured Hair"]],
    ["nicola-harrowell", "✂️", "Nicola Harrowell", "Textured hair stylist", "London", "nicola_harrowell", ["Textured Hair"]],
    ["shout-at-ishas-hair", "✂️", "Shout at Isha's Hair", "Textured hair treatments and styling", "London", "shoutatishashair", ["Textured Hair", "Treatments"]],
    ["devine-rootz", "✂️", "Devine Rootz", "Scalp and textured hair specialist", "London", "devinerootz", ["Scalp", "Textured Hair"]],
    ["casey-styles", "✂️", "Casey Styles", "Curl and wave stylist", "London", "iamcaseystyles", ["Curls", "Waves"]],
    ["hair-by-laura-lyn-clinton", "✂️", "Hair by Laura Lyn Clinton", "Textured hair styling and treatments", "London", "hairbylauralynclintonlondon", ["Textured Hair", "Treatments"]],
    ["the-natural-hair-whisperer", "✂️", "The Natural Hair Whisperer", "Natural hair care and styling specialist", "London", "thenaturalhairwhisperer", ["Natural Hair", "Styling"]],

    // ── MANCHESTER ──
    ["hair-king-callum", "✂️", "Hair King Callum (Callum Ashley Townsend)", "Curl artisan & inclusive textured hair expert", "Manchester", "hairkingcallum", ["Curls", "Textured Hair", "Inclusive"]],
    ["curly-gal-chloe-salon", "✂️", "Curly Gal Chloe Salon", "Curly & coily hair specialist", "Manchester", "curlygalchlosalon", ["Curly Hair", "Coily Hair"]],

    // ── LEEDS ──
    ["the-curl-therapist-leeds", "✂️", "The Curl Therapist", "Curly specialist", "Leeds", "the_curltherapist", ["Curly Hair", "Curl Therapy"]],

    // ── WEST MIDLANDS ──
    ["yasmine-byfield-hair", "✂️", "Yasmine Byfield Hair", "Specialist in naturally wavy, curly & coily hair", "West Midlands", "yasminebyfieldhair", ["Wavy", "Curly", "Coily"]],

    // ── BOURNEMOUTH ──
    ["curl-specialist-bournemouth", "✂️", "Curl Specialist Bournemouth", "Curly & coily hair expert", "Bournemouth", "curlspecialistbournemouth", ["Curly Hair", "Coily Hair"]],

    // ── BRISTOL ──
    ["bristol-loc", "✂️", "Bristol Loc", "Locs & textured hair specialist", "Bristol", "bristol_loc", ["Locs", "Textured Hair"]],
    ["gaudi-hair", "✂️", "Gaudi Hair", "Textured hair salon", "Bristol", "gaudihair", ["Textured Hair"]],

    // ── SCOTLAND ──
    ["the-curly-scott", "✂️", "The Curly Scott", "Curly & coily texture specialist", "Scotland", "thecurlyscott", ["Curly Hair", "Coily Hair"]],
  ] as Array<[string, string, string, string, string, string, string[], ProType?, string?]>).map(
    ([id, emoji, name, title, location, instaHandle, specs, type, verified]) => ({
      id,
      emoji,
      name,
      title,
      type: (type ?? "Curl Specialist") as ProType,
      verified: verified ?? "Specialist",
      clinic: name,
      location,
      specs,
      bio: `${title}. Based in ${location}. Recommended in Paige Lewin's UK Hair Care Professionals guide.`,
      insta: `@${instaHandle}`,
      instaUrl: `https://www.instagram.com/${instaHandle}/`,
      website: `https://www.instagram.com/${instaHandle}/`,
      bookCode: "STRAND10",
      discount: "STRAND10 — 10% off first booking",
    }),
  ),
];

/** Search any list of professionals by name, clinic, postcode, location, bio, or specialism. */
export function searchProfessionalsIn(
  list: Professional[],
  query: string,
  type?: ProType | "All",
): Professional[] {
  const q = query.trim().toLowerCase();
  return list.filter((p) => {
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

/** Filter helper used by the Directory and ProBook screens (static catalogue). */
export function searchProfessionals(query: string, type?: ProType | "All"): Professional[] {
  return searchProfessionalsIn(PROFESSIONALS, query, type);
}
