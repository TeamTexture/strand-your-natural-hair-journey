import { Button } from "@/components/ui/button";
import HairStrandIcon from "./HairStrandIcon";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  /** The country the member declared on the personal-details page. */
  country: string | null;
}

/**
 * Blocking splash for accounts that declared a country outside the UK. No form
 * — the personal-details page already gave us her name, mobile, email and
 * country, and she's been added to the international waitlist. Final for now:
 * the stored flag means she sees this on every future login too.
 */
const InternationalBlockedSplash = ({ country }: Props) => {
  const { signOut } = useAuth();
  const where = country && country.length > 2 ? country : "your country";

  return (
    <div className="flex flex-col h-full px-7 pb-10 bg-background overflow-y-auto">
      <div className="flex flex-col items-center flex-1 justify-center text-center gap-7 pt-10">
        <HairStrandIcon className="h-14 w-auto text-primary" />

        <div>
          <h1 className="font-display text-primary text-5xl font-semibold tracking-strand uppercase whitespace-nowrap ml-[0.2em]">
            Strand
          </h1>
          <p className="mt-5 font-display italic text-foreground text-xl">
            We're not in {where} yet
          </p>
        </div>

        <p className="max-w-[280px] text-sm leading-relaxed text-foreground/75">
          STRAND is open to members in the United Kingdom for now. The guidance leans on
          the products on the shelves near you, the professionals you can actually sit
          with, and the water coming out of your tap — so we won't open a country until
          all three are right.
        </p>

        <div className="w-full rounded-2xl border border-primary/50 bg-primary/5 px-5 py-6 space-y-2">
          <p className="font-display text-foreground text-lg">You're on the list</p>
          <p className="text-sm text-foreground/75 leading-relaxed">
            Your account is safe and your place is held. We'll email you the moment
            STRAND launches in {where}.
          </p>
        </div>

        <p className="text-xs text-muted-foreground max-w-[270px] leading-relaxed">
          Told us the wrong country by mistake? Email{" "}
          <a
            href="mailto:support@teamtexture.co.uk"
            className="underline underline-offset-4 text-foreground/80"
          >
            support@teamtexture.co.uk
          </a>{" "}
          and we'll take a look.
        </p>

        <Button variant="outline" size="pill" onClick={() => signOut()} className="whitespace-nowrap">
          Sign out
        </Button>
      </div>
    </div>
  );
};

export default InternationalBlockedSplash;
