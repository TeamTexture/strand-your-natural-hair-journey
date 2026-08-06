/**
 * STYLIST LISTING NOTIFICATION — TRIGGER POINT + MESSAGE, SEND NOT YET WIRED.
 *
 * When a salon lists a stylist, STRAND is holding personal data (name, email)
 * supplied by someone other than the person it concerns. That stylist has to be
 * told: who listed her, what is published, and how to correct or remove it.
 *
 * Email infrastructure is not configured on this project yet, so the send is a
 * deliberate, clearly named stub. It logs the exact payload it would send so the
 * trigger point can be verified now and swapped for a real send later without
 * touching any call site.
 *
 * TO ENABLE:
 *   1. Configure a verified sender domain for the project (Cloud → Emails).
 *   2. Run the email infrastructure setup, then scaffold app emails.
 *   3. Add a `stylist-listed` template with the copy in stylistListedMessage().
 *   4. Replace the body of sendStylistListedNotification_STUB with an invoke of
 *      the `send-transactional-email` function, keyed on
 *      `stylist-listed-${proProfileId}`.
 * Until step 1 is done nothing can be delivered — there is no shared or
 * STRAND-provided sender address.
 */

export type StylistListedPayload = {
  proProfileId: string;
  stylistName: string;
  /** Falls back to the salon's business email when the stylist gave none. */
  recipientEmail: string | null;
  salonName: string;
  listingUrl: string;
};

export const stylistListedMessage = (p: StylistListedPayload) => ({
  subject: `${p.salonName} has listed you on STRAND`,
  body: [
    `Hello ${p.stylistName},`,
    `${p.salonName} has added you to their STRAND salon listing, so members can find you and enquire with you by name.`,
    `You can see your listing here: ${p.listingUrl}`,
    `You don't need a STRAND account — your salon manages this listing on your behalf.`,
    `If anything is wrong — your name, your photo, your services, or the email enquiries come to — ask your salon to update it, or email info@teamtexture.co.uk and we'll correct or remove your listing.`,
  ].join("\n\n"),
});

/**
 * STUB. Does not send. Named loudly on purpose so it shows up in any audit.
 */
export const sendStylistListedNotification_STUB = async (
  payload: StylistListedPayload,
): Promise<{ sent: false; reason: "email_infrastructure_not_configured" }> => {
  const msg = stylistListedMessage(payload);
  console.info(
    "[notify_stylist_listed] STUB — not sent (no sender domain configured)",
    { to: payload.recipientEmail, subject: msg.subject, body: msg.body },
  );
  return { sent: false, reason: "email_infrastructure_not_configured" };
};
