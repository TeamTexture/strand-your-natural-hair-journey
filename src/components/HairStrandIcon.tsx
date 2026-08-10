import { forwardRef } from "react";

interface Props {
  className?: string;
}

/**
 * STRAND mark — vertical figure-eight, one continuous stroke.
 * Geometry matches the master logo artwork: mirror-symmetric, crossing at 50%
 * height, loops widest at 20% / 80%. Stroke is a presentation attribute so the
 * mark still renders correctly if no stylesheet loads. Aspect ratio is 106:300.
 */
const HairStrandIcon = forwardRef<SVGSVGElement, Props>(({ className }, ref) => (
  <svg
    ref={ref}
    viewBox="-3 -3 106 300"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M50 147 C-11.07 102.2 -11.07 4.15 50 4.15 C111.07 4.15 111.07 102.2 50 147 C-11.07 191.8 -11.07 289.85 50 289.85 C111.07 289.85 111.07 191.8 50 147"
      stroke="currentColor"
      strokeWidth="8.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
));

HairStrandIcon.displayName = "HairStrandIcon";

export default HairStrandIcon;
