import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * STRAND-standard toast. Dark charcoal background, white text, 1px gold border
 * at 30% alpha, 20px radius, Jost 12px, 2.4s, slides down from top centre,
 * and only one toast visible at a time.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      duration={2400}
      visibleToasts={1}
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast !bg-[#1a1a1a] !text-white !border !border-[rgba(196,154,60,0.3)] !rounded-[20px] !shadow-lg font-body !text-[12px] !px-4 !py-3",
          description: "!text-white/80 !text-[12px]",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md",
          cancelButton: "!bg-white/10 !text-white !rounded-md",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
