import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Users, BookOpen, Calendar, MessageCircle, ArrowRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import { Button } from "@/components/ui/button";
import HairStrandIcon from "@/components/HairStrandIcon";
import { usePlusAccess } from "@/hooks/usePlusAccess";

const LINKS = [
  { icon: Users, label: "Community forum", to: "/forum" },
  { icon: MessageCircle, label: "Messages", to: "/messages" },
  { icon: BookOpen, label: "Library", to: "/plus/library" },
  { icon: Calendar, label: "Events", to: "/plus/events" },
];

const PlusWelcome = () => {
  const nav = useNavigate();
  const { refetch } = usePlusAccess();
  useEffect(() => { refetch(); }, [refetch]);
  return (
    <ScreenLayout>
      <div className="px-5 pt-10 pb-10 text-center space-y-5">
        <div className="mx-auto size-20 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center">
          <HairStrandIcon className="size-9" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 mx-auto">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
            Welcome to STRAND+
          </span>
        </div>
        <h1 className="font-display text-[30px] font-semibold leading-[1.1]">
          You're in the <span className="italic text-primary">circle</span>.
        </h1>
        <p className="font-body text-[13.5px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
          The community, courses, events and members-only chat are all live for you now.
        </p>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          {LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.to}
                onClick={() => nav(l.to)}
                className="rounded-[14px] p-4 border border-border bg-card text-left hover:bg-muted/40 transition-colors"
              >
                <Icon className="size-5 text-primary mb-1.5" />
                <p className="font-body text-[12.5px] font-semibold leading-tight">{l.label}</p>
              </button>
            );
          })}
        </div>
        <Button variant="gold" size="pill" className="w-full" onClick={() => nav("/home")}>
          <span className="inline-flex items-center gap-2">Continue to STRAND <ArrowRight className="size-4" /></span>
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default PlusWelcome;
