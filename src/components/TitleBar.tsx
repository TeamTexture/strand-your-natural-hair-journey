import { ReactNode, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBackButtonContext } from "@/components/BackButtonContext";

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
  const { register, unregister } = useBackButtonContext();

  // Tell the global menu that this page already has a back button so it
  // doesn't render a duplicate.
  useEffect(() => {
    if (!back) return;
    register();
    return () => unregister();
  }, [back, register, unregister]);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <div className="relative px-4 pt-2 pb-1 shrink-0">
      <div className="h-10 flex items-center">
        <div className="flex-1 flex items-center">
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
        <div className="flex-shrink-0 flex items-center justify-end text-xs text-muted-foreground font-body">
          {right}
        </div>
      </div>
      {title && (
        <h1 className="text-center font-display text-2xl font-semibold text-foreground px-2 leading-tight">
          {title}
        </h1>
      )}
    </div>
  );
};

export default TitleBar;
