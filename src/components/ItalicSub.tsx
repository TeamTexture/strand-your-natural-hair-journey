import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/** Italic Cormorant Garamond sub-text used under titles */
const ItalicSub = ({ children }: Props) => (
  <p className="font-script italic text-[15px] leading-snug text-muted-foreground px-5 pb-4 text-center">
    {children}
  </p>
);

export default ItalicSub;
