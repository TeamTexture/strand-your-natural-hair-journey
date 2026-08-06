import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Scissors, Mail, Tag, EyeOff, Eye } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { smartBack } from "@/lib/smartBack";
import { toast } from "sonner";
import StylistEditorSheet from "@/components/pro/StylistEditorSheet";
import {
  useAddSalonStylist,
  useMySalon,
  useSalonStylists,
  useSetStylistPublished,
  useUpdateSalonStylist,
  stylistEnquiryEmail,
  type SalonService,
  type StylistDraft,
  type StylistProfile,
} from "@/hooks/useSalon";

const ProSalonStylists = () => {
  const nav = useNavigate();
  const { data: mine, isLoading } = useMySalon();
  const salon = mine?.salon;
  const { data: stylists = [], isLoading: loadingStylists } = useSalonStylists(
    salon?.id,
  );
  const add = useAddSalonStylist();
  const update = useUpdateSalonStylist();
  const setPublished = useSetStylistPublished();

  const [editing, setEditing] = useState<StylistProfile | null>(null);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [open, setOpen] = useState(false);

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

  if (isLoading) return <LoadingDot />;

  if (!salon) {
    return (
      <ScreenLayout>
        <TitleBar title="Salon stylists" onBack={smartBack(nav, "/pro")} />
        <div className="px-5 py-4">
          <SurfaceCard>
            <p className="text-sm font-body leading-snug">
              This account isn't linked to a salon listing. If you run a salon with
              more than one stylist, email info@teamtexture.co.uk and we'll set it up.
            </p>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  const handleSave = (draft: StylistDraft) => {
    if (mode === "add") {
      add.mutate(
        { salon, draft },
        {
          onSuccess: () => {
            setOpen(false);
            toast.success(`${draft.display_name.trim()} added to ${salon.name}.`);
          },
          onError: (e) => {
            console.error("[salon] add stylist failed", e);
            toast.error("Couldn't add that stylist — please try again.");
          },
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
        onError: (e) => {
          console.error("[salon] update stylist failed", e);
          toast.error("Couldn't save those changes — please try again.");
        },
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title="Salon stylists" onBack={smartBack(nav, "/pro")} />
      <div className="px-5 pb-10 space-y-4">
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-snug">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">
              {salon.name} —{" "}
            </span>
            your address and opening hours are held once for the salon. Each stylist
            keeps her own services and her own discount.
          </p>
        </SurfaceCard>

        {mine?.isOwner && (
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
        )}

        <SectionLabel>
          {stylists.length === 1 ? "1 stylist" : `${stylists.length} stylists`}
        </SectionLabel>

        {loadingStylists && <LoadingDot />}

        <div className="space-y-2.5">
          {stylists.map((s) => {
            const email = stylistEnquiryEmail(s, salon);
            const fallback = !s.contact_email?.trim();
            return (
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
                    </p>
                  </div>
                </div>

                <div className="space-y-1 text-[12px] font-body text-foreground/80">
                  <p className="flex items-start gap-1.5">
                    <Mail className="size-3.5 mt-0.5 shrink-0 text-primary/70" />
                    <span className="min-w-0 break-words">
                      {email ?? "No enquiry email yet"}
                      {fallback && email && " (salon email)"}
                    </span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Tag className="size-3.5 mt-0.5 shrink-0 text-primary/70" />
                    <span className="min-w-0 break-words">
                      {s.discount_active && s.discount_code
                        ? `${s.discount_code} · ${s.discount_description ?? "Active"}`
                        : "No active discount"}
                    </span>
                  </p>
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
                  {mine?.isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        setPublished.mutate(
                          { id: s.id, published: !s.is_published },
                          {
                            onSuccess: () =>
                              toast.success(
                                s.is_published
                                  ? `${s.display_name} removed from the directory.`
                                  : `${s.display_name} is live again.`,
                              ),
                            onError: () =>
                              toast.error("Couldn't update that stylist."),
                          },
                        )
                      }
                    >
                      {s.is_published ? (
                        <>
                          <EyeOff className="size-3.5 mr-1" /> Remove
                        </>
                      ) : (
                        <>
                          <Eye className="size-3.5 mr-1" /> Restore
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!loadingStylists && stylists.length === 0 && (
            <SurfaceCard>
              <p className="text-sm font-body leading-snug">
                No stylists listed yet. Add your first one above.
              </p>
            </SurfaceCard>
          )}
        </div>

        <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
          Removing a stylist hides her listing — her enquiry and appointment history is
          kept.
        </p>
      </div>

      <StylistEditorSheet
        open={open}
        onOpenChange={setOpen}
        mode={mode}
        initial={initial}
        saving={add.isPending || update.isPending}
        onSave={handleSave}
      />
    </ScreenLayout>
  );
};

export default ProSalonStylists;
