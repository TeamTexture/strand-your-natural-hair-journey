// Tools & accessories saved to the member's wishlist (e.g. added from a brand
// offer product page). Kept separate from `MyToolsSection`, which only lists
// tools the member actually owns.
import { ArrowUpFromLine, Trash2 } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useUserTools } from "@/hooks/useUserTools";
import { toast } from "sonner";

const WishlistTools = () => {
  const { tools, updateTool, deleteTool } = useUserTools();
  const wished = tools.filter((t) => t.on_wishlist);
  if (wished.length === 0) return null;

  return (
    <div className="px-5 pb-4 space-y-3">
      <SectionLabel>Tools & accessories</SectionLabel>
      {wished.map((t) => (
        <SurfaceCard key={t.id} className="p-4">
          <div className="flex items-center gap-3">
            {t.image_url ? (
              <img
                src={t.image_url}
                alt={t.name}
                className="size-12 rounded-xl object-cover bg-muted shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="size-12 rounded-xl bg-muted shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-body text-[14px] font-medium break-words">{t.name}</p>
              {t.brand && (
                <p className="text-[12px] text-muted-foreground break-words">{t.brand}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="goldOutline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                const ok = await updateTool(t.id, { on_wishlist: false, on_shelf: true });
                if (ok) toast.success("Moved to My Tools");
              }}
            >
              <ArrowUpFromLine className="size-4 mr-1.5" /> Move to My Tools
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              aria-label={`Remove ${t.name} from wishlist`}
              onClick={async () => {
                await deleteTool(t);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
};

export default WishlistTools;
