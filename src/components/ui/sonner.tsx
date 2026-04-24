import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      duration={2400}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !bg-alert-dark !text-alert-dark-foreground !border-primary !border !rounded-md !shadow-lg font-body text-sm",
          description: "!text-alert-dark-foreground/80",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
