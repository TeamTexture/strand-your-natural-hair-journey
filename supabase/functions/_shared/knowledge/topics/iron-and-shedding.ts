import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript,,
// "Diet and Nutrition" section, pp 112–116. Iron, ferritin, protein,
// haemoglobin → oxygen → follicle. Includes Dr Yvonne Abimbola's expert
// note on ferritin as the marker of stored iron.

export const IRON_AND_SHEDDING: Topic = {
 id: "iron-and-shedding",
 title: "Iron, Ferritin and Hair Shedding",
 body: `Iron is a vital component of haemoglobin — the protein in red blood cells that carries oxygen throughout the body. That oxygen delivery is essential for numerous bodily functions, including hair growth. Iron is also involved in cell repair, including in the hair follicles. A sufficient iron supply ensures the proper division of follicle cells, promoting healthy hair growth. When the body doesn't have enough iron, it can lead to iron deficiency, which may cause various symptoms, including hair loss.

Ferritin is the marker of stored iron. It's a protein in which iron is stored for future use, especially when circulating iron drops. Ferritin represents around 25 per cent of total body iron. Depletion of stores directly impacts bodily functions, causing symptoms such as lethargy and hair loss (Dr Yvonne Abimbola, GP and certified dermatologist, founder of Dr Eve Skin). While ferritin supplements exist, the manuscript is clear: consult your GP first to check your anaemia levels before supplementing.

This is why STRAND's Blood AI Summary treats low ferritin and low iron as different signals than just "low iron". Low ferritin can present even when circulating haemoglobin reads in range — the body has been dipping into stores, and that depletion can be the first thing to show up as shedding.

Food sources Paige names directly:

Animal-based iron (heme — more readily absorbed):
— Red meat: beef, lamb, pork
— Poultry: chicken, turkey
— Seafood: oysters, clams, mussels, sardines, tuna
— Eggs (also a complete protein source)

Plant-based iron (non-heme — less readily absorbed but enhanced by vitamin C):
— Legumes: lentils, chickpeas, kidney beans, soybeans
— Nuts and seeds: pumpkin seeds, chia seeds, flaxseeds
— Fortified cereals
— Dark leafy greens: spinach, kale, collard greens
— Dried fruits: apricots, raisins

The book's practical pairing tip: to enhance iron absorption from plant-based sources, consume them with vitamin-C-rich foods like citrus fruits, strawberries or peppers. Iron and vitamin C work together — that's why the nutrition plan can pair, for example, lentils with peppers in a single meal recommendation.

What this means for shedding:

— Hair growth is a non-essential process from the body's point of view. When protein or iron run low, the body prioritises essential functions and slows hair growth or causes shedding.

— Pattern matters. A varied diet ensures you get a spectrum of interacting nutrients — there isn't one miracle nutrient.

— Stay hydrated. Hair contains a significant amount of water; dehydration sends water to vital organs first and leaves the scalp and hair brittle and breakage-prone.

— Always confirm flagged ferritin or iron with a GP before changing supplementation.`,
 applies_to: {
 blood_markers: [
 "Ferritin",
 "ferritin",
 "Iron",
 "iron",
 "Haemoglobin",
 "Hemoglobin",
 "haemoglobin",
 "hemoglobin",
 "TIBC",
 "Transferrin",
 "MCV",
 "MCH",
 ],
 function_kinds: [
 "blood-ai-summary",
 "nutrition-plan",
 "wash-day-observation",
 "ingredient-analysis",
 ],
 },
 book_refs: [
 {
 chapter: 8,
 chapter_title: "Your Hair – The Basics",
 page_start: 112,
 page_end: 116,
 },
 ],
 tags: [
 "iron",
 "ferritin",
 "anaemia",
 "shedding",
 "haemoglobin",
 "vitamin-c-pairing",
 "protein",
 "telogen-effluvium",
 ],
};
