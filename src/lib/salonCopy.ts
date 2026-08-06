/**
 * Load-bearing copy for salon stylist listings.
 *
 * These two strings do real work:
 * - The email label must make clear the address is for notifications only.
 *   Without the second sentence, applicants either retype the salon email
 *   (defeating per-stylist routing) or assume they've created a login and
 *   raise a support ticket when the stylist can't sign in.
 * - The consent line is the lawful basis for holding a third party's name and
 *   email, so it must be an explicit, ticked confirmation.
 */

export const STYLIST_EMAIL_LABEL = "Enquiry email (optional)";

export const STYLIST_EMAIL_HELP =
  "Where should enquiries for this stylist go? This is for notifications only — they won't be able to log in separately. Leave blank and enquiries go to the salon's business email.";

export const STYLIST_CONSENT_LABEL =
  "I confirm each stylist listed has agreed to appear on STRAND and to be contacted at the address given.";
