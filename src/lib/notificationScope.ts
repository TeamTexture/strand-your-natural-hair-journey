// Which role view does an in-app notification belong to?
// Multi-role accounts (member + professional, member + brand) share one
// notifications table, so a consumer-side event must not badge the pro view
// and a pro-side enquiry must not badge My STRAND.
import type { ActiveRoleView } from "@/hooks/useActiveRoleView";

const KIND_VIEWS: Record<string, ActiveRoleView[]> = {
  // Professional-context events
  enquiry_new: ["pro"],
  review: ["pro"],
  review_pending: ["pro"],
  booking_link_opened: ["pro"],
  // Consumer-context events
  enquiry: ["consumer"],
  enquiry_accepted: ["consumer"],
  enquiry_declined: ["consumer"],
  appointment: ["consumer"],
  appointment_reminder: ["consumer"],
  appointment_logged: ["consumer"],
  review_approved: ["consumer"],
  review_denied: ["consumer"],
  forum_reply: ["consumer"],
  forum_thread: ["consumer"],
  library_item: ["consumer"],
  library_collection: ["consumer"],
  mention: ["consumer"],
  setup_goal: ["consumer"],
};

/**
 * `chatThreadIds` must already be scoped to the current view (the thread list
 * from useChatThreads), so message notifications inherit the same separation.
 * Unknown kinds are always shown rather than silently swallowed.
 */
export function notificationInView(
  n: { kind: string; entity_type: string | null; entity_id: string | null },
  view: ActiveRoleView,
  chatThreadIds: Set<string>,
): boolean {
  // Admin view is oversight: never hide anything from it.
  if (view === "admin") return true;
  if (n.entity_type === "chat_thread") {
    return n.entity_id ? chatThreadIds.has(n.entity_id) : true;
  }
  const views = KIND_VIEWS[n.kind];
  if (!views) return true;
  return views.includes(view);
}
