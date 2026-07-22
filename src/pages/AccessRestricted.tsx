import { ShieldAlert, LogOut, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SUPPORT_EMAIL = "info@teamtexture.co.uk";

const AccessRestricted = () => {
  const { signOut } = useAuth();
  const nav = useNavigate();

  return (
    <div
      className="min-h-full w-full flex flex-col items-center justify-center px-6 py-10 bg-background"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 32px)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 32px)",
      }}
    >
      <div className="w-full max-w-[320px] flex flex-col items-center text-center">
        <div className="size-16 rounded-full bg-destructive/10 border border-destructive/25 flex items-center justify-center mb-6">
          <ShieldAlert className="size-8 text-destructive" />
        </div>
        <h1 className="font-display text-[26px] leading-tight text-foreground">
          Access restricted
        </h1>
        <p className="mt-3 text-sm font-body text-foreground/75 leading-relaxed">
          The STRAND team have restricted your access to the app.
        </p>
        <p className="mt-4 text-[13px] font-body text-foreground/60 leading-relaxed">
          If you believe this was a mistake, contact us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-primary font-medium underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 h-11 rounded-pill border border-border bg-card text-sm font-body font-medium text-foreground/85 hover:bg-muted/60 transition-colors"
        >
          <Mail className="size-4" /> Email support
        </a>

        <Button
          variant="ghost"
          className="mt-3 w-full h-11 rounded-pill text-sm font-body text-foreground/70 hover:text-destructive"
          onClick={async () => {
            try {
              await signOut();
              nav("/", { replace: true });
            } catch (e) {
              console.error("[sign out] failed", e);
              toast.error("Sign out failed — check your connection and try again.");
            }
          }}
        >
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
};

export default AccessRestricted;
