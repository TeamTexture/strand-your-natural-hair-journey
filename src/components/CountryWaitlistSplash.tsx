import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HairStrandIcon from "./HairStrandIcon";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES } from "@/data/countries";
import { setUkOverride } from "@/lib/geoGate";
import { toast } from "sonner";

interface Props {
  /** Whatever the IP lookup reported — stored for audit, may be null. */
  detectedCountry: string | null;
  /** Visitor insists they're in the UK — let them through to the normal entry. */
  onOverride: () => void;
}

const labelClass = "text-[11px] uppercase tracking-[0.18em] text-muted-foreground";

const CountryWaitlistSplash = ({ detectedCountry, onOverride }: Props) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !country.trim()) {
      toast.error("Please add your name, email and country.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("country_waitlist").insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        country: country.trim(),
        ip_detected_country: detectedCountry,
      });
      if (error) throw error;
      setDone(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-7 pb-8 bg-background overflow-y-auto">
      <div className="flex flex-col items-center flex-1 justify-center pt-10 gap-8">
        <div className="flex flex-col items-center text-center">
          <HairStrandIcon className="h-14 w-auto text-primary mb-5" />
          <h1 className="font-display text-primary text-5xl font-semibold tracking-strand uppercase">
            Strand
          </h1>
          <p className="mt-5 font-display italic text-foreground text-lg">
            We're not in your country yet
          </p>
          <p className="mt-3 max-w-[270px] text-sm leading-relaxed text-foreground/75">
            STRAND is open to members in the United Kingdom for now. We're building
            carefully — the products, the professionals and the water in your area all
            shape the guidance, and we won't launch anywhere until that's right.
          </p>
        </div>

        {done ? (
          <div className="w-full rounded-2xl border border-primary/50 bg-primary/5 px-5 py-6 text-center space-y-2">
            <p className="font-display text-foreground text-lg">You're on the list</p>
            <p className="text-sm text-foreground/75 leading-relaxed">
              We'll let you know the moment STRAND launches where you are.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full flex flex-col gap-3 selectable">
            <p className={`${labelClass} text-center`}>Join the waitlist</p>

            <div className="space-y-1.5">
              <Label htmlFor="wl-name" className={labelClass}>Name</Label>
              <Input
                id="wl-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wl-email" className={labelClass}>Email</Label>
              <Input
                id="wl-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wl-country" className={labelClass}>Country</Label>
              <select
                id="wl-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select your country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Button variant="gold" size="pill" type="submit" disabled={saving} className="whitespace-nowrap">
              {saving ? "Please wait…" : "Keep me posted"}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setUkOverride();
            onOverride();
          }}
          className="text-xs text-muted-foreground hover:text-foreground text-center underline underline-offset-4"
        >
          I'm in the UK — take me to sign in
        </button>
      </div>
    </div>
  );
};

export default CountryWaitlistSplash;
