import { toast } from "sonner";
import SectionLabel from "@/components/SectionLabel";
import MediaConsentToggle from "@/components/treatment/MediaConsentToggle";
import PlanSharesSection from "@/components/treatment/PlanSharesSection";
import WhatTheyCanSee from "@/components/treatment/WhatTheyCanSee";
import { useInvitationActions, usePlanAssignment } from "@/hooks/useTreatmentAssignments";

/**
 * SHARING, in one block: the media consent decision for whoever assigned the
 * plan, what they can see, the professionals already following it, and the way
 * to tag someone else in. The consent model itself is untouched — media sharing
 * is still its own switch, still default off, and turning it off revokes access
 * without deleting anything.
 */
const PlanSharingSection = ({ planId }: { planId: string }) => {
  const { assignment } = usePlanAssignment(planId);
  const { setMediaConsent } = useInvitationActions();
  const sharedWith = assignment?.assigner_type === "admin" ? "STRAND" : "your professional";

  return (
    <div className="space-y-2">
      {assignment && assignment.status === "accepted" && (
        <>
          <SectionLabel className="px-0 mt-0 mb-1.5">Whoever gave you this plan</SectionLabel>
          <MediaConsentToggle
            name={sharedWith}
            value={assignment.media_sharing_consent}
            disabled={setMediaConsent.isPending}
            onChange={(on) =>
              setMediaConsent.mutate(
                { assignmentId: assignment.id, on },
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
          />
          <WhatTheyCanSee name={sharedWith} />
        </>
      )}

      <PlanSharesSection planId={planId} />
    </div>
  );
};

export default PlanSharingSection;
