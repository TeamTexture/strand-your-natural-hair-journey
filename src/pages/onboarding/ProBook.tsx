import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { searchProfessionalsIn, type Professional } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";

const ProCard = ({ p }: { p: Professional }) => {
  const bookHref = p.bookingUrl || p.website || p.instaUrl || "";
  return (
    <SurfaceCard padded={false} className="overflow-hidden">
      <div className="p-4 flex gap-3">
        <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-14" />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold leading-tight">{p.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {p.type} · {p.verified}
            </span>
            <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
              ✓
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {p.clinic} · {p.location}
          </p>
          {p.specs?.length ? (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              {p.specs.slice(0, 4).join(" · ")}
            </p>
          ) : null}
          {p.bio ? (
            <p className="text-[11px] text-foreground/75 mt-1.5 line-clamp-2 font-body">
              {p.bio}
            </p>
          ) : null}
          {bookHref ? (
            <a
              href={bookHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex mt-2.5 items-center justify-center px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-primary/90 transition-colors min-h-[36px]"
            >
              Book Now →
            </a>
          ) : null}
        </div>
      </div>
      {p.bookCode || p.discount ? (
        <div className="bg-primary/15 px-4 py-2.5 text-xs font-body">
          {p.bookCode && (
            <span className="font-semibold tracking-[0.1em] uppercase text-primary">
              {p.bookCode}
            </span>
          )}
          {p.discount && (
            <span className="text-foreground/80">
              {p.bookCode ? " — " : ""}
              {p.discount.replace(`${p.bookCode} — `, "")}
            </span>
          )}
        </div>
      ) : null}
    </SurfaceCard>
  );
};

const ProBook = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { pros, loading } = useDirectoryProfessionals();

  const featured = useMemo(() => pros.filter((p) => p.featured), [pros]);
  const searchResults = useMemo(
    () => (query.trim().length >= 2 ? searchProfessionalsIn(pros, query) : []),
    [pros, query],
  );
  const showingSearch = query.trim().length >= 2;

  return (
    <ScreenLayout>
      <TitleBar title="Book a Professional" right={<span>3 of 9</span>} />
      <ProgressDots total={9} current={3} />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard tone="orange">
          <p className="text-sm leading-snug">
            Your app will unlock once you have had your appointment. Open Strand during or after
            your consultation to fill in your hair characteristics with your professional.
          </p>
        </SurfaceCard>

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

        {showingSearch ? (
          <>
            <SectionLabel>
              {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
            </SectionLabel>
            {searchResults.length === 0 ? (
              <EmptyState
                icon="🔍"
                message="No professionals found"
                hint="Try a postcode, name, or specialism."
              />
            ) : (
              searchResults.map((p) => <ProCard key={p.id} p={p} />)
            )}
          </>
        ) : loading && pros.length === 0 ? (
          <LoadingDot label="Loading recommended pros…" fullScreen={false} />
        ) : (
          <>
            <SectionLabel>Recommended professionals</SectionLabel>
            {featured.map((p) => (
              <ProCard key={p.id} p={p} />
            ))}
            <button
              onClick={() => navigate("/directory")}
              className="w-full text-center text-xs uppercase tracking-[0.15em] text-primary py-2 min-h-[44px]"
            >
              See all {pros.length} professionals →
            </button>
          </>
        )}

        <SurfaceCard tone="gold">
          <p className="text-xs font-body">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">Tip — </span>
            Show your professional this app at your appointment. They can help you fill in your
            hair characteristics in real time.
          </p>
        </SurfaceCard>

        <Button
          variant="goldGhost"
          size="pill"
          onClick={() => navigate("/onboarding/pro-gate")}
        >
          ← I do have a recent appointment
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProBook;
