import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ImagePlus, X, Eye, EyeOff, Pencil } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllCuratedOffers,
  useCuratedOfferMutations,
  uploadCuratedOfferImage,
  useCuratedOfferImage,
  londonToday,
  type CuratedOffer,
} from "@/hooks/useCuratedOffers";

interface FormState {
  brand_name: string;
  title: string;
  description: string;
  discount_code: string;
  external_url: string;
  starts_on: string;
  ends_on: string;
  sort_order: string;
}

const EMPTY: FormState = {
  brand_name: "",
  title: "",
  description: "",
  discount_code: "",
  external_url: "",
  starts_on: "",
  ends_on: "",
  sort_order: "0",
};

function toForm(o: CuratedOffer): FormState {
  return {
    brand_name: o.brand_name,
    title: o.title,
    description: o.description ?? "",
    discount_code: o.discount_code ?? "",
    external_url: o.external_url ?? "",
    starts_on: o.starts_on ?? "",
    ends_on: o.ends_on ?? "",
    sort_order: String(o.sort_order ?? 0),
  };
}

/** Small thumbnail for the list rows. */
const Thumb = ({ path }: { path: string | null }) => {
  const { data: url } = useCuratedOfferImage(path);
  if (!url) return null;
  return <img src={url} alt="" className="size-12 rounded-[10px] object-cover shrink-0" />;
};

/** Human status for an offer row — never a raw column value. */
function statusOf(o: CuratedOffer): { label: string; tone: string } {
  const today = londonToday();
  if (o.hidden_at) return { label: "Hidden", tone: "bg-muted text-muted-foreground" };
  if (!o.is_active) return { label: "Switched off", tone: "bg-muted text-muted-foreground" };
  if (o.starts_on && o.starts_on > today) return { label: "Scheduled", tone: "bg-primary/15 text-primary" };
  if (o.ends_on && o.ends_on < today) return { label: "Expired", tone: "bg-muted text-muted-foreground" };
  return { label: "Live", tone: "bg-good/15 text-good" };
}

const AdminCuratedOffers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: offers, isLoading } = useAllCuratedOffers();
  const { create, update, remove } = useCuratedOfferMutations();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setImageFile(null);
    setImagePreview(null);
    setShowForm(true);
  };

  const openEdit = (o: CuratedOffer) => {
    setEditingId(o.id);
    setForm(toForm(o));
    setImageFile(null);
    setImagePreview(null);
    setShowForm(true);
  };

  const pickImage = (file: File | null) => {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const save = async () => {
    if (!form.brand_name.trim() || !form.title.trim()) {
      toast.error("Brand name and title are required");
      return;
    }
    if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) {
      toast.error("The end date can't be before the start date");
      return;
    }
    setBusy(true);
    try {
      let image_path: string | undefined;
      if (imageFile) image_path = await uploadCuratedOfferImage(imageFile);

      const payload = {
        brand_name: form.brand_name.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_code: form.discount_code.trim() || null,
        external_url: form.external_url.trim() || null,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        sort_order: Number(form.sort_order) || 0,
        ...(image_path ? { image_path } : {}),
      };

      if (editingId) {
        await update.mutateAsync({ id: editingId, patch: payload });
        toast.success("Offer updated");
      } else {
        await create.mutateAsync({ ...payload, created_by: user?.id ?? null });
        toast.success("Offer created");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
      setImageFile(null);
      setImagePreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the offer");
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async (o: CuratedOffer) => {
    try {
      await update.mutateAsync({
        id: o.id,
        patch: o.hidden_at
          ? { hidden_at: null, hidden_by: null }
          : { hidden_at: new Date().toISOString(), hidden_by: user?.id ?? null },
      });
      toast.success(o.hidden_at ? "Offer visible to members" : "Offer hidden from members");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the offer");
    }
  };

  const toggleActive = async (o: CuratedOffer) => {
    try {
      await update.mutateAsync({ id: o.id, patch: { is_active: !o.is_active } });
      toast.success(!o.is_active ? "Offer switched on" : "Offer switched off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the offer");
    }
  };

  const del = async (o: CuratedOffer) => {
    if (!window.confirm(`Delete the ${o.brand_name} offer? This can't be undone.`)) return;
    try {
      await remove.mutateAsync(o.id);
      toast.success("Offer deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the offer");
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Curated offers" onBack={() => navigate("/admin")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed">
          Deals STRAND arranges directly. These appear in their own section on the member
          Discounts &amp; offers page and are completely separate from paid brand campaigns —
          no slots, no booking, no billing.
        </p>

        {!showForm && (
          <Button variant="gold" size="pill" className="w-full gap-1.5" onClick={openNew}>
            <Plus className="size-4" /> New curated offer
          </Button>
        )}

        {showForm && (
          <SurfaceCard className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel className="!px-0 !mt-0">
                {editingId ? "Edit offer" : "New offer"}
              </SectionLabel>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-muted-foreground"
                aria-label="Close form"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Brand or partner name</Label>
              <Input value={form.brand_name} onChange={(e) => set("brand_name")(e.target.value)} placeholder="Team Texture" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Offer title</Label>
              <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="15% off TT Heat Hats" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
                placeholder="What the member gets, and anything they need to know."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Discount code (optional)</Label>
              <Input value={form.discount_code} onChange={(e) => set("discount_code")(e.target.value)} placeholder="STRAND15" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Link (optional)</Label>
              <Input
                value={form.external_url}
                onChange={(e) => set("external_url")(e.target.value)}
                placeholder="https://www.teamtexture.co.uk"
                inputMode="url"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">Starts (optional)</Label>
                <Input type="date" value={form.starts_on} onChange={(e) => set("starts_on")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Ends (optional)</Label>
                <Input type="date" value={form.ends_on} onChange={(e) => set("ends_on")(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Order on the page (lower shows first)</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => set("sort_order")(e.target.value)}
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Image (optional)</Label>
              <label className="flex items-center gap-2 text-[12px] font-body text-primary cursor-pointer">
                <ImagePlus className="size-4" />
                {imageFile ? imageFile.name : "Choose an image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                />
              </label>
              {imagePreview && (
                <img src={imagePreview} alt="" className="w-full h-28 object-cover rounded-[12px]" />
              )}
            </div>

            <Button variant="gold" size="pill" className="w-full" disabled={busy} onClick={save}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : editingId ? "Save changes" : "Create offer"}
            </Button>
          </SurfaceCard>
        )}

        <SectionLabel>All curated offers</SectionLabel>

        {isLoading && <LoadingDot />}

        {!isLoading && (offers?.length ?? 0) === 0 && (
          <p className="text-[12.5px] font-body text-muted-foreground">
            No curated offers yet.
          </p>
        )}

        {(offers ?? []).map((o) => {
          const status = statusOf(o);
          return (
            <SurfaceCard key={o.id} className="space-y-2.5">
              <div className="flex items-start gap-3">
                <Thumb path={o.image_path} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] leading-tight">{o.brand_name}</p>
                  <p className="text-[12px] font-body text-foreground/80">{o.title}</p>
                  {o.discount_code && (
                    <p className="text-[11px] font-body text-muted-foreground mt-0.5">
                      Code {o.discount_code}
                    </p>
                  )}
                </div>
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${status.tone}`}>
                  {status.label}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="gap-1 text-[11px]" onClick={() => openEdit(o)}>
                  <Pencil className="size-3" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-[11px]" onClick={() => toggleHidden(o)}>
                  {o.hidden_at ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                  {o.hidden_at ? "Unhide" : "Hide"}
                </Button>
                <Button variant="outline" size="sm" className="text-[11px]" onClick={() => toggleActive(o)}>
                  {o.is_active ? "Switch off" : "Switch on"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-[11px] text-destructive border-destructive/40"
                  onClick={() => del(o)}
                >
                  <Trash2 className="size-3" /> Delete
                </Button>
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </ScreenLayout>
  );
};

export default AdminCuratedOffers;
