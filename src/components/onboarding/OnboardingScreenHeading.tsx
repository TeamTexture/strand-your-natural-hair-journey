import { ReactNode } from "react";

interface Props {
  title: string;
  /** Quiet italic line under the title. */
  subtitle?: ReactNode;
}

/**
 * The top of an onboarding screen, directly under OnboardingGuide. Gives each
 * screen a real heading instead of opening straight into form fields.
 */
const OnboardingScreenHeading = ({ title, subtitle }: Props) => (
  <div className="px-5 pt-1 pb-4">
    <h1 className="font-display text-[25px] font-bold leading-[1.15] text-foreground">
      {title}
    </h1>
    {subtitle && (
      <p className="mt-2 font-body text-[12.5px] italic leading-[1.5] text-muted-foreground">
        {subtitle}
      </p>
    )}
  </div>
);

export default OnboardingScreenHeading;
