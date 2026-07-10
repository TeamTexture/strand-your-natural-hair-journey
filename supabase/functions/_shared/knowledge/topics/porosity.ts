import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript,,
// pp 109–110 ("Porosity"), p 120 ("Understanding porosity"). Paige's own
// phrasing carried over where it lands hardest.

export const POROSITY: Topic = {
 id: "porosity",
 title: "Porosity",
 body: `Porosity has been overhyped on the internet, and knowing your porosity isn't as important for day-to-day styling as many people would have you believe. Hair porosity is the ability of your hair strands to absorb water, and how it might react to chemical services such as colour, based on the condition and structure of your cuticle.

There are two main categories. Low-porosity hair has a tightly closed cuticle or several layers of cuticle scales — water struggles to get in, but once moisture is in, the hair holds onto it well. The challenge is the way in. High-porosity hair has fewer cuticle layers, raised or lifted from their flattened position; it absorbs moisture easily but loses it just as fast.

Most high-porosity hair is made externally. People with high-porosity hair are usually either people with naturally fine strands that have a thinner protective cuticle, or people who have over-manipulated, neglected or over-processed their hair — permanent dye, bleach, repeated chemical services. Paige's own Afro became highly porous from experimenting with too much permanent dye and bleach at home, leaving it unable to retain much moisture.

The flip side: people who believe they have low-porosity hair often don't. They're experiencing build-up on their hair strands that makes it harder for water to penetrate. Once the build-up is properly cleansed off, they often realise they don't have low-porosity hair at all. This is why correctly cleansing curls is so key — it changes what the hair can do.

Most people sit somewhere in the middle of the porosity spectrum. The idea that you are solidly either HIGH or LOW is a misconception (Anita Wilson, curl specialist). Most aren't naturally growing high-porosity hair unless they have an illness or medical condition, are taking certain medications, or are under medical treatment.

Practical implications:
— Low porosity benefits from warm water and gentle indirect heat during conditioning — the TT Heat Hat (www.teamtexture.co.uk) is the recommended tool for this. Avoid heavy proteins and butters that sit on the surface; they make build-up worse.
— High porosity benefits from sealing moisture in: deep conditioner first, then a leave-in plus a humectant or emollient while damp.
— If you're unsure: cleanse properly first, then assess. Build-up is the most common confounder.`,
 applies_to: {
 hair: { porosity: ["low", "high", "Low — tightly closed cuticle", "High — raised cuticle"] },
 function_kinds: [
 "ingredient-analysis",
 "product-analyse",
 "product-analyse-url",
 "wash-day-observation",
 "heat-treatment-rationale",
 ],
 },
 book_refs: [
 {
 chapter: 8,
 chapter_title: "Your Hair – The Basics",
 page_start: 109,
 page_end: 120,
 },
 ],
 tags: ["porosity", "cuticle", "moisture", "build-up", "low-porosity", "high-porosity"],
};
