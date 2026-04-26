# Phase 1 Plan — Data Foundation

**Date:** 2026-04-26
**Scope:** Move six clinical data domains out of `localStorage` into Postgres with RLS and selective application-layer encryption. Add a one-time migration that flushes existing beta-tester localStorage on first authed render. **No AI work in this phase.**

**Non-goals:**
- No edits to any `supabase/functions/*` AI handler. Their `context` payload contract stays identical.
- No move to Anthropic. Lovable Gateway + Gemini stays unchanged.
- No refactor of `ProductDetailNew` vs `ProductProfile`, no `_shared/` persona module — those are Phase 2.
- No deletion of unrelated localStorage keys. `strand_walkthrough_complete`, `strand_onboarding_step`, `strand_blood_summary_fp`, `strand_last_wash_date`, `strand_wash_step` stay where they are — they are UI state, not clinical data.

---

## 1. Schema — proposed tables

### Decision: separate tables, typed columns + `text[]` for tag clusters. Not JSONB-on-`profiles`.

You proposed `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_professionals`. **I agree, with one twist.** Here's why I am NOT recommending one big JSONB blob on `profiles`:

1. **Different update cadences.** Style changes weekly; hair characteristics change rarely; chosen professional changes ~yearly; identity (name/avatar/heritage) changes almost never. One row per domain means `PATCH user_style_profile` doesn't pull or rewrite hair data.
2. **Typed columns work for the 80% of fields that are controlled vocab** (porosity = "Low / High", density = "Low / Medium / High", scalp = enum). JSONB hides type errors that don't show up until an AI prompt mishandles the shape.
3. **Tag-array fields** (e.g., `diagnosed_conditions`, `areas_of_concern`, `chemical_history`) are real arrays, not free-form objects — Postgres `text[]` is the right primitive (GIN-indexable later if we want "find me users with traction alopecia"; trivial to expand the controlled vocab without a migration).
4. **JSONB only where the shape is genuinely free-form** — there isn't really anywhere in this domain that fits, so I'm not using JSONB.

### Twist: heritage / age / postcode go on `profiles`, NOT on `user_health_profile`

You asked me to decide. I recommend `profiles` because:
- These are **identity / location** data, not clinical state. They sit alongside `display_name` and `avatar_url`, which are already on `profiles`.
- They are captured in step 1 of onboarding before any health questions.
- They are referenced by code that has nothing to do with health (water-hardness lookup uses postcode; AI personalisation uses heritage; alerts use both).
- Putting them on `user_health_profile` would force a join/extra fetch in places that only need identity.

**One small recommendation: store `birth_year int` instead of `age int`**, with a v1 migration that derives it as `EXTRACT(year FROM now()) - age`. Reason: `age` goes stale automatically (a user who entered 32 in 2026 is 33 in 2027, the DB still says 32). `birth_year` is durable. Tradeoff: requires recomputing age on every read (`current_year - birth_year`). I think it's worth it for a clinical product where age drives advice. Easy to swap if you'd rather keep parity with the current form — flag this and I'll adjust before writing the migration.

### Tables to add

```sql
-- New columns on existing profiles table
alter table public.profiles
  add column heritage      text[]   not null default '{}',
  add column birth_year    smallint,
  add column postcode      text,
  add column country       text     not null default 'United Kingdom';
```

#### `user_hair_profile` — one row per user
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid, FK auth.users, **unique** | enables `upsert(onConflict:"user_id")` |
| `diameter` | text | enum-like: Fine/Medium/Coarse/Mixed |
| `surface_texture` | text | Rough/Medium/Silky |
| `density` | text | Low/Medium/High |
| `porosity` | text | Low/High |
| `elasticity` | text | Strong/Weak |
| `scalp_condition_enc` | bytea | **encrypted** — see §2 |
| `diagnosed_conditions_enc` | bytea | **encrypted** — array of strings, AEAD-sealed |
| `areas_of_concern` | text[] | not encrypted |
| `created_at`, `updated_at` | timestamptz | |

#### `user_health_profile` — one row per user
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid, FK auth.users, **unique** | |
| `life_stage_enc` | bytea | **encrypted** — Pregnant / Postpartum / Perimenopause / Menopause / None |
| `contraception_enc` | bytea | **encrypted** — array (HRT, IUD hormonal, etc.) |
| `medical_conditions_enc` | bytea | **encrypted** — Thyroid, PCOS, Anaemia, Lupus, etc. |
| `diet` | text | omnivore / vegetarian / vegan / pescatarian — not GDPR Art.9 sensitive |
| `diet_balance` | text | very_varied / fairly_balanced / limited |
| `smoke` | text | no / occasionally / regularly / ex |
| `alcohol` | text | none / light / moderate / heavy |
| `daily_water` | text | under_1l / 1_2l / 2_plus_l |
| `exercise` | text | rarely / 1_3 / 4_5 / daily |
| `sleep_quality` | text | poor / average / good |
| `created_at`, `updated_at` | timestamptz | |

Medications continue to live in `user_medications` (table already exists) — but we **add an encrypted column** `name_enc bytea` and stop using the plaintext `name` column going forward (kept around for one release for back-compat reads, then dropped in Phase 1.5). See §2.

#### `user_style_profile` — one row per user
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid, FK auth.users, **unique** | |
| `current_colour_status` | text | Natural / Permanently dyed / Bleached / Demi / Semi / Henna |
| `chemical_history` | text[] | Relaxer current/past, Texturiser, etc. — all positions visible to AI today |
| `current_hairstyle` | text | |
| `style_set_at` | timestamptz | derived from "How long in this style" |
| `planned_next_style` | text | |
| `planned_change_date` | date | nullable |
| `default_styles` | text[] | usual rotation |
| `created_at`, `updated_at` | timestamptz | |

#### `user_professionals` — one row per user (chosen pro)
Distinct from `professionals_directory` (the public directory).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid, FK auth.users, **unique** | |
| `directory_id` | uuid, nullable, FK professionals_directory | set when user picked from directory |
| `name` | text | plaintext — appears in PDF/UI |
| `professional_type` | text | Trichologist / Dermatologist / Curl Specialist / GP |
| `clinic` | text | plaintext |
| `consultation_date` | date | drives 90-day freshness + 170-day rebook alert |
| `gmc_number_enc` | bytea | **encrypted** |
| `iot_number_enc` | bytea | **encrypted** |
| `notes_enc` | bytea | **encrypted** — consultation notes |
| `notes_audio_path` | text | already opaque (storage object key); not encrypted |
| `instagram_handle` | text | |
| `website_url` | text | |
| `booking_url` | text | |
| `picked_from_directory` | boolean | |
| `created_at`, `updated_at` | timestamptz | |

### Why NOT one giant `user_clinical_data` table with a `kind` discriminator
Considered it. Rejected because:
- RLS policies would still be the same single `auth.uid() = user_id` shape — no policy reuse benefit.
- Every write becomes an upsert with a composite key + JSONB blob — loses typed columns.
- Indexing becomes weird (e.g., `WHERE kind='style' AND payload->>'current_hairstyle' = 'Locs'`).
- Hard to evolve a single domain without versioning the JSONB schema.

The only place where I'd consider JSONB is if the hair/health/style schemas turn out to evolve every month. They haven't in the existing UI; they look stable.

---

## 2. Encryption — what, why, and where I push back

### Threat model first
The realistic threats this protects against, in priority order:
1. **Casual database read** — Lovable/Supabase dashboard user, leaked SQL backup, leaked read-replica creds, future support engineer. App-layer AEAD makes the row useless without the master key. ✅ big win.
2. **Compromised service-role key with no edge function access** — same as above. ✅ win.
3. **App-layer XSS** — attacker can call decrypt edge function with the user's JWT, but they can call any API the user can call. Encryption doesn't help here; **CSP and input sanitisation do**. ⚠️ no marginal benefit.
4. **Edge function compromise** — attacker has both `LOVABLE_API_KEY` and the encryption master key. ❌ encryption doesn't help.

The localStorage problem (the audit's #2 finding) is solved **just by moving to Postgres + RLS**, regardless of encryption. Encryption is defense-in-depth on top of that.

### Where I disagree with your instinct
You proposed:
- ✅ Encrypt blood result **numerical values**
- ✅ Encrypt medication names + dosages
- ✅ Encrypt diagnosed conditions
- ✅ Encrypt scalp conditions
- ✅ Encrypt chosen pro's GMC/IOT + consultation notes
- Plain Postgres-at-rest for everything else

Three pushbacks:

**(a) On blood results: encrypting `value` only is half-protection.**
"Marker = ferritin, status = low" is already clinically meaningful in plaintext. If the threat model is dashboard-read leak, leaving `status` as plaintext leaks the diagnosis. But — `status` is what drives Home alerts ("Ferritin retest due") and the ingredient-analysis prompt context. Hiding it costs us a decrypt round-trip on every alert refresh.
**Recommendation:** encrypt `value` + `unit`. Keep `marker`, `status`, `category` plaintext, and accept that "user has 12 markers, 3 are low" is recoverable from a dashboard read. If you want stricter, we encrypt `status` too and pay the latency. **I want your call here.**

**(b) Add to your encryption list: life stage, contraception, medications-category, medication-dosage.**
Pregnancy / perimenopause / hormonal contraception are GDPR Article 9 special-category personal data — same legal tier as diagnosed conditions. They're in `user_health_profile` regardless. If we encrypt diagnosed conditions, we should encrypt these.

**(c) Don't encrypt scalp condition AND density/porosity/elasticity.**
You called out scalp specifically. I agree on scalp — "Sensitive scalp" is reasonably revealing. But density / porosity / elasticity / surface texture are observational; they're closer to a hairdresser's notes than to clinical data. Encrypting them costs latency and hides AI context unnecessarily. Same call applies to "areas of concern" — leaving these plaintext.

### Final encryption list (proposed)

| Table.column | Plaintext or encrypted? |
|---|---|
| `profiles.heritage` | Plaintext |
| `profiles.birth_year`, `age` | Plaintext |
| `profiles.postcode`, `country` | Plaintext |
| `user_hair_profile.diameter / surface_texture / density / porosity / elasticity / areas_of_concern` | Plaintext |
| `user_hair_profile.scalp_condition` | **Encrypted** |
| `user_hair_profile.diagnosed_conditions` | **Encrypted** |
| `user_health_profile.life_stage` | **Encrypted** |
| `user_health_profile.contraception` | **Encrypted** |
| `user_health_profile.medical_conditions` | **Encrypted** |
| `user_health_profile.diet / smoke / alcohol / water / exercise / sleep` | Plaintext |
| `user_medications.name`, `.category` (rename to `name_enc`) | **Encrypted** |
| `user_style_profile.*` | Plaintext (no clinical content) |
| `user_professionals.gmc_number / iot_number / notes` | **Encrypted** |
| `user_professionals.name / clinic / consultation_date / urls` | Plaintext (`name`+`clinic` appear in UI cards and the directory pick can already match on these in plaintext) |
| `blood_results.value`, `unit` | **Encrypted** |
| `blood_results.marker / status / category` | Plaintext (drives Home alerts; encrypting forces every alert to round-trip the decrypt edge fn) |

### Cryptography
- **Primitive:** libsodium AEAD via `crypto_secretbox_easy` (XSalsa20-Poly1305). Available in Deno runtime via `https://esm.sh/libsodium-wrappers@0.7.13` (or `https://esm.sh/tweetnacl@1.0.3` — same primitive, smaller surface).
- **Key:** single shared master key, 32 bytes (base64-encoded as a 44-character string), stored in **Lovable Cloud Secrets** under name `STRAND_CLINICAL_MASTER_KEY`. Edge functions read it via `Deno.env.get("STRAND_CLINICAL_MASTER_KEY")` and base64-decode to the raw 32 bytes. Never returned to the client. **Lovable Cloud has no Supabase Vault — Secrets is the equivalent surface.** See §A.1 for the one-time manual setup.
- **Per-row uniqueness:** each encrypted column stores `nonce(24) || ciphertext` as a single bytea. The nonce is generated fresh per write (`crypto.getRandomValues` in Deno).
- **No per-user DEK in v1.** Per-user keys are nicer (key rotation per user, "right to be forgotten" by destroying the DEK), but introduce key-management complexity and a bootstrap problem on auth. We can layer them on later without changing the row format — just change what `master_key_for(user_id)` returns inside the edge functions.

### Three new edge functions
- `data-encrypt-batch` — JWT-gated. Input: `{ items: Array<{ id: string, plaintext: string }> }`. Output: same shape with bytea ciphertext (base64 over the wire). Used by the localStorage migration hook and any future write path that needs encryption.
- `data-decrypt-context` — JWT-gated. Reads all encrypted columns for `auth.uid()` across the five tables, decrypts in one pass, returns a payload `aiContext.ts` merges with its plaintext fetches. (See §5.)
- `phase1-backfill-existing-rows` — **admin-only one-shot, deleted in Phase 1.5.** Service-role-keyed. Iterates every row in `blood_results` and `user_medications` where the corresponding `_enc` column is null, encrypts the existing plaintext value, writes it back. Used once after the schema migrations land to encrypt the production data that exists today (14 `blood_results` rows + any `user_medications`) — see §4 and §7.

### Why edge functions and not Postgres-side encryption?
- Lovable Cloud doesn't expose pgsodium or pgcrypto's AEAD primitives in user-runnable SQL.
- Lovable Cloud's table browser cannot see Secrets at all, so the key stays out of any database-readable view.
- Lets us swap libsodium for any other AEAD later without a SQL migration.

---

## 3. RLS policies

Standard pattern for every new table. Identical shape to `user_medications` / `blood_results` already in the migrations.

```sql
alter table public.user_hair_profile enable row level security;
create policy "Users view own hair profile" on public.user_hair_profile
  for select using (auth.uid() = user_id);
create policy "Users insert own hair profile" on public.user_hair_profile
  for insert with check (auth.uid() = user_id);
create policy "Users update own hair profile" on public.user_hair_profile
  for update using (auth.uid() = user_id);
create policy "Users delete own hair profile" on public.user_hair_profile
  for delete using (auth.uid() = user_id);
```

…and the same four policies on `user_health_profile`, `user_style_profile`, `user_professionals`. `profiles` already has the policies; the new columns are governed by them automatically.

`updated_at` triggers on each new table, reusing the existing `public.update_updated_at_column()` function from migration `20260424141005`.

No `WITH CHECK` clauses beyond the ownership check — we already constrain shape via column types.

---

## 4. Migration strategy from localStorage

### The hook: `useLocalStorageMigration`

Lives at `src/hooks/useLocalStorageMigration.ts`. Mounted **once** inside `<RequireAuth>` (after `user` is non-null and `loading` is false) so every authed render triggers a check. The hook itself is a no-op on subsequent renders.

```ts
// pseudo-shape
const STRAND_MIGRATION_VERSION = "v1";
const FLAG_KEY = `strand_migration_${STRAND_MIGRATION_VERSION}_done`;

useEffect(() => {
  if (!user) return;
  if (localStorage.getItem(FLAG_KEY)) return;
  let cancelled = false;
  void (async () => {
    try {
      const result = await runMigrationV1(user.id);
      if (cancelled) return;
      if (result.ok) localStorage.setItem(FLAG_KEY, new Date().toISOString());
    } catch (e) {
      // log to console; don't toast (silent migration). Try again next session.
      console.error("LocalStorage migration v1 failed", e);
    }
  })();
  return () => { cancelled = true; };
}, [user]);
```

### What `runMigrationV1` does, per domain

For each of the six domains:
1. **Read** the `strand_*` key(s) from localStorage. If absent or unparseable → skip this domain.
2. **Check the DB** for an existing row (`select count(*) from <table> where user_id = $uid`). If the row already exists → skip and consider it done. (This handles the "user re-onboarded on device A after we shipped, then opens device B with stale localStorage" case — we don't overwrite remote.)
3. **For domains with encrypted columns:** call `data-encrypt-batch` once with all plaintext fields. Receive bytea-as-base64. Insert/upsert into the table.
4. **For domains without encryption:** plain upsert.

Domain map:

| localStorage key | Target | Encrypted columns? |
|---|---|---|
| `strand_profile_basic` (name unused — already in profiles), `strand_heritage` | `profiles` (UPDATE) | None |
| `strand_health_profile` | `user_health_profile` | life_stage, contraception, medical_conditions |
| `strand_health_profile.medications` (legacy fallback) | already migrated; skip | n/a |
| `strand_hair_profile` | `user_hair_profile` | scalp, diagnosed_conditions |
| `strand_current_style` | `user_style_profile` | None |
| `strand_professional` | `user_professionals` | gmc, iot, notes |

`strand_blood_values` is already flushed to `blood_results` by `useBloodValues.persistBloodValues()` — but currently in plaintext. The migration hook does NOT re-encrypt those rows; that's handled in bulk by the admin backfill function — see "Existing production data" below.

### Existing production data — what gets encrypted at deploy time

The database already has production data from the founder's account and a small number of beta testers. As of 2026-04-26 the row counts are:

| Table | Rows | Affected by this PR? |
|---|---|---|
| `blood_results` | 14 | **Yes** — every row gets `value_enc` + `unit_enc` populated; existing `value` + `unit` left in place until Phase 1.5. |
| `profiles` | 6 | **Yes** — new columns (`heritage`, `birth_year`, `postcode`, `country`) added with safe defaults; populated per-user by the migration hook on each user's next authed render. |
| `user_products` | 4 | No — outside Phase 1 scope. |
| `user_medications` | unknown | **Yes if non-zero** — every row gets `name_enc` + `category_enc` populated; existing `name` + `category` left in place until Phase 1.5. |
| `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_professionals` | 0 (new tables) | n/a — populated entirely by the migration hook from each user's localStorage. |

**Encryption backfill of existing rows happens via the one-shot admin edge function `phase1-backfill-existing-rows`** (introduced in §2, detailed in §7). The sequence:

1. Schema migrations land (the three SQL files in §6 add the new tables, columns, and `_enc` columns).
2. You confirm the master key is in Lovable Cloud Secrets per §A.1.
3. You invoke `phase1-backfill-existing-rows` once from the Lovable Cloud Edge Functions panel. The function:
   - Selects all `blood_results` rows where `value_enc IS NULL` (will be all 14).
   - For each row, encrypts the existing plaintext `value` + `unit` using the master key, writes `value_enc` + `unit_enc`, leaves the plaintext columns in place.
   - Repeats for `user_medications` if any rows exist.
   - Returns a JSON summary: `{ blood_results: { encrypted: 14, skipped: 0, errors: 0 }, user_medications: { encrypted: N, skipped: 0, errors: 0 } }`.
   - **Idempotent:** re-running it after success encrypts 0 / skips 14 (rows where `_enc IS NOT NULL` are skipped).
4. Per-user data (the `user_*_profile` and `user_professionals` tables) is populated by `useLocalStorageMigration` on each user's next session — that part is per-user, not bulk. The 6 existing profiles rows pick up `heritage` / `birth_year` / `postcode` / `country` the same way.

If `phase1-backfill-existing-rows` returns non-zero `errors`, **do not flip the AI context to read from `_enc` columns**. Re-run after fixing whatever the error block says, or surface it for me to debug.

**Why a separate admin function and not a SQL migration?** Lovable Cloud's Postgres doesn't have AEAD primitives matching libsodium's `crypto_secretbox_easy`. Doing the encryption in a service-role-keyed edge function means we use the same code path future writes will use — same primitive, same key handling, no risk of incompatible ciphertext between rows written by SQL and rows written by JS.

### Idempotency

- ✅ Re-running the upsert with same data → same row state.
- ✅ The "skip if DB row exists" check prevents overwriting remote.
- ✅ The `FLAG_KEY` short-circuits all subsequent renders.
- ✅ Partial failure (encrypt fn returns 5xx for one domain): we don't set `FLAG_KEY`, we don't delete localStorage, next session retries. Other domains that succeeded will be skipped on retry by the "row exists" check.
- ✅ The admin backfill function is idempotent: skips rows where `_enc` is already populated.

### When do we delete the legacy localStorage keys?

Confirmed: **NOT in this PR** — defer to Phase 1.5 (decision §8 row 4). Keep `strand_*` keys around for one release as a fallback for two reasons:
1. If the migration silently fails for some users (encryption hiccup, RLS misconfig), we still have their data on-device.
2. If the new PRs that read from DB have a bug, we have a one-line revert to fall back on localStorage.

After Phase 1 ships and we've eyeballed beta users for ~1 week, Phase 1.5 deletes:
- The legacy keys themselves (`localStorage.removeItem(...)`)
- The fallback reads in `aiContext.ts` and `useHomeAlerts.ts`
- The plaintext columns from `blood_results` and `user_medications`
- The `phase1-backfill-existing-rows` edge function (no longer needed)

---

## 5. `src/lib/aiContext.ts` — what changes, what stays

### Public contract: unchanged
The `AiContext` interface and `buildAiContext()` signature stay identical. Edge functions consuming `context` see the same fields. Phase 2 will rewrite edge functions; Phase 1 must not touch them.

### Internal: localStorage reads → DB reads + decrypt edge fn

Before:
```ts
const hairProfile = safeParse("strand_hair_profile", null);
const healthProfileLocal = safeParse("strand_health_profile", null);
const profileStep1 = safeParse("strand_profile_step1", null);
const styleLocal = safeParse("strand_current_style", null);
const proLocal = safeParse("strand_professional", null);
```

After:
```ts
// Two parallel calls:
//  1) DB reads for the plaintext columns (existing pattern, just more tables)
//  2) data-decrypt-context edge fn for everything encrypted
const [plain, decrypted] = await Promise.all([
  fetchPlaintextDomains(userId),     // joins profiles + user_*_profile + user_professionals (plaintext cols)
  supabase.functions.invoke("data-decrypt-context"),  // returns the encrypted bits
]);
const hairProfile = mergeHair(plain.hair, decrypted.hair);
// …same for health, professional, blood_results
```

This adds one edge-fn round-trip per AI invocation. Acceptable: `data-decrypt-context` is a single Postgres roundtrip and a few libsodium operations. Budget ~150 ms p50.

### Fallback during the rollout window
For the one release where we keep legacy localStorage as a safety net: if `fetchPlaintextDomains` returns an empty result for the hair/health domain, fall back to the legacy `safeParse` for that domain only. This means a user who has not yet had the migration run (e.g., didn't re-open the app on a new release) still gets a working AI context.

After Phase 1.5, the fallback path goes away.

### Other call sites that read from localStorage today
These need similar `localStorage → DB` swaps in **this same PR** so we don't ship inconsistent state:

| File | Key read | Fix |
|---|---|---|
| `src/lib/profilePdf.ts` | hair, health, heritage, profile-basic | swap to DB reads. PDF generator becomes async-safe. |
| `src/pages/Profile.tsx` | hair, health, profile-basic | swap. |
| `src/pages/Home.tsx` | current_style, profile-basic | swap. |
| `src/hooks/useHomeAlerts.ts` | profile_step1 (postcode for hard-water alert) | swap to `profiles.postcode`. |
| `src/components/WashGuidanceCard.tsx` | hair, current_style | swap. |
| `src/pages/SetCurrentStyle.tsx` | current_style | now writes to `user_style_profile` instead of localStorage; same shape on read. |
| `src/pages/IngredientDetail.tsx` | hair, health | swap. |
| `src/pages/NutritionPlan.tsx` | health, heritage | swap. |
| `src/pages/onboarding/BloodAiSummary.tsx` | health, hair | swap. |

**During this PR** the onboarding pages still write to localStorage AND to the new DB tables (dual-write). That keeps the safety-net intact. Phase 1.5 removes the localStorage writes.

---

## 6. Deploy sequence

Three SQL migrations + one manual setup step + one one-shot edge function invocation, in this order:

1. **§12 voicenotes window check first.** Run the SQL query from §12 in the Lovable Cloud SQL editor. If 0 rows, capture the result as a comment block at the top of migration #2 below. If any rows, **STOP** and surface to me — see §12.

2. **`<ts>_phase1_profile_extensions.sql`**
   `alter table profiles add heritage / birth_year / postcode / country`. Backfill `country = 'United Kingdom'` for the existing 6 rows. Top-of-file comment block records the §12 voicenotes-check result.

3. **`<ts>_phase1_clinical_tables.sql`**
   Create `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_professionals`. RLS, triggers, indexes. Encrypted (`bytea`) columns included from the start.

4. **`<ts>_phase1_encryption_columns.sql`**
   Add `_enc bytea` columns to existing tables: `user_medications` (`name_enc`, `category_enc`), `blood_results` (`value_enc`, `unit_enc`). Plaintext columns stay in place; drop in Phase 1.5.

5. **Manual: confirm `STRAND_CLINICAL_MASTER_KEY` is set in Lovable Cloud Secrets (§A.1).** If skipped, every encrypt call in step 6 fails fast.

6. **One-shot: invoke `phase1-backfill-existing-rows` once** (Lovable Cloud → Edge Functions → `phase1-backfill-existing-rows` → Invoke with body `{ "confirm": "i-have-set-the-master-key" }`). Encrypts the 14 existing `blood_results` rows + any `user_medications` rows. Idempotent. Inspect the returned JSON; do not proceed if `errors > 0`.

7. **Deploy the client code** (the migration hook, the dual-write onboarding pages, the `aiContext.ts` swap, the 9 page swaps from §5). Each authed beta user's next session runs `useLocalStorageMigration` and populates their `user_*_profile` / `user_professionals` rows from localStorage.

A fifth migration file (`<ts>_phase15_drop_plaintext.sql`) lands in Phase 1.5 to drop `user_medications.name`, `user_medications.category`, `blood_results.value`, `blood_results.unit` once we're confident the encrypted path is healthy. The `phase1-backfill-existing-rows` edge function is also deleted in that phase.

---

## 7. New edge functions added in this PR

All three follow the existing `Deno.serve` + CORS pattern from current `supabase/functions/*`. The first two are JWT-gated (default behaviour; we don't add them to `verify_jwt = false` in `config.toml`). The third is service-role-gated and admin-only.

**Prerequisite:** `STRAND_CLINICAL_MASTER_KEY` must be set in Lovable Cloud Secrets before any of these run successfully. See §A.1 for the one-time setup.

### `supabase/functions/data-encrypt-batch/index.ts`
- Input: `{ items: Array<{ id: string, plaintext: string }> }`
- Output: `{ items: Array<{ id: string, ciphertext_b64: string }> }`
- Reads master key once per cold start from `Deno.env.get("STRAND_CLINICAL_MASTER_KEY")`, base64-decodes to 32 bytes, caches in module scope. AEAD-seals each plaintext with a fresh 24-byte nonce. Returns `nonce || ciphertext` base64-encoded.
- No DB writes — pure utility. Caller (the migration hook) does the upserts.

### `supabase/functions/data-decrypt-context/index.ts`
- Input: `{}` (uses JWT for user identity)
- Output: shape that matches the encrypted slice of `AiContext` — see §5.
- Reads master key from `Deno.env.get("STRAND_CLINICAL_MASTER_KEY")`. Selects `user_id`'s rows from `user_hair_profile`, `user_health_profile`, `user_professionals`, `user_medications`, `blood_results`. Decrypts the encrypted columns. Returns plaintext payload.
- No persona prompt, no AI call — pure crypto + DB.
- 5xx on any decrypt failure. Do not return partial or silently mask — that's the wash-day fallback bug pattern from the audit.

### `supabase/functions/phase1-backfill-existing-rows/index.ts` (admin-only, one-shot)
- Input: `{ "confirm": "i-have-set-the-master-key" }` — a literal hand-typed string, to prevent accidental invocation.
- Output: `{ blood_results: { encrypted, skipped, errors }, user_medications: { encrypted, skipped, errors } }`.
- **Auth model:** uses the service-role key (bypasses RLS) to read across all users. Gated by checking either (a) the caller's authenticated email matches the founder's account email, or (b) a `BACKFILL_ADMIN_TOKEN` Lovable Cloud Secret matches a value in the request body. Since you'll invoke this from the Lovable Cloud Edge Functions panel logged in as the founder, (a) is the primary gate; (b) is a fallback for non-browser invocation.
- **What it does:**
  - For each row in `blood_results` where `value_enc IS NULL`: encrypts `value::text` and `unit`, writes the ciphertext into `value_enc` / `unit_enc`. Leaves `value` / `unit` plaintext in place — Phase 1.5 drops those columns.
  - For each row in `user_medications` where `name_enc IS NULL`: same shape for `name` and `category`.
  - Idempotent: rows with non-null `_enc` columns are skipped.
- **What it does NOT do:** does not touch the new `user_*_profile` / `user_professionals` tables (those have no pre-existing rows — they're populated per-user by the migration hook). Does not delete or null out any plaintext column.
- **Lifetime:** deleted in Phase 1.5 along with the plaintext columns. No purpose after the one invocation.

---

## 8. Decisions log (confirmed by user, 2026-04-26)

| # | Question | Decision |
|---|---|---|
| 1 | `birth_year` instead of `age`? | Yes — `birth_year smallint` on `profiles`. |
| 2 | Encrypt `blood_results.status`? | No — plaintext (drives Home alerts cheaply). |
| 3 | Encrypt `life_stage` / `contraception`? | Yes — both AEAD-sealed in `user_health_profile`. |
| 4 | Delete legacy localStorage keys in this PR? | No — keep through Phase 1.5 as fallback. |
| 5 | `user_medications.name` cutover plan? | Dual-write `name` + `name_enc` (also `category` + `category_enc`) in Phase 1; drop plaintext in Phase 1.5. |
| 6 | Per-user DEK or single shared master key? | Single shared master key in Lovable Cloud Secrets. |
| 7 | Add the 5 smoke tests? | Yes — exactly the 5 listed: encrypt round-trip, RLS denial, hook idempotency, `buildAiContext()` shape, migration-hook-no-op-second-run. No scope expansion. |

**Additional asks attached to the approval:**
- Encryption master key lives in **Lovable Cloud Secrets** (not Supabase Vault — that surface doesn't exist on Lovable Cloud). One-time setup steps in §A.1.
- Existing production data (14 `blood_results` rows, 6 `profiles` rows, 4 `user_products` rows) is encrypted in-place via the `phase1-backfill-existing-rows` admin edge function — see §4 and §7.
- Rollback procedure documented in §11, including the Lovable Cloud snapshot-restore nuclear option.
- Voicenotes window check from audit §4 carried into this PR — see §12.

---

## 9. Out-of-scope reminders

- **No edge function changes** to the 10 AI handlers — I'll only add the 3 new utility edge functions (`data-encrypt-batch`, `data-decrypt-context`, `phase1-backfill-existing-rows`).
- **No Anthropic** — Lovable + Gemini stays. Phase 2.
- **No `_shared/strand-persona.ts`** — Phase 2.
- **No `ProductDetailNew` / `ProductProfile` consolidation** — orthogonal.
- **No fix for `use_count` never being incremented, hardcoded heat-treatment fallback, or static-professionals-list-as-source-of-truth** — separate cleanup PRs.
- **No deletion of `strand_walkthrough_complete`, `strand_onboarding_step`, `strand_blood_summary_fp`, `strand_last_wash_date`, `strand_wash_step`** — these are UI state, not clinical data. They stay where they are.

---

## 10. Estimated scope

- **3 SQL migrations** (profile extensions, new tables, encryption columns)
- **1 manual setup step** — `STRAND_CLINICAL_MASTER_KEY` in Lovable Cloud Secrets per §A.1
- **3 new edge functions** (`data-encrypt-batch`, `data-decrypt-context`, `phase1-backfill-existing-rows`)
- **1 one-shot admin invocation** of `phase1-backfill-existing-rows` to encrypt the 14 existing `blood_results` rows + any existing `user_medications`
- **1 voicenotes window check** before migrations land (§12), with the result logged as a comment in migration #2
- **1 new hook** (`useLocalStorageMigration`)
- **`src/lib/aiContext.ts`** — internal swap to DB + decrypt edge fn (export signature unchanged)
- **9 client files** swapped from localStorage reads to DB reads (listed §5)
- **6 onboarding pages** updated to dual-write (localStorage AND DB during the rollout window)
- **5 smoke tests** (encrypt round-trip, RLS denial, hook idempotency, `buildAiContext()` shape, migration-hook-no-op-second-run)

Ballpark: a meaty 1–2 day PR. Risky to bundle further (e.g., adding any AI edits). I'd ship this on its own and let beta testers exercise it for ~1 week before Phase 1.5 (drop legacy columns + localStorage writes + the backfill function) and Phase 2 (Anthropic migration).

---

## 11. Rollback procedure

If this PR ships and breaks production beta, pick the minimum revert that fixes the issue. Match the scenario.

**Pre-flight check before any rollback:** note the current production SHA (`git rev-parse HEAD` on the deployed branch) and the current snapshot list in Lovable Cloud → Database → Backups. If you proceed with a snapshot restore, you'll lose any beta-user data written between the snapshot timestamp and now.

### Scenario A — encryption is broken (decrypt produces garbage, AI context arrives empty)

Most likely cause: the master key in `STRAND_CLINICAL_MASTER_KEY` doesn't match what was used at encrypt time (e.g. you regenerated and overwrote, or there's a base64 typo). The data on disk is fine; only the crypto is wrong.

**Do not drop tables. Don't touch the data.** Revert just the code:

```
git log --oneline -10                  # find the merge commit for Phase 1
git revert -m 1 <merge-sha>            # creates a revert commit
git push                                # ships via Lovable Cloud auto-deploy
```

The reverted app reads from localStorage again (the fallback in §4 is still in place — that's why we kept the keys). New rows written into the encrypted columns during the broken window stay in the DB; they become readable as soon as the master key is restored. **Do not delete the secret in Lovable Cloud Secrets** — the existing ciphertext is only recoverable with the original key.

If you genuinely lost the original master key (e.g. you regenerated it and have no record of the old value), the encrypted rows written during that window are unrecoverable. The plaintext `value` / `name` columns are still in place (we kept them through Phase 1.5) so existing pre-Phase-1 data is fine; only rows whose plaintext was already nulled or written fresh during the broken window are lost.

### Scenario B — RLS or new tables are broken (users can't onboard, queries fail)

If the new tables are unusable but the data isn't actively wrong, drop the tables and revert the code. Existing localStorage data on each beta tester's device means most users keep working.

**Order matters: revert code first, drop tables second.** Dropping tables while live code still tries to read from them throws on every authed render.

```
# 1. revert code
git revert -m 1 <merge-sha> && git push

# 2. wait for Lovable Cloud to redeploy. Confirm the live app is on the reverted SHA before continuing.
```

Then in the Lovable Cloud SQL editor:

```sql
-- 3. drop the new tables
drop table if exists public.user_professionals;
drop table if exists public.user_style_profile;
drop table if exists public.user_health_profile;
drop table if exists public.user_hair_profile;

-- 4. drop the new profiles columns
alter table public.profiles drop column if exists heritage;
alter table public.profiles drop column if exists birth_year;
alter table public.profiles drop column if exists postcode;
alter table public.profiles drop column if exists country;

-- 5. drop the new encrypted columns on existing tables
alter table public.user_medications drop column if exists name_enc;
alter table public.user_medications drop column if exists category_enc;
alter table public.blood_results    drop column if exists value_enc;
alter table public.blood_results    drop column if exists unit_enc;
```

The plaintext `name`, `value`, `unit` columns are still present (they don't get dropped until Phase 1.5) so existing reads keep working.

### Scenario C — the migration hook is corrupting data (wrong fields, wrong shape, partial writes)

Newer rows in the new tables are wrong, but localStorage on each device is still right. Stop the bleeding:

```
# 1. revert code (stops the hook from running on any further sessions)
git revert -m 1 <merge-sha> && git push
```

Then:

```sql
-- 2. clear out the corrupted rows so a future hook v2 can repopulate from localStorage
truncate table public.user_hair_profile,
               public.user_health_profile,
               public.user_style_profile,
               public.user_professionals;
```

```
# 3. when re-shipping the fix, change the migration flag name (e.g. `strand_migration_v2_done`)
#    in `useLocalStorageMigration.ts` — that forces every device to re-run the migration.
```

`profiles` rows are NOT truncated — those are auth-adjacent and exist for users beyond Phase 1's scope. If the new `profiles` columns are corrupted, instead:

```sql
update public.profiles
  set heritage    = '{}',
      birth_year  = null,
      postcode    = null,
      country     = 'United Kingdom';
```

…then ship the v2 hook to repopulate from localStorage.

### Nuclear option — restore from Lovable Cloud snapshot

Lovable Cloud takes automatic database backups. As of 2026-04-26 there are **4 completed snapshots from the past 3 days**. Use this only if Scenarios A/B/C don't apply or have failed — restoring loses every database write between the snapshot timestamp and now (new beta sign-ups, journal entries, wash-day logs, etc.).

```
# 1. pick the most recent snapshot from BEFORE the Phase 1 deploy.
#    Lovable Cloud → Database → Backups → list of completed snapshots with timestamps.

# 2. revert code first:
git revert -m 1 <merge-sha> && git push

# 3. confirm the app is on the reverted SHA at /home before restoring the database.

# 4. request the restore in Lovable Cloud:
#    Lovable Cloud → Database → Backups → <chosen snapshot> → "Restore database from this backup".
#    This is destructive — all DB writes after the snapshot are gone.

# 5. tell beta testers (DM, email, whatever channel) that you've rolled back to <date>
#    and any data they entered after that is gone. Apologise. This is a beta.
```

After a snapshot restore, the master key in Lovable Cloud Secrets is **untouched** (Secrets are per-project, not per-snapshot). If the snapshot pre-dates this PR, no encrypted rows existed at that point, so the key is harmlessly idle until you re-deploy. Don't delete the secret — it's the same key any future Phase 1 retry will need.

### Secrets cleanup after rollback

The master key in Lovable Cloud Secrets is harmless to leave in place after a code revert — no other code reads `STRAND_CLINICAL_MASTER_KEY`. Only delete it if you're permanently abandoning Phase 1:

```
# Lovable Cloud → Secrets → STRAND_CLINICAL_MASTER_KEY → Delete.
```

**Warning:** if you delete the key while encrypted rows still exist (i.e. before you've also dropped the `_enc` columns or restored from a pre-Phase-1 snapshot), that ciphertext is permanently unreadable. Drop the encrypted columns *before* deleting the key, or keep the key.

### When NOT to roll back

If only one of the 9 client files (§5) is broken (e.g. NutritionPlan errors), fix forward — patch the one file and ship a hotfix. Rollback is for systemic breakage of the data layer, encryption, or migration hook.

---

## 12. Voicenotes window check (one-time, must complete before migrations land)

The audit (§4 of `AUDIT.md`) flagged that the `voicenotes` storage bucket was created public in migration `20260424143018` and patched private 3 minutes later in `20260424143319`. Before this PR ships, we confirm zero traffic during the public window and document the result alongside the Phase 1 migrations.

### The query — you run in Lovable Cloud SQL editor, before any Phase 1 migration is applied

```sql
select id, bucket_id, name, owner, created_at,
       octet_length(coalesce(metadata::text, '')) as meta_bytes
from storage.objects
where bucket_id = 'voicenotes'
  and created_at >= '2026-04-24T14:30:18Z'
  and created_at <= '2026-04-24T14:33:19Z'
order by created_at asc;
```

### Outcomes

- **Zero rows returned** (expected): all clear. Note the result as a SQL comment block at the top of the first Phase 1 migration file (`<ts>_phase1_profile_extensions.sql`) so we have an auditable record:

  ```sql
  -- Voicenotes window check (audit §4 follow-up):
  --   storage.objects within 2026-04-24T14:30:18Z..14:33:19Z, bucket=voicenotes
  --   = 0 rows. No exposure during the 3-minute public-bucket window.
  --   Verified by Paige on <YYYY-MM-DD> via Lovable Cloud SQL editor.
  ```

- **One or more rows returned** (unexpected): **STOP**. Do not apply the Phase 1 migrations. Surface the result to me with the file paths, owners, and `created_at` timestamps. We handle it as a separate workstream — at minimum, the affected files need to be reviewed for clinical content, the affected users need to be informed, and depending on what's in them we may need an ICO notification. None of that belongs in this PR.

### Sequencing

I'll run this query as the first step of Phase 1 implementation, before writing any migration files. If the result is anything other than zero rows, I'll pause and flag it. If it's zero, I'll add the comment block to migration #2 (the profile-extensions migration) and continue.

---

## Appendix A.1 — Setting up `STRAND_CLINICAL_MASTER_KEY` in Lovable Cloud Secrets

This is a one-time manual setup you do by hand, **before** the Phase 1 migrations land. None of the encryption works until this is done. Treat it like setting up a password manager: do it once, carefully, in a focused 10 minutes — not while distracted.

### Step 1 — Generate a 32-byte master key on your Mac

Open Terminal (Applications → Utilities → Terminal, or ⌘+Space → "Terminal").

Paste this exact command and hit Enter:

```
openssl rand -base64 32
```

Expected output: a single line of 44 characters ending in `=`. For example:

```
8ZkX7Pv9D3hN0qL4jR5mT2eS6yA1bC8wF7uH2iV0pYU=
```

(Yours will be different — that's the point. The whole 44-character string, including the `=`, is your master key.)

If you get `command not found: openssl`, openssl is missing from your machine — unusual on macOS. Tell me; I'll give you a Node-based fallback.

### Step 2 — Back up the key BEFORE doing anything else

This is the single most important step in Phase 1. **If you lose this key, every encrypted row in the database becomes permanently unreadable. There is no recovery — neither I nor Lovable Cloud support can recover the data without it.**

Save the key to:

1. **1Password** (or your password manager) as a new Secure Note titled "STRAND clinical master key — production". In the body: paste the 44-character key. Tag it `phase-1`, `do-not-delete`.
2. **Optionally, a second copy** in your password manager's emergency-access vault, or printed and locked in a safe. Paranoid but cheap insurance for a clinical product.

**Do NOT:**
- Paste the key into Slack, iMessage, email, or any chat app — those are searchable and backed up to systems you don't control.
- Commit it to git, even in a private repo. Even in a `.env` that you "promise" you'll add to `.gitignore`.
- Save it in Apple Notes, Notes.app, or any cloud-synced plaintext note.
- Share it with anyone except, optionally, your password manager's emergency contact.

### Step 3 — Add it to Lovable Cloud Secrets

Open the Lovable Cloud panel for the STRAND project in your browser.

1. Click **Secrets** in the left-hand panel (alongside Database / SQL editor / Edge functions / Storage / Users / Logs).
2. Click **Add secret** (or "New secret" — whichever button label is current).
3. **Name:** type exactly `STRAND_CLINICAL_MASTER_KEY` — all caps, with underscores, no spaces, no quotes. The edge functions look for this exact name. A typo here is a silent failure.
4. **Value:** paste the 44-character key from Step 1. No surrounding quotes, no leading or trailing spaces.
5. **Save.**

Expected result: the secret appears in the Secrets list with the name `STRAND_CLINICAL_MASTER_KEY`. The value should be hidden by default (shown as `••••••••` or behind a "Reveal" button); if it's shown in plaintext on the secrets list page, that's a Lovable Cloud UI choice — the value is still encrypted at rest.

### Step 4 — Verify the secret is readable from edge functions

After this PR ships and the edge functions are deployed, do one round-trip test before relying on the encryption for real data:

1. Lovable Cloud panel → **Edge functions** → `data-encrypt-batch` → **Invoke** (or "Test").
2. Body:
   ```
   { "items": [{ "id": "test", "plaintext": "hello strand" }] }
   ```
3. Run. Expected response: `{ "items": [{ "id": "test", "ciphertext_b64": "<some base64 string of ~70+ chars>" }] }`. Different every run (the nonce changes each time).

Then the round-trip:

4. Lovable Cloud panel → **Edge functions** → `data-decrypt-context` → **Invoke** with body `{}`, while logged in as a user with no encrypted data yet.
5. Expected response: an empty-ish payload (no decrypt errors). If you get a 5xx with "key not found" or "key length mismatch", the secret name is wrong, the value is malformed, or the edge function can't read `Deno.env`. Tell me; I'll debug.

(Also: the smoke tests from §8 row 7 — encrypt-then-decrypt round-trip — exercise this in code, so a green test suite is ground truth.)

### Step 5 — When NOT to rotate the key

Once the key is set and there is encrypted data in the database, **do not rotate the key** without a key-rotation plan in place. We don't have one in Phase 1. If you ever need to rotate (key compromise, employee leaving, regulatory requirement), tell me first and we'll write the dual-key migration. Phase 1 assumes the key is durable.

### Setup is complete when

- `STRAND_CLINICAL_MASTER_KEY` exists in Lovable Cloud Secrets.
- The 44-character key is also in 1Password (or wherever you keep durable secrets), with the project + date in the title.
- The Step 4 round-trip returns a usable response (post-deploy).

If any of those is missing, the encryption pipeline will silently fail on first use. Don't apply the Phase 1 migrations until all three are checked.

---

## 13. Phase 1 Execution Runbook

The strict-order checklist Paige follows on deploy day. Every step is labelled with the actor and a "Verify" line that gates the next step. Hand-off moments — where Paige tells Claude Code to continue — are explicit. **No step is skipped, even if it looks redundant.** A failure at any "Verify" halts the runbook until the failure is understood and resolved.

**Step 1. [Paige]** — Run the §12 voicenotes window check in Lovable Cloud SQL editor.
*Verify:* the query returns **0 rows**. If 1+ rows: STOP. Copy the rows back to Claude Code and treat the affected uploads as a separate workstream — do not start Phase 1.

**Step 2. [Paige]** — Generate the encryption master key on your Mac. In Terminal: `openssl rand -base64 32`. Save the 44-character output to 1Password as a Secure Note titled "STRAND clinical master key — production".
*Verify:* you can re-open the 1Password note and read the same key back. If you can't find it: regenerate (only safe BEFORE Step 3 is done — once the secret is in Lovable Cloud and any encrypted data exists, you cannot rotate without a key-rotation plan we don't have yet).

**Step 3. [Paige]** — Add the secret to Lovable Cloud. Lovable Cloud → Secrets → Add secret. Name: `STRAND_CLINICAL_MASTER_KEY` (exact spelling, all caps). Value: paste the 44-character key (no quotes, no spaces). Save.
*Verify:* the secret appears in the Secrets list with the exact name `STRAND_CLINICAL_MASTER_KEY`. If a typo'd name was saved (e.g. `STRAND_CLINICAL_MASTERKEY`): delete the typo'd entry first, then re-add. If the value is shown as plaintext on the list (some Lovable Cloud UIs do this): that's display-only; the value is still encrypted at rest.

**Step 4. [Paige → Claude Code] HAND-OFF #1** — Tell Claude Code: *"voicenotes = 0 rows; master key in Lovable Cloud Secrets and 1Password; proceed to write migrations and edge functions."*
*Verify:* you've actually completed Steps 1–3 — not just intended to. If anything's incomplete: do NOT hand off. Fix first.

**Step 5. [Claude Code]** — Write the 3 SQL migration files per §6: `<ts>_phase1_profile_extensions.sql` (with the §12 voicenotes-check comment block at the top), `<ts>_phase1_clinical_tables.sql`, `<ts>_phase1_encryption_columns.sql`.
*Verify:* `supabase/migrations/` contains 3 new timestamped files; `npm run build` still passes; no migration depends on a column the prior migration didn't add.

**Step 6. [Claude Code]** — Write the 3 edge functions per §7: `supabase/functions/data-encrypt-batch/index.ts`, `data-decrypt-context/index.ts`, `phase1-backfill-existing-rows/index.ts`. Each reads the master key via `Deno.env.get("STRAND_CLINICAL_MASTER_KEY")`.
*Verify:* each file uses the existing `Deno.serve` + CORS scaffold; the libsodium import resolves; `phase1-backfill-existing-rows` enforces both auth gates (founder email check + the `{ "confirm": "i-have-set-the-master-key" }` body literal).

**Step 7. [Claude Code]** — Commit + push the migrations and edge functions in one PR.
*Verify:* `git push` succeeds; no pre-commit hook failures.

**Step 8. [Paige]** — Confirm migrations applied and edge functions deployed. Lovable Cloud auto-applies committed migrations on push and auto-deploys edge functions. Wait ~3 minutes after the push, then: Lovable Cloud → Database → confirm tables `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_professionals` exist; `profiles` has new columns `heritage`, `birth_year`, `postcode`, `country`; `blood_results` has `value_enc`, `unit_enc`; `user_medications` has `name_enc`, `category_enc`. Then: Lovable Cloud → Edge Functions → confirm all three new functions are listed as deployed.
*Verify:* every table, column, and function in the list above is present. If anything is missing after 3 minutes: open the Lovable Cloud build log. If a migration failed silently, paste its file contents into the SQL editor and Run them in order. If an edge function failed to deploy, send the error log to Claude Code.

**Step 9. [Paige]** — Round-trip test the encryption per §A.1 Step 4. Lovable Cloud → Edge Functions → `data-encrypt-batch` → Invoke with body `{ "items": [{ "id": "test", "plaintext": "hello strand" }] }`. Then `data-decrypt-context` → Invoke with `{}` while logged in as yourself.
*Verify:* `data-encrypt-batch` returns `{ items: [{ id: "test", ciphertext_b64: "<70+ chars>" }] }` and the `ciphertext_b64` differs on every invocation (new nonce each time). `data-decrypt-context` returns a non-error payload. If 5xx with "key not found / length mismatch": Step 3 didn't take — re-check Secrets. If 401: the JWT plumbing is wrong — flag to Claude Code.

**Step 10. [Paige]** — Invoke the existing-data backfill. Lovable Cloud → Edge Functions → `phase1-backfill-existing-rows` → Invoke with body `{ "confirm": "i-have-set-the-master-key" }`.
*Verify:* response is `{ blood_results: { encrypted: 14, skipped: 0, errors: 0 }, user_medications: { encrypted: <N>, skipped: 0, errors: 0 } }`. The `blood_results.encrypted` count must be exactly 14. If `errors > 0`: STOP, copy the response to Claude Code, debug. If `encrypted = 0, skipped = 14`: harmless — the backfill is being run a second time and the data is already encrypted. If `encrypted < 14`: investigate the skip count via SQL `select count(*) from blood_results where value_enc is null`.

**Step 11. [Paige → Claude Code] HAND-OFF #2** — Tell Claude Code: *"migrations applied; edge functions deployed; encrypt/decrypt round-trip confirmed; backfill returned errors:0 with blood_results.encrypted=14. Proceed to client code."*
*Verify:* you've read the actual response JSON from Step 10 yourself, not relied on a hunch.

**Step 12. [Claude Code]** — Write `src/hooks/useLocalStorageMigration.ts` per §4. Mounted inside `<RequireAuth>`; idempotent via `strand_migration_v1_done` flag; encrypts via `data-encrypt-batch` before upsert for the encrypted-column domains; skips per-domain if the DB row already exists.
*Verify:* hook compiles; the FLAG_KEY is exactly `strand_migration_v1_done`; running the hook twice in tests results in zero second-pass writes.

**Step 13. [Claude Code]** — Update `src/lib/aiContext.ts`. Internal swap: localStorage reads → DB reads + `data-decrypt-context` invocation. Public `AiContext` interface and `buildAiContext()` signature unchanged. Include the rollout-window fallback to legacy localStorage when the DB read returns empty (per §5).
*Verify:* `npm run build` passes; `git diff src/lib/aiContext.ts` shows no change to the export signature or the `AiContext` interface — only function bodies and imports.

**Step 14. [Claude Code]** — Swap the 9 client files listed in §5: `src/lib/profilePdf.ts`, `src/pages/Profile.tsx`, `src/pages/Home.tsx`, `src/hooks/useHomeAlerts.ts`, `src/components/WashGuidanceCard.tsx`, `src/pages/SetCurrentStyle.tsx`, `src/pages/IngredientDetail.tsx`, `src/pages/NutritionPlan.tsx`, `src/pages/onboarding/BloodAiSummary.tsx`. Each goes from `safeParse("strand_*")` to a DB read.
*Verify:* `git grep -l "strand_hair_profile\|strand_health_profile\|strand_current_style\|strand_professional\|strand_profile_step1\|strand_profile_basic\|strand_heritage" src/` returns ONLY: `useLocalStorageMigration.ts` (the migration reader), `aiContext.ts` (the rollout-window fallback), and the 6 onboarding pages (which still dual-write). No other file should reference these keys.

**Step 15. [Claude Code]** — Add dual-write to the 6 onboarding pages: `ProfileStep1`, `ProfileStep2`, `ProfileStep3Hair`, `ProfileStep4Colour`, `ProDetails`, plus `SetCurrentStyle.tsx`. Each page keeps its existing `localStorage.setItem(...)` line AND adds an upsert into the corresponding new DB table. Encrypted fields go through `data-encrypt-batch` first.
*Verify:* each page's continue handler issues at most one `data-encrypt-batch` call (where applicable) plus one upsert. Onboarding navigation flow is unchanged. No new console errors during a manual click-through.

**Step 16. [Claude Code]** — Write and run the 5 smoke tests per §8 row 7: encrypt round-trip, RLS denial when `auth.uid()` ≠ `user_id`, hook idempotency (second run is a no-op), `buildAiContext()` returns the same shape as before, migration hook second-run no-op.
*Verify:* `npm run test` is all green; `npm run build` passes; no `expect(true).toBe(true)` placeholder tests left behind. Do not push red tests.

**Step 17. [Claude Code]** — Commit + push the client code (hook, `aiContext.ts` swap, 9 page swaps, 6 onboarding dual-writes, 5 tests).
*Verify:* `git push` succeeds; no pre-commit hook failures.

**Step 18. [Paige]** — Confirm client deploy. Wait ~2 minutes after the push, then open the deployed app at the production URL. Open browser DevTools → Console.
*Verify:* the app loads without a white screen or console errors on the splash. If white-screen / console error: capture the error message + stack, ping Claude Code, do NOT continue to smoke tests.

**Step 19. [Paige]** — Smoke test 1: own account, existing data still loads. Login as yourself (info@texturetalks.co.uk). Open DevTools → Application → Local Storage and confirm `strand_migration_v1_done` was written with today's timestamp on first authed render. Then navigate to Profile, Blood Results, and trigger one AI feature you've used before (Blood AI Summary or NutritionPlan).
*Verify:* (a) `strand_migration_v1_done` timestamp is today; (b) all 14 blood markers display with correct `value` and `status`; (c) the AI feature returns plausible output of the same shape it did pre-Phase-1. If `strand_migration_v1_done` is missing: the hook didn't run — open Network tab, look for `data-encrypt-batch` calls, ping Claude Code with the trace. If AI output is blank or generic: `data-decrypt-context` is failing silently — check Lovable Cloud Logs for the function. STOP before Step 20 if either fails.

**Step 20. [Paige]** — Smoke test 2: fresh signup, full onboarding. Sign up with a brand-new email (e.g. `info+phase1test@texturetalks.co.uk`). Walk the full onboarding: Step 1 (heritage, postcode, age, avatar) → Step 2 (health profile, medications) → ProGate / ProBook / ProDetails → Step 3 hair → Step 4 colour & style → BloodTiming + at least one blood marker page → BloodAiSummary.
*Verify:* (a) every onboarding step navigates without error; (b) in Lovable Cloud → Database, the corresponding rows appear in `profiles`, `user_hair_profile`, `user_health_profile`, `user_style_profile`, `user_professionals`, `user_medications`, `blood_results`; (c) every encrypted column (`scalp_condition_enc`, `diagnosed_conditions_enc`, `life_stage_enc`, `contraception_enc`, `medical_conditions_enc`, `value_enc`, `unit_enc`, `name_enc`, `category_enc`, `gmc_number_enc`, `iot_number_enc`, `notes_enc`) is non-null bytea (not the literal string "null", not empty). If any row is missing or any `_enc` is null where it should be set: ping Claude Code; do NOT delete the test account — we use it for debug.

**Step 21. [Paige]** — Smoke test 3: AI personalisation still works. On the test account from Step 20: take a product photo (or paste a product URL) and run product analysis, OR open the BloodAiSummary page. On your own account: do the same. Open Lovable Cloud → Logs and inspect the `context` payload received by the edge function for each call.
*Verify:* (a) both accounts produce personalised output that references each account's own data; (b) the test account's output reflects the data you entered in Step 20; (c) your own output is substantively unchanged from pre-Phase-1 (within model variance); (d) the `context` payload in the logs shows `hairProfile`, `healthProfile`, `professional`, `bloodResults` populated for both accounts. If `context` arrives with empty encrypted fields: `data-decrypt-context` is the culprit; flag to Claude Code.

**Step 22. [Paige]** — Sign-off and start the soak window. Mark §8 of this doc with a "**Closed: <YYYY-MM-DD>**" line at the top. Begin a 1-week soak window before starting Phase 1.5 (drop legacy plaintext columns + delete legacy localStorage keys + delete `phase1-backfill-existing-rows`).
*Verify:* every line in "Done criteria" below is ✅. If any is unchecked, do NOT mark Phase 1 closed.

### Done criteria — what closes Phase 1

Phase 1 is complete when **all** of these are true. No exceptions, no "we'll fix it in 1.5":

- ✅ §12 voicenotes check returned 0 rows; the comment block is at the top of the profile-extensions migration.
- ✅ `STRAND_CLINICAL_MASTER_KEY` exists in Lovable Cloud Secrets AND in 1Password.
- ✅ All 3 SQL migrations applied (verified visually in Lovable Cloud → Database).
- ✅ All 3 edge functions deployed and the encrypt/decrypt round-trip succeeds.
- ✅ `phase1-backfill-existing-rows` returned `errors: 0` with `blood_results.encrypted = 14`.
- ✅ All 5 smoke tests green; `npm run test` and `npm run build` both pass.
- ✅ Client code deployed; no console errors on splash.
- ✅ Smoke test 1 (own account) passes — existing 14 markers load correctly; one AI feature returns plausible output.
- ✅ Smoke test 2 (fresh signup) passes — every onboarding step persists to the new tables; every `_enc` column is populated.
- ✅ Smoke test 3 (AI personalisation) passes for both accounts; the `context` payload in Lovable Cloud Logs shows the encrypted slice populated.
- ✅ `git grep` confirms no client file outside the 7 expected locations reads any clinical `strand_*` localStorage key.

If any of these is not ✅, Phase 1 is NOT closed. Do not start Phase 1.5 (drop plaintext columns) and do not start Phase 2 (Anthropic migration) until they all are.

### Hand-off summary

Two explicit hand-offs from Paige to Claude Code, plus Paige's solo verification phase at the end:

| Hand-off | Trigger | What Paige says |
|---|---|---|
| H1 | After Step 4 — voicenotes check + Secrets setup done | *"voicenotes = 0 rows; master key in Lovable Cloud Secrets and 1Password; proceed to write migrations and edge functions"* |
| H2 | After Step 11 — schema migrations applied + admin backfill complete | *"migrations applied; edge functions deployed; encrypt/decrypt round-trip works; backfill errors:0 with blood_results.encrypted=14. Proceed to client code"* |
| (no H3) | After Step 17 — Claude Code finishes pushing client code | Paige picks up at Step 18 (verify deploy) without an explicit hand-off message |
| H4 | After Step 22 — every Done criterion ✅ | *"Phase 1 closed; begin 1-week soak"* |

Between hand-offs, **Claude Code does not act unilaterally on anything that touches Lovable Cloud production**: no auto-running of admin endpoints, no remote SQL execution, no production deploys from the CLI. All production-side actions (Secrets setup, migration application verification, backfill invocation, smoke testing) are Paige's hands.

---

**Approved 2026-04-26. Plan now contains §1–§13 + Appendix A.1 + Done criteria. Awaiting your explicit "build" before I write any migrations, edge functions, hooks, or page edits. Per the Step 1 / Hand-off #1 sequence, my first action when you say "build" will NOT be code — it will be running the §12 voicenotes window check first.**
