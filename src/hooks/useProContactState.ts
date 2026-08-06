import { useMemo } from "react";
import { useMyEnquiries, type EnquiryStatus } from "@/hooks/useEnquiries";
import { useChatThreads, useChatThreadMeta } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";

export type ProContactStateKind =
  | "none"
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn";

export interface ProContactState {
  kind: ProContactStateKind;
  /** Existing consumer↔pro chat thread, when one has been opened. */
  threadId: string | null;
  /** Unread messages waiting for me in that thread. */
  unread: number;
  enquiredAt: string | null;
  respondedAt: string | null;
  /** May the user send a (fresh) enquiry right now? */
  canEnquire: boolean;
}

const EMPTY: ProContactState = {
  kind: "none",
  threadId: null,
  unread: 0,
  enquiredAt: null,
  respondedAt: null,
  canEnquire: true,
};

/**
 * Per-professional enquiry/chat state for the CURRENT user, derived live from
 * pro_enquiries + chat_threads (never from a cached UI flag).
 *
 * An open chat thread always wins: once a professional has accepted, the user
 * sees "Chat now" on that professional's card and profile forever, even if the
 * enquiry row is later withdrawn or superseded.
 */
export function useProContactStates() {
  const { user } = useAuth();
  const { data: myEnquiries } = useMyEnquiries();
  const { data: chatThreads } = useChatThreads("all");

  // Only my consumer-side client_pro threads matter here.
  const myProThreads = useMemo(
    () =>
      (chatThreads ?? []).filter(
        (t) =>
          t.thread_type === "client_pro" &&
          !!t.pro_user_id &&
          (!user || t.consumer_id === user.id),
      ),
    [chatThreads, user],
  );
  const { data: meta } = useChatThreadMeta(myProThreads);

  const { byPro, byProfile } = useMemo(() => {
    const map = new Map<string, ProContactState>();
    // Keyed on the LISTING (`pro_profiles.id`). A salon shares one login across
    // several stylists, so `pro_user_id` alone would smear one stylist's enquiry
    // state across every colleague's card.
    const profileMap = new Map<string, ProContactState>();

    // Latest enquiry per pro.
    for (const e of myEnquiries ?? []) {
      const existing = map.get(e.pro_user_id);
      const state: ProContactState = {
        ...EMPTY,
        kind: e.status as EnquiryStatus,
        enquiredAt: e.created_at,
        respondedAt: e.responded_at,
        // Declined or withdrawn → the user may enquire again immediately.
        canEnquire: e.status === "declined" || e.status === "withdrawn",
      };
      if (e.pro_profile_id) {
        const prevProfile = profileMap.get(e.pro_profile_id);
        if (
          !prevProfile?.enquiredAt ||
          new Date(e.created_at) > new Date(prevProfile.enquiredAt)
        ) {
          profileMap.set(e.pro_profile_id, state);
        }
      }
      if (existing?.enquiredAt && new Date(e.created_at) <= new Date(existing.enquiredAt)) continue;
      map.set(e.pro_user_id, state);
    }

    // Thread presence promotes to ACCEPTED and carries the unread count.
    for (const t of myProThreads) {
      const proId = t.pro_user_id!;
      const prev = map.get(proId) ?? EMPTY;
      map.set(proId, {
        ...prev,
        kind: "accepted",
        threadId: t.id,
        unread: meta?.get(t.id)?.unread ?? 0,
        canEnquire: false,
      });
    }

    return { byPro: map, byProfile: profileMap };
  }, [myEnquiries, myProThreads, meta]);

  return {
    byPro,
    byProfile,
    stateFor: (proUserId: string | null | undefined): ProContactState =>
      (proUserId ? byPro.get(proUserId) : undefined) ?? EMPTY,
    /**
     * Listing-accurate state. Prefers the per-listing key, so a salon stylist
     * never inherits her colleague's enquiry state through the shared login.
     */
    stateForListing: (listing: {
      proProfileId?: string;
      proUserId?: string;
      isSalonStylist?: boolean;
    }): ProContactState => {
      if (listing.proProfileId) {
        const scoped = byProfile.get(listing.proProfileId);
        if (scoped) return scoped;
      }
      if (listing.isSalonStylist) return EMPTY;
      return (listing.proUserId ? byPro.get(listing.proUserId) : undefined) ?? EMPTY;
    },
  };
}

/** Short human status line for a professional card/profile. */
export function proContactStatusLine(
  state: ProContactState,
  formatWhen: (iso: string) => string,
): string | null {
  switch (state.kind) {
    case "pending":
      return state.enquiredAt
        ? `Enquiry sent ${formatWhen(state.enquiredAt)} — awaiting response`
        : "Enquiry sent — awaiting response";
    case "accepted":
      return state.enquiredAt
        ? `Enquiry accepted — you enquired ${formatWhen(state.enquiredAt)}`
        : "Enquiry accepted";
    case "declined":
      return "Enquiry closed — you can send a new one";
    case "withdrawn":
      return "Enquiry withdrawn — you can send a new one";
    default:
      return null;
  }
}
