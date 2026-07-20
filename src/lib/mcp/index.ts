import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getHairProfile from "./tools/get-hair-profile";
import listWashDays from "./tools/list-wash-days";
import listShelfProducts from "./tools/list-shelf-products";
import listGoals from "./tools/list-goals";
import listFlaggedBloodMarkers from "./tools/list-flagged-blood-markers";
import listJournalEntries from "./tools/list-journal-entries";
import listAppointments from "./tools/list-appointments";
import createJournalEntry from "./tools/create-journal-entry";
import logWashDay from "./tools/log-wash-day";
import addProduct from "./tools/add-product";
import setProductStatus from "./tools/set-product-status";
import createGoal from "./tools/create-goal";
import updateGoalProgress from "./tools/update-goal-progress";
import createAppointment from "./tools/create-appointment";
import addWishlistItem from "./tools/add-wishlist-item";
import listWishlistItems from "./tools/list-wishlist-items";

// Build issuer from the Supabase project ref (inlined at build time).
// Never derive from SUPABASE_URL — Cloud proxies use `.lovable.cloud` which
// mcp-js rejects against the direct `.supabase.co` issuer.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "strand-mcp",
  title: "STRAND",
  version: "0.2.0",
  instructions:
    "STRAND is a hair journal and clinical companion. All tools are scoped to the signed-in user via row-level security. " +
    "Read tools: `get_hair_profile`, `list_flagged_blood_markers` for clinical context; `list_shelf_products`, `list_wash_days`, `list_journal_entries`, `list_appointments` for care history; `list_goals` for active hair goals. " +
    "Write tools (use to update the user's STRAND app): `log_wash_day` to record a wash session, `add_product` to add products to the shelf or wishlist, `set_product_status` to move products on/off the shelf or favourite them, `create_goal` and `update_goal_progress` to manage goals, `create_appointment` to schedule a hair appointment, `create_journal_entry` to log a style journal entry. " +
    "Always cross-reference the user's hair profile, flagged blood markers, and recent wash history before recommending or writing changes.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    // Read
    getHairProfile,
    listWashDays,
    listShelfProducts,
    listGoals,
    listFlaggedBloodMarkers,
    listJournalEntries,
    listAppointments,
    // Write
    logWashDay,
    addProduct,
    setProductStatus,
    createGoal,
    updateGoalProgress,
    createAppointment,
    createJournalEntry,
    addWishlistItem,
    listWishlistItems,
  ],
});
