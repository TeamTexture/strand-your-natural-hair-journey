import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ItalicSub from "@/components/ItalicSub";
import { toast } from "sonner";

interface Board { id: string; name: string; emoji: string; gradient: string; count: number }
const boards: Board[] = [
  { id: "protective", name: "Protective Styles", emoji: "🌀", gradient: "from-[#C8B89A] to-[#D4B96A]", count: 12 },
  { id: "growth", name: "Growth Inspo", emoji: "🌿", gradient: "from-[#D4AA52] to-[#C49A3C]", count: 8 },
  { id: "colour", name: "Colour Goals", emoji: "✨", gradient: "from-[#E8D8C0] to-[#A07828]", count: 5 },
  { id: "washgo", name: "Wash & Go Vibes", emoji: "🫧", gradient: "from-[#DDD0B8] to-[#C8B89A]", count: 9 },
  { id: "style", name: "Style Inspo", emoji: "🌸", gradient: "from-[#D4B96A] to-[#8B6914]", count: 14 },
];

const MoodboardList = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Mood Boards"
        right={
          <button onClick={() => toast("New board created")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            + New
          </button>
        }
      />
      <ItalicSub>Tap ♡ on any image to add to your Favourites board.</ItalicSub>

      <div className="px-5 pb-4">
        <button
          onClick={() => navigate("/journal/moodboards/favourites")}
          className="w-full h-32 rounded-[14px] bg-gradient-to-br from-primary to-[#8B6914] text-primary-foreground p-4 flex flex-col justify-between text-left"
        >
          <span className="text-3xl">❤️</span>
          <div>
            <p className="font-display text-lg font-semibold">Favourites</p>
            <p className="text-xs opacity-80">6 images</p>
          </div>
        </button>
      </div>

      <div className="px-5 pb-6 grid grid-cols-2 gap-3">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => navigate(`/journal/moodboards/${b.id}`)}
            className={`h-36 rounded-[14px] bg-gradient-to-br ${b.gradient} p-3 flex flex-col justify-between text-left text-foreground`}
          >
            <span className="text-2xl">{b.emoji}</span>
            <div>
              <p className="font-display text-sm font-semibold leading-tight">{b.name}</p>
              <p className="text-[10px] opacity-80">{b.count} images</p>
            </div>
          </button>
        ))}
        <button
          onClick={() => toast("New board created")}
          className="h-36 rounded-[14px] border-2 border-dashed border-primary/60 bg-card flex flex-col items-center justify-center gap-2 text-primary"
        >
          <span className="text-3xl">+</span>
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium">New Board</span>
        </button>
      </div>
    </ScreenLayout>
  );
};

export default MoodboardList;
