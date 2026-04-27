import { forwardRef } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
}
/** Small uppercase gold section label */
const SectionLabel = forwardRef<HTMLHeadingElement, Props>(({ children, className }, ref) => (
  <h2
    ref={ref}
    className={
      "text-[11px] uppercase tracking-[0.2em] text-primary font-body font-medium px-5 mt-5 mb-2.5" +
      (className ? ` ${className}` : "")
    }
  >
    {children}
  </h2>
));
SectionLabel.displayName = "SectionLabel";
export default SectionLabel;
