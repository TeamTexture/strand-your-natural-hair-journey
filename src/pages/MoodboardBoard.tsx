import { useState } from "react";
import { Heart } from "lucide-react";
import { useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Tile { gradient: string; emoji: string; fav: boolean }
const initial: Tile[] = [
  { gradient: "from-[#C8B89A] to-[#D4B96A]", emoji: "🌀", fav: true },
  { gradient: "from-[#D4AA52] to-[#C49A3C]", emoji: "🌿", fav: false },
  { gradient: "from-[#E8D8C0] to-[#A07828]", emoji: "✨", fav: false },
  { gradient: "from-[#DDD0B8] to-[#C8B89A]", emoji: "🫧", fav: true },
  { gradient: "from-[#D4B96A] to-[#8B6914]", emoji: "🌸", fav: false },
  { gradient: "from-[#C49A3C] to-[#8B6914]", emoji: "💛", fav: false },
];

const MoodboardBoard = () => {
  const { id } = useParams();
  const [tiles, setTiles] = useState(initial);

  const title =
    id === "favourites" ? "Favourites" :
    id === "protective" ? "Protective Styles" :
    id === "growth" ? "Growth Inspo" :
    id === "colour" ? "Colour Goals" :
    id === "washgo" ? "Wash & Go Vibes" :
    id === "style" ? "Style Inspo" : "Board";

  const toggleFav = (i: number) => {
    setTiles((t) => {
      const next = [...t];
      next[i] = { ...next[i], fav: !next[i].fav };
      toast(next[i].fav ? "❤️ Added to Favourites board!" : "💔 Removed from Favourites");
      return next;
    });
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title={title}
        right={
          <button onClick={() => toast("Add image to board")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            + Add
          </button>
        }
      />
      <p className="text-xs text-muted-foreground text-center pb-3 px-5">{tiles.length} images · Tap ♡ to add to Favourites</p>

      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        {tiles.map((t, i) => (
          <div key={i} className={`relative aspect-[3/4] rounded-[12px] bg-gradient-to-br ${t.gradient} overflow-hidden`}>
            <span className="absolute inset-0 flex items-center justify-center text-5xl">{t.emoji}</span>
            <button
              onClick={() => toggleFav(i)}
              aria-label="Favourite"
              className={cn(
                "absolute top-2 right-2 size-8 rounded-full flex items-center justify-center transition-colors",
                t.fav ? "bg-primary text-primary-foreground" : "bg-white/80 text-foreground/70",
              )}
            >
              <Heart className={cn("size-4", t.fav && "fill-current")} />
            </button>
          </div>
        ))}
      </div>

      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => toast("Camera opening")}
          className="p-4 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center"
        >
          <div className="text-2xl mb-1">📷</div>
          <p className="text-xs font-medium">Take a Photo</p>
          <p className="text-[10px] text-muted-foreground">Use your camera</p>
        </button>
        <button
          onClick={() => toast("Choose from camera roll")}
          className="p-4 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center"
        >
          <div className="text-2xl mb-1">🖼️</div>
          <p className="text-xs font-medium">Upload a Photo</p>
          <p className="text-[10px] text-muted-foreground">From your camera roll</p>
        </button>
      </div>

      <div className="px-5 pb-6">
        <Button variant="goldGhost" size="pill" onClick={() => toast("Board link copied")}>
          Share Board
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default MoodboardBoard;
