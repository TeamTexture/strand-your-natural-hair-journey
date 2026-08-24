import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { UserCog, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_TYPE_LABEL,
  useRoleHistory,
  useSetAccountType,
  type AccountType,
} from "@/hooks/useAccountTypes";

const UNLOCKS: Record<string, string[]> = {
  professional: [
    "Unlocks the professional dashboard, client enquiries and client passports.",
    "Creates an unpublished directory listing so they appear in the admin professionals list straight away.",
    "They publish it themselves once their profile is complete and approved.",
  ],
  brand: [
    "Unlocks the brand portal, offer designer and campaign booking.",
    "Creates a brand account shell so they appear in the admin brands list straight away.",
  ],
  consumer: [
    "Removes professional and brand access.",
    "Any directory listing is unpublished, never deleted — it returns if you convert them back.",
    "Active client passport links they hold as a professional are revoked.",
  ],
};

export function AccountTypeBadge({ type }: { type: AccountType }) {
  const cls =
    type === "admin"
      ? "bg-foreground/10 text-foreground"
      : type === "professional"
        ? "bg-primary/20 text-primary"
        : type === "brand"
          ? "bg-good/15 text-good"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("text-[10px] font-medium px-2 py-1 rounded-full uppercase whitespace-nowrap", cls)}>
      {ACCOUNT_TYPE_LABEL[type]}
    </span>
  );
}

interface Props {
  userId: string;
  name: string | null;
  currentType: AccountType;
  isSelf?: boolean;
}

const AccountTypeControl = ({ userId, name, currentType, isSelf }: Props) => {
  const [target, setTarget] = useState<Exclude<AccountType, "admin"> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const setAccountType = useSetAccountType();
  const { data: history = [], isLoading: historyLoading } = useRoleHistory(userId, showHistory);

  const options: Exclude<AccountType, "admin">[] = ["consumer", "professional", "brand"];
  const locked = currentType === "admin" || !!isSelf;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-body font-medium">Account type</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {locked
              ? currentType === "admin"
                ? "Admin accounts cannot be converted."
                : "You cannot change your own account type."
              : "Drives every admin list, portal access and data permission."}
          </p>
        </div>
        <AccountTypeBadge type={currentType} />
      </div>

      {!locked && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {options.map((o) => (
            <Button
              key={o}
              variant={o === currentType ? "default" : "outline"}
              size="sm"
              disabled={o === currentType || setAccountType.isPending}
              className="w-full min-w-0 px-1.5 h-8 rounded-pill text-[11px] font-body whitespace-nowrap overflow-hidden"
              onClick={() => setTarget(o)}
            >
              {o === currentType && <UserCog className="size-3 mr-1 shrink-0" />}
              <span className="truncate">{ACCOUNT_TYPE_LABEL[o]}</span>
            </Button>
          ))}
        </div>
      )}


      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-body text-primary"
      >
        <History className="size-3" />
        {showHistory ? "Hide role history" : "Role history"}
      </button>

      {showHistory && (
        <div className="mt-2 space-y-1.5">
          {historyLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No changes recorded — account type has never been changed by an admin.
            </p>
          ) : (
            history.map((h) => (
              <p key={h.id} className="text-[11px] text-muted-foreground leading-snug">
                {ACCOUNT_TYPE_LABEL[(h.from_account_type ?? "consumer") as AccountType]} →{" "}
                <span className="text-foreground font-medium">
                  {ACCOUNT_TYPE_LABEL[h.to_account_type as AccountType]}
                </span>{" "}
                by {h.changed_by_name ?? "STRAND Team"} ·{" "}
                {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
              </p>
            ))
          )}
        </div>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Convert to {target ? ACCOUNT_TYPE_LABEL[target] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">{name ?? "This member"}</span> moves from{" "}
                  {ACCOUNT_TYPE_LABEL[currentType]} to {target ? ACCOUNT_TYPE_LABEL[target] : ""}.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-foreground/75">
                  {(UNLOCKS[target ?? "consumer"] ?? []).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!target) return;
                setAccountType.mutate({ userId, accountType: target });
                setTarget(null);
              }}
            >
              Change account type
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountTypeControl;
