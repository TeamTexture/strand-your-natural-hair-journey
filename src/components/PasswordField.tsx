import * as React from "react";
import { Eye, EyeOff, Check, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PASSWORD_RULES,
  PASSWORD_MAX_LENGTH,
  passwordStrength,
  strengthLabel,
} from "@/lib/passwordPolicy";

type Props = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  /** Live requirements checklist + strength meter. Visible from first render. */
  showRequirements?: boolean;
};

/**
 * The single password field used everywhere a password is set — signup (member,
 * professional, brand), reset-password and change-password.
 *
 * Requirements are shown before the user types anything: we never wait for a
 * failed validation to explain the rules.
 */
const PasswordField = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, label, showRequirements = true, className, id, ...rest },
    ref,
  ) => {
    const [visible, setVisible] = React.useState(false);
    const reactId = React.useId();
    const inputId = id ?? `password-${reactId}`;
    const score = passwordStrength(value);

    return (
      <div className="space-y-1.5">
        {label && (
          <Label
            htmlFor={inputId}
            className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            {label}
          </Label>
        )}

        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            onChange={onChange}
            maxLength={PASSWORD_MAX_LENGTH}
            className={cn("pr-10", className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {showRequirements && (
          <div className="pt-1 space-y-2">
            <div className="flex items-center gap-1.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-[3px] flex-1 rounded-full transition-colors duration-200",
                    i < score ? "bg-good" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <p className="text-[11px] font-body text-muted-foreground">
              {strengthLabel(value)}
            </p>

            <ul className="space-y-1" aria-label="Password requirements">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(value);
                return (
                  <li
                    key={rule.key}
                    className={cn(
                      "flex items-center gap-2 text-[12px] font-body leading-snug transition-colors duration-200",
                      met ? "text-good" : "text-muted-foreground",
                    )}
                  >
                    {met ? (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-good">
                        <Check className="size-2.5 text-good-foreground" strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle className="size-4 shrink-0" strokeWidth={1.5} />
                    )}
                    <span>{rule.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  },
);
PasswordField.displayName = "PasswordField";

export default PasswordField;
