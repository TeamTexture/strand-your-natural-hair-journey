import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  /** Centre title text */
  title?: string;
  /** Right-side small label (e.g. "1 of 9") or node */
  right?: ReactNode;
  /** Show back arrow. Defaults true; set false on profile etc. */
  back?: boolean;
  /** Custom back behaviour */
  onBack?: () => void;
}

const TitleBar = ({ title, right, back = true, onBack }: Props) => {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };
  return (
    <div className="h-12 px-4 flex items-center justify-between gap-2 shrink-0">
      <div className="w-12 flex items-center">
        {back && (
          <button
            onClick={handleBack}
            aria-label="Back"
            className="-ml-2 p-2 text-foreground/80 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
      </div>
      <h1 className="font-display text-base text-foreground truncate">{title}</h1>
      <div className="w-12 flex items-center justify-end text-xs text-muted-foreground font-body">
        {right}
      </div>
    </div>
  );
};

export default TitleBar;
