import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * STRAND-standard toast. Dark charcoal background, white text, 1px gold border
 * at 30% alpha, 20px radius, Jost 12px, 2.4s, slides down from top centre,
 * and only one toast visible at a time.
 *
 * On touch devices a tap can leave the toast in a "hovered" state, which pauses
 * Sonner's auto-dismiss timer forever — the toast then sits over the UI and
 * looks like a frozen screen. Two safeguards prevent that: a tap anywhere
 * clears any visible toast, and a watchdog clears everything shortly after the
 * page becomes visible again.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  useEffect(() => {
    const clear = () => toast.dismiss();
    const onVisible = () => {
      if (document.visibilityState === "visible") window.setTimeout(clear, 2600);
    };
    document.addEventListener("pointerdown", clear);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("pointerdown", clear);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return (
    <Sonner
      position="top-center"
      duration={2400}
      visibleToasts={1}
      closeButton
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast !bg-[#1a1a1a] !text-white !border !border-[rgba(196,154,60,0.3)] !rounded-[20px] !shadow-lg font-body !text-[12px] !px-4 !py-3",
          description: "!text-white/80 !text-[12px]",
          closeButton: "!bg-[#1a1a1a] !text-white !border-[rgba(196,154,60,0.3)]",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md",
          cancelButton: "!bg-white/10 !text-white !rounded-md",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
