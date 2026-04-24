import { useRef, ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface Props extends Omit<ButtonProps, "onClick"> {
  /** Called with the picked file. */
  onPick: (file: File) => Promise<void> | void;
  /** Use device camera (mobile). */
  preferCamera?: boolean;
  /** Accept attribute. Defaults to all images. */
  accept?: string;
  children: ReactNode;
}

/**
 * Renders a styled Button that opens a hidden file input when clicked.
 * Use for "Take a Photo / Upload" CTAs that should actually upload a file
 * instead of just showing a toast.
 */
const FilePickerButton = ({
  onPick,
  preferCamera = false,
  accept = "image/*",
  children,
  ...buttonProps
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        {...(preferCamera ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onPick(f);
          e.target.value = "";
        }}
      />
      <Button
        {...buttonProps}
        onClick={() => inputRef.current?.click()}
      >
        {/* Allow long, multi-line tile labels to wrap inside the button.
         * The default Button uses whitespace-nowrap + inline-flex which
         * causes captions like "From your camera roll" to spill out of
         * narrow half-width tiles. Wrapping in a flex column with
         * whitespace-normal lets long labels break cleanly. */}
        <span className="flex flex-col items-center justify-center w-full whitespace-normal break-words leading-tight">
          {children}
        </span>
      </Button>
    </>
  );
};

export default FilePickerButton;
