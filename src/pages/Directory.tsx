import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PROFESSIONALS, searchProfessionals, type ProType } from "@/data/professionals";

const tabs: Array<"All" | ProType> = ["All", "Trichologist", "Dermatologist", "Curl Specialist"];

const Directory = () => {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchProfessionals(query, tab), [query, tab]);

  const openExternal = (url: string, label: string) => {
    if (!url) {
      toast(`${label} unavailable`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Professionals" />

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, clinic, condition or location..."
            autoComplete="off"
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
                "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px]",
                tab === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground",
              )}
            >
              {t}
              {t !== "All" && (
                <span className="ml-1.5 opacity-60">
                  {PROFESSIONALS.filter((p) => p.type === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-4 pb-8">
        {results.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="No professionals match your search"
            body="Try a different name, clinic, condition, or clear the filters."
          />
        ) : (
          results.map((p) => (
            <SurfaceCard key={p.id} padded={false} className="overflow-hidden">
              <div className="p-4">
                <div className="flex gap-3">
                  <div className="size-[52px] rounded-[12px] bg-primary/15 flex items-center justify-center text-2xl shrink-0">
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-base font-semibold leading-tight">{p.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">{p.title}</span>
                      <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {p.verified} ✓
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.clinic} · {p.location}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.specs.map((s) => (
                    <span
                      key={s}
                      className="bg-primary/10 text-foreground text-[10px] px-2 py-1 rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <p className="text-[11px] text-foreground/80 leading-relaxed mt-3">{p.bio}</p>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button
                    onClick={() => openExternal(p.instaUrl, "Instagram")}
                    className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px]"
                  >
                    Instagram
                  </button>
                  <button
                    onClick={() => openExternal(p.website, "Website")}
                    className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px]"
                  >
                    Website
                  </button>
                  <button
                    onClick={() => toast(`📅 Booking — ${p.bookCode} applied`)}
                    className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
                  >
                    Book Now
                  </button>
                </div>
              </div>
              <div className="bg-primary/15 px-4 py-2.5 text-xs">
                <span className="font-semibold tracking-[0.1em] uppercase text-primary">
                  {p.discount}
                </span>
              </div>
            </SurfaceCard>
          ))
        )}
      </div>
    </ScreenLayout>
  );
};

export default Directory;
