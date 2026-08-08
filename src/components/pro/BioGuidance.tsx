/** Shared guidance + character cap for professional bios. */
export const BIO_MAX_CHARS = 500;
export const BIO_MIN_CHARS = 40;

interface BioGuidanceProps {
  /** Current bio text, for the live counter. */
  value: string;
  /** Show the "you can add more once accepted" reassurance (application flow only). */
  applicationStage?: boolean;
}

export function BioCounter({ value }: { value: string }) {
  const used = value.trim().length;
  const over = used > BIO_MAX_CHARS;
  return (
    <p
      className={`text-[11px] font-body text-right ${
        over ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {used}/{BIO_MAX_CHARS} characters
    </p>
  );
}

/** Best-practice notes shown beneath the bio field. */
export default function BioGuidance({ value, applicationStage }: BioGuidanceProps) {
  return (
    <div className="space-y-2">
      <BioCounter value={value} />
      <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5">
        <p className="text-[11px] font-body font-medium text-foreground">
          Writing a description members actually read
        </p>
        <ul className="text-[11px] font-body text-muted-foreground leading-snug space-y-1 list-disc pl-4">
          <li>Aim for three or four short sentences — around 60 to 80 words.</li>
          <li>
            Open with where you are and what you focus on (e.g. "a London-based
            Afro hair care salon focused on scalp health").
          </li>
          <li>Say who you love working with and what a first visit looks like.</li>
          <li>
            Keep it in your own voice. Skip long lists of certificates, course
            names, dates and press credits — those belong in your specialisms
            and credentials, not your description.
          </li>
          <li>Avoid ALL CAPS, abbreviations and acronyms members won't know.</li>
        </ul>
      </div>
      {applicationStage && (
        <p className="text-[11px] font-body text-muted-foreground leading-snug">
          Keep this short for now. Once your application is accepted you can add
          much more detail — credentials, training, awards and press — to your
          full directory listing.
        </p>
      )}
    </div>
  );
}
