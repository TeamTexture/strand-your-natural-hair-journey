import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBrandProfile } from "@/hooks/useBrandOffers";
import { BRAND_CATEGORIES } from "@/lib/brandCategories";
import { convertHeicToJpeg } from "@/lib/imagePrep";

async function resizeToWebp(file: File, maxDim = 512, quality = 0.9): Promise<Blob> {
  const src = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
    ? await convertHeicToJpeg(file)
    : file;
  const url = URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
import { toast } from "sonner";

/**
 * Brand-owned profile editor. Populates the public brand page (logo, about,
 * socials, website, contact, category). Fields left blank simply don't render
 * on the public page — the empty-state grace pattern.
 */
const BrandProfileEditor = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useBrandProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBrandName(profile.brand_name ?? "");
    setCategory((profile as { category?: string | null }).category ?? "");
    setAbout((profile as { about?: string | null }).about ?? "");
    setWebsite(profile.website ?? "");
    setInstagram((profile as { instagram_handle?: string | null }).instagram_handle ?? "");
    setTiktok((profile as { tiktok_handle?: string | null }).tiktok_handle ?? "");
    setContactEmail((profile as { contact_email?: string | null }).contact_email ?? "");
    setLogoPath(profile.logo_path ?? null);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (!logoPath) { setLogoUrl(null); return; }
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(logoPath, 60 * 60)
      .then(({ data }) => { if (!cancelled) setLogoUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [logoPath]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (!brandName.trim()) throw new Error("Brand name is required");
      if (!category) throw new Error("Please pick a brand category");
      if (!about.trim() || about.trim().length < 30) {
        throw new Error("Please add a short description (30+ characters)");
      }
      const { error } = await supabase
        .from("brand_profiles")
        .update({
          brand_name: brandName.trim(),
          category,
          about: about.trim(),
          website: website.trim() || null,
          instagram_handle: instagram.trim().replace(/^@/, "") || null,
          tiktok_handle: tiktok.trim().replace(/^@/, "") || null,
          contact_email: contactEmail.trim() || null,
          logo_path: logoPath,
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-profile"] });
      qc.invalidateQueries({ queryKey: ["brand-detail"] });
      qc.invalidateQueries({ queryKey: ["consumer", "brands-directory"] });
      toast.success("Brand profile saved");
      nav("/brand");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogo = async (file: File | null) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const blob = await resizeToWebp(file, 512, 0.9);
      const path = `${user.id}/logo-${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from("brand-assets")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      setLogoPath(path);
      toast.success("Logo uploaded — remember to save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Brand profile" onBack={() => nav("/brand")} />
      <div className="px-5 pb-10 space-y-5">
        <p className="text-[12px] font-body text-foreground/70 leading-snug">
          This is what members see on your public brand page. Blank fields simply won't show.
        </p>

        <SurfaceCard className="space-y-3">
          <SectionLabel className="!px-0 !mt-0">Logo</SectionLabel>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative size-20 rounded-2xl border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Brand logo" className="w-full h-full object-cover" />
              ) : (
                <Camera className="size-6 text-muted-foreground" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-body text-foreground/80 leading-snug">
                Square PNG or WebP. Tap to upload — we'll resize to 512×512.
              </p>
              {logoPath && (
                <button
                  type="button"
                  onClick={() => setLogoPath(null)}
                  className="mt-1.5 text-[11px] text-destructive font-body"
                >
                  Remove logo
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogo(e.target.files?.[0] ?? null)}
            />
          </div>
        </SurfaceCard>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Brand name *</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Category *</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
            >
              <option value="">Choose a category…</option>
              {BRAND_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              About your brand *
            </Label>
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={5}
              placeholder="What you make, who you make it for, and what makes it worth a place in a natural hair routine."
            />
            <p className="text-[10.5px] text-muted-foreground font-body">
              Shown as your description on the STRAND Brands page. {about.trim().length}/30 min.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Website</Label>
            <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="handle" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">TikTok</Label>
              <Input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="handle" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Public contact email
            </Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@yourbrand.com" />
            <p className="text-[10.5px] text-muted-foreground font-body">
              Optional — shown to members who want to reach out.
            </p>
          </div>
        </div>

        <Button
          variant="gold"
          size="pill"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full"
        >
          {save.isPending ? "Saving…" : "Save brand profile"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BrandProfileEditor;
