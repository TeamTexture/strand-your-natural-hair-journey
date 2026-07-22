import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Search, Star, Pencil, Clock, ChevronDown, MapPin, Phone, Mail } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import EnquiryDialog from "@/components/EnquiryDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchProfessionalsIn, type ProType, type Professional } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { useMyEnquiries, type EnquiryStatus } from "@/hooks/useEnquiries";
import { normalizeWebsiteUrl } from "@/lib/socialLinks";
import { summariseOpeningHours, listOpeningHours } from "@/lib/openingHours";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

const tabs: Array<"All" | ProType> = ["All", "Trichologist", "Dermatologist", "Curl Specialist"];

const Directory = () => {
  const [params] = useSearchParams();
  const bloodOnly = params.get("bloodOnly") === "1";
  const anchorSelf = params.get("self") === "1";

  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]>(bloodOnly ? "Dermatologist" : "All");
  const [query, setQuery] = useState("");
  const { pros, loading } = useDirectoryProfessionals();
  const { data: myEnquiries } = useMyEnquiries();
  const navigate = useNavigate();
  const [showTop, setShowTop] = useState(false);
  const [enquiryTarget, setEnquiryTarget] = useState<{ proUserId: string; name: string } | null>(null);
  const [expandedHours, setExpandedHours] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const enquiryByPro = useMemo(() => {
    const map = new Map<string, { status: EnquiryStatus; created_at: string }>();
    for (const e of myEnquiries ?? []) {
      const existing = map.get(e.pro_user_id);
      if (!existing || new Date(e.created_at) > new Date(existing.created_at)) {
        map.set(e.pro_user_id, { status: e.status, created_at: e.created_at });
      }
    }
    return map;
  }, [myEnquiries]);

  const results = useMemo(
    () => searchProfessionalsIn(pros, query, bloodOnly ? "Dermatologist" : tab),
    [pros, query, tab, bloodOnly],
  );

  // If the viewer is the owner of one of these listings and asked to be
  // anchored to it (via ?self=1), find that card so we can render it
  // distinctly and scroll it into view once mounted.
  const ownedListing: Professional | null = useMemo(() => {
    if (!user) return null;
    return pros.find((p) => p.proUserId && p.proUserId === user.id) ?? null;
  }, [pros, user]);

  useEffect(() => {
    if (!anchorSelf || !ownedListing) return;
    // Wait a frame so the DOM has rendered the card.
    const t = requestAnimationFrame(() => {
      const node = cardRefs.current[ownedListing.id];
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(t);
  }, [anchorSelf, ownedListing]);

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

  return (
    <ScreenLayout bottomNav>
      <TitleBar title={bloodOnly ? "Book a Doctor" : "Professionals"} />

      {bloodOnly && (
        <div className="px-5 pb-3">
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-snug">
              <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                Blood test —{" "}
              </span>
              These verified dermatologists can run the bloods we need to assess hair-loss
              deficiencies. Tap any card to book.
            </p>
          </SurfaceCard>
        </div>
      )}

      {anchorSelf && ownedListing && (
        <div className="px-5 pb-3">
          <div className="rounded-[12px] border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-[11px] font-body text-foreground/85 leading-snug">
            This is how consumers see your listing. Tap <span className="font-semibold">Edit</span> to update.
          </div>
        </div>
      )}

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

      {!bloodOnly && (
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
      )}

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
          results.map((p) => {
            const enq = p.proUserId ? enquiryByPro.get(p.proUserId) : undefined;
            const activeEnq = enq && enq.status !== "withdrawn" && enq.status !== "declined";
            const enqLabel =
              enq?.status === "accepted" ? "Accepted"
              : enq?.status === "pending" ? "Enquiry sent"
              : enq?.status === "declined" ? "Declined"
              : "Withdrawn";
            const enqCls =
              enq?.status === "accepted" ? "bg-good/15 text-good"
              : enq?.status === "pending" ? "bg-warn/15 text-warn"
              : "bg-muted text-muted-foreground";

            const isOwn = !!user && !!p.proUserId && p.proUserId === user.id;
            const openingSummary = summariseOpeningHours(p.openingHours);
            const hoursOpen = expandedHours[p.id] === true;
            const fullHours = hoursOpen ? listOpeningHours(p.openingHours) : [];
            const addressParts = [p.addressLine1, p.addressLine2, p.city, p.location]
              .map((s) => (typeof s === "string" ? s.trim() : ""))
              .filter((s) => s.length > 0);
            // Dedupe address vs the standing "location" line so we don't
            // repeat the same postcode twice on very compact profiles.
            const streetLine = addressParts.slice(0, addressParts.length - 1).join(", ");
            const cityLine = addressParts[addressParts.length - 1];

            return (
            <SurfaceCard
              key={p.id}
              padded={false}
              ref={(el) => { cardRefs.current[p.id] = el; }}
              className={cn(
                "overflow-hidden scroll-mt-24",
                // Owner-view distinct treatment: deeper sand tone using the
                // existing secondary/primary token family. Everyone else sees
                // the standard white card.
                isOwn && "bg-secondary/70 border-primary/40 ring-1 ring-primary/25",
              )}
            >
              <div className="p-4">
                <div className="flex gap-3">
                  <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-[52px]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isOwn && (
                          <Star
                            className="size-3.5 text-primary shrink-0"
                            fill="currentColor"
                            aria-label="Your listing"
                          />
                        )}
                        <p className="font-display text-base font-semibold leading-tight truncate">
                          {p.name}
                        </p>
                      </div>
                      {isOwn ? (
                        <button
                          type="button"
                          onClick={() => navigate("/pro/profile")}
                          className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-1 rounded-full bg-primary text-primary-foreground"
                        >
                          <Pencil className="size-3" />
                          Edit
                        </button>
                      ) : enq ? (
                        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${enqCls}`}>
                          {enqLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">{p.title}</span>
                      <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {p.verified} ✓
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.clinic}{p.location ? ` · ${p.location}` : ""}
                    </p>
                  </div>
                </div>

                {p.specs.length > 0 && (
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
                )}

                {p.bio && (
                  <p className="text-[11px] text-foreground/80 leading-relaxed mt-3">{p.bio}</p>
                )}

                {/* Progressive disclosure: opening hours + address + contact.
                    Summarised inline; full week expands on tap. */}
                {(openingSummary || streetLine || cityLine || p.businessPhone || p.businessEmail) && (
                  <div className="mt-3 rounded-[10px] border border-border/70 bg-background/60 divide-y divide-border/60">
                    {openingSummary && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHours((cur) => ({ ...cur, [p.id]: !cur[p.id] }))
                        }
                        className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        aria-expanded={hoursOpen}
                      >
                        <Clock className="size-3.5 text-primary shrink-0" />
                        <span className="text-[11px] font-body text-foreground/85 flex-1">
                          {openingSummary}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-3.5 text-muted-foreground transition-transform",
                            hoursOpen && "rotate-180",
                          )}
                        />
                      </button>
                    )}
                    {hoursOpen && fullHours.length > 0 && (
                      <ul className="px-3 pb-2 pt-1 space-y-0.5">
                        {fullHours.map((row) => (
                          <li
                            key={row.label}
                            className={cn(
                              "flex items-center justify-between text-[11px] font-body",
                              row.isToday ? "text-foreground font-medium" : "text-foreground/75",
                            )}
                          >
                            <span>{row.label}</span>
                            <span>{row.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(streetLine || cityLine) && (
                      <div className="flex items-start gap-2 px-3 py-2">
                        <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="text-[11px] font-body text-foreground/85 leading-snug">
                          {streetLine && <div>{streetLine}</div>}
                          {cityLine && cityLine !== streetLine && <div>{cityLine}</div>}
                        </div>
                      </div>
                    )}
                    {p.businessPhone && (
                      <a
                        href={`tel:${p.businessPhone.replace(/\s+/g, "")}`}
                        className="flex items-center gap-2 px-3 py-2 text-[11px] font-body text-foreground/85"
                      >
                        <Phone className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">{p.businessPhone}</span>
                      </a>
                    )}
                    {p.businessEmail && (
                      <a
                        href={`mailto:${p.businessEmail}`}
                        className="flex items-center gap-2 px-3 py-2 text-[11px] font-body text-foreground/85"
                      >
                        <Mail className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">{p.businessEmail}</span>
                      </a>
                    )}
                  </div>
                )}

                {enq && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    You enquired {formatDistanceToNow(new Date(enq.created_at), { addSuffix: true })}
                    {activeEnq ? " — awaiting response." : "."}
                  </p>
                )}

                {!isOwn && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {p.website ? (
                      <a
                        href={normalizeWebsiteUrl(p.website)}
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
                      if (p.proUserId) {
                        if (activeEnq) {
                          return (
                            <button
                              type="button"
                              onClick={() => navigate("/profile/enquiries")}
                              className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground border border-primary/40 rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                            >
                              View enquiry
                            </button>
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setEnquiryTarget({ proUserId: p.proUserId!, name: p.name })
                            }
                            className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                          >
                            {enq ? "Enquire again" : "Enquire Now"}
                          </button>
                        );
                      }
                      const bookUrl = normalizeWebsiteUrl(p.bookingUrl || p.website);
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
                          Enquire Now
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toast("Booking unavailable")}
                          className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary/60 text-primary-foreground rounded-md font-medium min-h-[44px]"
                        >
                          Enquire Now
                        </button>
                      );
                    })()}
                  </div>
                )}
                {p.instaUrl && (
                  <a
                    href={p.instaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-center py-2 text-[11px] uppercase tracking-[0.1em] bg-card border border-border text-foreground rounded-md min-h-[36px]"
                  >
                    Instagram {p.insta}
                  </a>
                )}
              </div>
              {p.discount && p.discount.trim().length > 0 && (
                <div className="bg-primary/15 px-4 py-2.5 text-xs">
                  <span className="font-semibold tracking-[0.1em] uppercase text-primary">
                    {p.discount}
                  </span>
                </div>
              )}
            </SurfaceCard>
            );
          })
        )}

        <SurfaceCard tone="gold">
          <div className="space-y-2">
            <p className="font-display text-base leading-tight">Are you a professional?</p>
            <p className="text-xs font-body text-muted-foreground leading-snug">
              Join the STRAND vetted directory. Trichologists, dermatologists,
              curl specialists, colourists and stylists welcome.
            </p>
            <a
              href="/pro/apply"
              className="mt-1 inline-flex items-center justify-center w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
            >
              Apply Now
            </a>
          </div>
        </SurfaceCard>
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
      {enquiryTarget && (
        <EnquiryDialog
          open={!!enquiryTarget}
          onOpenChange={(o) => !o && setEnquiryTarget(null)}
          proUserId={enquiryTarget.proUserId}
          proName={enquiryTarget.name}
        />
      )}
    </ScreenLayout>
  );
};

export default Directory;
