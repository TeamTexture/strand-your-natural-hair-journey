// Single source of truth for the hard wall between the member (consumer) side
// of the app and the professional / brand / admin sides.
//
// Multi-role accounts (member + pro, member + brand, admins) toggle views with
// the switcher in GlobalMenu. Rather than sprinkling per-page role checks, every
// shared surface asks these predicates which feature set may render, so nothing
// small can bleed across the wall (member bottom nav in pro view, pro enquiry
// popups on the member side, etc.).
import type { ActiveRoleView } from "@/hooks/useActiveRoleView";

/** Member (STRAND consumer) features: bottom nav, tips strip, upgrade CTA, tour. */
export const allowsMemberFeatures = (view: ActiveRoleView) => view === "consumer";

/** Professional features: enquiry alerts, client/diary surfaces, pro nav. */
export const allowsProFeatures = (view: ActiveRoleView) => view === "pro";

/** Brand features: offer designer, brand billing, brand nav. */
export const allowsBrandFeatures = (view: ActiveRoleView) => view === "brand";

/** Admin features: moderation, applications, audit. */
export const allowsAdminFeatures = (view: ActiveRoleView) => view === "admin";
