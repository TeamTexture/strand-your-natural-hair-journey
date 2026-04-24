import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Sub-text shown under titles. Now uses clear, readable body type at a larger
 * size (was italic Cormorant — replaced for legibility per design feedback).
 */
const ItalicSub = ({ children }: Props) => (
  <p className="font-body text-[15px] leading-relaxed text-foreground/75 px-5 pb-4 text-center">
    {children}
  </p>
);

export default ItalicSub;
