import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
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

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;
type DayKey = typeof DAYS[number]["key"];
type DayHours = { closed: boolean; open: string; close: string };
type OpeningHours = Record<DayKey, DayHours>;

const defaultHours = (): OpeningHours =>
  DAYS.reduce((acc, d) => {
    acc[d.key] = {
      closed: d.key === "sun",
      open: "09:00",
      close: "17:00",
    };
    return acc;
  }, {} as OpeningHours);

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

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary pt-2">
    {children}
  </p>
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
    specialisms: [] as string[],
    business_phone: "",
    business_email: "",
    address_line1: "",
    address_line2: "",
    city: "",
  });
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [specInput, setSpecInput] = useState("");

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
      specialisms: (profile.specialisms as string[] | null) ?? [],
      business_phone: profile.business_phone ?? "",
      business_email: profile.business_email ?? "",
      address_line1: profile.address_line1 ?? "",
      address_line2: profile.address_line2 ?? "",
      city: profile.city ?? "",
    });
    const savedHours = profile.opening_hours as OpeningHours | null;
    if (savedHours && typeof savedHours === "object") {
      setHours({ ...defaultHours(), ...savedHours });
    }
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
          specialisms: form.specialisms,
          business_phone: form.business_phone || null,
          business_email: form.business_email || null,
          address_line1: form.address_line1 || null,
          address_line2: form.address_line2 || null,
          city: form.city || null,
          opening_hours: hours as never,
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

  const addSpecialism = () => {
    const v = specInput.trim();
    if (!v) return;
    if (form.specialisms.includes(v)) { setSpecInput(""); return; }
    if (form.specialisms.length >= 12) {
      toast("Max 12 specialisms");
      return;
    }
    setForm((f) => ({ ...f, specialisms: [...f.specialisms, v] }));
    setSpecInput("");
  };

  const removeSpecialism = (s: string) =>
    setForm((f) => ({ ...f, specialisms: f.specialisms.filter((x) => x !== s) }));

  const updateHours = (day: DayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));

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

        {profile.is_published && (
          <SurfaceCard>
            <p className="text-xs font-body leading-snug text-foreground/80">
              <span className="font-semibold uppercase tracking-[0.15em] text-good">
                Live —{" "}
              </span>
              Changes save immediately and appear on your directory card for
              every STRAND member.
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
            <p className="text-[11px] font-body text-muted-foreground leading-snug">
              Shown as the round headshot on your directory card.
            </p>
          </div>
        </div>

        <SectionHead>Identity</SectionHead>

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

        <SectionHead>Specialisms</SectionHead>
        <p className="text-[11px] font-body text-muted-foreground leading-snug -mt-1">
          Short tags shown as chips on your card (e.g. "Afro Hair",
          "Traction Alopecia"). Max 12.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {form.specialisms.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 bg-primary/10 text-foreground text-[11px] px-2 py-1 rounded-full"
            >
              {s}
              <button
                onClick={() => removeSpecialism(s)}
                className="text-muted-foreground hover:text-alert-dark"
                aria-label={`Remove ${s}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {form.specialisms.length === 0 && (
            <span className="text-[11px] text-muted-foreground font-body">
              None yet.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={specInput}
            onChange={(e) => setSpecInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpecialism();
              }
            }}
            placeholder="Add a specialism"
          />
          <Button type="button" variant="outline" onClick={addSpecialism}>
            <Plus className="size-4" />
          </Button>
        </div>

        <SectionHead>Location</SectionHead>
        <Field label="Address line 1">
          <Input
            value={form.address_line1}
            onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
            placeholder="12 Harley Street"
          />
        </Field>
        <Field label="Address line 2">
          <Input
            value={form.address_line2}
            onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
            placeholder="Optional"
          />
        </Field>
        <Field label="City / town">
          <Input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            placeholder="London"
          />
        </Field>
        <Field label="Postcode">
          <Input
            value={form.postcode}
            onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
            placeholder="W1G 9PG"
          />
        </Field>
        <Field label="Region / area served">
          <Input
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="London & remote"
          />
        </Field>

        <SectionHead>Contact & booking</SectionHead>
        <Field label="Contact email">
          <Input
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            placeholder="hello@yourclinic.co.uk"
          />
        </Field>
        <Field label="Business phone">
          <Input
            type="tel"
            value={form.business_phone}
            onChange={(e) => setForm((f) => ({ ...f, business_phone: e.target.value }))}
            placeholder="+44 20 7946 0000"
          />
        </Field>
        <Field label="Business email">
          <Input
            type="email"
            value={form.business_email}
            onChange={(e) => setForm((f) => ({ ...f, business_email: e.target.value }))}
            placeholder="admin@yourclinic.co.uk"
          />
        </Field>
        <Field label="Booking URL">
          <Input
            value={form.booking_url}
            onChange={(e) => setForm((f) => ({ ...f, booking_url: e.target.value }))}
            placeholder="https://"
          />
        </Field>
        <Field label="Website">
          <Input
            value={form.website_url}
            onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
            placeholder="https://"
          />
        </Field>
        <Field label="Instagram">
          <Input
            value={form.instagram_handle}
            onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))}
            placeholder="@yourhandle"
          />
        </Field>

        <SectionHead>Opening hours</SectionHead>
        <p className="text-[11px] font-body text-muted-foreground leading-snug -mt-1">
          Toggle off any day you're closed. 24-hour format.
        </p>
        <div className="rounded-[14px] border border-border bg-card divide-y divide-border">
          {DAYS.map((d) => {
            const dh = hours[d.key];
            return (
              <div key={d.key} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-body font-semibold text-foreground">
                    {d.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-body text-muted-foreground">
                      {dh.closed ? "Closed" : "Open"}
                    </span>
                    <Switch
                      checked={!dh.closed}
                      onCheckedChange={(v) => updateHours(d.key, { closed: !v })}
                      aria-label={`${d.label} open`}
                    />
                  </div>
                </div>
                {!dh.closed && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-body uppercase tracking-[0.12em] text-muted-foreground">
                        Opens
                      </Label>
                      <Input
                        type="time"
                        value={dh.open}
                        onChange={(e) => updateHours(d.key, { open: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-body uppercase tracking-[0.12em] text-muted-foreground">
                        Closes
                      </Label>
                      <Input
                        type="time"
                        value={dh.close}
                        onChange={(e) => updateHours(d.key, { close: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <SectionHead>Services</SectionHead>
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

        <SectionHead>Gallery</SectionHead>
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

        <div className="rounded-[12px] border border-border bg-card p-3">
          <p className="text-[11px] font-body text-muted-foreground leading-snug">
            <span className="font-semibold text-foreground">Offers &amp; discounts</span>
            {" "}are managed on the{" "}
            <button
              onClick={() => nav("/pro/offers")}
              className="underline text-primary underline-offset-2"
            >
              Offers page
            </button>
            . The currently-live offer shows on your directory card.
          </p>
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
