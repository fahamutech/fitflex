# Missing inputs & items needing your decision

## Needed from you
1. **Verified CTA destinations** — website, gym-partner sign-up, trainer sign-up, Play Store / App Store links (`CTAS` in `src/shared/content.ts`). Currently dashed placeholders.
2. **App-download QR image** — only when a real store/landing URL exists (`APP_QR_IMAGE`).
3. **Brand colour decision** — brief asks for teal; the shipped apps use green (`#1F7A3A` mobile, `#17b26a` portal). Showcase uses teal `#14b8a6`. Set `THEME.teal` to match the apps if preferred.
4. **Real screenshots / screen recordings** — scenes use HTML mock-ups. Provide screenshots from release-candidate builds if you want pixel-accurate screens.
5. **Reference image** — `/mnt/data/a_wide_promotional_ui_marketing_composite_image_3.png` was not accessible in this environment, so it was not used.
6. **Music and voice-over** — none included. Supply licensed files (`public/audio/…`) and set `AUDIO`.
7. **Swahili version** — project rule is Swahili alongside English for user-facing strings; the showcase is English-only. Swahili copy needs a native review before use.
8. **Legal/Counsel** — gym/trainer/payout statements touch draft legal text pending Tanzanian counsel; get sign-off before external use.

## Capability caveats (verify before external use)
- Trainer earnings/payout screen reflects weekly trainer statements; vendor/trainer **settlement** is not fully live for real payouts.
- Gym settlement job is still in shadow mode; revenue figures shown are sample only.
- "Compare facilities" and amenity/preference filters: confirm the exact filter set in the mobile app.
- Product marketplace is shown generically; confirm vendor catalogue is live before promoting.
- Several feature flags are still off in production; nothing here implies they are on.

## Verification (this build)
- `tsc --noEmit` and `vite build`: pass.
- Visually checked desktop (1280×800) at t = 4, 16, 28, 45, 57 s and mobile (375×812) at t = 27 s in the browser pane.
- Remotion still render (frames 30, 75): works; settled logo frame matches the supplied artwork.
- Logo animation checked in the browser at t = 0.45, 0.9, 1.5, 3 s.
- NOT verified: full MP4 render, real-device behaviour, screen-reader pass, Lighthouse/perf profiling, Safari/Firefox.
