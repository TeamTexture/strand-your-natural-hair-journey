import { ShieldAlert, AlertCircle } from "lucide-react";
import type { MappedPasswordError } from "@/lib/passwordPolicy";

/**
 * Distinct rendering for password failures. A breached password looks nothing
 * like a weak one, because the reason it was rejected is completely different.
 */
const PasswordErrorNotice = ({ error }: { error: MappedPasswordError | null }) => {
  if (!error) return null;

  if (error.kind === "leaked_password") {
    return (
      <div className="flex gap-2.5 rounded-[14px] border border-destructive/40 bg-destructive/10 p-3">
        <ShieldAlert className="size-4 shrink-0 text-destructive mt-[1px]" />
        <p className="text-[12px] font-body leading-snug text-destructive">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-start">
      <AlertCircle className="size-3.5 shrink-0 text-destructive mt-[2px]" />
      <p className="text-[12px] font-body text-destructive leading-snug">{error.message}</p>
    </div>
  );
};

export default PasswordErrorNotice;
