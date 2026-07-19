import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getHairProfile from "./tools/get-hair-profile";
import listWashDays from "./tools/list-wash-days";
import listShelfProducts from "./tools/list-shelf-products";
import listGoals from "./tools/list-goals";
import listFlaggedBloodMarkers from "./tools/list-flagged-blood-markers";
import listJournalEntries from "./tools/list-journal-entries";
import createJournalEntry from "./tools/create-journal-entry";

// Build issuer from the Supabase project ref (inlined at build time).
// Never derive from SUPABASE_URL — Cloud proxies use `.lovable.cloud` which
// mcp-js rejects against the direct `.supabase.co` issuer.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "strand-mcp",
  title: "STRAND",
  version: "0.1.0",
  instructions:
    "STRAND is a hair journal and clinical companion. Tools return data for the signed-in user only, scoped by row-level security. Use `get_hair_profile` and `list_flagged_blood_markers` for clinical context; `list_wash_days`, `list_shelf_products`, and `list_journal_entries` for care history; `list_goals` for active hair goals; and `create_journal_entry` to log a new style journal entry.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getHairProfile,
    listWashDays,
    listShelfProducts,
    listGoals,
    listFlaggedBloodMarkers,
    listJournalEntries,
    createJournalEntry,
  ],
});
