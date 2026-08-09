import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
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
import { BRAND_CATEGORIES } from "@/lib/brandCategories";
import { convertHeicToJpeg } from "@/lib/imagePrep";
import { extractBrandColoursFromBlob, type BrandColours } from "@/lib/brandColour";
import { toast } from "sonner";
import { smartBack } from "@/lib/smartBack";

/**
 * Admin-side editor for a brand's public profile. Same fields the brand edits
 * itself, but every save writes a diff to brand_profile_admin_edits so there is
 * a permanent record of which admin changed what, and when.
 */
const ABOUT_MAX = 300;

const FIELD_LABELS: Record<string, string> = {
  brand_name: "Brand name",
  category: "Category",
  about: "Description",
  website: "Website",
  instagram_handle: "Instagram",
  tiktok_handle: "TikTok",
  contact_email: "Contact email",
  contact_name: "Contact name",
  logo_path: "Logo",
};

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

interface EditRow {
  id: string;
  admin_user_id: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

const AdminBrandEdit = () => {
  const nav = useNavigate();
  const { userId = "" } = useParams();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin", "brand-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["admin", "brand-profile-edits", userId],
    enabled: !!userId,
    queryFn: async (): Promise<EditRow[]> => {
      const { data, error } = await supabase
        .from("brand_profile_admin_edits")
        .select("id, admin_user_id, changes, created_at")
        .eq("brand_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as EditRow[];
    },
  });

  const adminIds = useMemo(
    () => Array.from(new Set(history.map((h) => h.admin_user_id))),
    [history],
  );
  const { data: adminNames = {} } = useQuery({
    queryKey: ["admin", "names", adminIds],
    enabled: adminIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", adminIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => { map[p.user_id] = p.display_name ?? "Admin"; });
      return map;
    },
  });

  const [brandName, setBrandName] = useState("");
  const [contactName, setContactName] = useState("");
  const [category, setCategory] = useState("");
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoColours, setLogoColours] = useState<BrandColours | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const s = (k: string) => (profile[k] as string | null) ?? "";
    setBrandName(s("brand_name"));
    setContactName(s("contact_name"));
    setCategory(s("category"));
    setAbout(s("about"));
    setWebsite(s("website"));
    setInstagram(s("instagram_handle"));
    setTiktok(s("tiktok_handle"));
    setContactEmail(s("contact_email"));
    setLogoPath((profile.logo_path as string | null) ?? null);
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
      if (!profile) throw new Error("Brand profile not found");
      const { data: me } = await supabase.auth.getUser();
      const adminId = me.user?.id;
      if (!adminId) throw new Error("Sign in required");
      if (!brandName.trim()) throw new Error("Brand name is required");
      if (about.trim().length > ABOUT_MAX) {
        throw new Error(`Description must be ${ABOUT_MAX} characters or fewer`);
      }

      const next: Record<string, string | null> = {
        brand_name: brandName.trim(),
        contact_name: contactName.trim() || null,
        category: category || null,
        about: about.trim() || null,
        website: website.trim() || null,
        instagram_handle: instagram.trim().replace(/^@/, "") || null,
        tiktok_handle: tiktok.trim().replace(/^@/, "") || null,
        contact_email: contactEmail.trim() || null,
        logo_path: logoPath,
      };

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [k, v] of Object.entries(next)) {
        const before = (profile[k] as string | null) ?? null;
        if ((before ?? null) !== (v ?? null)) changes[k] = { from: before, to: v };
      }
      if (Object.keys(changes).length === 0) throw new Error("Nothing has changed");

      const { error } = await supabase
        .from("brand_profiles")
        .update({
          ...next,
          ...(logoColours
            ? {
                brand_colour_primary: logoColours.primary,
                brand_colour_secondary: logoColours.secondary,
                brand_colour_on_primary: logoColours.onPrimary,
                brand_colour_source: logoColours.source,
                brand_colour_updated_at: new Date().toISOString(),
              }
            : {}),
        } as never)
        .eq("user_id", userId);
      if (error) throw error;

      const { error: logError } = await supabase
        .from("brand_profile_admin_edits")
        .insert({
          brand_user_id: userId,
          admin_user_id: adminId,
          changes: changes as never,
        } as never);
      if (logError) throw logError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "brands"] });
      qc.invalidateQueries({ queryKey: ["admin", "brand-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "brand-profile-edits", userId] });
      qc.invalidateQueries({ queryKey: ["brand-profile"] });
      qc.invalidateQueries({ queryKey: ["brand-detail"] });
      qc.invalidateQueries({ queryKey: ["consumer", "brands-directory"] });
      toast.success("Brand profile updated and logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogo = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await resizeToWebp(file, 512, 0.9);
      const path = `${userId}/logo-${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from("brand-assets")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      setLogoPath(path);
      setLogoColours(await extractBrandColoursFromBlob(blob));
      toast.success("Logo uploaded — remember to save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <LoadingDot />;

  if (!profile) {
    return (
      <ScreenLayout>
        <TitleBar title="Brand profile" onBack={smartBack(nav, "/admin/brands")} />
        <div className="px-5">
          <SurfaceCard>
            <p className="text-[13px] font-body text-foreground/70">
              This brand no longer has a profile.
            </p>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Edit brand profile" onBack={smartBack(nav, "/admin/brands")} />
      <div className="px-5 pb-10 space-y-5">
        <p className="text-[12px] font-body text-foreground/70 leading-snug">
          You're editing what members see on {brandName || "this brand"}'s public page. Every change
          is recorded against your admin account.
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
                <img src={logoUrl} alt={`${brandName} logo`} className="w-full h-full object-cover" />
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
                Square PNG or WebP — resized to 512×512 on upload.
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
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
            >
              <option value="">Uncategorised</option>
              {BRAND_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Description</Label>
            <Textarea
              maxLength={ABOUT_MAX}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={5}
            />
            <p className="text-[10.5px] text-muted-foreground font-body">
              {about.trim().length}/{ABOUT_MAX}
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
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contact name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Public contact email</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>

        <Button
          variant="gold"
          size="pill"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>

        <div className="space-y-2">
          <SectionLabel className="!px-0">Admin change history</SectionLabel>
          {history.length === 0 ? (
            <SurfaceCard>
              <p className="text-[12px] font-body text-foreground/60">
                No admin has edited this profile yet.
              </p>
            </SurfaceCard>
          ) : (
            history.map((h) => (
              <SurfaceCard key={h.id} className="space-y-1.5">
                <p className="text-[12px] font-body">
                  <span className="font-medium">{adminNames[h.admin_user_id] ?? "Admin"}</span>
                  {" · "}
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                  </span>
                </p>
                <ul className="space-y-1">
                  {Object.entries(h.changes ?? {}).map(([field, diff]) => (
                    <li key={field} className="text-[11.5px] font-body text-foreground/75 leading-snug">
                      <span className="text-muted-foreground">{FIELD_LABELS[field] ?? field}:</span>{" "}
                      {String(diff.from ?? "—")} → {String(diff.to ?? "—")}
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            ))
          )}
        </div>
      </div>
    </ScreenLayout>
  );
};

export default AdminBrandEdit;
