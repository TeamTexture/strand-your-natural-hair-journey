// THE QUICK LOG — one page, one add action.
//
// This page used to open on a long list of "what you usually reach for", which
// was more scrolling than choosing. It now opens on when + a single "Add
// product" button; the products already on the entry sit above it. Choosing how
// to add a product (scan, link, or her shelf) lives in AddProductSheet.
//
// Speed rules unchanged: defaults to today and now, the only required answer is
// a product, and the note/voicenote are optional. No steps, no wizard.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { CalendarDays, Plus, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import Eyebrow from "@/components/nav/Eyebrow";
import ProductThumb from "@/components/ProductThumb";
import AddProductSheet from "@/components/daily/AddProductSheet";
import VoiceNoteField from "@/components/VoiceNoteField";
import DateTimePicker from "@/components/DateTimePicker";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useCreateDailyHairEntry } from "@/hooks/useDailyHairEntries";
import { useHairCharacteristics } from "@/hooks/useHairCharacteristics";
import DailySaveConfirmation from "@/components/daily/DailySaveConfirmation";
import WeeklyPatternCard from "@/components/daily/WeeklyPatternCard";
import { friendlyWashDate, localIsoDate } from "@/lib/washLogSteps";
import { smartBack } from "@/lib/smartBack";



const pad = (n: number) => String(n).padStart(2, "0");

/** Local "YYYY-MM-DDTHH:mm" for right now. */
const nowLocalValue = () => {
  const d = new Date();
  return `${localIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const prettyTime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
};

/** Draft held only for the round trip out to a scan and back. */
const DRAFT_KEY = "strand_daily_log_draft";

const DailyHairLog = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { products } = useUserProducts("shelf");
  const create = useCreateDailyHairEntry();
  // Read up front so the confirmation paints instantly on save.
  const { data: hair } = useHairCharacteristics();

  // A scan or link takes her off this page and back again, so the half-written
  // entry is kept for the trip and cleared the moment it is saved.
  const draft = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as { when?: string; selected?: string[]; note?: string }) : null;
    } catch {
      return null;
    }
  }, []);

  const [when, setWhen] = useState(draft?.when || nowLocalValue);
  const [showWhen, setShowWhen] = useState(false);
  const [selected, setSelected] = useState<string[]>(draft?.selected ?? []);
  const [note, setNote] = useState(draft?.note ?? "");
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Set once the entry is stored — the form is replaced by the confirmation.
  const [saved, setSaved] = useState<{ productIds: string[]; at: string } | null>(null);

  const byId = useMemo(() => {
    const map: Record<string, (typeof products)[number]> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // A product scanned or linked from this page comes back attached.
  const returnedId = (location.state as { dailyAddProductId?: string } | null)?.dailyAddProductId;
  useEffect(() => {
    if (!returnedId) return;
    setSelected((prev) => (prev.includes(returnedId) ? prev : [...prev, returnedId]));
    navigate(location.pathname, { replace: true, state: null });
  }, [returnedId, navigate, location.pathname]);

  useEffect(() => {
    if (saved) {
      sessionStorage.removeItem(DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ when, selected, note }));
  }, [when, selected, note, saved]);

  const date = when.slice(0, 10);


  const save = async () => {
    if (!selected.length) {
      toast.error("Pick at least one product.");
      return;
    }
    try {
      const at = new Date(when);
      const entryAt = (Number.isNaN(at.getTime()) ? new Date() : at).toISOString();
      await create.mutateAsync({
        entry_date: date,
        entry_at: entryAt,
        product_ids: selected,
        note: note.trim() || null,
        voice_path: voicePath,
      });
      // Instead of bouncing straight to Home, confirm what was logged and why
      // it suits her hair — assembled from stored analysis, no model call.
      setSaved({ productIds: selected, at: entryAt });
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error("daily_hair_entries insert failed", e);
      toast.error(e instanceof Error ? e.message : "Could not save that. Please try again.");
    }
  };

  const savedProducts = useMemo(
    () => (saved?.productIds ?? []).map((id) => byId[id]).filter(Boolean),
    [saved, byId],
  );

  if (saved) {
    return (
      <ScreenLayout>
        <TitleBar title="Logged" onBack={() => navigate("/home")} />
        <div className="px-5 pb-6">
          <DailySaveConfirmation
            products={savedProducts}
            loggedAt={saved.at}
            hair={hair ?? null}
          />
        </div>
        <div className="px-5 pb-8 space-y-2">
          <Button variant="gold" size="pill" onClick={() => navigate("/home")}>
            Done
          </Button>
          <button
            type="button"
            onClick={() => {
              setSaved(null);
              setSelected([]);
              setNote("");
              setVoicePath(null);
              setWhen(nowLocalValue());
            }}
            className="w-full min-h-[44px] font-body text-[12.5px] text-primary"
          >
            Log something else
          </button>
        </div>
      </ScreenLayout>
    );
  }


  return (
    <ScreenLayout>
      <TitleBar title="What you did today" onBack={smartBack(navigate, "/home")} />

      {/* The weekly read of her between-wash pattern. Silent until there is
          one; never regenerated by opening this page. */}
      <div className="px-5 pb-4 empty:hidden">
        <WeeklyPatternCard />
      </div>



      {/* WHEN — today and now by default; only opened if she wants to change it. */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-3.5 text-primary shrink-0" aria-hidden />
          <p className="font-body text-[12.5px] text-foreground/80">
            {friendlyWashDate(date)}
            {prettyTime(when) ? `, ${prettyTime(when)}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setShowWhen((v) => !v)}
            className="text-[11px] uppercase tracking-[0.14em] text-primary font-medium min-h-[32px]"
          >
            {showWhen ? "Done" : "Change"}
          </button>
        </div>
        {showWhen && (
          <div className="mt-2">
            <DateTimePicker value={when} onChange={setWhen} />
          </div>
        )}
      </div>

      {/* WHAT SHE USED — only what's on this entry, above the add action. */}
      {selected.length > 0 && (
        <>
          <div className="px-5">
            <Eyebrow>What you used</Eyebrow>
          </div>
          <div className="px-5 pb-3 space-y-2">
            {selected.map((id) => {
              const p = byId[id];
              if (!p) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-[14px] border border-primary bg-primary/10 p-3"
                >
                  <ProductThumb
                    imageUrl={p.image_url}
                    storagePath={p.storage_path}
                    alt={p.name}
                    cover
                    wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <Link
                      to={`/products/profile/${p.id}`}
                      className="block product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2"
                    >
                      {p.name}
                    </Link>
                    {p.brand && (
                      <span className="block font-body text-[11.5px] text-muted-foreground break-words">
                        {p.brand}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => toggle(id)}
                    className="size-8 rounded-full flex items-center justify-center text-muted-foreground shrink-0"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* THE ONE ADD ACTION — scan, link, or her shelf. */}
      <div className="px-5 pb-4">
        <Button variant="gold" size="pill" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Add product
        </Button>
      </div>


      {/* Optional — never in the way of saving. */}
      <div className="px-5 pb-4">
        <SurfaceCard>
          <VoiceNoteField
            label="Anything to add? (optional)"
            placeholder="How your hair felt, why you did it…"
            value={note}
            onChange={setNote}
            audioPath={voicePath}
            onAudioPathChange={setVoicePath}
            folder="daily-hair"
            rows={3}
          />
        </SurfaceCard>
      </div>

      <div className="px-5 pb-8">
        <Button
          variant="gold"
          size="pill"
          onClick={save}
          disabled={create.isPending || !selected.length}
        >
          {create.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <AddProductSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        selectedIds={selected}
        onToggle={(id) => toggle(id)}
        returnTo="/daily-log"
      />

    </ScreenLayout>
  );
};

export default DailyHairLog;
