import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import BrandTagList from "@/components/brand/BrandTagList";
import { cn } from "@/lib/utils";
import { useRoles } from "@/hooks/useRoles";
import {
  type BrandTagType,
  type TaggableType,
  defaultDisclosure,
  promotionIsLive,
  useBrandTagOptions,
  useBrandTags,
  useDeleteBrandTag,
  useSaveBrandTag,
  visibleTags,
} from "@/hooks/useBrandTags";

/**
 * The single tagging control, used on every surface that brand_tags supports.
 *
 * Who sees what follows the RLS already in place: an admin may create editorial
 * or promoted tags anywhere; a record owner may create editorial tags on their
 * own record only. Promoted requires a disclosure label — the UI blocks submit
 * and says so, mirroring the CHECK constraint rather than surfacing a database
 * error.
 */

const Chip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-pill px-3 py-1.5 font-body text-[12px] border",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground/80 border-border",
    )}
  >
    {children}
  </button>
);

export default function BrandTagControl({
  taggableType,
  taggableId,
  /** True when the signed-in member owns the tagged record. */
  isOwner = false,
  title = "Brands tagged",
  className,
}: {
  taggableType: TaggableType;
  taggableId?: string | null;
  isOwner?: boolean;
  title?: string;
  className?: string;
}) {
  const { isAdmin } = useRoles();
  const { tags, loading } = useBrandTags(taggableType, taggableId);
  const save = useSaveBrandTag(taggableType, taggableId);
  const del = useDeleteBrandTag(taggableType, taggableId);
  const [open, setOpen] = useState(false);
  const { brands } = useBrandTagOptions(open);

  const [brandId, setBrandId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [tagType, setTagType] = useState<BrandTagType>("editorial");
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const canTag = isAdmin || isOwner;
  const canPromote = isAdmin;
  const shown = useMemo(() => visibleTags(tags), [tags]);
  const hidden = useMemo(
    () => tags.filter((t) => !shown.some((s) => s.id === t.id)),
    [tags, shown],
  );

  const brandName = brands.find((b) => b.id === brandId)?.brand_name ?? "";

  const pickBrand = (id: string) => {
    setBrandId(id);
    setCustomName("");
    const name = brands.find((b) => b.id === id)?.brand_name ?? "";
    if (tagType === "promoted") setLabel(defaultDisclosure(name));
  };

  const pickType = (t: BrandTagType) => {
    setTagType(t);
    if (t === "promoted" && !label.trim() && brandName) setLabel(defaultDisclosure(brandName));
  };

  const reset = () => {
    setBrandId("");
    setCustomName("");
    setTagType("editorial");
    setLabel("");
    setStartsOn("");
    setEndsOn("");
  };

  const disclosureMissing = canPromote && !!brandId && tagType === "promoted" && !label.trim();

  const hasBrand = !!brandId || !!customName.trim();

  const submit = () => {
    if (!hasBrand) return toast("Pick a brand, or type the brand's name");
    if (disclosureMissing) {
      return toast("A promoted tag needs a disclosure label before you can save it");
    }
    save.mutate(
      {
        brand_id: brandId || null,
        custom_brand_name: customName,
        tag_type: brandId ? tagType : "editorial",
        disclosure_label: label,
        promotion_starts_on: startsOn || null,
        promotion_ends_on: endsOn || null,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
          toast.success("Brand tagged");
        },
        onError: (e: any) =>
          toast.error(
            typeof e?.message === "string" && e.message.includes("disclosure")
              ? e.message
              : "That brand may already be tagged here",
          ),
      },
    );
  };

  if (!canTag && !shown.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <SectionLabel className="px-0 mt-0 mb-1.5">{title}</SectionLabel>

      {shown.length > 0 ? (
        <BrandTagList
          taggableType={taggableType}
          tags={shown}
          onRemove={canTag ? (t) => del.mutate(t.id) : undefined}
        />
      ) : (
        !loading &&
        canTag && (
          <p className="font-body text-[13px] text-muted-foreground">No brands tagged yet.</p>
        )
      )}

      {/* Promoted tags outside their window are hidden from the list above, so
          an admin still needs a way to see and remove them. */}
      {isAdmin && hidden.length > 0 && (
        <div className="space-y-1.5">
          {hidden.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <p className="flex-1 min-w-0 font-body text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                {t.brand_name} · outside its dates, hidden
              </p>
              <button
                type="button"
                aria-label={`Remove ${t.brand_name} tag`}
                onClick={() => del.mutate(t.id)}
                className="size-8 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}


      {canTag && (
        <Button variant="outline" className="rounded-pill w-full" onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1.5" /> Tag a brand
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-[18px]">Tag a brand</SheetTitle>
          </SheetHeader>

          <div className="pt-3 pb-6 space-y-4">
            <div>
              <SectionLabel className="px-0 mt-0 mb-1.5">Brand</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {brands.map((b) => (
                  <Chip key={b.id} active={brandId === b.id} onClick={() => pickBrand(b.id)}>
                    {b.brand_name}
                  </Chip>
                ))}
                {!brands.length && (
                  <p className="font-body text-[13px] text-muted-foreground">
                    No brands on STRAND to pick from yet.
                  </p>
                )}
              </div>
              <div className="mt-2.5">
                <SectionLabel className="px-0 mt-0 mb-1.5">
                  Or type a brand that isn't on STRAND
                </SectionLabel>
                <Input
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    if (e.target.value.trim()) setBrandId("");
                  }}
                  maxLength={60}
                  placeholder="Brand name"
                />
              </div>
            </div>

            {canPromote && (
            <div>
              <SectionLabel className="px-0 mt-0 mb-1.5">Kind of tag</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={tagType === "editorial"} onClick={() => pickType("editorial")}>
                  Editorial
                </Chip>
                {canPromote && (
                  <Chip active={tagType === "promoted"} onClick={() => pickType("promoted")}>
                    Promoted
                  </Chip>
                )}
              </div>
              <p className="mt-1.5 font-body text-[12px] text-muted-foreground leading-snug">
                {tagType === "promoted"
                  ? "A promoted tag is paid placement. The disclosure below is shown as plain text next to the brand name, everywhere the tag appears."
                  : "An editorial tag is a straight credit. It carries no disclosure and no promotional styling."}
              </p>
            </div>
            )}

            {canPromote && !!brandId && tagType === "promoted" && (
              <>
                <div>
                  <SectionLabel className="px-0 mt-0 mb-1.5">Disclosure label</SectionLabel>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={120}
                    placeholder={defaultDisclosure(brandName || "the brand")}
                  />
                  {disclosureMissing && (
                    <p className="mt-1.5 font-body text-[12px] text-destructive">
                      A promoted tag can't be saved without a disclosure label.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <SectionLabel className="px-0 mt-0 mb-1.5">Starts (optional)</SectionLabel>
                    <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                  </div>
                  <div>
                    <SectionLabel className="px-0 mt-0 mb-1.5">Ends (optional)</SectionLabel>
                    <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                  </div>
                </div>
                <SurfaceCard tone="gold">
                  <p className="font-body text-[12px] leading-snug">
                    Outside these dates the tag is hidden completely, rather than shown without the
                    disclosure.
                  </p>
                </SurfaceCard>
              </>
            )}

            <Button
              className="rounded-pill w-full"
              onClick={submit}
              disabled={save.isPending || !hasBrand || disclosureMissing}
            >
              Save tag
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
