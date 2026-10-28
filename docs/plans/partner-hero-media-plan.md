# Plan: partner hero photo and logo (gym owners, trainers, vendors)

> **Owner decisions 2026-10-29 (answers in §6; override anything below that differs).**
> - D-1: stored in our database. v1 shows only on the partner's own home.
> - **D-3 changed:** show immediately and review afterwards; no pending or approval state, no 14-day expiry.
> - **D-5 changed:** people and faces are allowed in partner photos, with no people confirmation. Revisit before any member-facing use.
> - D-6 dropped. D-2, D-4, D-7 and D-8 stay as the defaults.
>
> The design spec `docs/design/photo-hero-screens.md` §39–§45 is the authority for screens, copy and the contract changes (§44.4). The sections below have been updated to match.

## 0. What I found that shapes the plan

1. **Partner-uploaded photos already use this pipeline: Shop banners (live, `SHOP_BANNERS` on).** A vendor's banner photo goes through the `HeroImage` cleaning pipeline (`purpose='shop_banner'`, `vendorId`, `confirmationVersion`). It is rotated upright, EXIF/GPS is stripped, it stays private until a staff member approves it, and there is a two-person rule. A versioned rights text is stamped `draft_pending_counsel`. Files: `/Users/chollo/FitFlex/fitflex-functions/functions/shop-banners.mjs`, `src/services/shop-banner-service.mjs`, `docs/shop-banners-api.md`, `src/infra/hero-image-file.mjs` (`prepareHeroUpload(input, limits)`, `buildHeroVariants`, `measureTextZones`). This plan copies that model. It does not copy the gallery path.
2. **The other partner photos are base64 data URIs stored in Postgres.** This covers `Gym.images` / `thumbnails` (`gym-service.mjs` says so), trainer `images` / `photoUrl`, and the vendor's `vendorProfile.logo` and `banner`. They come from `FFPhotoPickerField` / `FFPhotoGalleryField` at 800 px. There is no server-side cleaning and no review. 800 px is below the 1080 px hero floor, so the existing pickers can't be reused as they are.
3. **Vendors already have a logo and a banner.** Both are required at publish (`PROFILE_REQUIRED` in `src/services/shop-service.mjs:24`). Both are already shown to members on the storefront sheet (`lib/shared/widgets/shop_browse_page.dart:2861-2880`). So "vendor hero + logo" partly exists, without moderation.
4. **Security findings for `security-and-privacy-reviewer`. I have not fixed them; they are separate from this feature:**
   - `saveVendorProfile` stores `logo` and `banner` as any string. `FFRemoteImage` (`lib/shared/components/ff_remote_image.dart:61`) turns anything that is not a data URI into `NetworkImage(src)`. So a vendor can make every member who opens their storefront fetch from any host (IP leak or tracking pixel). Suggested fix branch: `fix/vendor-media-src-check` (functions + mobile).
   - `/storage/upload` (`functions/storage.mjs`) accepts any signed-in user, including members, and immediately returns a public Zebra URL that can never be deleted. This is the same Zebra no-delete problem as Q-31.
   - I could not confirm whether the Flutter web picker path (raw bytes when `flutter_image_compress` is skipped) keeps EXIF/GPS in base64 gallery photos. This needs checking.
5. **The global photo manager has no per-partner concept.** `GET /app/hero-images` and the `trainer` / `vendor` / `owner` slots in `src/shared/hero-slots.mjs` are one photo for every partner of that type. Partner photos need their own records and their own read path. They should not be added to the public manifest.
6. **The owner home is per gym.** It has a gym picker in the app bar and `OwnerDataScope.ownerGyms`. Gym staff edit gym profiles under staff scope `gyms` (`requireGymAcl('gyms')` on `PUT /owner/gyms/:gymId`). The legacy check doesn't scope by gym, so the service must check that the `gymId` belongs to the caller.

**Settled decisions I am not re-opening:**
- Bundled photo on the first frame, with no network request.
- The always-dark scrim.
- `people=none` only for photos FitFlex publishes through the photo manager (because Zebra can't delete).
- No third-party brand logos.
- D-4: one `brand_media` admin publishes alone.
- DD-8: no stock photo above a named gym.
- `HERO_IMAGES_*` flags stay off.

---

## 1. Design (owner answers in §6, 2026-10-29)

| Topic | Recommendation |
|---|---|
| **Where it shows (v1)** | Only the partner's own home band: owner Home, trainer Home, vendor Products tab, each spec §25 band. Member-facing pages stay unchanged in v1. Gym and trainer detail already open with the partner's own gallery and only get a footer (D-1 stands). The vendor storefront keeps its current `banner` / `logo` until slice 5. |
| **Unit** | **Per gym** for owners: the home shows the gym picked in the app bar, and each gym has its own photo and logo. **Per trainer profile** for trainers. **Per vendor** for vendors (`Vendor.id` = vendor user id). |
| **Precedence** | Live partner photo or logo (uploaded by the partner, live as soon as the server has cleaned it, or set by FitFlex for that partner) → the photo manager's global role slot (only when `HERO_IMAGES_REMOTE` and `HERO_IMAGES_CMS` are on) → the bundled `FFHeroPhoto.owner` / `.trainer` / `.vendor`. Each partner has one live photo and one live logo at a time; the newest upload replaces the old one straight away, and the old files are deleted. *(D-3, 2026-10-29)* |
| **Logo placement** | Top-left inside the band on phones, top-right on the ≥ 840 banner. It sits on a contrast plate: 8 px radius, 6 px padding, 40 px tall, at most 120 px wide, aspect kept. The plate is light, or dark for white logos (`plate` auto / light / dark, spec §40.2). It never sits directly on the photo (canon: no logo on a busy photo without a plate). Hidden from screen readers, because the eyebrow already names the business. Shown without a photo too, on the bundled photo. Under high contrast: plate on navy. |
| **Logo rules** | PNG (transparency kept), JPEG or WebP. **No SVG** (the risk of scripts or external references; sharp would rasterise it anyway). Input at least 256 px on the short side, at most 2 MB, at most 4000×4000. Output: WebP with alpha, 256 and 128 px fit-inside, each at most 40 KB. The uploader confirms "This is my own business's logo, not another brand's." |
| **Hero photo rules** | Reuse `prepareHeroUpload`: at least 1080 px wide, at most 15 MB and 50 MP, JPEG/PNG/WebP/HEIC as the hero pipeline allows, decode check, EXIF/GPS/XMP stripped, sRGB. Variants: x2 1080 px wide WebP at most 150 KB (quality steps 72→50), x1 540 px at most 60 KB. No AVIF or wide master in v1 (the portal only shows a preview). Brightness warning shown, as the photo manager does. |
| **Moderation** | **Owner decision D-3 (2026-10-29): show immediately and review afterwards (post-moderation).** After server cleaning an upload is live at once; there is no pending state and no expiry. FitFlex admins see a "Partner photos" queue (To review · Live · Taken down) and either mark an item **Looks fine** or **Take down** with a reason code: `inappropriate`, `rights`, `other_brand`, `not_own_logo`, `person_request`, `quality`, or `other` (note required). The partner is notified on takedown. The partner can remove a live item at any time; a new upload replaces the live one. The Moderation & Promotion module is entity-level (gym/trainer/vendor hide or suspend), not media-level. So this reuses its **permission scope** (`moderation_decide` to decide, `moderation` to view). A gym or vendor that moderation has hidden or suspended keeps its home photo, since only the partner sees it. |
| **People and faces** | **Owner decision D-5 (2026-10-29): people and faces are allowed** in partner photos, because in v1 only the partner and their team see their own home. There is no people choice and no people or faces confirmation. The rights confirmation stays, and so does the own-logo confirmation for logos. The rules card advises asking recognisable people first (guidance, not a confirmation). **Must be revisited before any member-facing use (slice 5)**, together with Q-31 and counsel. |
| **Storage and takedown (the Q-31 answer for partner media)** | **Store the cleaned master and the variants in Postgres (`bytea`), not on Zebra.** Then removing a photo actually deletes it: the file rows (bytes) are deleted and the endpoint answers 404; a metadata row without bytes stays for audit and for the partner's "taken down" notice. The volume is small, about 250 KB per photo and 50 KB per logo, so a few hundred partners come to tens of MB. The original upload is never stored. **Approved by the owner 2026-10-29 (D-1).** (The rejected alternative was Zebra private-until-approved, like banners, which can't be deleted.) |
| **Serving** | *(Open question O-P1, spec §45.1: now that faces are allowed, the recommended v1 path is signed-in only, `GET /partner/media/:id/file`, with the public route left for slice 5.)* `GET /media/p/:fileId` is public and shows live items only. Each upload or variant gets a new random id, so `Cache-Control: public, max-age=31536000, immutable`. A removed item answers 404, and the app clears its saved copy on the next refresh. |
| **App fetch** | The app does not use the global manifest. Owner/trainer/vendor homes call `GET /partner/media` (signed in, own data) after the first frame. The live entries are saved with the existing `HeroImageStore` file mechanics: temp file then rename, decode check, at most 200 KB per photo and 64 KB per logo, Data Saver respected. The saved copy is used **when the home is next built or comes back into view** (spec §40.1), never swapped in mid-view. Offline: last saved copy, then the bundled photo. An empty answer, a 404 `feature_disabled`, or an item gone → clear saved copies → bundled photo. On web: no disk cache; network image only after `precacheImage` succeeds. |
| **Who can set whose** | Gym: an owner for gyms in their own `gymIds` (and active OrgMembership when `orgAuthzMode` enforces), or gym staff with scope `gyms` **at that gym**. Trainer: only the `TrainerProfile` whose `userId` = `req.user.sub`. Vendor: the vendor, or vendor staff with `vendorRole='admin'`. Admins: `brand_media` to set a photo or logo directly for any partner (live straight away, D-4 pattern, audit-logged, never in To review), `moderation_decide` to mark reviewed or take down, `moderation` to view. An admin can't mark an upload of their own as reviewed. **Reading** `GET /partner/media` is open to everyone who sees that home (any gym staff of that gym, any vendor staff); the answer carries `canEdit`. |
| **Analytics** | None. |

---

## 2. Cross-repo contract

**Media view (all partner and admin answers; updated for D-3 and D-5 on 2026-10-29, spec §44.4):**
```
MediaItem {
  id, kind: 'hero'|'logo', subject: { type: 'gym'|'trainer'|'vendor', id, name },
  status: 'live'|'replaced'|'removed'|'taken_down',
  origin: 'partner'|'fitflex',
  review: { state: 'to_review'|'reviewed', by?, byName?, at? },   // fitflex-origin items start 'reviewed'
  takedown: { reason, note?, by, byName, at } | null,
  width, height, focal: { x, y } (-1..1, hero only), bright: bool (hero only),
  plate: 'light'|'dark', plateChoice: 'auto'|'light'|'dark' (logo only),
  files: { x2?, x1?, logo256?, logo128? }   // live only, root-relative (path per O-P1)
  bytes: { x2?, x1?, logo256?, logo128? },
  uploadedBy, uploadedByName, uploadedByRole,
  confirmationVersion, rightsConfirmedBy/At/ByName, ownLogoConfirmedBy/At/ByName (logo),
  revision, createdAt, updatedAt
}
```
Removed from the earlier draft: `pending_review`, `rejected`, `withdrawn`, `expired`, `expiresAt`, `people`, `submittedAt`, `decidedAt`.

**Partner endpoints (new; flag off → `404 feature_disabled` before the auth check, as banners do)**

| Method and path | Who | Body / query | Answer |
|---|---|---|---|
| `GET /partner/media` | **read:** gym_operator, **any** gym_staff of that gym, trainer, vendor, **any** vendor_staff | `?gymId=` (required for gym roles) | `{ subject{type,id,name}, canEdit, hero: { live, lastTakedown }, logo: { live, lastTakedown }, confirmation: { version, status:'draft_pending_counsel', rights{en,sw}, ownLogo{en,sw} }, limits: { hero{minWidth,maxBytes,types[]}, logo{minSide,maxBytes,types[]} } }`. `lastTakedown` only when no live item is newer. ETag; 304 on If-None-Match |
| `POST /partner/media/hero` | **write:** gym_operator (own gym), gym_staff(`gyms` at that gym), trainer (own), vendor, vendor_staff(admin) | multipart `file`, `rightsConfirmed=true`, `confirmationVersion`, `focalX?`, `focalY?`, `gymId?` | `201 { item }` (`live`, `review.state: to_review`). In the same transaction the previous live item becomes `replaced` and its file bytes are deleted |
| `POST /partner/media/logo` | write, as above | multipart `file`, `rightsConfirmed`, `ownLogoConfirmed`, `confirmationVersion`, `plate?` (`auto` default), `gymId?` | `201 { item }`, same replace rule |
| `GET /partner/media/:id/preview?w=240\|480\|960` | the item's own subject only (read) | | WebP, `Cache-Control: no-store, private` |
| `DELETE /partner/media/:id` | write | | live → removed (bytes deleted; metadata row kept for audit, `sha256` cleared), `200 { item }` |

There is **no withdraw endpoint**: nothing is pending.

Errors (one Swahili and English text each in the app):
- **Permission and target:** `not_your_gym` 403, `acl_forbidden` 403, `subject_not_found` 404, `rate_limited` 429 (upload 10/min and 20/day per subject, O-P5).
- **Confirmations:** `confirmation_version_mismatch {current}`, `rights_confirmation_required`, `own_logo_confirmation_required`. `people_confirmation_required` and `invalid_people` are dropped.
- **The file itself:** `image_too_small {minWidth|minSide, width, height}`, `unsupported_file_type`, `svg_not_allowed`, `file_too_large {maxBytes}` 413, `variant_over_budget` 422, `invalid_focal`, `image_taken_down_before` 409 (same `sha256` as a taken-down item of this subject, O-P2).
- **State and service:** `not_editable` 409, `image_save_failed` 500.

**Public serving (new, no sign-in):** `GET /media/p/:fileId` returns the WebP bytes. It only serves files of `live` items, never masters, replaced, removed or taken-down files. *(O-P1: recommended to be signed-in only in v1; spec §45.1.)* Headers: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`. Anything else → 404.

**Admin endpoints (new; `requireAuth('admin')` plus the scope shown)**

| Method and path | Scope | Notes |
|---|---|---|
| `GET /admin/partner-media?tab=to_review\|live\|taken_down&type=&kind=&q=&subjectType=&subjectId=&cursor=` | `moderation` | `{ items[], total, next }` with subject name; To review = live partner uploads not yet reviewed, oldest first |
| `GET /admin/partner-media/:id/preview?w=` | `moderation` | no-store |
| `POST /admin/partner-media/:id/reviewed { revision }` | `moderation_decide` | "Looks fine": leaves To review; `409 stale_revision`, `403 own_upload` |
| `POST /admin/partner-media/:id/take-down { revision, reason, note? }` | `moderation_decide` | live → taken_down; bytes deleted at once; reason, note, who, when and `sha256` kept; the partner is notified. `reason_required`, `note_required` (for `other`), `invalid_reason`. Works on `origin: fitflex` items too |
| `GET /admin/partner-media/confirmation` | `brand_media` | `adminConfirmation{version, status, rights{en,sw}, partnerLogo{en,sw}}` |
| `POST /admin/partner-media` multipart `subjectType, subjectId, kind, file, rightsConfirmed, partnerLogoConfirmed (logo), adminConfirmationVersion, focalX?, focalY?, plate?` | `brand_media` | origin `fitflex`, live straight away, `review.state: reviewed`; same file rules; the partner is not notified (O-P3 = No) |
| `PATCH /admin/partner-media/:id { focal?, plate? }` | `brand_media` | |

`approve` and `reject` are gone (D-3).

Every write adds an `audit_log` row with before and after. Audit rows carry ids and hashes only, never file bytes.

**Partner notifications (reuse `partner-notifications`):**
- `partner_media.taken_down` (the reason line, never the note) only (O-P3 = No: no notice when FitFlex sets a photo), deep-linking to the photo and logo page (`/owner/brand-media?gymId=`, `/trainer/brand-media`, `/vendor/brand-media`).
- `approved`, `rejected`, `removed` and `expired` are dropped.
- Push titles in English and Swahili (wording in spec §44.3).

**Member-facing (slice 5 only, if D-2 says yes):** the public gym, trainer and storefront views gain `brandMedia: { hero: {x2,x1,width,height,focal}|null, logo: {logo256,logo128,plate}|null }`. This is additive. **Before slice 5, the people rule must be decided again (D-5 note):** v1 photos may show faces and were never confirmed people-free.

---

## 3. Slices

Every slice:
- has its own worktree and branch from `origin/release-candidate`, with `|| exit 1` on every step and `pwd` confirmed;
- opens a PR into `release-candidate`;
- ends at a **STOP for go-ahead**.

### Slice 0: design spec addendum (design-agent, parent repo)
- **Branch:** `docs/partner-hero-media` (parent; a docs branch, not `feat/`).
- **Adds §39–§45 to `/Users/chollo/FitFlex/docs/design/photo-hero-screens.md`:**
  - band anatomy with the logo plate (all three homes, phone and 840 px wide and up, light and dark, high contrast);
  - the "Home photo and logo" settings page: states for empty/default, uploading, live, taken down with reason, error, offline and staff without access (no pending, rejected or expired states after D-3);
  - the upload sheet: crop preview at band ratio, focal tap, the confirmation texts exactly as the server sends them (no people choice after D-5);
  - the portal "Partner photos" review queue, takedown dialog and the "Set photo for this partner" dialog on the gym, trainer and vendor admin pages;
  - where the settings entry sits: owner → Profile (`owner_profile_page.dart`, per gym picked), trainer → profile or prefs menu, vendor → business profile.
- **Also:** copy (§5), acceptance criteria AC-P*, and the owner's photo guidance for partners (people, other brands, signage, text in the image).
- **STOP:** the owner approves the spec. (Decisions D-1 to D-8 answered 2026-10-29, §6.)

### Slice 1: backend (backend-builder)
- **Branch:** `feat/partner-hero-media` (fitflex-functions).
- **Needs `security-and-privacy-reviewer`:** new serving route (public or signed-in, O-P1), new signed-in upload routes, tenant isolation, privacy of people in photos (faces allowed, D-5), post-moderation takedown.
- **Migration:** `db/migrations/20270122090000-partner-media.cjs`. Builder: re-check that it comes after the newest migration on RC; currently that is `20270121090000-b2b-member-requests.cjs`. It is additive and reversible.
  - `PartnerMedia`:
    - **Identity:** `id`, `subjectType` (check gym/trainer/vendor), `subjectId`, `kind` (hero/logo), `origin`.
    - **State and review:** `status` (live/replaced/removed/taken_down), `revision`, `reviewState` (to_review/reviewed), `reviewedBy`, `reviewedAt`, `reason`, `reasonNote`, `decidedBy`, `decidedAt` (takedown).
    - **Image facts:** `width`, `height`, `focalX`, `focalY`, `textZoneMean`, `textZonePatch`, `sha256`.
    - **Confirmations and authorship:** `confirmationVersion`, `rightsConfirmedBy/At`, `ownLogoConfirmedBy/At`, `uploadedBy`, `createdAt`, `updatedAt`.
    - **Indexes and checks:** partial unique index for one `live` item per (`subjectType`, `subjectId`, `kind`); index on (`status`, `reviewState`, `createdAt`). Check: `plate` and `plateChoice` are null unless `kind='logo'`; `focalX/Y` null unless `kind='hero'`.
  - `PartnerMediaFile`: `id` (random, public), `mediaId` FK ON DELETE CASCADE, `variant` (master/x2/x1/logo256/logo128), `contentType`, `byteLength`, `data bytea`.
- **Files:**
  - new: `src/services/partner-media-service.mjs`, `src/infra/partner-media-store-pg.mjs`, `functions/partner-media.mjs`, `src/shared/partner-media-rules.mjs` (limits, confirmation texts and version, reason codes);
  - extend `src/infra/hero-image-file.mjs`: `prepareLogoUpload` (alpha kept, no SVG) and a `buildPartnerHeroVariants` (x2/x1 only) that calls the same encoder;
  - `src/bootstrap/services.mjs`;
  - a feature-flag entry;
  - the partner-notifications hooks;
  - no lifecycle job (no expiry after D-3).
- **Tenant checks in the service, not only in guards:**
  - gym `subjectId` must be in `ownerGymIds(effectiveOperator)`;
  - gym staff need `gyms` at that gym;
  - trainers are found by `userId`;
  - vendor staff must be active with role admin for that vendor;
  - a preview id from another subject → 404, not 403.
- **Env:** `PARTNER_MEDIA` (off). No new secrets.
- **Tests:** `specs/partner-media.specs.mjs`
  - flag off → 404 on every route, including `/media/p/*`;
  - every role allowed and refused, with the owner of gym A refused on gym B and staff without `gyms` refused;
  - vendor staff who are not admins are refused; a trainer can't touch another trainer's profile;
  - an EXIF/GPS fixture comes back stripped; SVG refused; too-small files refused; byte budgets kept;
  - an upload is served at once (to the allowed readers, per O-P1); replace → old files 404 in the same transaction; partner remove and admin take-down → files 404 and bytes gone, metadata row kept;
  - staff of the gym without `gyms` can read `GET /partner/media` (`canEdit: false`) but not write;
  - the same file as a taken-down item is refused (`image_taken_down_before`);
  - `reviewed` on your own upload refused (`own_upload`); stale revision → 409; take-down needs a reason, and a note for `other`;
  - ETag/304; audit rows; Swahili and English confirmation texts both present (rights, ownLogo, admin rights, partnerLogo); no people fields accepted or returned.
- **Test environment:** run only with `FITFLEX_USE_CI_DB=1` against a fresh `fitflex_ci_partnermedia_*` database, after printing and checking the DB name. Note the known flaky specs (b2b-lifecycle after 22:00 UTC, `vendor-documents.specs.mjs:990`).
- **PR call-outs (rule 6):**
  - new endpoints;
  - a new public unauthenticated route;
  - `src/auth/*` is **not** changed (guards are reused);
  - no pricing, payout or check-in change.
- **STOP.**

### Slice 2: portal (portal-builder)
- **Branch:** `feat/partner-hero-media` (fitflex-portal). **Needs `security-and-privacy-reviewer`** (admin upload and review UI).
- **Files:**
  - new `app/admin/partner-media/page.tsx` (queue, with tabs To review, Live, Taken down);
  - `src/components/partner-media-review.tsx`: previews at band ratio, reusing the scrim and preview code from `hero-image-manager.tsx` and `shop-banner-preview.tsx`; the logo shown on its plate;
  - `src/components/partner-media-set-dialog.tsx`, opened from the gym, trainer and vendor detail views in `app/admin/gyms|trainers|vendors/page.tsx`;
  - `src/lib/api.ts`;
  - `Shell.tsx` nav item "Partner photos" (`aclScope: 'moderation'`), behind `NEXT_PUBLIC_PARTNER_MEDIA_ADMIN`;
  - `src/lib/i18n.ts`.
- **Behaviour:**
  - Looks fine and Take down send `revision`.
  - Take down needs a reason code (and a note for `other`).
  - Looks fine is disabled on your own upload.
  - Every error code has English and Swahili text.
  - Previews are fetched with the session token and never given a public URL.
- **Tests:** `tests/e2e/partner-media.spec.ts` with the API mocked: scope gating (moderation vs moderation_decide vs brand_media), own-upload block, take-down needs a reason, Swahili toggle, no public image URL in the DOM.
- **STOP.**

### Slice 3: mobile, showing it on partner homes (mobile-builder)
- **Branch:** `feat/partner-hero-media-home` (fitflexmobile).
- **Files:**
  - new `lib/shared/partner_media/partner_media_store.dart`: reuse the `hero_image_files_*` io/web split, `device_data`, the size caps and the decode check; key by subject and item id;
  - new `partner_media_flag.dart`;
  - `ff_photo_hero.dart`: `FFHeroBand` gains a `logo` slot rendered on the plate (the existing `logo` prop is panel-only today);
  - `owner_home_tab.dart` (per picked gym), `trainer_home_page.dart`, `vendor_home_page.dart`;
  - `api_client.dart` (`partnerMedia({gymId})`);
  - workflows: `partner_media` input on `distribute-android.yml`.
- **Address check:** `/media/p/<id>` paths only, using the same rule as `heroAssetUri` (root-relative, same host, no escapes).
- **Rules:**
  - Bundled photo on the first frame. A saved photo is used when the home is next built or comes back into view (route pop, tab switch, gym switch), never swapped while on screen (spec §40.1).
  - Switching gyms uses that gym's saved photo, or the bundled photo; no mid-view swap.
  - A footer never repeats the top photo's scene. Partner photos aren't in the footer pool, so the footer keeps the bundled pool.
- **Flags:** build-time `PARTNER_MEDIA_UI`, which needs `PHOTO_HERO_UI` (already on). Off means no request, no store, and the path is absent from the web JS. The app also treats `404 feature_disabled` as off.
- **Tests:**
  - flag off: no request, no change;
  - with a live photo and logo: rendered when the home is next built or comes back into view, logo plate present (light or dark per `plate`) and hidden from screen readers;
  - removed item → saved copy cleared → bundled photo;
  - oversize or corrupt file → bundled photo;
  - gym switch;
  - high contrast; Swahili; web path.
- **STOP.**

### Slice 4: mobile, the partner's own upload in Settings (mobile-builder)
- **Branch:** `feat/partner-hero-media-upload` (fitflexmobile). **Needs `security-and-privacy-reviewer`** (upload from the device; people allowed in v1, D-5).
- **Files:**
  - new `lib/screens/partner/partner_media_page.dart`, shared by all three roles: routes `/owner/brand-media`, `/trainer/brand-media`, `/vendor/brand-media` in `router.dart`;
  - entry rows in `owner_profile_page.dart`, the trainer prefs or profile menu, and the vendor business profile;
  - a new picker mode that sends the original bytes over multipart (the server cleans them). It doesn't reuse `FFPhotoPickerField`, whose 800 px base64 output is too small;
  - `api_client.dart` multipart methods modelled on `vendorUploadShopBannerImage`;
  - `i18n.dart`.
- **Behaviour:**
  - Shows the live item, or the last takedown with its reason and note; replace; remove with a confirmation (spec §41.3).
  - The confirmation texts are shown exactly as the server sends them.
  - Gym staff without `gyms` see no entry.
  - Notification deep links.
- **Tests:**
  - every state;
  - submit blocked until the boxes are ticked;
  - version-mismatch reload;
  - error mapping for every code in English and Swahili;
  - staff without access see no entry.
- **Needs a real device:** camera and HEIC from iOS.
- **STOP.**

### Slice 5 (later, only if D-2 is yes): member-facing
- **Branches:** `feat/partner-media-public` in functions and mobile.
  - Adds `brandMedia` to the public gym, trainer and vendor views.
  - The vendor storefront uses the live (reviewed) photo and logo instead of the unreviewed `banner` / `logo`.
  - Gym and trainer detail: logo only, next to the name. No top hero, because DD-8 and D-1 hold.
- **Needs `security-and-privacy-reviewer`.**
- **STOP.**

### Deploy order and flags
- **Order:** functions (1) → portal (2) → mobile (3, then 4) → parent submodule re-point PR. Promotion to `main` only on the owner's go-ahead, re-checking the RC head first.

| Flag | Where | Default |
|---|---|---|
| `PARTNER_MEDIA` | server env (new) | off |
| `NEXT_PUBLIC_PARTNER_MEDIA_ADMIN` | portal build (new) | off |
| `PARTNER_MEDIA_UI` | mobile build (new; needs `PHOTO_HERO_UI`) | off |

### Who does what
| Slice | Agent | Reviews after the PR |
|---|---|---|
| 0 | design-agent | — |
| 1 | backend-builder | security-and-privacy-reviewer, contract-checker, i18n-swahili-auditor |
| 2 | portal-builder | security, contract, i18n |
| 3, 4 | mobile-builder | security (4), contract, i18n; then design-qa and uat-tester on Flutter web from RC against an isolated DB with fixture partners |
| 5 | backend-builder + mobile-builder | security, contract, i18n |
| merge and promote | release-captain | — |
| after release | docs-and-tracker-sync | — |

---

## 4. Risks
- **Database storage:** about 300 KB per partner across photo and logo. Our server carries the image traffic, but the `immutable` cache and the app's saved copies keep repeat traffic near zero. Backups get slightly bigger.
- **Review workload (post-moderation, D-3):** nobody waits on the queue, but anything unsuitable is visible to the partner's own team until an admin sees it. Mitigations: To review is sorted oldest first, the upload rate is capped (O-P5), and the same file can't come back after a takedown (O-P2).
- **Faces in real gym photos (allowed, D-5):** partners will upload photos with members in them. In v1 only the partner's team sees them; reason `person_request` lets FitFlex take one down when someone asks. **Before any member-facing use (slice 5)** the people rule must be decided again.
- **Shared files:** other sessions touch `vendor_home_page.dart`, `owner_home_tab.dart` and `ff_photo_hero.dart`. Rebase before merging.
- **The Zebra and vendor-src findings in §0.4** exist today, independent of this feature.

## 5. New strings (English / Swahili, Swahili drafts for native review)

Updated 2026-10-29 for D-3 (show now, review afterwards) and D-5 (people allowed). The full tables are in spec §44.1 (mobile), §44.2 (portal) and §44.3 (server texts); the key strings are below.

**Removed:**
- `partnerMedia.withdraw`, `.pending`, `.pendingNote`, `.rejected`, `.expired`, `.people.none` / `.handsBacks`;
- portal `.approve` / `.reject`;
- the server `people` confirmation;
- the "no recognisable faces" rule.

| Key | English | Swahili |
|---|---|---|
| `partnerMedia.entry` | Home photo and logo | Picha ya mwanzo na nembo |
| `partnerMedia.hero` | Home photo | Picha ya mwanzo |
| `partnerMedia.logo` | Logo | Nembo |
| `partnerMedia.upload` / `.uploadLogo` | Upload photo / Upload logo | Pakia picha / Pakia nembo |
| `partnerMedia.replace` | Replace | Badilisha |
| `partnerMedia.remove` | Remove | Ondoa |
| `partnerMedia.live` | Showing on your home | Inaonekana kwenye ukurasa wako wa mwanzo |
| `partnerMedia.default` | Using the FitFlex photo | Inatumia picha ya FitFlex |
| `partnerMedia.replaceNote` | The new one replaces the current one straight away, and the old one is deleted. | Mpya itachukua nafasi ya iliyopo mara moja, na ya zamani itafutwa. |
| `partnerMedia.reviewNote` | It shows on your home straight away. FitFlex checks new photos and may take one down if it breaks the rules below. We'll tell you why. | Inaonekana kwenye ukurasa wako wa mwanzo mara moja. FitFlex hukagua picha mpya na inaweza kuondoa picha inayovunja kanuni zilizo hapa chini. Tutakueleza sababu. |
| `partnerMedia.takenDown.hero` / `.logo` | FitFlex took down your home photo. / FitFlex took down your logo. | FitFlex imeondoa picha yako ya mwanzo. / FitFlex imeondoa nembo yako. |
| `partnerMedia.takenDown.reason` / `.note` | Reason: {reason} / Note from FitFlex: {note} | Sababu: {reason} / Ujumbe kutoka FitFlex: {note} |
| `partnerMedia.rules.people` | People are fine. Ask anyone who can be recognised before you use their photo. | Watu wanaruhusiwa. Muulize kwanza mtu yeyote anayetambulika kabla ya kutumia picha yake. |
| `partnerMedia.rules.brands` / `.text` / `.suitable` / `.size` | No other brands' logos or signs. Your own is fine. / Keep text out of the photo; your home already shows your name. / Nothing unsuitable: no nudity, violence or offensive content. / At least 1080 pixels wide. Landscape photos work best. | Hakuna nembo wala mabango ya chapa nyingine. Yako mwenyewe inaruhusiwa. / Usiweke maandishi kwenye picha; ukurasa wako tayari unaonyesha jina lako. / Hakuna kisichofaa: uchi, vurugu au maudhui ya kuudhi. / Upana wa angalau pikseli 1080. Picha za mlalo zinafaa zaidi. |
| `partnerMedia.rules.logo` | PNG, JPEG or WebP, at least 256 pixels on the short side, up to 2 MB. Your own business's logo only. | PNG, JPEG au WebP, angalau pikseli 256 upande mfupi, hadi MB 2. Nembo ya biashara yako tu. |
| `partnerMedia.reason.*` | `inappropriate` / `rights` / `other_brand` / `not_own_logo` / `person_request` / `quality` / `other`: one partner-facing line each (spec §44.1) | one each |
| `partnerMedia.error.*` | one per error code, including `image_taken_down_before` | one per error code |
| portal `admin.nav.partnerMedia` | Partner photos | Picha za washirika |
| portal `partnerMedia.tab.toReview` / `.live` / `.takenDown` | To review / Live / Taken down | Za kukagua / Zinazoonekana / Zilizoondolewa |
| portal `partnerMedia.looksFine` / `.takeDown` / `.setPhoto` | Looks fine / Take down / Set photo for this partner | Iko sawa / Iondoe / Weka picha kwa mshirika huyu |

Confirmation texts (`rights`, `ownLogo`, and the admin `rights` / `partnerLogo`) are server strings in English and Swahili, marked `draft_pending_counsel`; the proposed wording is in spec §44.3. There is no people confirmation.

## 6. Decisions (owner answers 2026-10-29)
- **D-1. Database storage, so removing one really deletes it.** **Yes.** v1 shows them only on the partner's own home: owner home per gym, trainer home, vendor Products tab.
- **D-2. Own home first; member-facing in slice 5.** **Yes** (as D-1).
- **D-3. Approve first, or show now and review afterwards?** **CHANGED: show immediately, review afterwards (post-moderation).**
  - An upload goes live right away after server cleaning.
  - FitFlex admins get a "Partner photos" queue of recent uploads and can take one down, with a reason code, at any time; the partner is notified.
  - There is no pending or approval state and no 14-day expiry. Replace (the newest live one replaces the old) and the partner's Remove stay.
- **D-4. Who decides.** **Yes, adapted:** `moderation_decide` takes down (and marks "Looks fine"); `brand_media` sets a photo or logo directly for a partner, live straight away.
- **D-5. Faces.** **CHANGED: people and faces are allowed** in partner photos, because only the partner sees their own home in v1. The people and no-faces confirmation is removed; the rights confirmation and the own-logo confirmation stay.
  - **Note (2026-10-29):** this must be revisited before any member-facing use (slice 5), with Q-31 and counsel.
- **D-6. 14-day expiry and the "2 working days" notice.** **Dropped:** nothing is pending.
- **D-7. Gym staff with `gyms` at that gym, and vendor admin staff, may upload.** **Yes.**
- **D-8. Existing vendor `banner` / `logo` unchanged until slice 5.** **Yes.** The src-check fix PR (§0.4) was not answered separately: it is still recommended as a plain fix and needs the owner's go.

**New questions raised by the decisions** (spec §45.1, defaults in brackets):
- **O-P1.** Serve files signed-in only in v1, now that faces are allowed? **Owner 2026-10-29: Yes**
- **O-P2.** Refuse re-uploading a file that was taken down? **Owner 2026-10-29: Yes**
- **O-P3.** Notify the partner when FitFlex sets their photo? **Owner 2026-10-29: No**
- **O-P4.** Keep an evidence copy after a takedown? **Owner 2026-10-29: No**
- **O-P5.** Upload rate cap? [10 a minute and 20 a day per subject] **Owner 2026-10-29: Yes**

## 7. Known gaps to keep in view
- **Photo flags:** `HERO_IMAGES_CMS`, `HERO_IMAGES_REMOTE` and `NEXT_PUBLIC_HERO_IMAGES_ADMIN` are still off. The admin photo manager is dormant, so the "global role slot" step in the precedence only applies once those are on.
- **Swahili:** native review is still owed on all photo-hero and partner strings.
- **Legal:** the confirmation texts and Q-31 depend on Tanzanian counsel; the legal texts are still drafts.
- **Settlement:** vendor settlement exists but hasn't been tried by hand. Trainer statements are live.
- **Devices:** camera, HEIC and real-device rendering are "needs a real device". iOS hasn't been released.

**Relevant paths**
- `/Users/chollo/FitFlex/docs/plans/photo-hero-sections-footer-admin-plan.md`
- `/Users/chollo/FitFlex/docs/design/photo-hero-screens.md` (§25, §36)
- Backend:
  - `/Users/chollo/FitFlex/fitflex-functions/functions/shop-banners.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/docs/shop-banners-api.md`
  - `/Users/chollo/FitFlex/fitflex-functions/src/infra/hero-image-file.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/src/services/hero-image-service.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/src/shared/hero-slots.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/functions/storage.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/src/services/shop-service.mjs` (lines 24, 161–186)
  - `/Users/chollo/FitFlex/fitflex-functions/src/auth/org-authz.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/functions/owner-gyms.mjs`
  - `/Users/chollo/FitFlex/fitflex-functions/src/services/portal-user-service.mjs`
- Mobile:
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/components/ff_photo_hero.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/hero_images/`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/components/ff_remote_image.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/widgets/ff_photo_picker_field.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/widgets/shop_browse_page.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/screens/owner/owner_home_tab.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/screens/owner/owner_profile_page.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/screens/trainer/trainer_home_page.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/screens/vendor/vendor_home_page.dart`
  - `/Users/chollo/FitFlex/fitflexmobile/lib/shared/api_client.dart` (`vendorUploadShopBannerImage`, around line 2217)
- Portal:
  - `/Users/chollo/FitFlex/fitflex-portal/src/components/hero-image-manager.tsx`
  - `/Users/chollo/FitFlex/fitflex-portal/src/components/shop-merch-detail.tsx`
  - `/Users/chollo/FitFlex/fitflex-portal/app/admin/gyms/page.tsx`
  - `/Users/chollo/FitFlex/fitflex-portal/app/admin/trainers/page.tsx`
  - `/Users/chollo/FitFlex/fitflex-portal/app/admin/vendors/page.tsx`