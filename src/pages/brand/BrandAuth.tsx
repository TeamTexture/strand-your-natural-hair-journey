import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import PasswordField from "@/components/PasswordField";
import PasswordErrorNotice from "@/components/PasswordErrorNotice";
import { mapPasswordError, passwordProblem, type MappedPasswordError } from "@/lib/passwordPolicy";
import { toast } from "sonner";
import { BRAND_CATEGORIES, type BrandCategory } from "@/lib/brandCategories";
import { getBrandEntryPath, BRAND_ACCESS_PATH } from "@/lib/consumerOnboarding";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Dedicated brand auth surface. Signup collects brand_name + contact +
 * website up front, creates a brand_profiles row, and grants the 'brand'
 * role via edge function on first sign-in.
 */
const BrandAuth = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brandName, setBrandName] = useState("");
  const [contactName, setContactName] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [category, setCategory] = useState<BrandCategory | "">("");
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<MappedPasswordError | null>(null);

  // An already-signed-in brand landing here goes to their correct entry point:
  // the £99/year access page until Brand Access is active, then the dashboard.
  // Never fires mid-signup — submit() owns the routing while busy.
  useEffect(() => {
    if (authLoading || !user || busy) return;
    let cancelled = false;
    (async () => {
      const readRoles = async () => {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        return (data ?? []).map((r) => r.role as string);
      };
      let roles = await readRoles();

      // Signups that required email confirmation had no session at signup, so
      // the brand role/profile was never provisioned. Do it now, on the first
      // authenticated visit, using the brand fields carried in user metadata —
      // without it the role gate on /brand/subscribe sends them to the
      // consumer side.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      if (!roles.includes("brand") && meta.brand_intent && typeof meta.brand_name === "string") {
        const { error } = await supabase.functions.invoke("brand-signup", {
          body: {
            brand_name: meta.brand_name,
            contact_name: meta.contact_name ?? null,
            website: meta.website ?? null,
            category: meta.category ?? null,
            about: meta.about ?? null,
            instagram_handle: meta.instagram_handle ?? null,
            tiktok_handle: meta.tiktok_handle ?? null,
            contact_email: meta.contact_email ?? null,
          },
        });
        if (!error) {
          await qc.invalidateQueries({ queryKey: ["user-roles"] });
          roles = await readRoles();
        }
      }

      const path = await getBrandEntryPath(user.id, roles);
      if (!cancelled) nav(path, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, busy, nav, qc]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email) return toast.error("Enter your email address.");
    if (mode === "signup") {
      const problem = passwordProblem(password);
      if (problem) {
        setPwError({ kind: "weak_password", message: problem });
        return;
      }
      if (password !== confirm) {
        setPwError({ kind: "generic", message: "Passwords don't match." });
        return;
      }
      if (!brandName.trim()) return toast.error("Please enter your brand name.");
      if (!category) return toast.error("Please choose a brand category.");
      if (about.trim().length < 30) return toast.error("Please add a short brand description (30+ characters).");
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Land back on the brand auth surface, which routes on to the
            // £99/year access page (or the dashboard once it's active).
            emailRedirectTo: `${window.location.origin}/brand/auth?mode=signin`,
            data: {
              display_name: contactName || brandName,
              brand_intent: true,
              brand_name: brandName.trim(),
              contact_name: contactName.trim() || null,
              website: website.trim() || null,
              category: category || null,
              about: about.trim() || null,
              instagram_handle: instagram.trim().replace(/^@/, "") || null,
              tiktok_handle: tiktok.trim().replace(/^@/, "") || null,
              contact_email: contactEmail.trim() || null,
            },
          },
        });
        if (error) throw error;
        // Session may or may not exist depending on email-confirmation
        // settings. If it does, immediately provision the brand role +
        // profile via the edge function (uses service role — bypasses RLS).
        if (data.session) {
          const { error: fnErr } = await supabase.functions.invoke("brand-signup", {
            body: {
              brand_name: brandName.trim(),
              contact_name: contactName.trim() || null,
              website: website.trim() || null,
              category: category || null,
              about: about.trim() || null,
              instagram_handle: instagram.trim().replace(/^@/, "") || null,
              tiktok_handle: tiktok.trim().replace(/^@/, "") || null,
              contact_email: contactEmail.trim() || null,
            },
          });
          if (fnErr) throw fnErr;
        }
        // The brand role was just granted — drop any role snapshot cached
        // before it existed, or the role gate on /brand/subscribe bounces
        // this account onto the consumer side.
        await qc.invalidateQueries({ queryKey: ["user-roles"] });
        toast.success("Brand account created");
        // Brands pay the annual access fee BEFORE landing in the dashboard.
        nav(BRAND_ACCESS_PATH, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["user-roles"] });
        const signedIn = data.user;
        if (signedIn) {
          const { data: roleRows } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", signedIn.id);
          const roles = (roleRows ?? []).map((r) => r.role as string);
          nav(await getBrandEntryPath(signedIn.id, roles), { replace: true });
        } else {
          nav("/brand", { replace: true });
        }
      }
    } catch (err) {
      const mapped = mapPasswordError(err, password);
      if (mode === "signup" && mapped.kind !== "generic") {
        setPwError(mapped);
      } else {
        toast.error(mapped.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-7 pb-8 bg-background overflow-y-auto">
      <div className="flex flex-col items-center text-center pt-6 gap-3">
        <HairStrandIcon className="h-12 w-auto text-primary" />
        <h1 className="font-display text-primary text-4xl font-semibold tracking-strand uppercase">Strand</h1>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">For Brands</p>
        <p className="max-w-[280px] text-foreground/75 text-sm leading-relaxed">
          Reach thousands of women invested in their natural hair journey. Place your offers directly in-app.
        </p>
      </div>

      <form onSubmit={submit} className="w-full flex flex-col gap-3 mt-6 selectable">
        {mode === "signup" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Brand name *</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Hello Klean" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Brand category *</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BrandCategory)}
                required
                className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
              >
                <option value="">Choose a category…</option>
                {BRAND_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">About your brand *</Label>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                required
                minLength={30}
                rows={4}
                placeholder="What you make, who you make it for, and what makes it worth a place in a natural hair routine."
                className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60 font-body"
              />
              <p className="text-[10.5px] text-muted-foreground font-body">
                Shown on your public brand page. {about.trim().length}/30 min.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Website</Label>
              <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Instagram</Label>
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="handle" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">TikTok</Label>
                <Input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="handle" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Public contact email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@yourbrand.com" />
              <p className="text-[11px] font-body text-muted-foreground leading-snug">
                Shown on your brand profile so STRAND members can contact you directly.
              </p>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Internal email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode === "signup" && (
            <p className="text-[11px] font-body text-muted-foreground leading-snug">
              Your login, and how the STRAND admin team reaches you. Never shown to members.
            </p>
          )}
        </div>

        {mode === "signup" ? (
          <PasswordField
            label="Password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setPwError(null);
            }}
            placeholder="Choose a password"
          />
        ) : (
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Password</Label>
            <PasswordInput value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Confirm password</Label>
            <PasswordInput value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        )}
        <PasswordErrorNotice error={pwError} />

        <Button variant="gold" size="pill" type="submit" className="mt-2">
          {busy ? "Please wait…" : mode === "signup" ? "Create brand account" : "Sign in"}
        </Button>
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => nav("/brand/forgot-password")}
            className="text-center text-xs text-primary font-semibold hover:underline"
          >
            Forgot password?
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Already have a brand account? Sign in" : "New brand? Create an account"}
        </button>
        <button type="button" onClick={() => nav("/")} className="text-center text-[11px] text-muted-foreground/70 hover:text-foreground">
          ← Back to STRAND
        </button>
      </form>
    </div>
  );
};

export default BrandAuth;
