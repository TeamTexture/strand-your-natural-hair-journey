import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Scissors,
  Trash2,
  UserPlus,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import StylistEditorSheet from "@/components/pro/StylistEditorSheet";
import { smartBack } from "@/lib/smartBack";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  emptySalonDraft,
  useAddSalonOwner,
  useAdminSalons,
  useCreateSalon,
  useMoveProToSalon,
  useRemoveSalonOwner,
  useSalonOwners,
  useUnassignedPros,
  useUpdateSalon,
  type SalonDraft,
  type SalonRow,
} from "@/hooks/useAdminSalons";
import {
  useAddSalonStylist,
  useSalonStylists,
  useSetStylistPublished,
  useUpdateSalonStylist,
  stylistEnquiryEmail,
  type SalonService,
  type StylistDraft,
  type StylistProfile,
} from "@/hooks/useSalon";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Create salon                                                        */
/* ------------------------------------------------------------------ */

const CreateSalonSheet = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) => {
  const [draft, setDraft] = useState<SalonDraft>(emptySalonDraft());
  const create = useCreateSalon();
  const set = (k: keyof SalonDraft) => (v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-lg">New salon</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 pt-2 pb-6">
          <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
            The address and opening hours are held once here. Stylists inherit them,
            so two chairs in one building can never drift apart.
          </p>
          <Field label="Salon name">
            <Input value={draft.name} onChange={(e) => set("name")(e.target.value)} />
          </Field>
          <Field label="Address line 1">
            <Input
              value={draft.address_line1}
              onChange={(e) => set("address_line1")(e.target.value)}
            />
          </Field>
          <Field label="Address line 2">
            <Input
              value={draft.address_line2}
              onChange={(e) => set("address_line2")(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="City">
              <Input value={draft.city} onChange={(e) => set("city")(e.target.value)} />
            </Field>
            <Field label="Postcode">
              <Input
                value={draft.postcode}
                onChange={(e) => set("postcode")(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Business phone">
            <Input
              value={draft.business_phone}
              onChange={(e) => set("business_phone")(e.target.value)}
            />
          </Field>
          <Field label="Business email">
            <Input
              type="email"
              value={draft.business_email}
              onChange={(e) => set("business_email")(e.target.value)}
            />
          </Field>
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            disabled={!draft.name.trim() || create.isPending}
            onClick={() =>
              create.mutate(draft, {
                onSuccess: (salon) => {
                  toast.success(`${salon.name} created — add stylists next.`);
                  setDraft(emptySalonDraft());
                  onOpenChange(false);
                  onCreated(salon.id);
                },
                onError: () => toast.error("Couldn't create that salon."),
              })
            }
          >
            Create salon
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Owner logins                                                        */
/* ------------------------------------------------------------------ */

const OwnerLogins = ({ salon }: { salon: SalonRow }) => {
  const { data: owners = [], isLoading } = useSalonOwners(salon.id);
  const { data: pros = [] } = useUnassignedPros();
  const addOwner = useAddSalonOwner();
  const removeOwner = useRemoveSalonOwner();
  const [pick, setPick] = useState("");

  // Only accounts that already have a professional login can be made an owner —
  // a salon owner needs somewhere to answer enquiries from.
  const candidates = pros.filter((p) => p.user_id);

  return (
    <div className="space-y-2">
      <SectionLabel>Owner logins</SectionLabel>
      <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
        An owner login manages the whole roster and receives every enquiry for
        stylists who have no login of their own.
      </p>
      {isLoading && <LoadingDot />}
      {owners.map((o) => (
        <div
          key={o.id}
          className="flex items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2.5"
        >
          <KeyRound className="size-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-body font-semibold truncate">{o.name}</p>
            <p className="text-[11px] font-body text-muted-foreground">
              {o.pro_profile_id ? "Single-stylist login" : "Full salon access"}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${o.name}`}
            className="text-muted-foreground p-1"
            onClick={() =>
              removeOwner.mutate(o.id, {
                onSuccess: () => toast.success("Login removed from this salon."),
                onError: () => toast.error("Couldn't remove that login."),
              })
            }
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {!isLoading && owners.length === 0 && (
        <p className="text-[12px] font-body text-warn">
          No login yet — nobody can answer this salon's enquiries.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Add a professional login" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((p) => (
              <SelectItem key={p.id} value={p.user_id!}>
                {p.display_name ?? "Unnamed pro"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={!pick || addOwner.isPending}
          onClick={() =>
            addOwner.mutate(
              { salonId: salon.id, userId: pick },
              {
                onSuccess: () => {
                  setPick("");
                  toast.success("Login added.");
                },
                onError: () => toast.error("Couldn't add that login."),
              },
            )
          }
        >
          <UserPlus className="size-4" />
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Salon detail                                                        */
/* ------------------------------------------------------------------ */

const SalonDetail = ({ salon, onClose }: { salon: SalonRow; onClose: () => void }) => {
  const { data: stylists = [], isLoading } = useSalonStylists(salon.id);
  const { data: pros = [] } = useUnassignedPros();
  const add = useAddSalonStylist();
  const update = useUpdateSalonStylist();
  const setPublished = useSetStylistPublished();
  const updateSalon = useUpdateSalon();
  const movePro = useMoveProToSalon();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<StylistProfile | null>(null);
  const [movePick, setMovePick] = useState("");

  const initial: StylistDraft | undefined = useMemo(() => {
    if (mode === "add" || !editing) return undefined;
    return {
      display_name: editing.display_name ?? "",
      discipline: editing.discipline,
      specialisms: (editing.specialisms as string[] | null) ?? [],
      services: Array.isArray(editing.services)
        ? (editing.services as unknown as SalonService[])
        : [],
      contact_email: editing.contact_email ?? "",
      bio: editing.bio ?? "",
      discount_code: editing.discount_code ?? "",
      discount_description: editing.discount_description ?? "",
      discount_active: editing.discount_active === true,
    };
  }, [editing, mode]);

  const handleSave = (draft: StylistDraft) => {
    if (mode === "add") {
      add.mutate(
        { salon, draft },
        {
          onSuccess: () => {
            setOpen(false);
            toast.success(`${draft.display_name.trim()} added to ${salon.name}.`);
          },
          onError: () => toast.error("Couldn't add that stylist."),
        },
      );
      return;
    }
    if (!editing) return;
    update.mutate(
      { id: editing.id, draft },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success("Stylist updated.");
        },
        onError: () => toast.error("Couldn't save those changes."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <SurfaceCard tone="gold">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Building2 className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight">
              {salon.name}
            </p>
            <p className="text-[11.5px] font-body text-muted-foreground mt-0.5">
              {[salon.city, salon.postcode].filter(Boolean).join(" · ") ||
                "No address yet"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3"
          onClick={() =>
            updateSalon.mutate(
              { id: salon.id, patch: { is_published: !salon.is_published } },
              {
                onSuccess: () =>
                  toast.success(
                    salon.is_published
                      ? "Salon hidden from the directory."
                      : "Salon is live in the directory.",
                  ),
                onError: () => toast.error("Couldn't update the salon."),
              },
            )
          }
        >
          {salon.is_published ? (
            <>
              <EyeOff className="size-3.5 mr-1" /> Hide from directory
            </>
          ) : (
            <>
              <Eye className="size-3.5 mr-1" /> Publish to directory
            </>
          )}
        </Button>
      </SurfaceCard>

      <Button
        variant="gold"
        size="pill"
        className="w-full"
        onClick={() => {
          setMode("add");
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="size-4 mr-1" /> Add a stylist
      </Button>

      <SectionLabel>
        {stylists.length === 1 ? "1 stylist" : `${stylists.length} stylists`}
      </SectionLabel>
      {isLoading && <LoadingDot />}
      <div className="space-y-2.5">
        {stylists.map((s) => (
          <div
            key={s.id}
            className="rounded-[14px] border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Scissors className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-semibold leading-tight">
                  {s.display_name}
                </p>
                <p className="text-[12px] font-body text-foreground/70 mt-0.5">
                  {s.discipline}
                  {!s.is_published && " · Hidden from the directory"}
                  {s.user_id ? " · Has own login" : ""}
                </p>
                <p className="text-[11px] font-body text-muted-foreground mt-0.5 break-words">
                  {stylistEnquiryEmail(s, salon) ?? "No enquiry email yet"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setMode("edit");
                  setEditing(s);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() =>
                  setPublished.mutate(
                    { id: s.id, published: !s.is_published },
                    {
                      onSuccess: () => toast.success("Stylist updated."),
                      onError: () => toast.error("Couldn't update that stylist."),
                    },
                  )
                }
              >
                {s.is_published ? "Hide" : "Restore"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  movePro.mutate(
                    {
                      profileId: s.id,
                      salonId: null,
                      userId: s.user_id,
                      makeOwner: false,
                    },
                    {
                      onSuccess: () =>
                        toast.success(`${s.display_name} moved out of ${salon.name}.`),
                      onError: () => toast.error("Couldn't move that stylist."),
                    },
                  )
                }
              >
                Move out
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && stylists.length === 0 && (
          <SurfaceCard>
            <p className="text-sm font-body leading-snug">
              No stylists yet. Add one above, or move an existing professional in.
            </p>
          </SurfaceCard>
        )}
      </div>

      <div className="space-y-2">
        <SectionLabel>Move an existing professional in</SectionLabel>
        <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
          Her listing keeps its reviews, enquiries and appointments. If she has her
          own login she also gains owner access to this salon.
        </p>
        <div className="flex gap-2">
          <Select value={movePick} onValueChange={setMovePick}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose a professional" />
            </SelectTrigger>
            <SelectContent>
              {pros.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.display_name ?? "Unnamed pro"}
                  {p.city ? ` · ${p.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!movePick || movePro.isPending}
            onClick={() => {
              const pro = pros.find((p) => p.id === movePick);
              if (!pro) return;
              movePro.mutate(
                {
                  profileId: pro.id,
                  salonId: salon.id,
                  userId: pro.user_id,
                  makeOwner: true,
                },
                {
                  onSuccess: () => {
                    setMovePick("");
                    toast.success(`${pro.display_name ?? "Professional"} moved in.`);
                  },
                  onError: () => toast.error("Couldn't move that professional."),
                },
              );
            }}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      <OwnerLogins salon={salon} />

      <StylistEditorSheet
        open={open}
        onOpenChange={setOpen}
        initial={initial}
        mode={mode}
        saving={add.isPending || update.isPending}
        onSave={handleSave}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

const AdminSalons = () => {
  const nav = useNavigate();
  const { data: salons = [], isLoading } = useAdminSalons();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = salons.find((s) => s.id === selectedId) ?? null;

  return (
    <ScreenLayout>
      <TitleBar title="Salons" onBack={smartBack(nav, "/admin")} />
      <div className="px-5 pb-10 space-y-4">
        {isLoading ? (
          <LoadingDot label="Loading salons…" fullScreen={false} />
        ) : selected ? (
          <SalonDetail salon={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <>
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4 mr-1" /> New salon
            </Button>

            {salons.length === 0 ? (
              <EmptyState
                icon="🏛️"
                message="No salons yet"
                hint="Create one, then add stylists or move an existing professional in."
              />
            ) : (
              <div className="space-y-2.5">
                {salons.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className="w-full text-left rounded-[14px] border border-border bg-card p-4 flex items-center gap-3"
                  >
                    <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Building2 className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-base font-semibold leading-tight truncate">
                        {s.name}
                      </p>
                      <p className="text-[11.5px] font-body text-muted-foreground mt-0.5 truncate">
                        {s.publishedStylistCount} live of {s.stylistCount} stylists
                        {s.city ? ` · ${s.city}` : ""}
                      </p>
                      <p
                        className={cn(
                          "text-[11px] font-body mt-0.5",
                          s.ownerCount === 0 ? "text-warn" : "text-muted-foreground",
                        )}
                      >
                        {s.ownerCount === 0
                          ? "No owner login"
                          : `${s.ownerCount} owner login${s.ownerCount === 1 ? "" : "s"}`}
                        {" · "}
                        {s.is_published ? "In the directory" : "Hidden"}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CreateSalonSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => setSelectedId(id)}
      />
    </ScreenLayout>
  );
};

export default AdminSalons;
