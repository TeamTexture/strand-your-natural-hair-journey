// Admin review queue for brand shelf products. This is the only place a shelf
// item submitted by a brand can be approved so it appears on the brand's page
// and can be added by members.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { smartBack } from "@/lib/smartBack";
import { toast } from "sonner";
import {
  useAdminShelfItems,
  useDecideShelfItem,
  type AdminShelfItem,
} from "@/hooks/useAdminShelfReview";

const TABS = [
  { key: "pending", label: "Awaiting review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const kindLabel = (kind: string | null) =>
  kind === "tool" ? "Tool" : kind === "supplement" ? "Supplement" : "Product";

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 text-[12px] font-body min-w-0">
    <span className="text-muted-foreground w-[92px] shrink-0">{label}</span>
    <span className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
  </div>
);

const ItemCard = ({ item }: { item: AdminShelfItem }) => {
  const decide = useDecideShelfItem();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const images = (item.image_urls ?? []).filter(Boolean);
  const ingredients = item.ingredients ?? [];
  const features = item.key_features ?? [];

  const submit = (decision: "approved" | "rejected") =>
    decide.mutate(
      { id: item.id, decision, reason: decision === "rejected" ? reason.trim() : undefined },
      {
        onSuccess: () => {
          setRejecting(false);
          setReason("");
          toast.success(decision === "approved" ? "Approved — the brand can publish it" : "Sent back to the brand");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
      },
    );

  return (
    <SurfaceCard className="p-3.5">
      <div className="flex items-start gap-3">
        {images[0] && (
          <img
            src={images[0]}
            alt={item.name}
            className="size-16 rounded-[10px] object-cover bg-muted shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] leading-tight">{item.name}</p>
          <p className="mt-0.5 text-[12px] font-body text-muted-foreground">{item.brand_name}</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
              {kindLabel(item.kind)}
            </span>
            <span className="text-[10.5px] font-body text-muted-foreground">
              Updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {item.description && (
        <p className="mt-2.5 text-[12.5px] font-body leading-relaxed whitespace-pre-line">
          {item.description}
        </p>
      )}

      <div className="mt-2.5 space-y-1">
        {ingredients.length > 0 && (
          <Meta
            label={item.kind === "supplement" ? "Supplement facts" : "Ingredients"}
            value={`${ingredients.length} listed — ${ingredients.slice(0, 8).join(", ")}${ingredients.length > 8 ? "…" : ""}`}
          />
        )}
        {ingredients.length > 0 && item.ingredients_source && (
          <Meta
            label="Source"
            value={
              item.ingredients_source === "manual"
                ? "Entered by the brand"
                : item.ingredients_source === "scan"
                  ? "Read from a label photo"
                  : item.ingredients_source === "link"
                    ? "Read from the product page"
                    : item.ingredients_source
            }
          />
        )}
        {features.length > 0 && <Meta label="Key features" value={features.join(", ")} />}
        {item.materials && item.materials.length > 0 && (
          <Meta label="Materials" value={item.materials.join(", ")} />
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
        {item.external_url && (
          <a
            href={item.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-body text-primary"
          >
            Buy link <ExternalLink className="size-3 opacity-60" />
          </a>
        )}
        {item.source_url && item.source_url !== item.external_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-body text-primary"
          >
            Scanned page <ExternalLink className="size-3 opacity-60" />
          </a>
        )}
      </div>

      {item.approval_status === "rejected" && item.rejection_reason && (
        <p className="mt-2 text-[12px] font-body text-destructive leading-snug">
          Sent back: {item.rejection_reason}
        </p>
      )}
      {item.approval_status === "approved" && (
        <p className="mt-2 text-[12px] font-body text-muted-foreground">
          {item.is_published ? "Live on the brand's page." : "Approved — the brand has not shown it yet."}
        </p>
      )}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What does the brand need to change?"
            className="text-[13px] font-body"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-pill flex-1"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-pill flex-1"
              disabled={reason.trim().length < 4 || decide.isPending}
              onClick={() => submit("rejected")}
            >
              {decide.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send back"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {item.approval_status !== "approved" && (
            <Button
              size="sm"
              variant="gold"
              className="rounded-pill flex-1"
              disabled={decide.isPending}
              onClick={() => submit("approved")}
            >
              {decide.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check className="size-3.5 mr-1" /> Approve
                </>
              )}
            </Button>
          )}
          {item.approval_status !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-pill flex-1"
              onClick={() => setRejecting(true)}
            >
              <X className="size-3.5 mr-1" /> Send back
            </Button>
          )}
        </div>
      )}
    </SurfaceCard>
  );
};

const AdminShelfReview = () => {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("pending");
  const { data, isLoading } = useAdminShelfItems();

  const grouped = useMemo(() => {
    const all = data ?? [];
    return {
      pending: all.filter((i) => i.approval_status === "pending"),
      approved: all.filter((i) => i.approval_status === "approved"),
      rejected: all.filter((i) => i.approval_status === "rejected"),
    };
  }, [data]);

  const items = grouped[tab];

  return (
    <ScreenLayout>
      <TitleBar title="Brand shelf review" onBack={() => smartBack(nav, "/admin")} />

      <div className="px-4 pb-8 space-y-3">
        <SurfaceCard className="p-3.5">
          <p className="text-[12.5px] font-body text-muted-foreground leading-relaxed">
            Products brands add to their permanent shelf. A shelf item only appears on the
            brand's page — and can only be added by members — once it is approved here. Any
            later edit sends it back to this queue automatically.
          </p>
        </SurfaceCard>

        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-pill py-2 text-[11.5px] font-body border transition-colors ${
                tab === t.key
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {t.label}
              {grouped[t.key].length > 0 ? ` (${grouped[t.key].length})` : ""}
            </button>
          ))}
        </div>

        <SectionLabel className="!px-0">
          {TABS.find((t) => t.key === tab)?.label}
        </SectionLabel>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="✦" message="Nothing here" tone="card" />
        ) : (
          <div className="space-y-2">
            {items.map((i) => (
              <ItemCard key={i.id} item={i} />
            ))}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminShelfReview;
