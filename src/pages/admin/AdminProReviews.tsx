import { smartBack } from "@/lib/smartBack";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, MessageSquareWarning } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import UrlValue from "@/components/admin/UrlValue";
import { useMarkAdminEntityRead } from "@/hooks/useAdminNotifications";
import { toast } from "sonner";
import {
  usePendingProProfileReviews,
  type ProProfileRow,
} from "@/hooks/useProProfileReview";

const BUCKET = "pro-photos";

const DAYS: [string, string][] = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

const Row = ({
  label,
  value,
  url,
}: {
  label: string;
  value?: string | null;
  url?: boolean;
}) => (
  <div className="flex gap-2 text-[12px] font-body min-w-0">
    <span className="text-muted-foreground w-[104px] shrink-0">{label}</span>
    <span
      className={
        value?.trim()
          ? "flex-1 min-w-0 whitespace-pre-line break-words [overflow-wrap:anywhere]"
          : "flex-1 min-w-0 italic text-muted-foreground"
      }
    >
      {url ? (
        <UrlValue url={value} label={label} />
      ) : value?.trim() ? (
        value
      ) : (
        "Not set"
      )}
    </span>
  </div>
);

const PhotoStrip = ({ paths }: { paths: string[] }) => {
  const [urls, setUrls] = useState<string[]>([]);
  const key = paths.join("|");
  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) return;
    Promise.all(
      paths.slice(0, 6).map((p) =>
        supabase.storage
          .from(BUCKET)
          .createSignedUrl(p, 3600)
          .then(({ data }) => data?.signedUrl ?? null),
      ),
    ).then((r) => {
      if (!cancelled) setUrls(r.filter(Boolean) as string[]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 mt-2">
      {urls.map((u) => (
        <img
          key={u}
          src={u}
          alt=""
          className="aspect-square w-full object-cover rounded-[10px]"
        />
      ))}
    </div>
  );
};

const ReviewCard = ({ p }: { p: ProProfileRow }) => {
  const qc = useQueryClient();
  const markEntityRead = useMarkAdminEntityRead();

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "pro-profile-reviews"] });
    qc.invalidateQueries({ queryKey: ["admin", "pro-usage"] });
    qc.invalidateQueries({ queryKey: ["pro_directory"] });
  };

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pro_profiles")
        .update({
          profile_review_status: "approved",
          is_published: true,
          review_note: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("user_id", p.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void markEntityRead("pro_profile", p.user_id);
      invalidate();
      toast.success("Profile approved — listing is live.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not approve"),
  });

  const requestChanges = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pro_profiles")
        .update({
          profile_review_status: "changes_requested",
          is_published: false,
          review_note: note.trim() || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("user_id", p.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void markEntityRead("pro_profile", p.user_id);
      invalidate();
      setNoteOpen(false);
      setNote("");
      toast.success("Sent back to the professional with your note.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not update"),
  });

  const services = Array.isArray(p.services)
    ? (p.services as unknown as { name: string; price?: string }[])
    : [];
  const hours = (p.opening_hours ?? null) as Record<
    string,
    { closed: boolean; open: string; close: string }
  > | null;

  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-tight truncate">
            {p.display_name || "Unnamed professional"}
          </p>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5">
            {p.discipline}
            {p.submitted_at &&
              ` · submitted ${formatDistanceToNow(new Date(p.submitted_at), { addSuffix: true })}`}
          </p>
        </div>
        <span className="text-[9px] uppercase tracking-[0.06em] whitespace-nowrap px-1.5 py-0.5 rounded bg-warn/20 text-warn font-body shrink-0">
          Pending
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <Row label="Bio" value={p.bio} />
        <Row label="Contact email" value={p.contact_email} />
        <Row label="Business phone" value={p.business_phone} />
        <Row label="Business email" value={p.business_email} />
        <Row
          label="Address"
          value={[p.address_line1, p.address_line2, p.city, p.postcode]
            .filter(Boolean)
            .join(", ")}
        />
        <Row label="Area served" value={p.location} />
        <Row label="Website" value={p.website_url} url />
        <Row label="Instagram" value={p.instagram_handle} />
        <Row label="Booking URL" value={p.booking_url} url />
        <Row
          label="Services"
          value={services
            .map((s) => s.name + (s.price ? ` · ${s.price}` : ""))
            .join("\n")}
        />
        <Row
          label="Specialisms"
          value={((p.specialisms as string[] | null) ?? []).join(", ")}
        />
        <Row
          label="Opening hours"
          value={
            hours
              ? DAYS.map(([k, label]) =>
                  hours[k]
                    ? `${label}: ${hours[k].closed ? "Closed" : `${hours[k].open} – ${hours[k].close}`}`
                    : `${label}: Not set`,
                ).join("\n")
              : null
          }
        />
        <Row label="Headshot" value={p.avatar_path ? "Uploaded" : ""} />
        <Row label="Cover photo" value={p.cover_path ? "Uploaded" : ""} />
      </div>

      <PhotoStrip
        paths={[p.cover_path, p.avatar_path, ...(p.photos ?? [])].filter(
          Boolean,
        ) as string[]}
      />

      {noteOpen ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs changing? (optional — the pro sees this)"
          />
          <div className="flex gap-2">
            <Button
              variant="gold"
              size="pill"
              className="!min-h-[36px] !text-[12px] flex-1"
              disabled={requestChanges.isPending}
              onClick={() => requestChanges.mutate()}
            >
              {requestChanges.isPending ? "Sending…" : "Send back"}
            </Button>
            <Button
              variant="goldOutline"
              size="pill"
              className="!min-h-[36px] !text-[12px]"
              onClick={() => setNoteOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-3">
          <Button
            variant="gold"
            size="pill"
            className="!min-h-[36px] !text-[12px] flex-1"
            disabled={approve.isPending}
            onClick={() => approve.mutate()}
          >
            <Check className="size-3.5" />{" "}
            {approve.isPending ? "Approving…" : "Approve & publish"}
          </Button>
          <Button
            variant="goldOutline"
            size="pill"
            className="!min-h-[36px] !text-[12px] flex-1"
            onClick={() => setNoteOpen(true)}
          >
            <MessageSquareWarning className="size-3.5" /> Request changes
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
};

const AdminProReviews = () => {
  const nav = useNavigate();
  const { data: rows = [], isLoading } = usePendingProProfileReviews();

  return (
    <ScreenLayout>
      <TitleBar title="Profile approvals" onBack={smartBack(nav, "/admin")} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-[12px] font-body text-foreground/75 leading-snug">
          Professional profiles submitted for review. Approving publishes the
          listing to the directory and opens their dashboard.
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-foreground/60 py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading submissions…
          </div>
        ) : rows.length === 0 ? (
          <SurfaceCard>
            <p className="text-[12px] font-body text-muted-foreground">
              Nothing waiting for review.
            </p>
          </SurfaceCard>
        ) : (
          rows.map((p) => <ReviewCard key={p.id} p={p} />)
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminProReviews;
