import type { Topic } from "../types.ts";

// Sourced from How To Love Your Afro, Chapter 8: Your Hair – The Basics,
// pp 105–108 (anatomy, strand diameter / texture, surface texture, curl
// diameter, density). Strand diameter is often miscategorised as curl pattern.

export const HAIR_ARCHITECTURE: Topic = {
  id: "hair-architecture",
  title: "Hair Architecture — Density, Strand Diameter, Surface Texture",
  body: `Three different things, often confused for each other, all of which we need straight before any styling decision is going to make sense.

Strand diameter (often called "texture") is the thickness or width of your individual strands of hair, determined by the diameter of your hair follicle. The three main categories are fine, medium and coarse. Fine strands can be difficult to see or feel between your fingers. Coarse strands are thicker, more like a thick thread or floss. Most of us either have more than one texture on our scalps or sit somewhere in the middle of the spectrum rather than rigidly on one end. Understanding where your strands fall helps you select the right styling products to achieve your desired style.

Surface texture is different. It refers to how rough or smooth the outer surface of your hair strands feels between your fingers when you smooth from root to tip — irrespective of how fine or coarse the strands are. Surface texture ranges from rough and crinkly to silky and glassy, and it's determined genetically by how your cuticles lie on one another. Rougher textures have more raised cuticle scales; this is why some surface textures appear matte or dull even when the hair is healthy and hydrated. Silkier textures have flatter cuticles, which is why they look shiny — light bounces off uninterrupted surface area.

Curl diameter is the actual shape and size of your curls, kinks or waves — how your hair bends or coils. Most people have more than one curl pattern growing from their scalp. Any bend in a hair strand is considered a curl.

Density is the number of strands per square inch — how many follicles you have producing hair in a given area. Low density means you can see your scalp easily through the hair. Medium density means your scalp is covered but easy to part. High density means it's next to impossible to see your scalp through your hair.

Strand diameter and density confuse each other. Someone with fine strands might think they have low density because they can see their scalp, when actually they have a high number of thin strands — high density, fine strand. The reverse is also true: thick strands at low density can feel "full" because each individual strand takes up more space.

These three axes drive different decisions. Density tells you how much product you need and whether to section before working in a wash day routine. Strand diameter tells you what weight of product the hair can carry without being weighed down. Surface texture tells you what to expect from "shine" and whether matte appearance means dryness or just genetics.`,
  applies_to: {
    hair: {
      density: ["low", "medium", "high", "Low", "Medium", "High"],
    },
    function_kinds: [
      "ingredient-analysis",
      "product-analyse",
      "product-analyse-url",
      "wash-day-observation",
    ],
  },
  book_refs: [
    {
      chapter: 8,
      chapter_title: "Your Hair – The Basics",
      page_start: 105,
      page_end: 108,
    },
  ],
  tags: [
    "density",
    "strand-diameter",
    "surface-texture",
    "curl-pattern",
    "fine",
    "coarse",
    "anatomy",
  ],
};
