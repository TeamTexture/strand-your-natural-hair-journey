import { useNavigate, useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { CONSENT_DOCUMENT_VERSION } from "@/lib/consent";

/**
 * Legal document reader.
 *
 * The body text of each document is DELIBERATELY a placeholder. Terms, privacy
 * and medical wording for a health-adjacent product must be drafted by a
 * solicitor — nothing here is auto-written. Replace the `placeholder` array of
 * each entry with the final text and bump CONSENT_DOCUMENT_VERSION.
 */
const DOCS: Record<
  string,
  { title: string; intro: string; mustCover: string[] }
> = {
  terms: {
    title: "Terms of Service",
    intro: "PLACEHOLDER — awaiting solicitor-drafted text.",
    mustCover: [
      "Who STRAND is, what the service is, and who may use it (18+).",
      "Membership, subscription pricing, renewal, cancellation and refunds.",
      "Acceptable use, forum and community rules, and moderation.",
      "That professionals listed in the directory are independent third parties — not employees or agents of STRAND — and STRAND is not party to any booking, treatment or payment between a member and a professional.",
      "That guidance is AI-generated from a published manuscript, may contain errors, and is not clinical advice.",
      "Intellectual property in the manuscript and in member-uploaded content.",
      "Limitation of liability, suspension and termination, governing law.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "PLACEHOLDER — awaiting solicitor-drafted text.",
    mustCover: [
      "What data is collected, including health data and progress photographs.",
      "The lawful basis for each purpose (contract, explicit consent for health data, legitimate interests, consent for marketing and personalised offers).",
      "Retention periods, including the 24-month advert event retention already in place.",
      "Processors and international transfers — Supabase (hosting and database), Resend (email), and the AI providers used to generate guidance.",
      "Member rights (access, rectification, erasure, portability, objection, restriction) and how to exercise them.",
      "The data protection complaints route inside the app, and the right to complain to the ICO.",
      "How to withdraw each optional consent, and that withdrawal does not affect access.",
      "Cookies / local storage and analytics, if any.",
    ],
  },
  "medical-disclaimer": {
    title: "Medical Disclaimer",
    intro: "PLACEHOLDER — awaiting solicitor-drafted text.",
    mustCover: [
      "STRAND does not diagnose, treat, cure or prevent any condition, and does not replace a clinician.",
      "Guidance is AI-generated from a published manuscript and may contain errors.",
      "Blood results shown in STRAND are the member's own records; they must be discussed with a GP or other qualified clinician.",
      "STRAND does not interpret blood markers as causes of hair concerns unless that link is clinically established.",
      "When to seek urgent medical attention.",
    ],
  },
  "health-data": {
    title: "How we use health information",
    intro: "PLACEHOLDER — awaiting solicitor-drafted text.",
    mustCover: [
      "The categories of special category data processed: blood results, scalp and skin conditions, medications, health profile answers, progress photographs.",
      "That the lawful basis is explicit consent under Article 9(2)(a), and why the service cannot be delivered without it.",
      "Who can see it: the member, STRAND administrators, and only professionals the member has explicitly granted passport access to.",
      "That AI providers process this data to generate guidance, and on what terms.",
      "How to withdraw — and that withdrawal means the service can no longer be provided, with what happens to the data then.",
    ],
  },
};

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
        <SurfaceCard tone="gold">
          <p className="text-[13px] font-medium text-foreground">{entry.intro}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            This document has not been drafted yet. The final wording will be supplied by STRAND's
            solicitor and inserted here. Below is the list of points the final document must cover.
          </p>
        </SurfaceCard>

        <SurfaceCard>
          <ul className="space-y-2.5">
            {entry.mustCover.map((point) => (
              <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </SurfaceCard>

        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Version {CONSENT_DOCUMENT_VERSION}
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Legal;
