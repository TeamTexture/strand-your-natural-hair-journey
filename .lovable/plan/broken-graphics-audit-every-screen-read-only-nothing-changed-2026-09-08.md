# Broken graphics audit — every screen (read-only, nothing changed)

Six parallel audits covered all ~180 routes: member core, products/ingredients/treatment, onboarding/auth/blood, professional/directory/messages, admin/brand/shared shell, forum/Plus/offers.

## Clean across the whole app

- No missing image files. Nothing in the app points at a file that does not exist; `public/placeholder.svg` exists but is never used, so no fallback placeholder is ever firing.
- No icon referencing an icon that does not exist. All 377 icon imports across the app resolve against the installed icon library.
- No photo circle without fallback initials. Every avatar goes through `UserAvatar` / `ProAvatar` / `ForumAvatar`, which show initials when there is no photo.
- No `<img>` missing an `alt` attribute anywhere, and no icon with conflicting size settings or clipped by its container.

## Genuinely broken

| # | Screen | What is broken | Where |
|---|---|---|---|
| 1 | Plus library collection | The cover picture is handed the raw storage path instead of a signed link, so it will not load. Every other library cover signs the path first (`PlusLibrary.tsx:91-112`). | `src/pages/PlusLibraryCollection.tsx:104-105` |
| 2 | Treatment check-in review | Photos render with `src=""` while the signed link is still loading, which shows the browser's broken-image glyph. | `src/components/treatment/CheckinReview.tsx:95` |
| 3 | Product / ingredient detail hero | Photo tile has no error fallback at all, and its fallback emoji is fixed at `text-2xl` inside a 224px tile, so the placeholder looks tiny and off-centre. | `src/components/ProductPhotoTile.tsx:80, 82`; call site `src/pages/IngredientDetail.tsx:1147-1154` |

## Emoji standing in for an icon

Where the same screen uses proper icons elsewhere:

- Home: `🔔 Alerts` (`Home.tsx:404`), `✓` in "on track" (`:426`), `✕` dismiss button (`:460`), `✦` label (`:628`), STRAND+ tiles `💬 📅 📚 ✉️` (`:617-620`, rendered `:652`), alert row prefixes (`:675`). The tile emoji has no box size and can collide with the count badge (`:647-652`).
- Directory: verified badge renders a literal `✓` next to text (`Directory.tsx:434`).
- Plus event detail: `📍` before the venue, while the events list and tickets use the map-pin icon (`PlusEventDetail.tsx:85`).
- Moodboard: `❤️ ♥ ♡` characters instead of the heart icon (`MoodboardBoard.tsx:139, 251-252, 268`).
- Profile health summary lines prefixed `🩸 💊 🩺` (`Profile.tsx:379-387`).
- Nutrition plan: `IconBubble` is fed emoji strings (`NutritionPlan.tsx:261, 293, 309, 357`, defaults `507-529, 1417`).
- Empty states passing an emoji into the `icon` prop: `⭐` (`pro/ProReviews.tsx:111`, `ProReviewsPublic.tsx:101`), `💬` (`Messages.tsx:170`, `ChatThreadPage.tsx:519`, `admin/AdminMessages.tsx:173`, `admin/AdminMemberMessages.tsx:49`), `🩸` (`BloodHistory.tsx:529`), `📷` (`MilestoneGallery.tsx:243`), `🎯 🖼️` (`Journal.tsx:346, 573`), `👁️` (`admin/AdminAudit.tsx:95`), `🏛️` (`admin/AdminSalons.tsx:564`), `✦` (`BrandsDirectory.tsx:180`), `🌱` (all treatment screens), `🧴` (`BrandProducts.tsx:71`), `🔎` (`IngredientResearch.tsx:69`).
- Note: `EmptyState` documents its `icon` prop as "large emoji or icon", so this pattern is currently by design. Walkthrough and setup-guide illustrations also use emoji, but deliberately, as fake phone mockups.

## Photos that break instead of degrading (no error fallback)

Only three images in the entire app recover from a failed link (`ProductThumb`, `MoodboardList:359,477`, `MoodboardLinkImportDialog:236`). Every other photo shows the broken-image glyph if a stored link expires or fails:

- Journal and moodboards: `Journal.tsx:437, 550`; `MoodboardBoard.tsx:286`; `MoodboardList.tsx:242, 279`; `StyleRecord.tsx:455`; `journal/GoalUpdateRow.tsx:70`; `journal/JournalStepCard.tsx:343, 495`; `journal/ProgressPhotosCard.tsx:147, 170`; `journal/StepReviewCard.tsx:136, 160`; `style/MainPhotoPicker.tsx:186`.
- Wash day and milestones: `WashDayDetail.tsx:647`; `wash/WashLogStyle.tsx:511`; `MilestoneGallery.tsx:252`; `washday/SponsoredWashDayTipCard.tsx:217`.
- Products and tools: `Avoidlist.tsx:281-289`; `ProductScanning.tsx:288-306`; `BrandProducts.tsx:141`; `MyToolsSection.tsx:333`.
- Treatment photos: `TreatmentProgress.tsx:227, 267`; `CheckinPhotos.tsx:105`; `PlanCheckinsSection.tsx:158`; `PlanProgressPhotos.tsx:106`; `TodayTreatmentCard.tsx:167, 217, 376`.
- Onboarding, profile and blood: `onboarding/ProfileStep1.tsx:524`; `onboarding/ProfileStepPhotos.tsx:102`; `profile-review/PersonalDetails.tsx:213`; `BloodHistory.tsx:557`; `BloodPanelReview.tsx:344`; `blood/BrandBloodPanelRow.tsx:59`.
- Members, brands and offers: `MemberProfile.tsx:56` (falls back to initials only when there is no photo, not when the photo fails); `BrandDetailPage.tsx:54`; `BrandProductPage.tsx:266`; `OfferPage.tsx:302, 350`; `SponsoredOfferCard.tsx:102`; `CuratedOfferCard.tsx:23`; `brand/BrandOfferBanner.tsx:162`; `brand/BannerPreview.tsx:36, 98`; `brand/BannerProductBlock.tsx:113`; `brand/LiveOfferCard.tsx:73`; `brand/PastOfferCard.tsx:76`; `brand/UpcomingOfferCard.tsx:76`; `nutrition/MealLogZone.tsx:37`; `chat/ChatImageBubble.tsx` and `ChatVoiceBubble.tsx` (these two already guard the no-link case).
- `UserAvatar.tsx:115` and `ProAvatar.tsx:60` show initials only when there is no photo, not when a photo fails to load.

## Empty `alt` on meaningful photos

Valid HTML but likely unintended on real content photos: `MyToolsSection.tsx:333`, `BrandDetailPage.tsx:54`, `BrandProducts.tsx:141`, `BrandsDirectory.tsx:42`, `brand/BannerPreview.tsx:36, 98`, `brand/BannerProductBlock.tsx:113`, `brand/BrandOfferBanner.tsx:162`, `brand/LiveOfferCard.tsx:73`, `brand/UpcomingOfferCard.tsx:76`, `admin/AdminCuratedOffers.tsx:63, 291`, `admin/AdminEvents.tsx:136`, `admin/AdminLibrary.tsx:689`, `brand/BrandCreateOffer.tsx:987`, `pro/ProProfile.tsx:493, 977`, `pro/ProSetup.tsx:170`, `OfferPage.tsx:302, 350`, `BrandProductPage.tsx:266`, `MemberProfile.tsx:56`.

## Suggested fix order, if you want it done

1. The three genuinely broken items above.
2. One shared image component with a built-in fallback, then swap the photo lists onto it, starting with journal, wash day, treatment and offers.
3. Swap emoji for real icons screen by screen, starting with Home, Directory and Plus event detail.
4. Real alt text on content photos.

Nothing was changed and nothing was deployed.
