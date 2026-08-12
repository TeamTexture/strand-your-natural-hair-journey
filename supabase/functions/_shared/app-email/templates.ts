/**
 * APP EMAIL TEMPLATE REGISTRY — the single place every email lives.
 *
 * Rules baked in here:
 *  - Every template declares a `category`: "transactional" or "marketing".
 *  - `essential: true` means the email cannot be switched off (account, legal,
 *    payment, moderation). Non-essential transactional emails map to a
 *    preference key on `email_preferences`.
 *  - Marketing templates ALWAYS require `marketing_consent` and ALWAYS render
 *    an unsubscribe line. Transactional templates NEVER render one, and must
 *    never carry promotional or upsell content.
 *
 * Copy here is operational only — no hair-care or clinical guidance.
 */

export type EmailCategory = "transactional" | "marketing";

/** Keys on public.email_preferences that can gate an optional email. */
export type PreferenceKey =
  | "wash_day_reminders"
  | "blood_test_due"
  | "forum_replies"
  | "enquiry_updates"
  | "appointment_reminders"
  | "brand_offers"
  | "treatment_checkin_reminders"
  | "treatment_weekly_digest";

export interface EmailTemplate {
  key: string;
  category: EmailCategory;
  /** Essential emails ignore preference switches (they are never optional). */
  essential: boolean;
  /** Preference switch that can suppress this email. Essential = undefined. */
  preference?: PreferenceKey;
  subject: (d: Record<string, unknown>) => string;
  /** Ordered blocks of body copy. */
  body: (d: Record<string, unknown>) => string[];
  /** Optional destination, rendered as a button. In-app path or absolute URL. */
  cta?: (d: Record<string, unknown>) => { label: string; path: string } | null;
  /** Optional label/value detail table under the copy. */
  rows?: (d: Record<string, unknown>) => { label: string; value: string }[];
  /** Small uppercase eyebrow above the heading. */
  eyebrow?: string;
  /** Sender identity. Defaults to notifications@. */
  sender?: "notifications" | "noreply";
  /** Extra footer line above the standard footer. */
  footerNote?: string;
  /**
   * Emails that already send in production today. These bypass the global
   * `email_sending_enabled` flag so switching the platform on/off never
   * regresses live behaviour (admin application alerts, password resets).
   */
  legacy?: boolean;
}

const s = (v: unknown, fallback = "") =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

const t = (
  key: string,
  category: EmailCategory,
  essential: boolean,
  subject: EmailTemplate["subject"],
  body: EmailTemplate["body"],
  cta?: EmailTemplate["cta"],
  preference?: PreferenceKey,
  extra?: Partial<EmailTemplate>,
): EmailTemplate => ({ key, category, essential, subject, body, cta, preference, ...extra });


export const TEMPLATES: Record<string, EmailTemplate> = {
  // ---------------- Account (essential, transactional) ----------------
  "consumer-welcome": t(
    "consumer-welcome",
    "transactional",
    true,
    () => "Welcome to STRAND",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your STRAND account is set up. You can sign in any time to pick up where you left off.",
      "If you did not create this account, reply to this email and we will remove it.",
    ],
    () => ({ label: "Open STRAND", path: "/home" }),
  ),
  "professional-welcome": t(
    "professional-welcome",
    "transactional",
    true,
    () => "Your STRAND professional account",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your professional account is set up. Your directory listing goes live once your application is approved.",
    ],
    () => ({ label: "Open your portal", path: "/pro/home" }),
  ),
  "brand-welcome": t(
    "brand-welcome",
    "transactional",
    true,
    () => "Your STRAND brand account",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your brand account is set up. You can complete your brand profile and prepare adverts from your dashboard.",
    ],
    () => ({ label: "Open your dashboard", path: "/brand/home" }),
  ),

  // ---------------- Professional onboarding ----------------
  "pro-application-received": t(
    "pro-application-received",
    "transactional",
    true,
    () => "We have your STRAND application",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Thank you — your application to join the STRAND directory has been received and is with our team for review.",
      "We will email you as soon as a decision is made.",
    ],
  ),
  "pro-application-approved": t(
    "pro-application-approved",
    "transactional",
    true,
    () => "Your STRAND application is approved",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your application has been approved. Your professional portal is now open.",
    ],
    () => ({ label: "Open your portal", path: "/pro/home" }),
  ),
  "pro-application-rejected": t(
    "pro-application-rejected",
    "transactional",
    true,
    () => "An update on your STRAND application",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "We are not able to approve your application at this time.",
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
      "If you would like to discuss this, reply to this email.",
    ].filter(Boolean),
  ),
  "pro-application-more-info": t(
    "pro-application-more-info",
    "transactional",
    true,
    () => "We need a little more information",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Before we can finish reviewing your application we need some more information.",
      s(d.reason) ? `What we need: ${s(d.reason)}` : "",
    ].filter(Boolean),
    () => ({ label: "Update your application", path: "/pro/apply" }),
  ),
  "pro-profile-published": t(
    "pro-profile-published",
    "transactional",
    true,
    () => "Your STRAND listing is live",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your profile is now published in the STRAND directory and members can find you.",
    ],
    () => ({ label: "View your listing", path: "/pro/profile" }),
  ),
  "pro-profile-suspended": t(
    "pro-profile-suspended",
    "transactional",
    true,
    () => "Your STRAND listing has been suspended",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your directory listing has been suspended and is no longer visible to members.",
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
      "Reply to this email if you would like to resolve this.",
    ].filter(Boolean),
  ),
  "salon-stylist-listed": t(
    "salon-stylist-listed",
    "transactional",
    true,
    (d) => `You have been listed on STRAND by ${s(d.salon_name, "your salon")}`,
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `${s(d.salon_name, "Your salon")} has added you as a stylist on their STRAND salon listing.`,
      s(d.contact_email)
        ? `Member enquiries for you will be sent to ${s(d.contact_email)}.`
        : "Member enquiries for you will be sent to your salon's enquiry address.",
      "If this is not correct, reply to this email and we will remove your listing.",
    ],
  ),
  "pro-complimentary-expiring": t(
    "pro-complimentary-expiring",
    "transactional",
    true,
    (d) => `Your complimentary STRAND access ends on ${s(d.ends_on, "soon")}`,
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your complimentary professional access ends on ${s(d.ends_on, "the end of your term")}.`,
      "To keep your listing, portal and client access active after that date, add a payment method in your billing settings.",
    ],
    () => ({ label: "Open billing", path: "/pro/billing" }),
  ),

  // ---------------- Brand journey ----------------
  "brand-offer-submitted": t(
    "brand-offer-submitted",
    "transactional",
    true,
    () => "We have your advert for review",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your advert${s(d.offer_title) ? ` "${s(d.offer_title)}"` : ""} has been submitted and is with our team for review.`,
    ],
  ),
  "brand-offer-approved": t(
    "brand-offer-approved",
    "transactional",
    true,
    () => "Your STRAND advert has been approved",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your STRAND advert${s(d.offer_title) ? ` "${s(d.offer_title)}"` : ""} has been approved. Review it and confirm your booking dates in your dashboard.`,
    ],
    (d) => ({
      label: "Review your advert",
      path: s(d.offer_id) ? `/brand/offers/${s(d.offer_id)}` : "/brand/offers",
    }),
  ),
  "brand-offer-rejected": t(
    "brand-offer-rejected",
    "transactional",
    true,
    () => "An update on your STRAND advert",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your advert${s(d.offer_title) ? ` "${s(d.offer_title)}"` : ""} was not approved.`,
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
    ].filter(Boolean),
    (d) => ({
      label: "Open your advert",
      path: s(d.offer_id) ? `/brand/offers/${s(d.offer_id)}` : "/brand/offers",
    }),
  ),
  "brand-revision-approved": t(
    "brand-revision-approved",
    "transactional",
    true,
    () => "Your advert changes are approved",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "The changes you submitted to your advert have been approved and are now in place.",
    ],
    (d) => ({
      label: "Open your advert",
      path: s(d.offer_id) ? `/brand/offers/${s(d.offer_id)}` : "/brand/offers",
    }),
  ),
  "brand-revision-rejected": t(
    "brand-revision-rejected",
    "transactional",
    true,
    () => "Your advert changes were not approved",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "The changes you submitted to your advert were not approved, so your advert is unchanged.",
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
    ].filter(Boolean),
  ),
  "brand-campaign-live": t(
    "brand-campaign-live",
    "transactional",
    true,
    () => "Your STRAND advert is live",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your advert${s(d.offer_title) ? ` "${s(d.offer_title)}"` : ""} is now live to members${s(d.ends_on) ? ` until ${s(d.ends_on)}` : ""}.`,
    ],
    (d) => ({
      label: "View performance",
      path: s(d.offer_id) ? `/brand/offers/${s(d.offer_id)}` : "/brand/offers",
    }),
  ),
  "brand-campaign-ended": t(
    "brand-campaign-ended",
    "transactional",
    true,
    () => "Your STRAND advert has ended",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your advert${s(d.offer_title) ? ` "${s(d.offer_title)}"` : ""} has finished its booked run.`,
      `Total views: ${s(d.views, "0")}. Total clicks: ${s(d.clicks, "0")}.`,
    ],
    (d) => ({
      label: "View the full report",
      path: s(d.offer_id) ? `/brand/offers/${s(d.offer_id)}` : "/brand/offers",
    }),
  ),

  // ---------------- Subscriptions and payments (essential) ----------------
  "subscription-started": t(
    "subscription-started",
    "transactional",
    true,
    () => "Your STRAND subscription is active",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your subscription is active${s(d.amount) ? ` at ${s(d.amount)}` : ""}${s(d.renews_on) ? `, renewing on ${s(d.renews_on)}` : ""}.`,
      "You can view invoices and manage your plan in billing settings.",
    ],
    (d) => ({ label: "Open billing", path: s(d.billing_path, "/profile") }),
  ),
  "subscription-renewing": t(
    "subscription-renewing",
    "transactional",
    true,
    () => "Your STRAND subscription renews soon",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your subscription renews on ${s(d.renews_on, "your next billing date")}${s(d.amount) ? ` at ${s(d.amount)}` : ""}.`,
    ],
    (d) => ({ label: "Open billing", path: s(d.billing_path, "/profile") }),
  ),
  "subscription-payment-failed": t(
    "subscription-payment-failed",
    "transactional",
    true,
    () => "We could not take your STRAND payment",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your last subscription payment did not go through. Please update your payment method to avoid losing access.",
    ],
    (d) => ({ label: "Update payment method", path: s(d.billing_path, "/profile") }),
  ),
  "subscription-cancelled": t(
    "subscription-cancelled",
    "transactional",
    true,
    () => "Your STRAND subscription is cancelled",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your subscription has been cancelled${s(d.ends_on) ? ` and your access ends on ${s(d.ends_on)}` : ""}.`,
    ],
    (d) => ({ label: "Open billing", path: s(d.billing_path, "/profile") }),
  ),
  "account-deletion-requested": t(
    "account-deletion-requested",
    "transactional",
    true,
    () => "Your STRAND account is scheduled for deletion",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `We have received your request to delete your STRAND account. Your membership has been cancelled and the app is closed for you now.`,
      `Nothing has been erased yet. Your data stays exactly as it is until ${s(d.erase_on, "30 days from today")}, when it will be erased and cannot be recovered.`,
      `Changed your mind? Sign in and choose "Cancel my deletion request" in your data and account settings. Everything comes straight back.`,
      `We keep payment records for six years because tax law requires it, and records of any data protection complaint for six years so we can show we handled it properly. Everything else is erased.`,
    ],
    () => ({ label: "Cancel my deletion request", path: "/profile/data-access" }),
  ),
  "account-deletion-cancelled": t(
    "account-deletion-cancelled",
    "transactional",
    true,
    () => "Your STRAND account is staying with us",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      "Your deletion request has been cancelled and nothing was erased. Your account and all your records are back as they were.",
      "If you did not do this, reply to this email straight away.",
    ],
    () => ({ label: "Open STRAND", path: "/home" }),
  ),

  // ---------------- Enquiries and appointments ----------------

  "pro-new-enquiry": t(
    "pro-new-enquiry",
    "transactional",
    false,
    () => "You have a new STRAND enquiry",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `A member has sent you an enquiry through STRAND${s(d.member_name) ? ` (${s(d.member_name)})` : ""}.`,
      "Open your portal to read it and reply.",
    ],
    () => ({ label: "Open enquiries", path: "/pro/enquiries" }),
    "enquiry_updates",
  ),
  "member-enquiry-replied": t(
    "member-enquiry-replied",
    "transactional",
    false,
    () => "You have a reply to your STRAND enquiry",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `${s(d.pro_name, "The professional you contacted")} has replied to your enquiry.`,
    ],
    (d) => ({
      label: "Read the reply",
      path: s(d.thread_id) ? `/chat/${s(d.thread_id)}` : "/chat",
    }),
    "enquiry_updates",
  ),
  "appointment-booked": t(
    "appointment-booked",
    "transactional",
    false,
    () => "Your appointment is booked",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your appointment${s(d.pro_name) ? ` with ${s(d.pro_name)}` : ""} is booked for ${s(d.when, "the agreed time")}.`,
    ],
    () => ({ label: "View appointments", path: "/appointments" }),
    "appointment_reminders",
  ),
  "appointment-reminder": t(
    "appointment-reminder",
    "transactional",
    false,
    () => "Your appointment is coming up",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `A reminder that your appointment${s(d.pro_name) ? ` with ${s(d.pro_name)}` : ""} is on ${s(d.when, "your booked date")}.`,
    ],
    () => ({ label: "View appointments", path: "/appointments" }),
    "appointment_reminders",
  ),
  "appointment-cancelled": t(
    "appointment-cancelled",
    "transactional",
    false,
    () => "Your appointment has been cancelled",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your appointment${s(d.pro_name) ? ` with ${s(d.pro_name)}` : ""}${s(d.when) ? ` on ${s(d.when)}` : ""} has been cancelled.`,
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
    ].filter(Boolean),
    () => ({ label: "View appointments", path: "/appointments" }),
    "appointment_reminders",
  ),

  // ---------------- Member lifecycle (optional, switchable) ----------------
  "wash-day-reminder": t(
    "wash-day-reminder",
    "transactional",
    false,
    () => "Your scheduled wash day is tomorrow",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `You scheduled a wash day for ${s(d.when, "tomorrow")}.`,
      "Open STRAND when you are ready to log it.",
    ],
    () => ({ label: "Open wash day", path: "/wash-day" }),
    "wash_day_reminders",
  ),
  "blood-test-due": t(
    "blood-test-due",
    "transactional",
    false,
    () => "Your blood test is due",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your next blood test is due${s(d.due_on) ? ` on ${s(d.due_on)}` : ""}.`,
      "You can upload your results in STRAND once you have them.",
    ],
    () => ({ label: "Open blood work", path: "/blood-history" }),
    "blood_test_due",
  ),
  "forum-reply": t(
    "forum-reply",
    "transactional",
    false,
    () => "Someone replied to your post",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `There is a new reply to your post${s(d.thread_title) ? ` "${s(d.thread_title)}"` : ""}.`,
    ],
    (d) => ({
      label: "Read the reply",
      path: s(d.thread_id) ? `/forum/thread/${s(d.thread_id)}` : "/forum",
    }),
    "forum_replies",
  ),
  "moderation-action": t(
    "moderation-action",
    "transactional",
    true,
    () => "A moderation decision about your STRAND content",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `${s(d.action, "Content you posted")} has been actioned by our moderation team.`,
      s(d.reason) ? `Reason given: ${s(d.reason)}` : "",
      "Reply to this email if you believe this was a mistake.",
    ].filter(Boolean),
  ),

  // ---------------- Compliance (essential, never optional) ----------------
  "complaint-received": t(
    "complaint-received",
    "transactional",
    true,
    () => "We have received your data protection complaint",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `We have received your data protection complaint and logged it${s(d.reference) ? ` under reference ${s(d.reference)}` : ""}.`,
      "We will respond within one month, as required under UK GDPR.",
      "If you need to add anything, reply to this email.",
    ],
  ),
  "complaint-acknowledged": t(
    "complaint-acknowledged",
    "transactional",
    true,
    () => "Your data protection complaint is under review",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your complaint${s(d.reference) ? ` (${s(d.reference)})` : ""} is now under formal review by our data protection contact.`,
    ],
  ),
  "complaint-resolved": t(
    "complaint-resolved",
    "transactional",
    true,
    () => "Your data protection complaint is resolved",
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `Your complaint${s(d.reference) ? ` (${s(d.reference)})` : ""} has been closed.`,
      s(d.outcome) ? `Outcome: ${s(d.outcome)}` : "",
      "If you are not satisfied, you can escalate to the Information Commissioner's Office at ico.org.uk.",
    ].filter(Boolean),
  ),

  // ---------------- Admin (essential, internal) ----------------
  "admin-action-required": t(
    "admin-action-required",
    "transactional",
    true,
    (d) => `STRAND admin: ${s(d.summary, "an item needs review")}`,
    (d) => [
      s(d.summary, "An item in the admin queue needs review."),
      s(d.detail),
    ].filter(Boolean),
    (d) => ({ label: "Open admin", path: s(d.path, "/admin") }),
  ),
  // A member/pro/brand sent a message. The body is deliberately NOT reproduced —
  // the CTA deep links straight to the message inside STRAND.
  "admin-new-message": t(
    "admin-new-message",
    "transactional",
    true,
    (d) => `New STRAND message — ${s(d.fromName, "someone")}`,
    () => [
      "A new message has arrived in the STRAND admin inbox.",
      "Open it in STRAND to read and reply.",
    ],
    (d) => ({ label: "Open the message", path: s(d.path, "/admin/messages") }),
    undefined,
    {
      eyebrow: "Admin",
      footerNote: "You are receiving this because you are an admin on STRAND.",
      rows: (d) => [
        { label: "From", value: s(d.fromName) },
        { label: "Subject", value: s(d.subject) },
        { label: "Received", value: s(d.received) },
      ],
    },
  ),
  // STRAND (admin) has messaged a member, professional or brand.
  // Essential + `legacy` so it can never be switched off or gated: the body is
  // NEVER reproduced (it can contain personal or health detail) — the CTA deep
  // links to the thread, and survives the login redirect via ?next=.
  "strand-message-received": t(
    "strand-message-received",
    "transactional",
    true,
    () => "STRAND has sent you a message",
    () => [
      "The STRAND team has sent you a message.",
      "For your privacy we do not include the message here — open STRAND to read it and reply.",
    ],
    (d) => ({ label: "Read your message", path: s(d.path, "/messages") }),
    undefined,
    {
      eyebrow: "Message",
      legacy: true,
      rows: (d) => [{ label: "Sent", value: s(d.received) }],
    },
  ),
  // Already live in production — bypasses the global flag.



  "admin-application-received": t(
    "admin-application-received",
    "transactional",
    true,
    (d) => `New STRAND professional application — ${s(d.fullName, "applicant")}`,
    () => ["A new applicant is waiting for review."],
    () => ({ label: "Review application", path: "/admin/applications" }),
    undefined,
    {
      eyebrow: "Admin",
      legacy: true,
      footerNote: "You are receiving this because you are an admin on STRAND.",
      rows: (d) => [
        { label: "Name", value: s(d.fullName) },
        { label: "Discipline", value: s(d.discipline) },
        { label: "Business", value: s(d.businessName) },
        { label: "Email", value: s(d.email) },
        { label: "Submitted", value: s(d.submitted) },
      ],
    },
  ),

  // Already live in production — bypasses the global flag.
  "directory-enquiry-forwarded": t(
    "directory-enquiry-forwarded",
    "transactional",
    true,
    (d) => `New STRAND enquiry from ${s(d.senderName, "a member")}`,
    (d) => [
      `Hi ${s(d.proName, "there")},`,
      `${s(d.senderName, "A STRAND member")} found you in the STRAND professional directory and would like to get in touch.`,
      s(d.message),
      "Reply directly to this email to reach the member.",
    ].filter(Boolean),
    undefined,
    undefined,
    {
      legacy: true,
      eyebrow: "Directory enquiry",
      rows: (d) => [
        { label: "Reply to", value: s(d.senderEmail) },
        { label: "Phone", value: s(d.phone) },
      ],
    },
  ),

  "password-reset": t(

    "password-reset",
    "transactional",
    true,
    (d) =>
      d.audience === "pro"
        ? "Reset your STRAND Pro password"
        : d.audience === "brand"
          ? "Reset your STRAND brand password"
          : "Reset your STRAND password",
    (d) => [
      `We received a request to reset the password for your STRAND${
        d.audience === "pro" ? " Pro" : d.audience === "brand" ? " brand" : ""
      } account.`,
      "Tap the button below to choose a new password. The link can be used once and expires in one hour.",
      "If you did not ask for this, you can safely ignore this email.",
    ],
    (d) => (s(d.link) ? { label: "Choose a new password", path: s(d.link) } : null),
    undefined,
    {
      sender: "noreply",
      legacy: true,
      eyebrow: undefined,
    },
  ),



  // ---- Member asked for an ended offer to return, and it has ----------
  "offer-relaunch-interest": t(
    "offer-relaunch-interest",
    "transactional",
    false,
    (d) => `${s(d.brand_name, "A brand")} is running that offer again`,
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `You asked to hear if ${s(d.brand_name, "this brand")} ran "${s(d.headline, "their offer")}" again. It is scheduled to return.`,
      "You can see the dates and details in STRAND.",
    ],
    (d) => ({ label: "View the offer", path: `/offers/${s(d.offer_id)}` }),
    "brand_offers",
  ),

  // A brand has been credited on a member's record (treatment plan, wash day,
  // style record, glossary entry). The email NEVER names the member or
  // reproduces any record detail — brands only ever see the aggregate.
  "brand-tagged": t(
    "brand-tagged",
    "transactional",
    true,
    () => "Your brand has been credited on STRAND",
    (d) => [
      `Hi ${s(d.brand_name, "there")},`,
      `Your brand has been tagged on ${s(d.surface, "a member's record")} in STRAND.`,
      "For privacy we don't share who tagged you or any detail of their record — you can see your credits in your brand dashboard.",
    ],
    () => ({ label: "See your brand credits", path: "/brand/tags" }),
    undefined,
    { eyebrow: "Brand credit" },
  ),


  // ---------------- Treatment plans ----------------------------------------

  // Once at the end of a plan week, only if the member switched reminders on.
  // Warm, no urgency, no percentages, never mentions a zero.
  "treatment-checkin-nudge": t(
    "treatment-checkin-nudge",
    "transactional",
    false,
    (d) => `Your week ${s(d.week, "")} check-in`.replace("  ", " "),
    (d) => {
      const tasks = Array.isArray(d.due_tasks) ? (d.due_tasks as string[]) : [];
      return [
        `Hi ${s(d.name, "there")},`,
        `You have reached the end of week ${s(d.week, "1")} of ${s(d.plan_title, "your plan")}.`,
        Number(d.steps_logged ?? 0) > 0
          ? `You logged ${d.steps_logged} step${Number(d.steps_logged) === 1 ? "" : "s"} this week.`
          : "Whenever you are ready, you can tell us how the week felt.",
        tasks.length ? `Your plan asks for: ${tasks.join(", ")}.` : "",
        "The check-in takes a moment, and you can still log any day you missed.",
      ].filter(Boolean);
    },
    (d) => ({
      label: "Check in",
      path: `/treatment/${s(d.plan_id)}/checkin/${s(d.week, "1")}`,
    }),
    "treatment_checkin_reminders",
    { eyebrow: "Treatment plan" },
  ),

  // Daily reminder. Names the exact steps due today — the whole point is that
  // she does not have to open the app to remember what she committed to.
  "treatment-daily-reminder": t(
    "treatment-daily-reminder",
    "transactional",
    false,
    (d) => `Today on ${s(d.plan_title, "your plan")}`,
    (d) => {
      const tasks = Array.isArray(d.due_tasks) ? (d.due_tasks as string[]) : [];
      const outstanding = Number(d.due_outstanding ?? 0);
      return [
        `Hi ${s(d.name, "there")},`,
        tasks.length
          ? `Today on ${s(d.plan_title, "your plan")}: ${tasks.join(", ")}.`
          : `A quick nudge for ${s(d.plan_title, "your plan")}.`,
        outstanding === 0
          ? "Everything due today is already logged — nothing else needed."
          : "Tick it off in STRAND once it's done, or log it later if today runs away with you.",
      ].filter(Boolean);
    },
    (d) => ({ label: "Open your plan", path: `/treatment/${s(d.plan_id)}` }),
    "treatment_checkin_reminders",
    { eyebrow: "Treatment plan" },
  ),


  // Weekly digest for professionals and admins. Counts and names only —
  // never ratings, notes, photos, voice notes or signed URLs.
  "treatment-weekly-digest": t(
    "treatment-weekly-digest",
    "transactional",
    false,
    () => "Your weekly client summary",
    (d) => {
      const total = Number(d.clients_total ?? 0);
      const checked = Array.isArray(d.checked_in) ? (d.checked_in as string[]) : [];
      const quiet = Array.isArray(d.quiet) ? (d.quiet as string[]) : [];
      return [
        `Hi ${s(d.name, "there")},`,
        `You have ${total} client${total === 1 ? "" : "s"} on an active plan.`,
        checked.length
          ? `Checked in this week: ${checked.join(", ")}.`
          : "No check-ins came in this week.",
        quiet.length ? `Quieter this week: ${quiet.join(", ")}.` : "",
        "Open STRAND to read anything that has been shared with you.",
      ].filter(Boolean);
    },
    (d) => ({ label: "Open your clients", path: s(d.path, "/pro/treatment") }),
    "treatment_weekly_digest",
    { eyebrow: "Treatment plans", footerNote: "Client check-in content stays inside STRAND." },
  ),

  // Assignment created. Never implies that accepting shares media.
  "treatment-plan-invitation": t(
    "treatment-plan-invitation",
    "transactional",
    true,
    (d) => `${s(d.sender_name, "A professional")} has shared a treatment plan with you`,
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `${s(d.sender_name, "A professional")} has put together a treatment plan for you on STRAND.`,
      "Open the invitation to read the plan in full and decide whether to accept it. Nothing starts until you do.",
    ],
    (d) => ({
      label: "Review the plan",
      path: `/treatment/invitation/${s(d.assignment_id)}`,
    }),
    undefined,
    {
      eyebrow: "Treatment plan",
      rows: (d) => [
        { label: "Plan", value: s(d.plan_title, "Treatment plan") },
        { label: "Length", value: s(d.duration, "—") },
        { label: "From", value: s(d.sender_name, "STRAND") },
      ],
    },
  ),

  // A member has tagged a professional into their own plan. Read-only access,
  // and never implies media is included.
  "treatment-plan-share": t(
    "treatment-plan-share",
    "transactional",
    true,
    (d) => `${s(d.member_name, "A STRAND member")} would like you to follow their treatment plan`,
    (d) => [
      `Hi ${s(d.name, "there")},`,
      `${s(d.member_name, "A STRAND member")} has shared their treatment plan with you on STRAND so you can follow their progress.`,
      "Open the invitation to see what the plan involves and decide whether to accept. You'll see the plan, the steps they tick off and their weekly check-ins — photos, videos and voice notes stay private unless they switch sharing on.",
    ],
    (d) => ({
      label: "Review the invitation",
      path: `/treatment/share/${s(d.share_id)}`,
    }),
    undefined,
    {
      eyebrow: "Treatment plan",
      rows: (d) => [
        { label: "Plan", value: s(d.plan_title, "Treatment plan") },
        { label: "Length", value: s(d.duration, "—") },
        { label: "From", value: s(d.member_name, "A STRAND member") },
      ],
    },
  ),


  // ---------------- Marketing (consent required, unsubscribe rendered) ----


  "marketing-brand-offer": t(
    "marketing-brand-offer",
    "marketing",
    false,
    (d) => s(d.subject, "A new offer on STRAND"),
    (d) => [
      `Hi ${s(d.name, "there")},`,
      s(d.message, "There is a new brand offer available in STRAND."),
    ],
    () => ({ label: "Open STRAND", path: "/products" }),
    "brand_offers",
  ),
  "marketing-newsletter": t(
    "marketing-newsletter",
    "marketing",
    false,
    (d) => s(d.subject, "News from STRAND"),
    (d) => [`Hi ${s(d.name, "there")},`, s(d.message, "")].filter(Boolean),
    () => ({ label: "Open STRAND", path: "/home" }),
  ),
};

export function getTemplate(key: string): EmailTemplate | null {
  return TEMPLATES[key] ?? null;
}
