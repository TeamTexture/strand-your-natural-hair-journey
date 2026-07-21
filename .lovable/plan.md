
## Admin "View as user" — read-only shadow mode

Admins get a picker to enter any user's app as if signed in as them. Their own auth session stays put; only the *effective user id* used by consumer data hooks is swapped. Writes are blocked with a banner + guards so no data is corrupted.

### 1. New context: `ViewAsProvider`
`src/hooks/useViewAs.tsx`
- Holds `viewAsUserId: string | null` (persisted to `sessionStorage` so tab refresh keeps state, closes on tab close).
- Exposes `{ viewAsUserId, viewAsDisplayName, isViewingAs, startViewAs(id, name), stopViewAs() }`.
- Only usable when the real signed-in user has the `admin` role — otherwise `startViewAs` is a no-op.
- Wraps `<App />` inside `<AuthProvider>` in `src/App.tsx`.

### 2. Effective-user surface: patch `useAuth`
`src/hooks/useAuth.tsx`
- Add `effectiveUserId: string` and `isViewingAs: boolean` to the context.
- `effectiveUserId = viewAsUserId ?? session.user.id`.
- Keep `user` and `session` returning the real admin — hooks that need to mutate/authenticate use those. Hooks that only *read a user's data* use `effectiveUserId`.

### 3. Refactor consumer read-hooks to `effectiveUserId`
Update these hooks to read from `effectiveUserId` instead of `user.id`:
- `useGoals`, `useUserProducts`, `useUserTools`, `useWashDays`, `useJournalEncouragement`
- `useBloodValues`, `useBloodPanelThumbs`, `useIngredientLists`, `useIngredientProfile`
- `useMoodboards`, `useSavedMeals`, `useHomeAlerts`, `useProductPhotos`, `useVoicenoteCounts`
- `useConsumerSubscription` (so subscribe/paywall renders correctly for the viewed user)
- `useAccessRestricted` (see the same block screen they'd see)
- `useEnquiries` (consumer side)
- The `PassportView` / `usePassportData` reads already accept a `userId` prop — no change.

Pro/admin/brand hooks (`useProSubscription`, `useRoles`, `useBrandOffers`, etc.) keep using the real admin user — role-switcher must still work.

### 4. Write guard
- Extend `useAuth` result with `assertWritable()` that throws when `isViewingAs`.
- Add a small helper `useReadOnly()` returning `isViewingAs` for UI-level disabling.
- Wire it into the most common write hooks (product save, wash day save, journal save, goals) — they early-return + toast "Read-only: exit View as user mode to make changes." This is defense-in-depth; RLS already blocks the writes because the admin's JWT can't insert rows owned by another user.

### 5. UI

**Global banner** — `src/components/ViewAsBanner.tsx`
- Sticky slim bar at top of `PhoneShell` when `isViewingAs`, ink background with gold text: "Viewing as {name} — read only • Exit". Height ~28px, respects the phone frame.
- "Exit" clears view-as and refetches queries (`queryClient.invalidateQueries()`).

**Picker** — new admin route `/admin/view-as`
- Reuses `admin_list_member_emails` + `profiles` to list every member (search by name/email).
- Each row has a "View as" button that calls `startViewAs(userId, displayName)` and navigates to `/home`.
- Card entry point added to `AdminHub.tsx` under a new "Support tools" section.

**Deep link from existing admin screens**
- `AdminMembers`, `AdminProfessionals`, and `AdminMemberPassport` get a secondary "View as user" button next to the passport link so you can jump in from where you already are.

### 6. Query cache isolation
- Every `queryKey` in the refactored hooks already includes `user.id`; changing that to `effectiveUserId` naturally scopes cached data per viewed user with no cross-contamination.
- On `startViewAs` / `stopViewAs`, call `queryClient.removeQueries({ predicate: q => q.queryKey.includes(previousId) })` to be safe.

### 7. Safety rails
- Admin cannot "view as" another admin who has restricted them (not a real case yet, but the check is one line).
- Realtime subscriptions in `useBrandOfferLiveSync` etc. keep using admin's session — fine, they're global reads.
- Session tracking (`sessionTracker`) checks `isViewingAs` and skips writing a `user_sessions` row so we don't pollute the viewed user's activity metrics.

### Technical details

Files touched (~18):
- New: `src/hooks/useViewAs.tsx`, `src/components/ViewAsBanner.tsx`, `src/pages/admin/AdminViewAs.tsx`
- Edited: `src/App.tsx` (provider + route + banner mount), `src/hooks/useAuth.tsx`, `src/components/PhoneShell.tsx` (banner slot), `src/pages/admin/AdminHub.tsx`, `AdminMembers.tsx`, `AdminProfessionals.tsx`, `AdminMemberPassport.tsx`, plus each read-hook listed in §3.

No database migration needed — admins already have RLS read access to all consumer tables via `has_role(auth.uid(), 'admin')` policies. If a specific table is missing an admin-read policy we'll surface it and add it in a follow-up migration.

Rollout: ship gated behind the admin role check; non-admins see zero change.
