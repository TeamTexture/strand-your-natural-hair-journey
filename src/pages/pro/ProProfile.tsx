import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Discipline = Database["public"]["Enums"]["pro_discipline"];
type ProProfileRow = Database["public"]["Tables"]["pro_profiles"]["Row"];

interface Service {
  name: string;
  description?: string;
  price?: string;
}

const disciplines: Discipline[] = [
  "Trichologist",
  "Dermatologist",
  "Curl Specialist",
  "Colourist",
  "Stylist",
];

const BUCKET = "pro-photos";

const useSignedUrl = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

const ProProfile = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["pro_profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pro_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as ProProfileRow | null;
    },
  });

  const [form, setForm] = useState({
    display_name: "",
    discipline: "Trichologist" as Discipline,
    bio: "",
    location: "",
    postcode: "",
    contact_email: "",
    booking_url: "",
    website_url: "",
    instagram_handle: "",
    avatar_path: null as string | null,
    photos: [] as string[],
    services: [] as Service[],
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      discipline: profile.discipline,
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      postcode: profile.postcode ?? "",
      contact_email: profile.contact_email ?? "",
      booking_url: profile.booking_url ?? "",
      website_url: profile.website_url ?? "",
      instagram_handle: profile.instagram_handle ?? "",
      avatar_path: profile.avatar_path,
      photos: profile.photos ?? [],
      services: Array.isArray(profile.services)
        ? (profile.services as unknown as Service[])
        : [],
    });
  }, [profile]);

  const avatarUrl = useSignedUrl(form.avatar_path);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("pro_profiles")
        .update({
          display_name: form.display_name.trim(),
          discipline: form.discipline,
          bio: form.bio || null,
          location: form.location || null,
          postcode: form.postcode || null,
          contact_email: form.contact_email || null,
          booking_url: form.booking_url || null,
          website_url: form.website_url || null,
          instagram_handle: form.instagram_handle || null,
          avatar_path: form.avatar_path,
          photos: form.photos,
          services: form.services as never,
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["pro_profile", user?.id] });
    },
    onError: (e: Error) => {
      console.error(e);
      toast.error(e.message);
    },
  });

  const uploadFile = async (file: File, kind: "avatar" | "gallery") => {
    if (!user) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) { toast.error(error.message); return; }
    if (kind === "avatar") {
      setForm((f) => ({ ...f, avatar_path: path }));
    } else {
      setForm((f) => ({ ...f, photos: [...f.photos, path] }));
    }
  };

  const removePhoto = (path: string) =>
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== path) }));

  if (isLoading) return <LoadingDot />;

  if (!profile) {
    return (
      <ScreenLayout>
        <TitleBar title="Profile" onBack={() => nav("/pro")} />
        <div className="px-5 py-8">
          <SurfaceCard>
            <p className="text-sm">
              Your professional profile hasn't been set up yet. Please contact
              STRAND support if you've been approved but can't see it here.
            </p>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Profile" onBack={() => nav("/pro")} />
      <div className="px-5 pb-8 space-y-4">
        {!profile.is_published && (
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-snug">
              <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                Draft —{" "}
              </span>
              Your profile is saved but not yet public. STRAND admin will publish it after review.
            </p>
          </SurfaceCard>
        )}

        <SectionLabel>Public listing</SectionLabel>

        <div className="flex items-center gap-4">
          <div className="size-20 rounded-full overflow-hidden bg-primary/10 border border-border shrink-0 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No photo</span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-body px-3 py-2 rounded-full border border-border cursor-pointer hover:border-primary/50">
              <Upload className="size-3.5" /> Upload avatar
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f, "avatar");
                }}
              />
            </label>
          </div>
        </div>

        <Field label="Display name">
          <Input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </Field>

        <Field label="Discipline">
          <Select value={form.discipline} onValueChange={(v) => setForm((f) => ({ ...f, discipline: v as Discipline }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {disciplines.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Bio">
          <Textarea
            rows={4}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Tell clients about your practice."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </Field>
          <Field label="Postcode">
            <Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} />
          </Field>
        </div>

        <Field label="Contact email">
          <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
        </Field>
        <Field label="Booking URL">
          <Input value={form.booking_url} onChange={(e) => setForm((f) => ({ ...f, booking_url: e.target.value }))} placeholder="https://" />
        </Field>
        <Field label="Website">
          <Input value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} placeholder="https://" />
        </Field>
        <Field label="Instagram">
          <Input value={form.instagram_handle} onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))} placeholder="@yourhandle" />
        </Field>

        <SectionLabel>Services</SectionLabel>
        <div className="space-y-2.5">
          {form.services.map((s, i) => (
            <SurfaceCard key={i}>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Service name"
                    value={s.name}
                    onChange={(e) => setForm((f) => {
                      const list = [...f.services];
                      list[i] = { ...list[i], name: e.target.value };
                      return { ...f, services: list };
                    })}
                  />
                  <button
                    onClick={() => setForm((f) => ({ ...f, services: f.services.filter((_, x) => x !== i) }))}
                    className="p-2 text-muted-foreground hover:text-alert-dark"
                    aria-label="Remove service"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Description"
                  value={s.description ?? ""}
                  onChange={(e) => setForm((f) => {
                    const list = [...f.services];
                    list[i] = { ...list[i], description: e.target.value };
                    return { ...f, services: list };
                  })}
                />
                <Input
                  placeholder="Price (e.g. £120)"
                  value={s.price ?? ""}
                  onChange={(e) => setForm((f) => {
                    const list = [...f.services];
                    list[i] = { ...list[i], price: e.target.value };
                    return { ...f, services: list };
                  })}
                />
              </div>
            </SurfaceCard>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setForm((f) => ({ ...f, services: [...f.services, { name: "" }] }))}
          >
            <Plus className="size-4 mr-1" /> Add service
          </Button>
        </div>

        <SectionLabel>Photos</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {form.photos.map((p) => (
            <PhotoTile key={p} path={p} onRemove={() => removePhoto(p)} />
          ))}
          <label className="aspect-square rounded-[12px] border border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-primary/50">
            <Upload className="size-4 mb-1" /> Add
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f, "gallery");
              }}
            />
          </label>
        </div>

        <div className="pt-4">
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>
    </ScreenLayout>
  );
};

const PhotoTile = ({ path, onRemove }: { path: string; onRemove: () => void }) => {
  const url = useSignedUrl(path);
  return (
    <div className="relative aspect-square rounded-[12px] overflow-hidden bg-secondary">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center"
        aria-label="Remove photo"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};

export default ProProfile;
