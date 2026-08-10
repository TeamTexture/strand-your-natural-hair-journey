import { useState } from "react";
import { toast } from "sonner";
import { Mail, Search, UserPlus, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import WhatTheyCanSee from "@/components/treatment/WhatTheyCanSee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  usePlanShares,
  usePlanShareActions,
  useProSearch,
  type PlanShareRow,
} from "@/hooks/useTreatmentShares";

const nameOf = (s: PlanShareRow) => s.invited_name || s.invited_email || "Your professional";

const statusLine = (s: PlanShareRow) =>
  s.status === "accepted"
    ? "Following your progress"
    : s.status === "declined"
      ? "Declined the invitation"
      : s.professional_user_id
        ? "Invitation sent — waiting for them"
        : "Invited by email — waiting for them to join";

/**
 * MEMBER-INITIATED SHARING.
 *
 * Tag a professional who is already on STRAND, or invite one by email. Media
 * sharing is always its own switch and can be turned off at any time.
 */
const PlanSharesSection = ({ planId }: { planId: string }) => {
  const { shares } = usePlanShares(planId);
  const { share, setShareMedia, revoke } = usePlanShareActions(planId);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<{ user_id: string; display_name: string } | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [shareMedia, setShareMediaChoice] = useState(false);
  const { results, loading } = useProSearch(picked ? "" : term);

  const reset = () => {
    setTerm("");
    setPicked(null);
    setInviteName("");
    setInviteEmail("");
    setShareMediaChoice(false);
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());
  const canSend = picked ? true : inviteName.trim().length > 1 && emailValid;

  const onSend = () => {
    share.mutate(
      {
        professionalUserId: picked?.user_id ?? null,
        name: picked?.display_name ?? inviteName,
        email: picked ? null : inviteEmail,
        shareMedia,
      },
      {
        onSuccess: () => {
          toast.success(
            picked
              ? "Invitation sent — they'll see it in STRAND"
              : "Invitation emailed — they can join STRAND to follow along",
          );
          reset();
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            String((e as Error).message).includes("duplicate")
              ? "They're already tagged into this plan"
              : "Couldn't send that just now",
          ),
      },
    );
  };

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Professionals following this plan</SectionLabel>

      {shares.map((s) => (
        <SurfaceCard key={s.id} className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-body text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
                {nameOf(s)}
              </p>
              <p className="font-body text-[12px] text-muted-foreground mt-0.5 leading-snug">
                {statusLine(s)}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${nameOf(s)}`}
              onClick={() =>
                revoke.mutate(s.id, {
                  onSuccess: () => toast("Removed — they can no longer see this plan"),
                  onError: () => toast.error("Couldn't do that just now"),
                })
              }
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {s.status === "accepted" && (
            <div className="flex items-start gap-3 border-t border-border/60 pt-2">
              <p className="min-w-0 flex-1 font-body text-[12px] leading-snug text-muted-foreground">
                Let them see your photos, videos and voice notes. You can turn this off at any time
                and you keep everything you've recorded.
              </p>
              <Switch
                checked={s.share_media}
                disabled={setShareMedia.isPending}
                aria-label={`Share media with ${nameOf(s)}`}
                onCheckedChange={(on) =>
                  setShareMedia.mutate(
                    { shareId: s.id, on },
                    {
                      onSuccess: () =>
                        toast.success(
                          on
                            ? "Sharing on — they can see your photos, videos and voice notes"
                            : "Sharing off — everything you've recorded stays with you",
                        ),
                      onError: () => toast.error("Couldn't change that just now"),
                    },
                  )
                }
                className="mt-0.5 shrink-0"
              />
            </div>
          )}
        </SurfaceCard>
      ))}

      {shares.length > 0 && <WhatTheyCanSee name={nameOf(shares[0])} />}

      <Button
        variant="outline"
        className="rounded-pill w-full"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus className="size-4 mr-1.5" />
        Tag a professional
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-[330px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-[19px]">Tag a professional</DialogTitle>
            <DialogDescription className="font-body text-[12.5px]">
              They'll see your plan, the steps you tick off and your check-ins. Photos, videos and
              voice notes stay private unless you switch sharing on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {picked ? (
              <SurfaceCard className="flex items-center gap-3">
                <p className="min-w-0 flex-1 font-body text-[14px] font-semibold [overflow-wrap:anywhere]">
                  {picked.display_name}
                </p>
                <button
                  type="button"
                  className="font-body text-[12px] underline shrink-0"
                  onClick={() => setPicked(null)}
                >
                  Change
                </button>
              </SurfaceCard>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search professionals on STRAND"
                    className="pl-9 font-body text-[13px]"
                  />
                </div>

                {term.trim().length >= 2 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {loading && (
                      <p className="font-body text-[12px] text-muted-foreground">Looking…</p>
                    )}
                    {!loading && results.length === 0 && (
                      <p className="font-body text-[12px] text-muted-foreground">
                        No one by that name yet — invite them by email below.
                      </p>
                    )}
                    {results.map((r) => (
                      <button
                        key={r.user_id}
                        type="button"
                        onClick={() => setPicked({ user_id: r.user_id, display_name: r.display_name })}
                        className="w-full text-left rounded-xl border border-border/60 px-3 py-2"
                      >
                        <span className="block font-body text-[13.5px] font-semibold [overflow-wrap:anywhere]">
                          {r.display_name}
                        </span>
                        <span className="block font-body text-[11.5px] text-muted-foreground">
                          {[r.discipline, r.city].filter(Boolean).join(" · ") || "Professional"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="font-body text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                    Not on STRAND yet
                  </p>
                  <Input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Their name"
                    className="font-body text-[13px]"
                  />
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      type="email"
                      inputMode="email"
                      placeholder="Their email"
                      className="pl-9 font-body text-[13px]"
                    />
                  </div>
                  <p className="font-body text-[11.5px] text-muted-foreground leading-snug">
                    We'll email them an invitation to join STRAND and follow your progress.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 font-body text-[12.5px] leading-snug">
                Share my photos, videos and voice notes too
              </p>
              <Switch
                checked={shareMedia}
                onCheckedChange={setShareMediaChoice}
                aria-label="Share media"
                className="mt-0.5 shrink-0"
              />
            </div>

            <Button
              className="rounded-pill w-full"
              disabled={!canSend || share.isPending}
              onClick={onSend}
            >
              Send invitation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlanSharesSection;
