import { Check, ChevronDown } from "lucide-react";
import { DIAL_COUNTRIES, phoneError, stripTrunkZero, toE164 } from "@/lib/phone";

/**
 * The ONE mobile-number input used at every entry point: registration,
 * onboarding and Profile → personal details. Country code on the left
 * (United Kingdom by default), local number on the right. A leading zero the
 * member types is kept in the box but stripped when the number is saved.
 */
export default function PhoneField({
  dial,
  local,
  onDialChange,
  onLocalChange,
  invalid,
  id = "phone",
  onEnter,
  inputRef,
}: {
  dial: string;
  local: string;
  onDialChange: (dial: string) => void;
  onLocalChange: (local: string) => void;
  invalid?: boolean;
  id?: string;
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const valid = !!toE164(dial, local);
  return (
    <div
      className={`flex items-center rounded-[10px] border bg-card ${
        invalid ? "border-destructive" : valid ? "border-good" : "border-border"
      }`}
    >
      <div className="relative shrink-0">
        <select
          aria-label="Country dialling code"
          value={dial}
          onChange={(e) => onDialChange(e.target.value)}
          className="appearance-none bg-transparent pl-3.5 pr-7 py-3 text-sm font-body text-foreground focus:outline-none min-h-[44px] max-w-[7.5rem]"
        >
          {DIAL_COUNTRIES.map((c) => (
            <option key={`${c.name}-${c.dial}`} value={c.dial}>
              +{c.dial} {c.name}
            </option>
          ))}
        </select>
        <ChevronDown className="size-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <span className="h-6 w-px bg-border shrink-0" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={local}
        maxLength={20}
        placeholder={dial === "44" ? "7700 900123" : "Local number"}
        aria-invalid={invalid || undefined}
        onChange={(e) => onLocalChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        className="w-full min-w-0 bg-transparent px-3 py-3 text-sm font-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-h-[44px]"
      />
      {valid && <Check className="size-4 text-good mr-3 shrink-0" />}
    </div>
  );
}

export { phoneError, stripTrunkZero, toE164 };
