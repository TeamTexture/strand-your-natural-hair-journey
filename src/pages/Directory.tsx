import { useState } from "react";
import { Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const tabs = ["All", "Trichologist", "Dermatologist", "Curl Specialist"];

interface Pro {
  emoji: string; name: string; title: string; verified: string; clinic: string;
  specs: string[]; bio: string; insta: string; bookCode: string; discount: string;
}
const pros: Pro[] = [
  {
    emoji: "🏥", name: "Teresa Richardson", title: "Trichologist", verified: "IOT Verified",
    clinic: "Fulham Scalp & Hair Clinic",
    specs: ["Afro Hair", "Hair Loss", "Scalp Health", "Traction Alopecia", "CCCA"],
    bio: "Over 20 years specialising in Afro and textured hair trichology. Co-founder of Fulham Scalp & Hair Clinic. Featured in Texture Talks podcast Season 2.",
    insta: "@fulhamscalphair", bookCode: "STRAND15", discount: "STRAND15 — 15% off",
  },
  {
    emoji: "⚕️", name: "Dr. Yvonne Abimbola", title: "Dermatologist", verified: "GMC Verified",
    clinic: "Dr Eve Skin",
    specs: ["Scalp Dermatology", "Hair Loss", "Blood Analysis", "Skin of Colour", "Alopecia"],
    bio: "GP specialist and certified dermatologist. Founder of Dr Eve Skin, CQC-registered. Expert in deficiency-driven hair loss and conditions affecting skin of colour.",
    insta: "@dreveskin", bookCode: "STRAND20", discount: "STRAND20 — £20 off",
  },
  {
    emoji: "✂️", name: "Erica Liburd", title: "Curl Specialist · 27+ years", verified: "Specialist",
    clinic: "The Muse Salon",
    specs: ["Curl & Coil Styling", "Afro Hair", "Curl Assessment", "Hair Health", "Education"],
    bio: "27+ years in hairdressing with a deep specialism in curly and coily textures. Professional educator. Known for her prescriptive approach — the hair tells the story.",
    insta: "@themusesalon", bookCode: "STRAND10", discount: "STRAND10 — 10% off",
  },
];

const Directory = () => {
  const [tab, setTab] = useState("All");
  return (
    <ScreenLayout>
      <TitleBar title="Professionals" />

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            placeholder="Search professionals..."
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      <div className="px-5 pb-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors",
                tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-4 pb-8">
        {pros.map((p) => (
          <SurfaceCard key={p.name} padded={false} className="overflow-hidden">
            <div className="p-4">
              <div className="flex gap-3">
                <div className="size-[52px] rounded-[12px] bg-primary/15 flex items-center justify-center text-2xl shrink-0">{p.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold leading-tight">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">{p.title}</span>
                    <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">{p.verified} ✓</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{p.clinic}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {p.specs.map((s) => (
                  <span key={s} className="bg-primary/10 text-foreground text-[10px] px-2 py-1 rounded-full">{s}</span>
                ))}
              </div>

              <p className="text-[11px] text-foreground/80 leading-relaxed mt-3">{p.bio}</p>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => toast(p.insta)} className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md">Instagram</button>
                <button onClick={() => toast("Opening...")} className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md">Website</button>
                <button onClick={() => toast(`📅 Booking — ${p.bookCode} applied`)} className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium">Book Now</button>
              </div>
            </div>
            <div className="bg-primary/15 px-4 py-2.5 text-xs">
              <span className="font-semibold tracking-[0.1em] uppercase text-primary">{p.discount}</span>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </ScreenLayout>
  );
};

export default Directory;
