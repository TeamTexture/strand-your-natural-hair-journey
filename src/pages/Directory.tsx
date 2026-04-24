import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchProfessionalsIn, type ProType } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";

const tabs: Array<"All" | ProType> = ["All", "Trichologist", "Dermatologist", "Curl Specialist"];

const Directory = () => {
  const [params] = useSearchParams();
  // `?bloodOnly=1` is set by the onboarding Blood-Test screen when the user
  // needs to book a doctor for blood work. We lock the directory to
  // Dermatologists and hide the type tabs to keep the flow focused.
  const bloodOnly = params.get("bloodOnly") === "1";

  const [tab, setTab] = useState<(typeof tabs)[number]>(bloodOnly ? "Dermatologist" : "All");
  const [query, setQuery] = useState("");
  const { pros, loading } = useDirectoryProfessionals();
  const [showTop, setShowTop] = useState(false);

  const results = useMemo(
    () => searchProfessionalsIn(pros, query, bloodOnly ? "Dermatologist" : tab),
    [pros, query, tab, bloodOnly],
  );

  // The scrollable surface is the <main> element inside ScreenLayout. We listen
  // to it directly so the floating "back to top" only shows once the user has
  // moved past the first viewport — keeps the UI calm by default.
  useEffect(() => {
    const main = document.querySelector("main") as HTMLElement | null;
    if (!main) return;
    const onScroll = () => setShowTop(main.scrollTop > 400);
    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const main = document.querySelector("main") as HTMLElement | null;
    main?.scrollTo({ top: 0, behavior: "smooth" });
  };

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
                  {pros.filter((p) => p.type === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-4 pb-8">
        {loading && pros.length === 0 ? (
          <LoadingDot label="Loading directory…" fullScreen={false} />
        ) : results.length === 0 ? (
          <EmptyState
            icon="🔍"
            message="No professionals found"
            hint="Try a postcode, name, or specialism."
          />
        ) : (
          results.map((p) => (
            <SurfaceCard key={p.id} padded={false} className="overflow-hidden">
              <div className="p-4">
                <div className="flex gap-3">
                  <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-[52px]" />
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
                  {/* Plain anchor tags so the iframe sandbox / popup-blocker
                      treats them as a user-initiated navigation. window.open
                      was being silently blocked in the embedded preview. */}
                  {p.instaUrl ? (
                    <a
                      href={p.instaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px] flex items-center justify-center text-center"
                    >
                      Instagram
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toast("Instagram unavailable")}
                      className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary/60 text-muted-foreground rounded-md min-h-[44px]"
                    >
                      Instagram
                    </button>
                  )}
                  {p.website ? (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px] flex items-center justify-center text-center"
                    >
                      Website
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toast("Website unavailable")}
                      className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary/60 text-muted-foreground rounded-md min-h-[44px]"
                    >
                      Website
                    </button>
                  )}
                  {(() => {
                    const bookUrl = p.bookingUrl || p.website || p.instaUrl;
                    return bookUrl ? (
                      <a
                        href={bookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (p.bookCode) toast(`📅 Use code ${p.bookCode} at booking`);
                        }}
                        className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                      >
                        Book Now
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toast("Booking unavailable — try Instagram")}
                        className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary/60 text-primary-foreground rounded-md font-medium min-h-[44px]"
                      >
                        Book Now
                      </button>
                    );
                  })()}
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

      {showTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-30 size-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <ArrowUp className="size-5" />
        </button>
      )}
    </ScreenLayout>
  );
};

export default Directory;
