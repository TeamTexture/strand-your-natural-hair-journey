import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, X, Check } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getJournalEntry } from "@/data/journalEntries";

// Product catalog (mirrors keys/labels in src/pages/Products.tsx)
interface Product { key: string; emoji: string; name: string; brand: string }
const PRODUCT_CATALOG: Product[] = [
  { key: "camille-rose-moisture-retention", emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose" },
  { key: "briogeo-honey-whip", emoji: "🫙", name: "Honey Whip Moisturiser", brand: "Briogeo" },
  { key: "cantu-curl-defining-cream", emoji: "🧪", name: "Curl Defining Cream", brand: "Cantu" },
  { key: "mielle-scalp-serum", emoji: "🌿", name: "Scalp Serum", brand: "Mielle" },
];

interface ReflectionState {
  how: string;
  liked: string;
  next: string;
  productKeys: string[];
}

const emptyReflection = (): ReflectionState => ({
  how: "",
  liked: "",
  next: "",
  productKeys: [],
});

const JournalEntry = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const entry = getJournalEntry(id);

  const storageKey = `strand_journal_entry_${id}`;
  const [state, setState] = useState<ReflectionState>(emptyReflection);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load any saved reflection / product selections
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReflectionState>;
        setState({
          how: parsed.how ?? "",
          liked: parsed.liked ?? "",
          next: parsed.next ?? "",
          productKeys: parsed.productKeys ?? entry?.productKeys ?? [],
        });
        return;
      }
    } catch {
      /* ignore */
    }
    // Seed with entry's defaults if no saved state
    setState({
      how: "",
      liked: entry?.note ?? "",
      next: "",
      productKeys: entry?.productKeys ?? [],
    });
  }, [id, storageKey, entry]);

  const selectedProducts = useMemo(
    () => PRODUCT_CATALOG.filter((p) => state.productKeys.includes(p.key)),
    [state.productKeys],
  );

  const persist = (next: ReflectionState) => {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleProduct = (key: string) => {
    const has = state.productKeys.includes(key);
    persist({
      ...state,
      productKeys: has
        ? state.productKeys.filter((k) => k !== key)
        : [...state.productKeys, key],
    });
  };

  const onSave = () => {
    persist(state);
    toast.success("Reflection saved");
  };

  if (!entry) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Journal Entry" />
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">Entry not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/journal")}>
            Back to Journal
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Journal Entry" />

      {/* Hero image */}
      <div className="px-5 pb-4">
        <SurfaceCard padded={false} className="overflow-hidden">
          <div
            className={`relative h-56 bg-gradient-to-br ${entry.gradient} flex items-center justify-center`}
          >
            <span className="text-7xl">{entry.emoji}</span>
            <span className="absolute bottom-2 right-3 text-[11px] text-white/95 font-body bg-black/30 px-2 py-1 rounded">
              {entry.date}
            </span>
          </div>
          <div className="p-4">
            <p className="font-display text-xl font-semibold leading-tight">{entry.title}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-primary mt-1">
              {entry.date}
            </p>
          </div>
        </SurfaceCard>
      </div>

      {/* Products used — placed ABOVE notes & voicenotes per spec */}
      <SectionLabel>Products Used</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          {selectedProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-3">
              Track which products you used in this style.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedProducts.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-1.5 bg-secondary text-foreground/90 text-xs px-3 py-1.5 rounded-full"
                >
                  <span>{p.emoji}</span>
                  <span className="font-medium">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleProduct(p.key)}
                    className="ml-1 text-muted-foreground hover:text-warn"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button
            variant="goldOutline"
            size="pill"
            onClick={() => setPickerOpen((v) => !v)}
            className="gap-2"
          >
            <Plus className="size-4" />
            {pickerOpen ? "Done" : "Add products used"}
          </Button>

          {pickerOpen && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {PRODUCT_CATALOG.map((p) => {
                const selected = state.productKeys.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggleProduct(p.key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] border min-h-[48px] transition-colors text-left",
                      selected
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border hover:border-primary/50",
                    )}
                  >
                    <span className="text-lg shrink-0">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                    </div>
                    {selected && <Check className="size-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Reflection prompts */}
      <SectionLabel>Reflection</SectionLabel>
      <div className="px-5 pb-4 space-y-3">
        <SurfaceCard>
          <label className="block text-xs font-semibold mb-1.5">
            How did you do this style?
          </label>
          <Textarea
            value={state.how}
            onChange={(e) => persist({ ...state, how: e.target.value })}
            placeholder="Steps, technique, sections, drying method…"
            className="min-h-[88px] font-body text-sm"
          />
        </SurfaceCard>

        <SurfaceCard>
          <label className="block text-xs font-semibold mb-1.5">
            What did you like about it?
          </label>
          <Textarea
            value={state.liked}
            onChange={(e) => persist({ ...state, liked: e.target.value })}
            placeholder="Definition, shine, longevity, how it felt…"
            className="min-h-[88px] font-body text-sm"
          />
        </SurfaceCard>

        <SurfaceCard>
          <label className="block text-xs font-semibold mb-1.5">
            What do you want to do differently next time?
          </label>
          <Textarea
            value={state.next}
            onChange={(e) => persist({ ...state, next: e.target.value })}
            placeholder="Less product, different parting, sealant…"
            className="min-h-[88px] font-body text-sm"
          />
        </SurfaceCard>
      </div>

      {/* Voicenotes for this entry — reuses ProductVoicenotes keyed by entry id */}
      <SectionLabel>Voicenotes</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          <ProductVoicenotes
            productKey={`journal:${entry.id}`}
            productName={entry.title}
            productBrand="Journal entry"
          />
        </SurfaceCard>
      </div>

      <div className="px-5 pb-6 space-y-3">
        <Button variant="gold" size="pill" onClick={onSave}>
          Save Reflection
        </Button>
        <Button variant="goldGhost" size="pill" onClick={() => navigate("/journal")}>
          Back to Journal
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default JournalEntry;
