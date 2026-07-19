// Renders a brand name as a tappable link that opens the BrandProducts page
// listing every product from this brand the user has ever saved (on shelf,
// wishlist, off shelf, or otherwise). Safe to nest inside <button> rows —
// it renders as a <span role="link"> and stops event propagation on click.
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  brand?: string | null;
  className?: string;
  underline?: boolean;
};

const BrandLink = ({ brand, className, underline = true }: Props) => {
  const navigate = useNavigate();
  if (!brand || !brand.trim()) return null;

  const go = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/products/brand/${encodeURIComponent(brand.trim())}`);
  };

  return (
    <span
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
};

export default BrandLink;
