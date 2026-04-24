import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { journalEntries } from "@/data/journalEntries";

const moodTiles = [
  { gradient: "from-[#C8B89A] to-[#D4B96A]", emoji: "🌀" },
  { gradient: "from-[#D4AA52] to-[#C49A3C]", emoji: "🌿" },
  { gradient: "from-[#E8D8C0] to-[#A07828]", emoji: "✨" },
];

const Journal = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Hair Journal"
        back={false}
        right={
          <button onClick={() => toast("New entry — add a photo")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            + Add
          </button>
        }
      />

      <div className="px-5 pb-4">
        <div className="rounded-[14px] p-4 bg-gradient-to-r from-primary to-[#8B6914] text-primary-foreground">
          <p className="text-base font-semibold">🌟 3 Month Natural Anniversary</p>
          <p className="font-body text-sm opacity-90 mt-1">You have come so far. Keep going.</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        <SurfaceCard>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Length Retention</p>
            <span className="text-[11px] uppercase tracking-[0.15em] text-primary">In Progress</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full w-[60%] bg-primary rounded-full" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Goal: 2 inches by September · Current: 1.2 inches</p>
        </SurfaceCard>
      </div>

      <SectionLabel>Photo Journal</SectionLabel>
      <div className="px-5 space-y-3 pb-4">
        {journals.map((j) => (
          <SurfaceCard key={j.date} padded={false} className="overflow-hidden">
            <div className={`relative h-40 bg-gradient-to-br ${j.gradient} flex items-center justify-center`}>
              <span className="text-5xl">{j.emoji}</span>
              <span className="absolute bottom-2 right-3 text-[11px] text-white/90 font-body bg-black/30 px-2 py-1 rounded">{j.date}</span>
            </div>
            <div className="p-3">
              <p className="font-display text-base font-semibold">{j.title}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{j.note}</p>
            </div>
          </SurfaceCard>
        ))}
      </div>

      <SectionLabel>Mood Boards</SectionLabel>
      <div className="px-5 pb-6 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {moodTiles.map((t, i) => (
            <div key={i} className={`aspect-square rounded-[12px] bg-gradient-to-br ${t.gradient} flex items-center justify-center text-3xl`}>
              {t.emoji}
            </div>
          ))}
        </div>
        <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal/moodboards")}>
          View Mood Boards
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/journal/moodboards/favourites")}>
          + Add to Mood Board
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default Journal;
