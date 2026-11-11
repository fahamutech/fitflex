# Photo-hero increment plan: section heroes, footer band, admin-managed photos

> **Owner decisions 2026-10-19:** D-1 footer only on gym/trainer detail (no stock top hero) · D-2 footer = wordmark + "That's all for now." / "Hiyo ndiyo yote kwa sasa." (+ Back to top on Gyms/Trainers/Shop) · D-3 member screens only (default) · D-4 any admin with `brand_media` publishes alone (audit + one-click rollback) · D-5 rotation per day (default) · Release: build the photo manager (slices 4–6) now behind flags; include in next release only if it passes security review in time.

Recommended plan, written from `origin/release-candidate` in all four repos on 2026-10-19. I changed no files.

**Where things stand.** The addendum screens are on mobile RC (mobile#179). `PHOTO_HERO_UI` and `NEXT_PUBLIC_PHOTO_HERO_UI` are both off in production. The hero photos already bundled come to 1.07 MB against a 1.6 MB budget (§26). Decisions already made stay as they are: bundled photos, no network request on first launch, the always-dark scrim, no identifiable faces, licence table required ("no row, no ship").

**Short answer to the owner's third question: not today.** Every hero photo is built into the app (the `FFHeroPhoto` enum loading `AssetImage`). Changing one needs a new app build. Slices 4–6 below make it self-serve from the portal.

---

## 1. What to build, and why

### Request 1: more photos in Gyms, Trainers and Marketplace

**Where heroes go**
- **Gyms list** (`member_gyms_tab.dart`): a `band` hero at the top. It replaces the "Discover gyms" page title; the Trainers button moves onto the hero as a secondary button.
- **Trainers list** (`member_trainers_tab.dart`): a `band` hero.
- **Shop home** (`ShopHomeView` in `lib/shared/widgets/shop_home/shop_home_page.dart`, which is live with `SHOP_HOME_V2`): a `band` hero above the category row.
- Bands are inset cards, not full-width heroes, so the search field and filters stay near the top. They scroll away with the page.

**No top hero on gym detail or trainer detail.** Both pages already open with the partner's own photo gallery (`_GymHero` → `PhotoGallery`, and `trainer-section-gallery`). A stock photo above a named gym would read as that gym's photo, which goes against design decision DD-8. These pages get the footer band only.

**Avoiding a clash with Shop Home V2**
- The shop hero is a static brand band, shown only when `ShopHomeView` renders and the page is the member shop (a `showHero` parameter; trainer and owner shops pass false).
- It is not shown on the `ShopBrowsePage` fallback.
- When Shop Phase 3 adds banners (`FFHeroCarousel`, not built yet), the carousel replaces this band whenever the feed has at least one active banner. The band is the carousel's fallback.
- Both already share one scrim implementation (`FFPhotoHero` compact/band), as the photo-hero spec §3.2 asks.

**More photos per section**
- While photos are bundled, each slot keeps one photo, because of the bundle budget.
- Real rotation (1–5 photos per slot, a stable pick per day) comes with the admin CMS (slice 6). There it adds nothing to the app size.

### Request 2: footer photo band

**New component `FFPhotoFooter`** in `lib/shared/components/ff_photo_footer.dart`
- A sliver placed last in the scroll content. The photo uses the `band` look with 24px corners, sitting inside the page padding.
- Height: 160 on phones (clamped 140–200), 220 at 840px wide and above.
- Scrim fixed at 0.80 behind the text. Contains the FitFlex wordmark (hidden from screen readers) and one sign-off line. On Gyms, Trainers and Shop only, it also has an `onPhoto` small "Back to top" button.

**Which pages**
- Every page that has a top hero and scrolls: member Home, Activity (all four sections), Profile, Upgrade plan, Gyms, Trainers, Shop home, and the trainer, vendor and owner homes.
- Plus gym detail and trainer detail.
- Never on: Language, Role, Sign in, Sign up, PIN and PIN flows (these are forms or pinned keypads), checkout, payment, QR, chat, sheets, or the admin portal.

**Always a different photo from the top**
- A small bundled pool of four footer photos (16:7, about 40 KB each at 2×).
- Each page passes its top photo. The footer picks from the pool by a hash of the route, skipping any photo from the same original as the top, even if cropped differently.
- Bundled photos therefore get a `sourceId` field. A test checks every footer page.

**Short pages**
- The footer shows only if the content plus the footer is taller than the screen. This is decided once, at layout time, from the content height above it, so it cannot flicker.
- A page that doesn't scroll has no "bottom" to signal, and showing it there would put a second photo next to the top hero or an empty-state band.
- On lists, it shows only once loading has finished and the list isn't empty. Gyms and Trainers load in full, with no paging. On Shop, it comes after the last rail.

**Bottom navigation and floating buttons**
- The footer sits inside the scroll content, so it ends above the member `NavigationBar`, with the bottom safe-area inset added.
- Extra bottom padding equal to the vendor "Add product" button height, or the shop's sticky cart bar height, so neither covers the footer text.

**Performance**
- The sliver is built lazily, so nothing is decoded until the user nears the bottom.
- Photo is decoded at display size, fades in over 250ms (instant when reduced motion is on).
- No parallax effect.
- Under high contrast: navy background with text only, no photo.
- Bundled, so no data cost. In the later remote mode, footers only use photos already saved on the phone.

**Accessibility**
- The photo and the wordmark are hidden from screen readers.
- The sign-off line is one plain text node, not a heading.
- "Back to top" is a labelled button with a minimum 44px touch target. It moves focus to the hero heading.

**Flag**
- New sub-flag `PHOTO_FOOTER_UI`, set at build time. It only takes effect when `PHOTO_HERO_UI` is also on.
- Why a separate flag: the owner can switch heroes on without footers if the footer gets a different verdict.
- Add a `photo_footer` input to `distribute-android.yml` for tester builds.

### Request 3: changing photos from the portal

**Data model**
- A photo library, plus a list of photos per slot, plus published snapshots.
- A slot is a named place in the app, such as `gyms`, `footerPool` or `portalLogin`.
- Editing a slot only changes the draft. "Publish" freezes every slot into a snapshot, and the app reads the latest snapshot.
- Rollback means re-publishing an earlier snapshot. The snapshot id doubles as the cache tag (ETag) the app uses to check for changes.

**No light/dark variants per photo.** The hero is dark in both themes, and readability is guaranteed for any photo (DD-9). This is also why letting admins change photos is safe.

**Storage: private until published**
- Uploads go through the existing private Zebra store (`createZebraDocumentStore` in `src/infra/storage-client.mjs`, the one KYC uses).
- Only on Publish does the server create the public WebP/AVIF versions and upload them to the public Zebra path (`/storage/:cid/:filename`).
- Why: Zebra serves any file to anyone who knows its id. A rejected photo showing a face must never get a public address.
- The admin preview streams the private file to signed-in admins, as KYC does.

**Image processing**
- The current `/storage/upload` makes 1280px q82 files, which miss the 150 KB budget, so it is not reused.
- A new admin-only upload rotates the image and strips EXIF/GPS (sharp's default; never `withMetadata`). It rejects images under 1080px wide, caps input at 50 MP and 15 MB, and checks the file really decodes as an image.
- Publish produces:
  - 2×: 1080 wide, WebP, quality stepped down from 72 to 50 until ≤150 KB
  - 1×: 540 wide, ≤60 KB
  - wide master: up to 1600, used by desktop and portal
  - an AVIF copy for the portal
- It also measures how bright the text area of the photo is. If it averages above 0.20 (spec §8.3), the admin sees a warning but can still publish.

**Roles**
- New permission scope `brand_media`. Recommended default: one admin with it can upload, edit and publish.
- Every action is written to `audit_log`, and rollback is one click.
- Whether to require a second approver is decision D-4.

**App behaviour**
- Bundled photos always show on first launch. The app fetches the photo list after the first frame. A photo is used only once it is fully saved and has decoded, and only the next time that screen is built, never in the middle of viewing.
- If the server sends an empty list (flag off or kill switch), the app deletes its saved photos and goes back to bundled ones.

---

## 2. Slices

Each slice has its own branch from `origin/release-candidate`, a PR into RC, its own worktree (never switch branches in a shared checkout), and a **STOP** for the owner's go-ahead.

### Next release: slices 0–3 (mobile; portal only if the login photo changes)

#### Slice 0: spec addendum 2 (design-agent, parent repo)
**Branch:** `docs/photo-hero-sections-footer` (parent). Docs, so not `feat/`.

**Adds §31–§38 to `docs/design/photo-hero-screens.md`:**
- Gyms, Trainers and Shop bands: copy, layout, states. Covers the Shop V2 coexistence rule above, and search focus and empty states.
- `FFPhotoFooter`: anatomy, short-page rule, list of pages, padding next to the floating button and cart bar, focus and semantics.
- Stand-in crops from the photos not yet used in `social/brand/photos` (10376250, 33832204, 34043570, 36510739/44, 4173217, 5592605, 5647574, 5878659, 6388369, 6496099, 6604154, 8612491), checked for no faces and for the adjacency rule.
- Bundle math: about +0.26 MB for the three tops and +0.20 MB for four footers, giving about 1.53 MB of 1.6 MB. If it goes over, drop 1× variants for footers.
- **Photo intake guide for the owner** (see §6).
- Admin CMS screen spec: slots grouped by area, upload form, focal-point picker, previews at three sizes using the real scrim CSS, publish diff, history and rollback.
- Acceptance criteria AC-L*, AC-M*, AC-N*.

**STOP:** owner approves the copy, page list and decisions D-1 to D-3.

#### Slice 1: section heroes (mobile-builder)
**Branch:** `feat/photo-hero-sections` (fitflexmobile)

**Files likely touched**
- `lib/shared/components/ff_photo_hero.dart`: new enum values `gyms`, `trainers`, `shop`, plus a `sourceId` field on every value.
- `lib/screens/member/member_gyms_tab.dart`, `member_trainers_tab.dart`.
- `lib/shared/widgets/shop_home/shop_home_page.dart`: `showHero` parameter. `member_shop_tab.dart` passes true.
- `member_shell.dart`: pre-cache the three new photos after the existing ones.
- `lib/shared/i18n.dart`.
- `assets/photos/hero/` (+ `2.0x/`), new rows in `LICENSES.md`, `pubspec.yaml` only if a new folder is added.

**Tests:** new `test/photo_hero_sections_test.dart`
- Flag off: no change, and existing keys (`gym-page-scroll`, `member-find-trainer`, `shop-home-section-*`) still work.
- Flag on: band rendered; the shop with `SHOP_HOME_V2` on and off; trainer and owner shops have no hero.
- Report the build size change in the PR.

**No backend change, no endpoint change.** **STOP.**

#### Slice 2: footer band (mobile-builder)
**Branch:** `feat/photo-hero-footer` (fitflexmobile). Can be built alongside slice 1; merge after it.

**Files likely touched**
- New `lib/shared/components/ff_photo_footer.dart` and `lib/shared/photo_footer_flag.dart`.
- Pages: member Home, Activity, Profile, Upgrade plan, Gyms, Trainers, Shop home, gym detail, trainer detail, trainer, vendor and owner homes.
- Four footer-pool photos and their `LICENSES.md` rows.
- `.github/workflows/distribute-android.yml`: new `photo_footer` input.

**Tests:** new `test/photo_footer_test.dart`
- Hidden on a page that doesn't scroll; shown after the content on a page that does.
- Never the same source photo as the top hero (one loop over every footer page).
- Hidden while loading or empty.
- Padding next to the floating button and the cart bar.
- High contrast; screen-reader tree (photo and wordmark hidden, one text node).
- "Back to top" scrolls and moves focus.

**STOP.**

#### Slice 3: owner photos in (mobile-builder; portal-builder only if the login photo changes)
**Branch:** `feat/photo-hero-owner-photos` in fitflexmobile, plus the same name in fitflex-portal if needed.

- Assets-only PR. Design-agent prepares the crops, focal points and grading per §8.3, strips metadata, and adds the `LICENSES.md` rows (photographer, place, partner-gym consent reference if any, "no face in frame" statement).
- **Blocked on the owner's photos.** Slices 1 and 2 ship with stand-ins until then.

**STOP.**

> **Release boundary.** Slices 0–3 can make the next release, all hidden behind flags that are off. Slices 4–6 should not be rushed into it: they add a public endpoint, an admin upload and app-side downloading, and need security review. They can land on RC dormant while the release goes out, but should not block it.

### Later release: admin-managed photos (slices 4–6)

#### Slice 4: backend CMS (backend-builder)
**Branch:** `feat/hero-images-cms` (fitflex-functions). **Needs `security-and-privacy-reviewer`.**

**Migration:** `db/migrations/20261230090000-hero-images.cjs`

| Table | Columns |
|---|---|
| `hero_images` | `id`, `privateKey` (Zebra document key; never leaves the server), `status` (`draft` \| `published` \| `retired`), `width`, `height`, `focalX`, `focalY` (each -1..1), `variants` (jsonb: `{url2x, url1x, urlWide, urlAvif, bytes2x, bytes1x}`, set at publish), `textZoneLuminance`, `source`, `photographer`, `licence`, `licenceRef`, `people` (`none` \| `hands_backs` \| `unclear_faces`), `consentRef` (nullable; partner-gym consent), `rightsConfirmedBy/At`, `noFacesConfirmedBy/At`, `createdBy`, `createdAt`, `updatedAt` |
| `hero_slot_drafts` | `slotId`, `imageId`, `position`; primary key (`slotId`, `imageId`) |
| `hero_publications` | `id`, `slots` (jsonb), `publishedBy`, `publishedAt`, `note`, `rolledBackFrom` (nullable) |

**Other files**
- `src/infra/knex-store.mjs`: column allowlists for the new tables.
- New `src/shared/hero-slots.mjs`: registry of `id`, `surface` (mobile/portal), `variant`, `aspectHint`, `maxImages`. It mirrors the `FFHeroPhoto` names, plus `footerPool` (up to 8) and `portalLogin`.
- New `src/services/hero-image-service.mjs`, new `functions/hero-images.mjs`.
- `src/bootstrap/services.mjs`.
- `src/services/portal-user-service.mjs`: add `brand_media` to `PORTAL_ACL_SCOPES`.
- `specs/portal-acl-scopes.specs.mjs` picks the new scope up.

**Endpoints.** These are new endpoints, a new public unauthenticated route and a new permission scope, so the PR must call them out per CONTRIBUTING.md.

```
GET  /app/hero-images                       public, no auth
  200 { version: <publicationId|0>, publishedAt,
        slots: { [slotId]: [{ id, sourceId, url, url1x, urlWide, width, height,
                              bytes, focal: { x, y } }] } }
  Headers: ETag "hp_<publicationId>"; Cache-Control: public, max-age=300, stale-while-revalidate=86400
  304 on If-None-Match. Flag off -> 200 { version: 0, slots: {} } (client purges).
  Never returns licence, uploader, drafts or private keys. Kept in server memory for 60s.

All below: requireAuth('admin') + requireAcl('brand_media'); flag off -> 404
GET   /admin/hero-images                    -> { images[], slots[{ id, surface, variant, draft[], published[] }], publications[last 20] }
POST  /admin/hero-images                    multipart: file + source, photographer, licence, licenceRef?, people, consentRef?,
                                            rightsConfirmed=true, noFacesConfirmed=true
                                            -> 201 { image }  | 400 rights_confirmation_required | no_faces_confirmation_required
                                            | image_too_small | unsupported_file_type | 413 file_too_large | 503 storage_service_unavailable
GET   /admin/hero-images/:id/preview        streams the private file (Cache-Control: no-store, private)
PATCH /admin/hero-images/:id                { focal?, source?, photographer?, licence?, licenceRef?, people?, consentRef?, status: 'retired'? }
PUT   /admin/hero-slots/:slotId             { imageIds: [...] }  -> 400 unknown_slot | too_many_images | image_retired
POST  /admin/hero-slots/publish             { note? } -> 201 { publication }  (builds variants for newly used images)
POST  /admin/hero-slots/rollback            { publicationId } -> 201 { publication }
```

- An empty slot is allowed: it means "use the bundled photo".
- Every write adds an `audit_log` row with before and after.
- Server flag **`HERO_IMAGES_CMS`**, off by default.
- The `/storage/:cid/:filename` redirect for published variants could get `Cache-Control: public, max-age=31536000, immutable`, since files are addressed by content.

**Tests:** `specs/hero-images.specs.mjs`
- Permission scope and non-admin access; flag off.
- Upload checks, including a fixture with EXIF/GPS that must come back stripped.
- Byte budgets per variant; drafts absent from the public list.
- ETag and 304; publish and rollback; audit rows.
- Zebra mocked.
- Run only with `FITFLEX_USE_CI_DB=1` against a fresh `fitflex_ci_heroimg_*` database, after checking the database name.

**STOP.**

#### Slice 5: portal admin screen and login panel (portal-builder)
**Branch:** `feat/hero-images-admin` (fitflex-portal). **Needs `security-and-privacy-reviewer`** (admin upload UI).

**Files likely touched**
- New `app/admin/hero-images/page.tsx` and `src/components/hero-image-manager.tsx`.
- Upload dialog modelled on `src/components/image-upload.tsx`, but calling the new endpoint.
- Focal-point picker: tap or drag a crosshair; arrow keys move it 5%.
- Previews reuse the scrim CSS from `src/components/photo-panel.tsx` at phone compact (390×300), phone band (3:1) and desktop panel sizes.
- `src/lib/api.ts`.
- `src/components/Shell.tsx`: nav item "App photos", `aclScope: 'brand_media'`, gated by `NEXT_PUBLIC_HERO_IMAGES_ADMIN`.
- `src/lib/i18n.ts`.

**Behaviour**
- Upload is disabled until both confirmation boxes are ticked and the licence fields are filled.
- Brightness warning shown when the server flags it.
- Publish shows what changed, slot by slot.
- History list with "Put back this version".
- Every API error code mapped to English and Swahili text.

**Login panel**
- Under `NEXT_PUBLIC_HERO_IMAGES_REMOTE`, `photo-panel.tsx` reads the `portalLogin` slot at runtime.
- The bundled photo paints first. The remote photo is used only if it loads within 1.5s; otherwise it waits for the next visit, so there is no late swap.
- No fetch under `prefers-reduced-data` or high contrast.

**Tests:** new `tests/e2e/hero-images.spec.ts` with the API mocked
- Scope gating; upload blocked until the boxes are ticked; focal point by keyboard.
- Publish and rollback; Swahili toggle; no `<h1>` change on login.

**STOP.**

#### Slice 6: app reads remote photos (mobile-builder)
**Branch:** `feat/hero-images-remote` (fitflexmobile). **Needs `security-and-privacy-reviewer`** (app downloads remote content).

**Files likely touched**
- New `lib/shared/hero_images/hero_image_store.dart` (manifest and disk cache) and `hero_image_flag.dart`.
- `ff_photo_hero.dart` and `ff_photo_footer.dart`: `heroImageProvider` resolves slot → saved file, web URL, or bundled asset; focal point comes from the server list when present.
- `pubspec.yaml`: make `path_provider` a direct dependency (already in the lockfile as transitive). No `cached_network_image`.
- `api_client.dart`.
- Workflows: `HERO_IMAGES_REMOTE` input.

**Rules**
- Fetch after the first frame and on resume if more than 6 hours have passed; 5s timeout; sends If-None-Match.
- Download only slots for the current role plus the sign-in screens.
- Each file ≤200 KB: check the declared size and stop once the limit is passed.
- Cache ≤4 MB, oldest removed first; ≤1.5 MB downloaded per day.
- Write to a temp file, rename, then decode-test before use. Any error or low storage → bundled photo.
- Empty list from the server → purge the cache.
- Rotation: pick by day and slot. Footer excludes the top photo's `sourceId`.
- On web: no disk; use the network image only after `precacheImage` succeeds in this session.
- Flag **`HERO_IMAGES_REMOTE`**, set at build time, off by default.

**Tests:** unit and widget tests
- 304 handling; oversize stop; corrupt file falls back; purge on empty list.
- Bundled shows on the first frame; footer never matches the top; web path.

**STOP.**

### Deploy order and flags

**Deploy order:** functions (4) → portal (5) → mobile (6). Slices 1–3 have no backend part, so mobile (and portal for slice 3) only. Then a parent repo submodule re-point PR.

| Flag | Where | Default |
|---|---|---|
| `PHOTO_HERO_UI` | mobile, build time (existing) | off |
| `PHOTO_FOOTER_UI` | mobile, build time (new) | off |
| `HERO_IMAGES_REMOTE` | mobile, build time (new) | off |
| `HERO_IMAGES_CMS` | server env (new) | off |
| `NEXT_PUBLIC_HERO_IMAGES_ADMIN` | portal, build time (new) | off |
| `NEXT_PUBLIC_HERO_IMAGES_REMOTE` | portal, build time (new) | off |

No new secrets. `ZEBRA_BASE_URL` already exists.

---

## 3. New strings (English / Swahili)

All Swahili is a draft for native review, following the glossary (Trainer = "Trainer", portal "bonyeza").

**Mobile**

| Key | English | Swahili |
|---|---|---|
| `hero.gyms.lead` / `.accent` | Find your / **gym.** | Pata / **gym yako.** |
| `hero.trainers.lead` / `.accent` | Train with / **a Trainer.** | Fanya mazoezi na / **Trainer.** |
| `hero.shop.lead` / `.accent` | Gear up / **for training.** | Jiandae / **kwa mazoezi.** |
| `footer.endLine` | That's all for now. | Hiyo ndiyo yote kwa sasa. |
| `footer.backToTop` | Back to top | Rudi juu |

Eyebrows reuse `member.discoverGyms`, `member.trainers` and `member.shopTitle`.

**Portal**

| Key | English | Swahili |
|---|---|---|
| `admin.nav.heroImages` | App photos | Picha za app |
| `heroImages.upload` | Upload photo | Pakia picha |
| `heroImages.focal.hint` | Click the subject to keep it in view | Bonyeza kitu kikuu ili kibaki kionekane |
| `heroImages.rights.confirm` | I confirm FitFlex has the right to use this photo in its apps and portal. | Nathibitisha kuwa FitFlex ina haki ya kutumia picha hii kwenye app na portal zake. |
| `heroImages.faces.confirm` | No one in this photo can be recognised: only backs, hands or unclear faces. | Hakuna mtu anayeweza kutambulika kwenye picha hii: migongo, mikono au nyuso zisizo wazi tu. |
| `heroImages.people.none` / `.handsBacks` / `.unclearFaces` | No people / Hands or backs only / Faces not clear | Hakuna watu / Mikono au migongo tu / Nyuso si wazi |
| `heroImages.brightWarning` | This photo is bright where the text sits. It will still be readable but will look darker. | Picha hii ina mwanga mwingi mahali maandishi yalipo. Bado yatasomeka, ila picha itaonekana nyeusi zaidi. |
| `heroImages.publish` | Publish | Chapisha |
| `heroImages.rollback` | Put back this version | Rudisha toleo hili |
| `heroImages.empty` | Using the built-in photo | Inatumia picha iliyomo kwenye app |
| `heroImages.error.*` | one per error code | one per error code |

---

## 4. Risks

- **Bundle budget.** About 1.53 MB of 1.6 MB after slices 1–2. Owner photos must be cropped to the same sizes.
- **Owner photos:** rights, faces in the background, other brands' signage, and partner-gym consent. These are the actual blockers for slice 3.
- **Zebra (needs checking).**
  - Can files be deleted? The private-until-publish design avoids needing it.
  - Does Zebra send the cross-origin header (CORS) Flutter web needs to draw remote images? Gym photos already render on web, which suggests yes; UAT must confirm.
  - Cache headers after the 307 redirect.
- **Public `/app/hero-images` endpoint.** Cacheable and read-only, but a new unauthenticated surface.
- **Shared files.** Other sessions touch `shop_home_page.dart` (Shop Phase 2/3) and the gyms tab. Rebase before merge.
- **First launch is unaffected.** It still makes no network request (DD-6 holds).
- **Nothing is visible to users** until the owner switches flags on with a new build.

**Security-and-privacy-reviewer is required on slices 4, 5 and 6.** Slices 0–3 touch no payouts, auth, KYC or pricing; this only touches privacy through the people-in-photos rule.

---

## 5. Decisions for the owner (recommended default in brackets)

- **D-1.** Gym and trainer detail pages: footer only, with no stock top hero, because the partner's own photos lead those pages. [Yes]
- **D-2.** Footer sign-off: "That's all for now." plus the FitFlex wordmark, or the photo alone? [Line + wordmark]
- **D-3.** Partner-side Gyms tab and Shop (trainer, owner): heroes too, or member only for now? [Member only]
- **D-4.** Who can change photos: any admin with the `brand_media` scope publishes alone (audit log + one-click rollback), or a second admin must approve? [Alone]
- **D-5.** Rotation: a new photo per day, or per app open? [Per day]

---

## 6. What the owner needs to send (for slice 3)

- **How many:** 1–3 photos each for Gyms, Trainers and Shop. Up to 4 more for footers.
- **Size and format:** original JPEG or HEIC files, at least 2160px on the long edge, landscape preferred.
- **People:** no identifiable faces (backs, hands or blurred only), no other brands' logos, no text in the photo.
- **For each photo:** who took it, where, and confirmation that FitFlex may use it.
- **If taken in a partner gym:** that gym's written consent.

**Until the photos arrive,** slices 1–2 ship with licensed stand-ins from `social/brand/photos`.

---

## 7. Who does what

| Slice | Agent |
|---|---|
| 0 | design-agent |
| 1, 2, 3, 6 | mobile-builder (design-agent prepares the slice 3 photos) |
| 4 | backend-builder |
| 5 | portal-builder |

After each PR: contract-checker (4–6), i18n-swahili-auditor (all), security-and-privacy-reviewer (4–6). Then release-captain, then design-qa and uat-tester on Flutter web from RC against an isolated database.

---

## 8. Known gaps still open

- `PHOTO_HERO_UI`, `NEXT_PUBLIC_PHOTO_HERO_UI` and every flag above are off.
- All Swahili awaits native review.
- Legal texts are still drafts pending Tanzanian counsel.
- Vendor settlement exists but hasn't been tried by hand.
- Shop Phase 2/3 banners are not started.
- How photos render on a real phone is a device check.

**Relevant files**
- `/Users/chollo/FitFlex/docs/design/photo-hero-screens.md`
- `/Users/chollo/FitFlex/fitflexmobile/lib/shared/components/ff_photo_hero.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/shared/components/ff_photo_hero_page.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/shared/photo_hero_flag.dart`
- `/Users/chollo/FitFlex/fitflexmobile/assets/photos/hero/LICENSES.md`
- `/Users/chollo/FitFlex/fitflexmobile/lib/screens/member/member_gyms_tab.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/screens/member/member_trainers_tab.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/screens/member/member_gym_detail_page.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/screens/member/member_trainer_detail_page.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/shared/widgets/shop_home/shop_home_page.dart`
- `/Users/chollo/FitFlex/fitflexmobile/lib/screens/member/member_shell.dart`
- `/Users/chollo/FitFlex/fitflexmobile/.github/workflows/distribute-android.yml`
- `/Users/chollo/FitFlex/fitflex-functions/functions/storage.mjs`
- `/Users/chollo/FitFlex/fitflex-functions/src/infra/storage-client.mjs`
- `/Users/chollo/FitFlex/fitflex-functions/src/services/portal-user-service.mjs`
- `/Users/chollo/FitFlex/fitflex-functions/functions/training.mjs` (the exercise admin routes this design copies)
- `/Users/chollo/FitFlex/fitflex-portal/src/components/photo-panel.tsx`
- `/Users/chollo/FitFlex/fitflex-portal/src/components/image-upload.tsx`
- `/Users/chollo/FitFlex/fitflex-portal/src/components/Shell.tsx`