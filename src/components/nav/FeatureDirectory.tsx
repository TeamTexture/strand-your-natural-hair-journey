// EVERYTHING IN STRAND — the single feature directory.
//
// Home deliberately shows only a handful of cards, so this is the place every
// feature stays reachable from. It lives inside the existing hamburger sheet
// and is also opened by the "Explore all features" button at the bottom of
// Home. Account, membership and settings are untouched — they stay on Profile.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useActiveTreatmentPlans } from "@/hooks/useTreatmentPlans";

interface Feature {
  name: string;
  desc: string;
  to: string;
}

interface Group {
  label: string;
  items: Feature[];
}

/** Grouped feature list. `treatmentTo` varies with whether a plan is running. */
export function featureGroups(treatmentTo: string): Group[] {
  return [
    {
      label: "My hair",
      items: [
        { name: "Treatment plan", desc: "Your plan, steps and check-ins", to: treatmentTo },
        { name: "Goals & length", desc: "Your goals, challenges and progress photos", to: "/profile/milestones" },
        { name: "Style & rotation", desc: "Set your current style and plan the next", to: "/home/style" },
        { name: "Hair profile", desc: "Your Afro and textured hair details", to: "/profile/hair" },
        { name: "Colour history", desc: "Colour, relaxer and chemical history", to: "/profile/colour" },
        { name: "Wash day", desc: "Log a wash day and see your history", to: "/wash-day" },
        { name: "Wash day favourites", desc: "Routines you save and reuse", to: "/wash/favourites" },
        { name: "Daily hair log", desc: "A quick note between wash days", to: "/daily-log" },
        { name: "Style journal", desc: "Document your styles over time", to: "/journal" },
      ],
    },
    {
      label: "My health",
      items: [
        { name: "Blood work", desc: "Your markers and what they mean", to: "/blood-history" },
        { name: "Add a blood test", desc: "Upload results you already have", to: "/blood-upload?next=analysis" },
        { name: "Supplements", desc: "What you take, and what it does for hair", to: "/profile/health" },
        { name: "Diet & nutrition", desc: "Food and supplements for your hair", to: "/nutrition-plan" },
        { name: "Allergies & sensitivities", desc: "Things to keep off your hair and scalp", to: "/profile/health" },
      ],
    },
    {
      label: "My products",
      items: [
        { name: "My shelf", desc: "Everything you own, analysed for you", to: "/products" },
        { name: "Scan a product", desc: "Read a label and get your fit", to: "/products" },
        { name: "Homemade products", desc: "Your own mixes, analysed from the recipe", to: "/products/homemade/new" },
        { name: "Wishlist", desc: "Products you are thinking about", to: "/products/wishlist" },
        { name: "Favourites", desc: "The ones that work for you", to: "/products/favourites" },
        { name: "Off the shelf", desc: "Products you have retired", to: "/products/off-shelf" },
        { name: "Avoid list", desc: "Ingredients you would rather not use", to: "/products/avoidlist" },
        { name: "Ingredient research", desc: "Look up an ingredient", to: "/products/ingredient-research" },
        { name: "Product library", desc: "Browse products other members hold", to: "/products/repository" },
        { name: "Brand directory", desc: "Explore the brands on STRAND", to: "/brands" },
        { name: "Moodboards", desc: "Save style inspiration", to: "/journal/moodboards" },
      ],
    },
    {
      label: "Support",
      items: [
        { name: "Find a professional", desc: "Trusted specialists near you", to: "/directory" },
        { name: "Appointments", desc: "Book, log and review appointments", to: "/appointments" },
        { name: "My enquiries", desc: "Requests you have sent to professionals", to: "/profile/enquiries" },
        { name: "Message Paige", desc: "Talk to us directly", to: "/messages" },
        { name: "Discounts & offers", desc: "Member-only perks", to: "/profile/discounts" },
        { name: "Help", desc: "How STRAND works", to: "/help" },
        { name: "Contact us", desc: "Send us a message", to: "/contact" },
      ],
    },
  ];
}

const FeatureDirectory = ({ onNavigate }: { onNavigate?: () => void }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { bundles } = useActiveTreatmentPlans();
  const treatmentTo = bundles?.[0]?.plan?.id ? `/treatment/${bundles[0].plan.id}` : "/treatment/new";

  const groups = useMemo(() => {
    const all = featureGroups(treatmentTo);
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.name.toLowerCase().includes(term) || i.desc.toLowerCase().includes(term),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, treatmentTo]);

  const go = (to: string) => {
    onNavigate?.();
    navigate(to);
  };

  return (
    <div>
      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search features"
            aria-label="Search features"
            className="w-full h-9 pl-8 pr-3 rounded-[10px] border border-border bg-card text-[13px] font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {groups.length === 0 && (
        <p className="px-5 py-4 text-[12px] font-body text-muted-foreground">
          Nothing matches that.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.label} className="pb-2">
          <p className="px-5 pt-2 pb-1.5 text-[10px] uppercase tracking-[0.2em] text-primary font-body font-medium">
            {g.label}
          </p>
          {g.items.map((i, idx) => (
            <button
              key={`${g.label}-${i.name}`}
              onClick={() => go(i.to)}
              className={`w-full text-left px-5 py-2.5 hover:bg-primary/[0.05] transition-colors ${
                idx > 0 ? "border-t border-border/50" : ""
              }`}
            >
              <span className="block text-[14px] font-body text-foreground leading-snug break-words">
                {i.name}
              </span>
              <span className="block text-[12px] font-body text-muted-foreground leading-snug break-words mt-0.5">
                {i.desc}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default FeatureDirectory;
