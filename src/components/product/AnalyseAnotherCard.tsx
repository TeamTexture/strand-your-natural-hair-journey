// Lets a member start a brand-new product analysis without walking back to
// the products page first — offered right under the save options once an
// analysis has finished.

import { useState } from "react";
import { Camera, Link2, Loader2, ScanLine } from "lucide-react";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";

interface Props {
  /** Where the new analysis should return to, if the flow started somewhere specific. */
  returnTo?: string | null;
}

const AnalyseAnotherCard = ({ returnTo }: Props) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const { startScan, busy: scanBusy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();
  const busy = scanBusy || urlBusy;
  const extras = returnTo ? { returnTo } : undefined;

  const handleUrl = () => {
    if (!linkUrl.trim()) return;
    void startUrlScan(linkUrl, "shelf", extras);
    setLinkUrl("");
  };

  return (
    <>
      <SectionLabel className="!px-0">Analyse another product</SectionLabel>
      <SurfaceCard className="space-y-3">
        <p className="text-[12px] font-body text-muted-foreground">
          Scan the front and back of the next one, or paste its link — no need
          to go back to your products first.
        </p>
        <Button
          variant="goldOutline"
          size="pill"
          className="w-full whitespace-nowrap"
          onClick={() => setSheetOpen(true)}
          disabled={busy}
        >
          <Camera className="size-4 mr-1.5" /> Scan a new product
        </Button>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Paste product link"
              className="pl-8 h-10 text-sm"
              inputMode="url"
              autoCapitalize="none"
            />
          </div>
          <Button
            size="pill"
            variant="gold"
            className="shrink-0 whitespace-nowrap"
            onClick={handleUrl}
            disabled={busy || !linkUrl.trim()}
          >
            {urlBusy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
          </Button>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Stay on the analysis screen while it runs — leaving it early
          interrupts the analysis.
        </p>
      </SurfaceCard>

      <DualPhotoCaptureSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        busy={scanBusy}
        onSubmit={async (front, back) => {
          await startScan(front, back, "shelf", extras);
          setSheetOpen(false);
        }}
      />
    </>
  );
};

export default AnalyseAnotherCard;
