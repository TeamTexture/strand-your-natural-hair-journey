# STRAND — End-to-end audit flow inventory

Planning document only. No app behaviour is changed by this file.

Purpose: a checklist a human (or a scripted Playwright pass) can walk top-to-bottom.
Every row names the **real route** and the **real component/hook files** involved, the
**tiers** it must be re-checked under, and a **concrete pass condition** — not "does it load".

## Tier legend

| Tag | Meaning | Source of truth in code |
| --- | --- | --- |
| **Basic** | Paying consumer, no STRAND+ | `useConsumerSubscription`, `PaidGate.tsx` |
| **Plus** | Consumer + STRAND+ | `usePlusAccess`, `PlusGate.tsx` |
| **Pro** | `professional` role, pro subscription | `useProSubscription`, `ProSubGate`, `ProProfileGate` |
| **Admin** | `admin` role | `RoleGate allow={["admin"]}` |
| **Brand** | `brand` role | `BrandSubGate`, `useBrandSubscription` |
| **Comp** | `profiles.complimentary_access = true` | `useComplimentaryAccess` |
| **Unpaid** | Signed in, no active subscription | `getSubscribePath`, `/subscribe` |

Global gates that wrap *every* row below — verify once per tier, then assume:
`AccessRestrictedGate` → `ConsentGate` → `RouteCrashGuard` → `RequireAuth`/`Paid`/`RoleGate`
(`src/App.tsx`, `src/components/`). Pass: a restricted account sees only
`pages/AccessRestricted`, an unconsented account sees only `ConsentGateScreen` on
every route except `/legal/*` and the auth routes.

---

## 1. New member: signup → onboarding → first Home load

Tiers: **Unpaid → Basic** (repeat the whole flow once as **Comp** to confirm no paywall appears).

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 1.1 | `/` | `pages/Index.tsx`, `components/SplashScreen.tsx` | Signed-out shows splash; signed-in resolves to exactly one destination per role and never parks on `LoadingDot` |
| 1.2 | `/auth` | `pages/Auth.tsx`, `hooks/useAuth.tsx` | Email signup requires confirmation (no auto-confirm), Google button present and completes without "Unsupported provider" |
| 1.3 | `/walkthrough` | `pages/Walkthrough.tsx`, `components/walkthrough/` | Skippable; skipping still lands on step 1, not `/home` |
| 1.4 | `/onboarding/profile-step-1` | `pages/onboarding/ProfileStep1`, `hooks/useOnboardingDraft` | Answers survive a hard refresh (draft persists, `strand_*` not purged) |
| 1.5 | `/onboarding/profile-step-2` | `ProfileStep2`, `MedicationPicker.tsx` | Medications save as separate rows; no raw enum text on screen |
| 1.6 | `/onboarding/profile-supplements` | `ProfileSupplements`, `SupplementPicker.tsx`, `hooks/useSupplements`, fn `supplement-extract` | Link paste **and** photo capture both yield name + dose in identical format (e.g. `80mg · 2 capsules per day`) plus a thumbnail |
| 1.7 | `/onboarding/pro-gate` → `/pro-book` / `/pro-details` | `ProGate`, `ProBook`, `ProDetails` | "No professional" path skips both sub-screens without dead-ends |
| 1.8 | `/onboarding/profile-step-3-hair`, `-4-colour` | `ProfileStep3Hair`, `ProfileStep4Colour`, `lib/hairstyles.ts` | Current style captured as duration/coverage only — no technique verdicts |
| 1.9 | `/onboarding/blood-timing` → `blood-iron-vitamins` → `blood-minerals` → `blood-thyroid` → `blood-hormones` | `pages/onboarding/Blood*`, `data/bloodRanges.ts` | "Skip"/"not tested" is available at each step and never blocks completion |
| 1.10 | `/blood-upload` | `pages/BloodUpload.tsx`, `lib/bloodThumbnail.ts` | Uploaded panel appears as a thumbnail; OCR failure surfaces an error, not silence |
| 1.11 | `/onboarding/blood-ai-summary` | `BloodAiSummary`, fn `blood-ai-summary`, `lib/bloodGuardrail.ts` | Markers stated factually; zero causal bridges to hair care (guardrail rejects) |
| 1.12 | `/onboarding/photos` → `/onboarding/success` | `ProfileStepPhotos`, `SuccessScreen` | Photos optional; success screen routes to `/subscribe` for Unpaid, `/home` for Comp |
| 1.13 | Back navigation, every step | `lib/onboardingFlow.ts` | Back always goes to the mapped previous step, never `/home` |
| 1.14 | `/subscribe` | `pages/Subscribe.tsx`, `lib/entitlement.ts` | Consumer price £9.99/mo from Stripe; Comp accounts never see this screen |
| 1.15 | First `/home` load | `pages/Home.tsx`, `lib/aiContext.ts`, `lib/featureFlags.ts` | Populates in one pass with no visible waterfall; Strand tip hidden while `SHOW_STRAND_TIP` is off; first-run nudge (`useFirstRunNudge`) shows once |
| 1.16 | `OnboardingGate` re-entry | `components/OnboardingGate.tsx` | Abandoning mid-flow and re-signing-in resumes at the earliest incomplete step |

---

## 2. Shelf & products

Tiers: **Basic**, **Plus** (repeat sensitivity rows as a member **with** and **without** a logged sensitivity).

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 2.1 | `/products` | `pages/Products.tsx`, `ProductsHeader.tsx`, `product/ShelfProductCard.tsx` | Shelf renders match % + sensitivity strip together and consistently |
| 2.2 | Photo scan | `hooks/useProductScan.ts`, `DualPhotoCaptureSheet.tsx`, `/products/scanning` (`ProductScanning.tsx`), fn `product-analyse` | Front+back required for the Claude path; analysis starts before uploads finish; failure surfaces an error state |
| 2.3 | Link scan | `hooks/useProductUrlScan.ts`, `UrlScanProgressButton.tsx`, fn `product-analyse-url` | Same field set as a photo scan (name, brand, INCI, purpose) |
| 2.4 | Manual add | `pages/Products.tsx` add path, `MarketedPurposeSelector.tsx` | Product saves with no AI call and no fabricated INCI list |
| 2.5 | Detail page | `/products/ingredient` → `pages/IngredientDetail.tsx` | **The page shelf cards actually navigate to.** Verdict, stars and verdict sentence all reflect the sensitivity ceiling |
| 2.6 | Alternate detail page | `pages/ProductProfile.tsx`, `/products/profile/:id` → `ProductProfileRedirect` | Same score/verdict/warning as 2.5 for the same product (known duplicate-surface debt) |
| 2.7 | Ingredient rows | `product/IngredientFlagRow.tsx`, `ScoreReasons.tsx`, fn `ingredient-analysis` | Matched sensitivity ingredients visibly flagged; every reason is a mechanism, not a benefit |
| 2.8 | Wishlist | `/products/wishlist`, `pages/Wishlist.tsx`, `WishlistTools.tsx` | Sensitivity strip renders here too |
| 2.9 | Favourites | `/products/favourites`, `pages/Favourites.tsx` | Sensitivity strip renders here too |
| 2.10 | Off-shelf | `/products/off-shelf`, `pages/OffShelf.tsx`, `OffShelfReasonSheet.tsx` | Reason captured; item leaves the active shelf but keeps its history |
| 2.11 | Avoidlist | `/products/avoidlist`, `pages/Avoidlist.tsx` | Avoided ingredients feed back into scoring |
| 2.12 | Repository / by-brand / by-ingredient | `pages/ProductRepository.tsx`, `BrandProducts.tsx`, `ProductsByIngredient.tsx` | Sensitivity strip on every card surface |
| 2.13 | Tools | `pages/ToolProfile.tsx`, `MyToolsSection.tsx`, `hooks/useToolMatchScores` | Heat guidance references only the TT Heat Hat |
| 2.14 | Sensitivity scoring | `lib/sensitivityMatch.ts`, `lib/sensitivityCeiling.ts`, `sensitivity/SensitivityShelfAlert.tsx` | 1 match → 18%, 2 → 8%, 3+ → 3%, applied reactively without a reload, on cards *and* detail |
| 2.15 | Voicenotes / ratings | `ProductVoicenotes.tsx`, `hooks/useReviews`, `useVoicenoteCounts` | Recording saves and plays back |
| 2.16 | Brand shelf entry points | `/brands`, `/brands/:brandUserId`, `BrandShelfProductOpen.tsx`, `BrandProductPage.tsx`, `lib/addBrandProductToShelf.ts` | Adding writes products to the shelf and tools to My Tools |

---

## 3. Wash Day

Tiers: **Basic**, **Plus**.

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 3.1 | `/wash-day` | `pages/WashDayHub.tsx`, `WashDayCard.tsx`, `wash/NextWashDayBox.tsx`, `TimeSelect.tsx` | Next-wash-day time picker is hourly |
| 3.2 | Steps 1–4 + styling | `/wash/step-1..4`, `/wash/step-styling`, `components/wash/`, `lib/washSteps.ts`, `hooks/useWashDaySteps` | Each step saves independently; abandoning mid-log keeps prior steps |
| 3.3 | Heat step | `wash/HeatStepEditor.tsx`, `HeatToolPicker.tsx`, fn `heat-treatment-rationale`, `lib/stylingHeat.ts` | Heat advice names only the TT Heat Hat, linked to www.teamtexture.co.uk |
| 3.4 | Product suggestions | `ProductPickerSheet.tsx`, `lib/pendingStepProducts.ts`, `journal/PendingStepProducts.tsx` | Suggestions come from the member's own shelf; no scalp products (oils/butters/gels) proposed |
| 3.5 | Detail / history | `/wash-day/:id`, `pages/WashDayDetail.tsx`, `lib/washHistoryAggregate.ts` | Saved wash reads back with the same steps and products |
| 3.6 | Wash tip | `washday/SponsoredWashDayTipCard.tsx`, `hooks/useWarmSponsoredWashDayTip`, `useDynamicWashTip`, fn `wash-day-tip` | Tip generates **with ads off** (salvage pass) — no 502, no empty card |
| 3.7 | Guidance density ("essentials-only") | `GlobalTipsDensityStrip.tsx`, `TipsLevelControl.tsx`, `lib/tipsLevel.ts`, `tips/TipsBlock.tsx` | Exactly 3 levels; level 1 shows visibly less than 2, 2 less than 3; nutrition stays full detail at every level |
| 3.8 | Observation | fn `wash-day-observation`, `lib/coherence.ts` | Copy passes `safeRewrite` — no broken sentences |

---

## 4. Diet / Nutrition

Tiers: **Basic**, **Plus**.

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 4.1 | `/nutrition-plan` | `pages/NutritionPlan.tsx`, fn `nutrition-plan` | Plan honours the member's diet pattern (vegan/vegetarian/pescatarian/omnivore/other/unknown); unknown never treated as omnivore |
| 4.2 | Supplements section | `nutrition/MySupplementsSection.tsx`, `hooks/useSupplements`, `ProductThumb.tsx` | Collapsed by default showing title + count; expands to add/review; thumbnails present |
| 4.3 | Meal ideas / saved meals | `hooks/useSavedMeals`, meal cards in `NutritionPlan.tsx` | Saving a meal persists across reloads |
| 4.4 | Cook log | `nutrition/MealLogZone.tsx`, `MealLogSheet.tsx`, `hooks/useMealCookLogs` | Star rating + photo save; `cooked_at` is immutable and displayed as a friendly date |
| 4.5 | Nutrient gaps | `sensitivity/NutrientGapNote.tsx`, `AvoidingSummary.tsx`, `lib/dietaryPattern.ts` | Dietary sensitivities produce substitutes, never bare removals; no injections/dosing/at-risk-group language |
| 4.6 | Blood → nutrition link | `lib/bloodGuardrail.ts` | Markers may be named factually; no causal hair claim |

---

## 5. Journal & Blood

Tiers: **Basic**, **Plus**.

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 5.1 | `/journal` | `pages/Journal.tsx`, `journal/JournalStepCard.tsx`, `GoalHeroCard.tsx` | Entries list newest-first with friendly dates |
| 5.2 | `/journal/entry/:id` | `pages/StyleRecord.tsx`, `journal/StepReviewCard.tsx`, `StepVideoCapture.tsx` | Photos/videos render from signed URLs (`useSignedMedia`), no broken tiles |
| 5.3 | Goals & challenges | `hooks/useGoals`, `useChallenges`, `GoalEditorSheet.tsx`, `GoalProgressComposer.tsx`, `journal/PastGoalsSection.tsx` | Progress update writes a timeline row; goal tips regenerate only on goal change |
| 5.4 | Moodboards | `/journal/moodboards`, `MoodboardList.tsx`, `MoodboardBoard.tsx`, `MoodboardLinkImportDialog.tsx` | Link import adds an image, not a dead card |
| 5.5 | Encouragement | fn `journal-encouragement` | Fails loudly on error (note: currently the only `verify_jwt = false` function, and lacks the provider flag) |
| 5.6 | Blood upload | `/blood-upload`, `pages/BloodUpload.tsx`, `hooks/useBloodPanelThumbs` | Panel saved with a thumbnail and vendor attribution |
| 5.7 | Panel review | `/blood-panel/:id`, `pages/BloodPanelReview.tsx`, `BloodResultRow.tsx`, `MarkerBadgeRow.tsx` | Value + range + "see your GP" only |
| 5.8 | Longitudinal trends | `/blood-history`, `pages/BloodHistory.tsx`, `BloodChangeAnalysis.tsx`, `hooks/useBloodValues` | Two panels produce a real delta; a single panel shows an honest "not enough data" state |
| 5.9 | Home blood summary | `blood/HomeBloodSummary.tsx`, `BloodSummaryBar.tsx` | Flagged markers match the panel page exactly |

---

## 6. Passport & Profile

Tiers: **Basic**, **Plus**, plus a paired **Pro** check for 6.6–6.8.

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 6.1 | `/profile` | `pages/Profile.tsx`, `AccountControls.tsx`, `FontScaleControl.tsx` | All sub-links reachable; back button works from each |
| 6.2 | Reviews: personal / health / hair / colour | `/profile/personal`, `/health`, `/hair`, `/colour`, `profile-review/HealthFieldsSection.tsx` | Medications and Supplements are **separate boxes**; edits save as diffs |
| 6.3 | Allergies / sensitivities | `sensitivity/SensitivitySheet.tsx`, `SensitivityCaptureCard.tsx`, `hooks/useSensitivities`, `useSensitivityCapture` | Stored encrypted; UI always says to read the pack/label; only "avoid completely" excludes |
| 6.4 | Re-confirmation prompt | `ProfileReconfirmPrompt.tsx`, `lib/profileConfirmation.ts` | Dialog fits a 375px viewport with no overflow |
| 6.5 | `/profile/passport-visibility` | `pages/PassportVisibility.tsx`, `hooks/usePassportVisibility` | All 9 sections toggle and persist; back returns to Profile |
| 6.6 | `/profile/passport-preview` | `pages/PassportPreview.tsx`, `passport/PassportView.tsx` | Gold "what professionals see" banner; hidden sections absent; back goes to `/home` |
| 6.7 | Pro consent flow | `EnquiryDialog.tsx`, `hooks/useEnquiries`, `useProContactState`, `pro_client_access` | Passport data unlocks **only** via an accepted enquiry |
| 6.8 | Pro view of passport | `/pro/clients/:consumerId`, `passport/usePassportData.ts`, fn `passport-decrypt` | Tab strip filtered to visible sections only; supplements + sensitivities populate |
| 6.9 | Data access / deletion | `/profile/data-access`, `pages/DataAccess.tsx`, `DeletionPending.tsx`, `/data-protection-complaint` | Export produces a file; deletion request shows pending state |
| 6.10 | Consents | `pages/ConsentGateScreen.tsx`, `hooks/useConsentState`, `useActiveRoleView` | Only the active view's items are asked; nothing already answered is re-asked |
| 6.11 | Milestones / discounts / offers prefs | `/profile/milestones`, `/profile/discounts`, `/profile/personalised-offers`, `/email-preferences` | Discount codes visible to authenticated members only |

---

## 7. Chat & appointments

Tiers: **Basic** (locked chat), **Plus** (unlocked), **Pro**.

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 7.1 | `/appointments` | `pages/Appointments.tsx`, `AppointmentCard.tsx`, `lib/appointmentState.ts`, `lib/appointmentDisplay.ts` | Upcoming/past split correct; friendly dates |
| 7.2 | Booking | `/directory` → `pages/Directory.tsx`, `booking/BookingDepartureSheet.tsx`, `BookingReturnPrompt.tsx`, `lib/bookingUrl.ts` | External booking opens in a new tab (`target=_blank rel=noopener noreferrer`); return prompt fires |
| 7.3 | Log appointment | `/appointments/log`, `pages/LogAppointment.tsx`, `AppointmentFollowUpDialog.tsx` | Logged appointment appears in past list and in the pro's view |
| 7.4 | Chat lock boundary | `/messages`, `/messages/:threadId`, `pages/Messages.tsx`, `ChatThreadPage.tsx`, `hooks/useCanSendChatMessage`, `chat/ChatUpgradeNotice.tsx` | Sending is allowed inside the appointment window and blocked outside it, with the upgrade notice — never a silent failure |
| 7.5 | Chat media | `chat/ChatImageBubble.tsx`, `ChatVoiceBubble.tsx`, `DeliveryTicks.tsx`, `lib/chatVoice.ts` | Image/voice send, render, and show delivery state |
| 7.6 | Plus upgrade | `/plus/upgrade`, `pages/PlusUpgrade.tsx`, `PlusWelcome.tsx`, `hooks/useUpgradeEligibility`, `usePlusAccess` | Stripe is the price source; on return, chat unlocks without a manual refresh |
| 7.7 | Plus surfaces | `/forum`, `/forum/:id` (`ForumThread.tsx`), `/plus/library`, `/plus/events`, `/plus/tickets`, `MentionTextarea.tsx` | `@`-mention resolves real members (`mention_search_all`); "Message" button opens a DM |
| 7.8 | Reviews | `/reviews/new`, `pages/LeaveReview.tsx`, `ReviewVoicenoteRecorder.tsx`, `/directory/:proUserId/reviews` | Review appears on the pro's public page after moderation |
| 7.9 | Global chat widget | `GlobalChatWidget.tsx`, `MessageNotifications.tsx`, `hooks/useIncomingChatMessages`, `useAppBadge` | Unread count matches the thread list |

---

## 8. Pro side

Tiers: **Pro** (subscribed), **Pro unpaid**, **Admin** (full pro privileges, no subscription).

| # | Route | Files | Correct looks like |
| --- | --- | --- | --- |
| 8.1 | `/pro/auth` → `/pro/landing` | `pages/pro/ProAuth.tsx`, `ProLanding.tsx` | Applicant → landing; approved → dashboard; never the consumer splash |
| 8.2 | Apply / review | `/pro/apply`, `/pro/under-review`, `/pro/welcome`, `/pro/setup` | Application status is visible and accurate |
| 8.3 | `/pro` dashboard | `pages/pro/ProDashboard.tsx`, `ProTour.tsx`, `hooks/usePendingEnquiriesCount`, `usePendingBookingClicks` | Counts match the underlying lists |
| 8.4 | Profile & salon | `/pro/profile`, `/pro/salon`, `hooks/useSalon`, `lib/openingHours.ts`, `hooks/useProProfileReview` | Publishing puts the pro in `/directory` |
| 8.5 | Directory listing | `/directory`, `hooks/useDirectoryProfessionals`, `directory/`, `DirectoryReviewPreview.tsx` | Only published/approved pros listed; discount data only for authenticated viewers |
| 8.6 | Clients | `/pro/clients`, `/pro/clients/:consumerId`, `/…/past`, `hooks/useProClients`, `useProClientNotes`, `useAssignableClients` | Only clients with accepted access appear |
| 8.7 | Client passport | `passport/PassportView.tsx` in pro mode, `usePassportVisibility` | Sections the member hid are absent from tabs *and* content |
| 8.8 | Enquiries | `/pro/enquiries`, `EnquiriesListInline.tsx`, `ExternalEnquiryDialog.tsx` | Accept grants access; decline grants nothing |
| 8.9 | Appointments as pro | `/pro/appointments`, `/pro/appointments/log`, `hooks/useProAppointments`, `useProLogAppointment` | Logged appointment appears on the member side too |
| 8.10 | Chat as pro | `/messages` in pro view, `hooks/useCanSendChatMessage`, `chat/InlineThreadChat.tsx` | Pro can reply within the window; consent/appointment rules identical to member side |
| 8.11 | Treatment plans | `/pro/treatment`, `/pro/treatment/templates/:id`, `/pro/treatment/plan/:planId/week/:week`, `hooks/useProTreatment`, `useTreatmentAssignments` | Assigned plan shows on the member's `/treatment/:id` |
| 8.12 | Billing & undertaking | `/pro/billing`, `hooks/useProSubscription`, `useProUndertaking`, `lib/proCapabilities.ts` | Pro £12.99/mo from Stripe; Admin/Comp bypass with no payment prompt |
| 8.13 | Pro campaigns | `/pro/campaigns*` (reuses `BrandDashboard`/`BrandCreateOffer`), `hooks/useOwnerMode`, `lib/adPricing.ts` | Placement calendar + Stripe checkout complete; live campaign shows in admin |
| 8.14 | Pro reviews | `/pro/reviews`, `pages/ProReviews.tsx` | Member reviews visible with correct star maths |

---

## 9. Admin

Tier: **Admin** only. Every route below must 404/redirect for non-admins.

| Route | Files | Correct looks like |
| --- | --- | --- |
| `/admin` | `AdminHub.tsx`, `hooks/useAdminNotifications` | Badge counts match each destination list |
| `/admin/applications` | `AdminApplications.tsx` | Approve/reject/delete-profile all work (`admin-delete-user`) |
| `/admin/members`, `/admin/members/:userId/passport` | `AdminMembers.tsx`, `AdminMemberPassport.tsx` | Members list = consumers only, excludes pros, updates as people join |
| `/admin/professionals` | `AdminProfessionals.tsx` | Pros populate dynamically; no "Subscribed" card; no wrapped button labels |
| `/admin/brands`, `/admin/brands/:userId/edit` | `AdminBrands.tsx`, `AdminBrandEdit.tsx` | Cards fit 375px with no bleed |
| `/admin/brand-offers`, `/…/:id`, `/admin/brand-calendar` | `AdminBrandOffers.tsx`, `AdminBrandOfferReview.tsx`, `AdminBrandCalendar.tsx`, `admin/UnifiedCampaignCalendar.tsx` | Live campaigns listed; "Requested" count equals actual pending requests (0 means 0) |
| `/admin/view-as` | `AdminViewAs.tsx`, `hooks/useViewAs`, `ViewAsBanner.tsx` | Shadow view swaps read identity only; writes still blocked by RLS |
| `/admin/settings`, `/admin/capabilities` | `AdminSettings.tsx`, `AdminCapabilities.tsx` | Kill switch / caps (`_shared/usage-cap.ts`, `AI_KILL_SWITCH`) reflect real state |
| `/admin/audit`, `/admin/tip-grounding`, `/admin/clarifications` | `AdminAudit.tsx`, `AdminTipGrounding.tsx`, `AdminAuthorClarifications.tsx` | Grounding shows manuscript citations with chapter + page |
| `/admin/shelf-review` | `AdminShelfReview.tsx`, `hooks/useAdminShelfReview` | Queue drains as items are actioned |
| `/admin/treatment*` | `AdminTreatment.tsx`, `AdminTreatmentTemplate.tsx`, `AdminTreatmentPlan.tsx` | Template edits propagate to new plans only |
| `/admin/messages`, `/admin/broadcast`, `/admin/moderation` | `AdminMessages.tsx`, `AdminBroadcast.tsx`, `AdminModeration.tsx` | Broadcast respects the global email OFF flag |
| `/admin/data-protection` | `AdminDataProtection.tsx`, `hooks/useDataProtectionComplaints` | Complaints and deletion requests both listed |
| `/admin/library`, `/admin/events`, `/admin/blood-vendors`, `/admin/salons`, `/admin/pro-reviews`, `/admin/referrals` | matching `pages/admin/*` | Each CRUD screen round-trips a create and an edit |

Cross-cutting admin checks: no UUIDs, file paths, ISO timestamps, snake_case labels or
raw enum values anywhere; no button label wrapping a single letter onto a second line.

---

## 10. Cross-cutting sweeps (run once, all tiers)

- **AI spend guards**: `_shared/usage-cap.ts` kill switch + per-user daily cap fire before any model call; `ai_call_log` gets a row per call with `outcome`/`rejection_rule`/`stage`.
- **AI failure UX**: every 5xx from an edge function surfaces a visible error — never a silent empty card.
- **RLS/GRANTs**: no `anon` access to `user_sensitivities`, `user_supplements`, `meal_cook_logs`, `pro_passport_visibility`, discount codes, blood panels.
- **Design system**: Playfair + Jost only, tokens only (no hardcoded colours), 375px-wide layout inside `PhoneShell`.
- **External links**: all `target="_blank" rel="noopener noreferrer"`.
- **Tests**: `npm run test` green (`src/test/*` already covers consent gate, sensitivity ceiling, match score consistency, manuscript fidelity, dietary integrity).

---

## Notes / known debt to re-verify during the audit

- Two product detail surfaces exist (`IngredientDetail.tsx` and `ProductProfile.tsx`); fixes must land on both.
- `journal-encouragement` is the only function with `verify_jwt = false` and has no `STRAND_AI_PROVIDER_*` flag.
- "Essentials-only mode" in this app is the guidance-density level (`lib/tipsLevel.ts` level 2 "Essential"), not a separate wash mode — confirm that is the intended reading before auditing row 3.7.
