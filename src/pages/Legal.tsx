import { useNavigate, useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { CONSENT_DOCUMENT_VERSION } from "@/lib/consent";

/**
 * Legal document reader.
 *
 * ONE DOCUMENT IS STILL OUTSTANDING — the Brand Advertising Terms are a clearly
 * marked placeholder listing what they must cover. They must be drafted by a
 * solicitor.
 *
 * The other five documents (Terms of Service, Privacy Policy, Medical
 * Disclaimer, How we use health information, and the Professional Data Handling
 * Undertaking) have been reviewed and are the published wording.
 *
 * Company details, ICO registration (ZC216631, registered 7 August 2026), data
 * region, retention periods and the liability cap are all filled in. No
 * square-bracket placeholders remain in any of the five documents. Do not ship a
 * document with a bracket still in it.
 *
 * When the final wording lands, bump CONSENT_DOCUMENT_VERSION so every member
 * is asked to accept the new version.
 *
 * Paragraph text is verbatim. A leading `**label**` in a paragraph renders bold;
 * nothing else in the text is transformed.
 */

interface LegalDoc {
  title: string;
  lastUpdated: string;
  sections: { heading: string; body: string[] }[];
}

const LAST_UPDATED = "7 August 2026";

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: "Terms of Service",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Who we are",
        body: [
          `STRAND is operated by Team Texture Ltd, a company registered in England and Wales, company number 16901086, registered office 103 Ferdinand Magellan Court, 5 Clipper Street, London, England, E16 2XE. You can contact us at info@teamtexture.co.uk.`,
          `These terms form a contract between you and us. By accepting them you agree to be bound by them. If you do not agree, do not use STRAND.`,
        ],
      },
      {
        heading: "What STRAND is",
        body: [
          `STRAND is a hair health platform. It lets you record your hair routine, store and view your own health and blood test records, receive educational guidance drawn from the book How to Love Your Afro by Paige Lewin, track products, and find independent hair professionals.`,
          `STRAND is an information and record-keeping tool. It is not a medical service, it does not provide healthcare, and it does not replace advice from a doctor or other qualified clinician. Please read our Medical Disclaimer, which forms part of these terms.`,
        ],
      },
      {
        heading: "Who can use STRAND",
        body: [
          `You must be 16 or over. You must provide accurate information and keep your account details secure. You are responsible for everything done through your account.`,
          `We may refuse, suspend or close an account where these terms are breached, where information provided is false, or where we reasonably believe use of the service risks harm to you or others.`,
        ],
      },
      {
        heading: "Salon and multi-stylist accounts",
        body: [
          `A salon account may list more than one stylist under a single login. Where it does, the account holder is responsible for everything done through that account, for the accuracy of every stylist listing under it, and for ensuring each stylist has agreed to be listed and contacted at the email address given.`,
          `Sharing login details among stylists means we cannot identify which individual took a particular action. The account holder accepts responsibility for all of them.`,
        ],
      },
      {
        heading: "Subscriptions and payment",
        body: [
          `Paid plans are STRAND Basic at £9.99 per month, STRAND Plus at £14.99 per month, STRAND Pro at £12.99 per month for professionals, and brand platform access at £99 per year with additional fees for promotional placements.`,
          `Subscriptions renew automatically at the end of each billing period until cancelled. You can cancel at any time; cancellation takes effect at the end of the period you have paid for, and you keep access until then. We do not provide pro-rata refunds for part-used periods except where required by law.`,
          `Payments are processed by Stripe. We do not store your card details.`,
          `We may change prices. We will give you at least 30 days' notice before a change affects you, and you may cancel before it takes effect.`,
          `Where we grant complimentary access, we will tell you the period it covers. At the end of that period access stops unless you take out a paid plan. Complimentary access can be withdrawn at any time.`,
        ],
      },
      {
        heading: "Professionals listed on STRAND",
        body: [
          `Professionals listed in our directory are independent third parties. They are not our employees, agents or partners.`,
          `We do not employ, supervise, train, insure or endorse them. We do not verify their qualifications, insurance or competence beyond basic checks at the point of listing. We are not responsible for any service, treatment, advice or outcome they provide.`,
          `Any booking, treatment, payment or dispute is between you and that professional directly. We are not a party to it. We may help put you in touch, and we may pass on a complaint, but we cannot resolve disputes between you and a professional.`,
          `You should satisfy yourself as to a professional's suitability, qualifications and insurance before booking.`,
        ],
      },
      {
        heading: "Brand offers and discount codes",
        body: [
          `Brands pay to show offers inside STRAND. Those offers, discount codes, prices and product claims are the brand's own. They are not our recommendations.`,
          `We review offers before they appear, but we do not guarantee that a code will work, that an offer will be honoured, that a price is accurate, or that a product will suit you. Anything you buy from a brand is a contract between you and that brand.`,
          `Where we say an advert is shown to you because it matches details of your hair, that means only what our privacy documents describe. It is not an endorsement.`,
        ],
      },
      {
        heading: "Guidance generated in STRAND",
        body: [
          `Educational guidance in STRAND is generated using artificial intelligence, drawing on How to Love Your Afro. It is general information, not personal advice, and it may contain errors or omissions.`,
          `Do not rely on it as your only source of information about your hair or your health. Do not use it in place of professional advice. Please read our Medical Disclaimer.`,
        ],
      },
      {
        heading: "Your content",
        body: [
          `You keep ownership of what you upload — photographs, notes, voice recordings, ratings and reviews.`,
          `By uploading, you give us a licence to store, display and process that content so we can provide STRAND to you. Where you grant a professional access to your records, you authorise us to show them that content. This licence ends when you delete the content or your account, except where we must retain something by law.`,
          `You must not upload content you have no right to share, or content that is unlawful, abusive, misleading or infringes someone else's rights.`,
        ],
      },
      {
        heading: "Our content",
        body: [
          `The How to Love Your Afro manuscript, the STRAND name and branding, the platform and its design are owned by us or licensed to us. You may use them only as part of using STRAND. You may not copy, republish, scrape, resell or use them to train any machine learning model.`,
        ],
      },
      {
        heading: "Community rules",
        body: [
          `Where STRAND includes forums or community features, you must not post anything abusive, harassing, discriminatory, defamatory, misleading, sexually explicit, or that gives medical advice presented as professional advice. Do not share another member's personal or health information.`,
          `We may remove content and restrict accounts. We will tell you when we do.`,
        ],
      },
      {
        heading: "Things we are not liable for",
        body: [
          `We provide STRAND with reasonable skill and care, but we do not promise it will be uninterrupted, error-free, or that the guidance in it will produce any particular result.`,
          `We are not liable for the acts or omissions of professionals or brands, for any decision you take based on guidance in STRAND, for any health outcome, or for loss caused by inaccurate information you have entered.`,
          `Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be limited.`,
          `Subject to that, our total liability to you in any 12-month period is limited to the greater of the amount you paid us in that period and £500.`,
          `If you use STRAND for business purposes, we are not liable for lost profits, lost business or lost data.`,
        ],
      },
      {
        heading: "Ending your use",
        body: [
          `You can stop using STRAND and delete your account at any time. We may end your access if you breach these terms, if we stop providing the service, or if we are required to. Where we do so without cause and you have paid in advance, we will refund the unused part.`,
        ],
      },
      {
        heading: "Changes",
        body: [
          `We may change these terms. Where a change materially affects you we will tell you and ask you to accept the new version before continuing. Continuing to use STRAND after that means you accept it.`,
        ],
      },
      {
        heading: "Law",
        body: [
          `These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction. If you live elsewhere in the UK you may bring proceedings in your own country's courts.`,
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Who is responsible for your data",
        body: [
          `Team Texture Ltd, company number 16901086, registered office 103 Ferdinand Magellan Court, 5 Clipper Street, London, England, E16 2XE, is the data controller for the personal data described here. We are registered with the Information Commissioner's Office under registration reference ZC216631, registered on 7 August 2026.`,
          `The ICO keeps a public register of data controllers, which is searchable at ico.org.uk, so you can check our registration yourself at any time.`,

          `For any question about your data, or to exercise a right, contact info@teamtexture.co.uk or use the data protection complaint form in the app.`,
        ],
      },
      {
        heading: "What we collect",
        body: [
          `**Account information** — your name, email address, password (stored encrypted), and account type.`,
          `**Hair profile** — porosity, density, strand thickness, surface texture, length, curl pattern, current and planned styles, and the areas of your hair or scalp you are concerned about.`,
          `**Routine records** — wash days, products used, techniques, heat use, how your hair felt, and voice notes you record.`,
          `**Health information** — blood test results you enter or upload, scalp and skin conditions, medications and supplements, and health profile answers. This is special category data and is covered in more detail in How we use health information.`,
          `**Photographs** — progress photos and product photos you upload. Photographs of your hair or scalp can reveal health information, so we treat them as special category data too.`,
          `**Goals and challenges** — what you are working towards and what you are struggling with, including anything you record by voice.`,
          `**Products** — items on your shelf, wishlist and favourites, and what you have scanned or linked.`,
          `**Payment information** — your subscription status and history. Card details are handled by Stripe and never reach us.`,
          `**Usage information** — pages viewed, features used, adverts shown to you and whether you interacted with them, and technical information such as device type and browser.`,
          `**Communications** — messages you send us, enquiries you send professionals, and complaints you raise.`,
        ],
      },
      {
        heading: "Why we use it, and our lawful basis",
        body: [
          `**To provide STRAND** — your account, your records, your routine and product tracking. Lawful basis: performance of our contract with you.`,
          `**To generate your guidance** — producing hair guidance and summaries from your profile, records and health information. Lawful basis: performance of our contract, and for health information your explicit consent under Article 9(2)(a) of the UK GDPR.`,
          `**To take payment** — Lawful basis: performance of our contract.`,
          `**To connect you with professionals** — passing your enquiry, and where you have specifically granted it, giving a professional access to your records. Lawful basis: performance of our contract, and your explicit consent for health information.`,
          `**To keep STRAND secure and working** — diagnosing faults, preventing abuse, measuring which features are used. Lawful basis: our legitimate interests in running a secure and functional service.`,
          `**To show adverts** — brands pay to show offers in STRAND. Everyone sees these. Lawful basis: our legitimate interests in funding the service.`,
          `**To match adverts to your hair** — only if you have turned personalised offers on. Lawful basis: your consent. See Adverts below.`,
          `**To send you service emails** — confirmations, approvals, reminders, receipts, complaint acknowledgements. Lawful basis: performance of our contract and our legitimate interests.`,
          `**To send you marketing emails** — only if you have opted in. Lawful basis: your consent.`,
          `**To meet legal obligations** — accounting records, responding to lawful requests, handling data protection complaints. Lawful basis: compliance with a legal obligation.`,
        ],
      },
      {
        heading: "Adverts",
        body: [
          `Brands pay to show offers inside STRAND. Some are shown to everyone.`,
          `If you turn personalised offers on, we may show you offers matched to non-health details: your porosity, density, strand thickness, surface texture, hair length, how often you wash, the categories of product on your shelf, your current and planned styles, and your hair goal.`,
          `We never use your health information for advertising. Blood results, medications, diagnosed conditions, scalp conditions and areas of concern are excluded, and cannot be used for advertising in any circumstances.`,
          `Brands never receive your personal data and never learn who you are. They see only approximate ranges rather than exact numbers, and nothing that could identify an individual.`,
          `This setting is off unless you turn it on. You can turn it off at any time in your profile, and it takes effect immediately. Turning it off does not affect your access to STRAND.`,
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          `**Professionals** — only those you have specifically granted access to, and only for as long as you allow it. You can revoke access at any time.`,
          `**Our service providers** — Supabase (hosting, database and file storage), Stripe (payments), Resend (email), and the artificial intelligence providers that generate your guidance. Each is bound by contract to process data only on our instructions and to keep it secure.`,
          `**Nobody else** — we do not sell your personal data, and we do not share it with brands or advertisers.`,
          `We may disclose information where the law requires it, or to protect someone's safety.`,
        ],
      },
      {
        heading: "Where your data goes",
        body: [
          `Your data is stored in the EU Central (Frankfurt, Germany) region. Some of our providers are based outside the UK. Where data is transferred outside the UK we rely on the UK International Data Transfer Addendum, or on adequacy regulations where they apply. You can ask us for details of the safeguards for any specific provider.`,
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          `**Your account and records** — while your account is open, and for 30 days afterwards, then deleted.`,
          `**Health information** — deleted with your account, or sooner if you withdraw consent.`,
          `**Advert interaction records** — 24 months, after which they are aggregated so no individual can be identified.`,
          `**Payment records** — six years, as tax law requires.`,
          `**Data protection complaints** — six years, to show we handled them properly.`,
          `**Consent records** — for as long as we need them to show what you agreed to, and for a reasonable period afterwards.`,
        ],
      },
      {
        heading: "Your rights",
        body: [
          `You have the right to be told what we hold about you and to get a copy; to have inaccurate data corrected; to have your data deleted; to restrict how we use it; to receive it in a portable form; to object to processing based on our legitimate interests; and to withdraw any consent you have given.`,
          `We will respond within one month. We will not charge you, and we will not treat you differently for asking.`,
          `To exercise a right, contact info@teamtexture.co.uk or use the data protection complaint form in the app. If you are unhappy with how we have handled it you can complain to the Information Commissioner's Office at ico.org.uk, or call 0303 123 1113. You can complain to the ICO at any time; you do not have to come to us first.`,
        ],
      },
      {
        heading: "Automated processing",
        body: [
          `We use artificial intelligence to generate your guidance. This produces information for you to consider; it makes no decision about you, does not affect your legal rights or your access to anything, and is never used to assess you or decide what you can have.`,
          `If you have turned personalised offers on, we use straightforward rules — not artificial intelligence — to decide which offers you see. This affects only which advert appears.`,
        ],
      },
      {
        heading: "Information about other people",
        body: [
          `If you are a salon and you give us a stylist's name and email address, you must have their agreement first. We will contact that stylist to tell them they have been listed, what we hold, and how to correct or remove it.`,
        ],
      },
      {
        heading: "Children",
        body: [
          `STRAND is for people aged 16 and over. We do not knowingly collect data about anyone under 16. If you believe we have, contact us and we will delete it.`,
        ],
      },
      {
        heading: "Changes",
        body: [
          `If we change how we use your data in a way that materially affects you, we will tell you and, where the law requires it, ask for your consent again.`,
        ],
      },
    ],
  },

  "medical-disclaimer": {
    title: "Medical Disclaimer",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Please read this carefully",
        body: [
          `STRAND is not a medical service. Nothing in it is medical advice, and it must not be used as a substitute for advice from a doctor, dermatologist, trichologist, pharmacist or other qualified healthcare professional.`,
        ],
      },
      {
        heading: "What STRAND does not do",
        body: [
          `STRAND does not diagnose, treat, cure or prevent any disease or condition. It does not tell you what is wrong with you, does not tell you what treatment to have, and does not interpret your results in the way a clinician would.`,
          `STRAND is not a medical device and is not intended for any medical purpose. It is a tool for recording your own information and receiving general educational guidance about hair care.`,
        ],
      },
      {
        heading: "Guidance in STRAND",
        body: [
          `Guidance is generated using artificial intelligence, drawing on the book How to Love Your Afro by Paige Lewin. It is general educational information about hair care. It is not personal to your medical circumstances, even where it refers to details you have entered.`,
          `Automatically generated guidance can be wrong. It may be incomplete, out of date, or not right for you. Please treat it as a starting point for your own thinking, not as an instruction.`,
        ],
      },
      {
        heading: "Your blood test results",
        body: [
          `Blood test results shown in STRAND are your own records, entered or uploaded by you. We display them so you can keep them in one place and see them over time.`,
          `We do not interpret them clinically. Where a result sits outside a typical reference range, we will tell you that and suggest you discuss it with your GP. We will not tell you what it means for your health.`,
          `We do not claim that a blood marker is the cause of a hair concern unless that link is clinically established, and where we do refer to such a link it is drawn from a source we can cite. If you see anything in STRAND suggesting a connection between a blood result and your hair that you do not understand, treat it as unreliable and tell us at info@teamtexture.co.uk.`,
          `Always discuss your results with your GP or the clinician who ordered the test. Do not change any medication, supplement or treatment on the basis of anything in STRAND.`,
        ],
      },
      {
        heading: "Speak to a professional",
        body: [
          `Please speak to a qualified healthcare professional before acting on anything in STRAND if you are pregnant or breastfeeding, taking any medication, have a diagnosed medical or skin condition, are having treatment for hair loss, or have any allergy or sensitivity.`,
        ],
      },
      {
        heading: "Do not delay getting help",
        body: [
          `Never delay seeking medical advice because of something you have read in STRAND.`,
          `See a doctor promptly if you have sudden or patchy hair loss, a painful, bleeding, weeping or infected scalp, a rash or swelling spreading beyond your scalp, hair loss with other unexplained symptoms such as fatigue or weight change, or any reaction to a product.`,
          `If you think you are having a severe allergic reaction, or you are seriously unwell, call 999 or go to A&E. For urgent advice that is not an emergency, call 111.`,
        ],
      },
      {
        heading: "Professionals listed in STRAND",
        body: [
          `Professionals in our directory are independent third parties. We do not employ, supervise, insure or endorse them, and they are not medical practitioners unless they say so and you have verified it. Anything they tell you is their own advice, not ours.`,
        ],
      },
      {
        heading: "Products",
        body: [
          `Where STRAND mentions a product, that is not a recommendation that it is safe or suitable for you. Always patch test, read the manufacturer's instructions, and check the ingredients against any allergy you have.`,
        ],
      },
    ],
  },

  "professional-data-handling": {
    title: "Professional Data Handling Undertaking",
    lastUpdated: "9 August 2026",
    sections: [
      {
        heading: "Who this applies to",
        body: [
          `This undertaking applies to you if you are listed on STRAND as a professional — a stylist, loctician, braider, trichologist, dermatologist, or any other professional listed in our directory.`,
          `STRAND is operated by Team Texture Ltd, company number 16901086, registered office 103 Ferdinand Magellan Court, 5 Clipper Street, London, England, E16 2XE. You can contact us at info@teamtexture.co.uk.`,
          `You must accept this undertaking before you can view any member's passport or health records. You can use every other part of your professional account without accepting it.`,
        ],
      },
      {
        heading: "What you may be given access to",
        body: [
          `Where a member chooses to share their records with you, you may see: their hair profile, their wash day and routine history, the products they use, photographs of their hair and scalp, their goals and challenges, blood test results they have uploaded, scalp and skin conditions they have recorded, and medications and supplements they have listed.`,
          `Much of this is health information. The law treats it as needing extra protection, and so do we.`,
        ],
      },
      {
        heading: "The member grants access, not us",
        body: [
          `We do not decide what you see. The member does. They choose whether to share, what to share, and for how long.`,
          `We are not giving you this information for our own purposes, and you are not acting on our behalf when you use it. You decide how to use it in the care you provide, and you are responsible for that decision.`,
        ],
      },
      {
        heading: "Use it only to care for that member",
        body: [
          `You may use what you see for one purpose only: providing care, advice or treatment to the member who shared it with you.`,
          `You must not use it to market to them or to anyone else, to build a mailing list, for research, for training or teaching, for any commercial purpose, or to make decisions about anyone other than that member.`,
        ],
      },
      {
        heading: "Keep it confidential",
        body: [
          `Do not discuss a member's information with anyone who does not need to know it in order to provide their care. Do not show it to colleagues out of interest. Do not post it, screenshot it for social media, or repeat it as an anecdote in a way that could identify them — including in a salon, a group chat or a training session.`,
          `If you work in a salon where an account is shared between stylists, you are responsible for making sure the people you share that account with understand and follow this undertaking.`,
        ],
      },
      {
        heading: "Records you keep yourself",
        body: [
          `You may need to keep your own notes about a member's care. Where you do, keep only what you genuinely need, keep it securely, and keep it no longer than your own professional obligations require.`,
          `Anything you record or store outside STRAND is yours to look after. You become responsible for it under data protection law in your own right, including responding to that member if they ask you what you hold. We cannot do that for you.`,
        ],
      },
      {
        heading: "Access ends when the member says so",
        body: [
          `A member can withdraw your access at any time, without telling you why.`,
          `When they do, you must stop using anything you saw through STRAND for any new purpose, and you must delete anything you copied out of it unless your own professional or legal obligations require you to keep it. If you do keep something, keep only what those obligations require.`,
        ],
      },
      {
        heading: "Tell us if something goes wrong",
        body: [
          `If you think a member's information has been lost, seen by someone who should not have seen it, or used in a way this undertaking does not allow, tell us at info@teamtexture.co.uk as soon as you become aware of it, and no later than 24 hours afterwards.`,
          `Tell us even if you are not sure. It is better to raise something that turns out to be nothing.`,
        ],
      },
      {
        heading: "Your own professional obligations still apply",
        body: [
          `This undertaking sits alongside your own responsibilities, it does not replace them. You remain responsible for your own registration, qualifications, insurance, and any code of practice or regulatory obligation that applies to your profession.`,
          `Nothing here makes us responsible for the care you provide.`,
        ],
      },
      {
        heading: "You are independent",
        body: [
          `You are not our employee, agent or partner. We do not supervise, train or insure you, and we are not a party to any arrangement between you and a member.`,
        ],
      },
      {
        heading: "If you breach this undertaking",
        body: [
          `We may withdraw your access to member records, suspend or remove your listing, and close your professional account. Where the law requires it, we may need to report a breach to the Information Commissioner's Office or to the affected member.`,
        ],
      },
      {
        heading: "Changes",
        body: [
          `We may update this undertaking. Where a change materially affects you we will tell you and ask you to accept the new version before you can view member records again.`,
        ],
      },
    ],
  },

  /**
   * PLACEHOLDER — NOT LEGAL TEXT. One document is outstanding and must be
   * drafted by a qualified solicitor before launch. The headings below describe
   * what it has to cover; the body text is a deliberate placeholder so the
   * route resolves.
   */
  "brand-advertising-terms": {
    title: "Brand Advertising Terms",
    lastUpdated: "Awaiting drafting",
    sections: [
      {
        heading: "This document is not yet written",
        body: [
          `**PLACEHOLDER.** These terms have not been drafted yet. They are being prepared with a qualified solicitor and will replace this page before brands can be charged for advertising.`,
        ],
      },
      {
        heading: "What they will cover",
        body: [
          `**Claim substantiation.** The brand warrants that every claim it makes about its own products — ingredient, performance, safety, certification and testing claims — is accurate and substantiated, and indemnifies us against any loss arising from a claim that is not. Liability for a false product claim sits with the brand.`,
          `Compliance with UK advertising law and the CAP Code, cosmetic product regulations, and any applicable labelling and safety requirements.`,
          `Intellectual property: the brand warrants it owns or is licensed to use the imagery, copy and trade marks it supplies, and licenses us to display them.`,
          `Editorial control: our right to review, reject, amend the presentation of, or withdraw an advert, and what happens to fees when we do.`,
          `Fees, booked placement dates, payment terms, cancellation and refunds.`,
          `What data a brand receives — aggregate campaign performance only, never member-level or health information.`,
          `That AI-generated guidance shown alongside an advert is ours, not the brand's, and the brand may not require or influence its wording.`,
          `Term, suspension and termination, liability cap, and governing law.`,
        ],
      },
      {
        heading: "Questions",
        body: [`Contact info@teamtexture.co.uk.`],
      },
    ],
  },

  "health-data": {
    title: "How we use health information",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Why this document exists",
        body: [
          `Some of what STRAND holds about you is health information. The law treats it as needing extra protection, and asking for your clear agreement before we use it. This explains what we hold, why, and what control you have. It sits alongside our Privacy Policy.`,
        ],
      },
      {
        heading: "What we treat as health information",
        body: [
          `Blood test results you enter or upload, including individual markers and their values.`,
          `Scalp and skin conditions you record, whether diagnosed or self-described.`,
          `Medications and supplements you are taking.`,
          `Health profile answers, including anything about your general health that may affect your hair.`,
          `Areas of concern such as thinning at your hairline, temples or crown.`,
          `Photographs of your hair or scalp. A photograph can reveal a condition, so we treat your progress photos as health information even though you may not think of them that way.`,
          `Anything you record by voice that touches on the above.`,
        ],
      },
      {
        heading: "Why we need it",
        body: [
          `STRAND exists to connect your hair to your health. Without this information we cannot generate guidance that reflects your circumstances, we cannot show you your results over time, and we cannot give a professional the context they need when you choose to share it with them.`,
          `This is why we ask for your agreement to it as a condition of using STRAND. It is not an optional extra we would like to have — the service does not work without it.`,
        ],
      },
      {
        heading: "Our lawful basis",
        body: [
          `We rely on your explicit consent under Article 9(2)(a) of the UK GDPR. That is why we ask for it separately, in its own tick box, rather than bundling it in with our terms.`,
          `"Explicit" means you must actively agree. We will never assume it, pre-tick it, or infer it from anything else you do.`,
        ],
      },
      {
        heading: "What we do with it",
        body: [
          `We use it to generate your guidance and hair summaries, to display your results and track them over time, to spot patterns in your routine, and to show a professional the context you have chosen to share.`,
          `Your guidance is generated using artificial intelligence, which means your health information is processed by an artificial intelligence provider on our behalf. That provider is contractually bound to process it only for that purpose, not to use it for anything else, and not to use it to train models.`,
        ],
      },
      {
        heading: "Who can see it",
        body: [
          `**You.** Always.`,
          `**Our administrators.** A small number of people, only where needed to run the service, fix a fault or answer a question you have raised.`,
          `**A professional you have chosen.** Only where you have specifically granted that professional access, and only what that access covers. You choose who, and you can withdraw it at any time in your profile. Withdrawing stops their access immediately.`,
          `**Nobody else.** We do not share your health information with brands, advertisers or anyone else.`,
        ],
      },
      {
        heading: "We never use it for advertising",
        body: [
          `Your health information is never used to decide which adverts you see. Blood results, medications, diagnosed conditions, scalp conditions and areas of concern are excluded from advertising entirely, and this cannot be turned on.`,
          `If you choose to see personalised offers, they are matched only on non-health details of your hair such as porosity, length and how often you wash.`,
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          `We keep it while your account is open. It is deleted when you delete your account, or sooner if you withdraw consent. We do not keep a copy for advertising, analytics or any other purpose.`,
        ],
      },
      {
        heading: "Withdrawing your consent",
        body: [
          `You can withdraw at any time by contacting info@teamtexture.co.uk or using the data protection complaint form in the app.`,
          `Because STRAND cannot work without this information, withdrawing means we can no longer provide the service, and your account will be closed. We will delete your health information, and confirm when we have. Withdrawing does not affect anything we lawfully did before you withdrew.`,
          `If you would rather remove specific information than close your account, you can delete individual records — a blood panel, a photograph, a condition — at any time, and keep using STRAND.`,
        ],
      },
      {
        heading: "Questions",
        body: [
          `Contact info@teamtexture.co.uk, or use the data protection complaint form in the app. You can also complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113.`,
        ],
      },
    ],
  },
};

/** Renders a paragraph, bolding any **…** spans. The text itself is untouched. */
const Paragraph = ({ text }: { text: string }) => (
  <p className="text-[13.5px] leading-[1.7] font-body text-foreground/85">
    {text.split("**").map((chunk, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="font-semibold text-foreground">
          {chunk}
        </strong>
      ) : (
        <span key={i}>{chunk}</span>
      ),
    )}
  </p>
);

const Legal = () => {
  const { doc } = useParams<{ doc: string }>();
  const navigate = useNavigate();
  const entry = doc ? DOCS[doc] : undefined;

  if (!entry) {
    return (
      <ScreenLayout>
        <TitleBar title="Legal" onBack={() => navigate(-1)} />
        <div className="px-5 py-8 text-[13px] text-muted-foreground">Document not found.</div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <title>{`STRAND — ${entry.title}`}</title>
      <TitleBar title={entry.title} onBack={() => navigate(-1)} />
      <div className="px-5 pb-10 pt-2 space-y-4">
        <p className="text-[11px] uppercase tracking-[0.16em] font-body text-muted-foreground">
          Last updated {entry.lastUpdated}
        </p>

        {entry.sections.map((section) => (
          <SurfaceCard key={section.heading}>
            <h2 className="font-display text-[16px] leading-tight text-foreground mb-2.5">
              {section.heading}
            </h2>
            <div className="space-y-3">
              {section.body.map((para, i) => (
                <Paragraph key={i} text={para} />
              ))}
            </div>
          </SurfaceCard>
        ))}

        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Version {CONSENT_DOCUMENT_VERSION}
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Legal;
