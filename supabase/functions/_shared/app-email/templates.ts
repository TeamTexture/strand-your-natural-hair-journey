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
  | "brand_offers";

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
