// Renders a brand name as a tappable link that opens the BrandProducts page
// listing every product from this brand the user has ever saved (on shelf,
// wishlist, off shelf, or otherwise). Safe to nest inside <button> rows —
// it renders as a <span role="link"> and stops event propagation on click.
import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  brand?: string | null;
  className?: string;
  underline?: boolean;
};

// forwardRef: list rows and tooltip/popover wrappers hand a ref to whatever
// they render, which logged a React warning on every shelf render.
const BrandLink = forwardRef<HTMLSpanElement, Props>(
  ({ brand, className, underline = true }, ref) => {
    const navigate = useNavigate();
    if (!brand || !brand.trim()) return null;

    const go = (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/products/brand/${encodeURIComponent(brand.trim())}`);
    };

    return (
      <span
        ref={ref}
        role="link"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") go(e);
        }}
        className={cn(
          "cursor-pointer text-primary hover:opacity-80 transition-opacity",
          underline && "underline underline-offset-2 decoration-primary/40",
          className,
        )}
      >
        {brand}
      </span>
    );
  },
);

BrandLink.displayName = "BrandLink";

export default BrandLink;
