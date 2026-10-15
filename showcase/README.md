# FitFlex Africa — Kinetic Product Showcase

A 60-second animated showcase for **gym owners**, **gym customers** and **personal trainers**,
available as (1) an interactive web player and (2) a deterministic 1920×1080 / 30 fps MP4 (Remotion).

This is a **standalone app** (it does not touch `fitflex-portal`, `fitflex-functions` or `fitflexmobile`).

## How it works
- `src/shared/timeline.ts` — scene timings (0–5 intro, 5–20 owner, 20–35 customer, 35–48 trainer, 48–60 ecosystem).
- `src/shared/Showcase.tsx` — `<Showcase t={seconds} />` is a **pure function of time**. The web player feeds it a clock,
  Remotion feeds it `frame / fps`, so both outputs are identical and frame-exact.
- `src/scenes/*` — one component per scene; `src/shared/ui.tsx` — phone frame, cards, charts, QR art, backdrop.
- `src/shared/content.ts` — **all copy, colours, CTA links, audio paths and the feature-status map.** Edit here first.
- `src/web/Player.tsx` — play/pause/replay, scrubber, scene buttons, Space key, reduced-motion handling.
- `src/remotion/*` — video composition (independent of web controls).

Phone screens are real HTML/CSS (not screenshots), driven by illustrative sample data.

## Kinetic logo
`src/shared/KineticLogo.tsx` animates the real logo (a location pin + muscular runner whose leg breaks out of the pin),
split into `public/brand/logo-pin.png` and `logo-runner.png` (same 768 px canvas, so they re-align exactly):
1. **Pin drops** and lands on its tip with a squash and a teal ripple — "find your gym".
2. **Runner dashes in** from the left with motion ghosts and speed lines, leg ending up outside the pin.
3. **Arm flexes** with a gold pulse on the bicep — strength.
4. **Settles to the exact artwork** (identity transform from 1.9 s), then a barely-visible float.
Used in the intro (0–2 s) and again, smaller, before the closing CTAs. To re-cut the layers from a new logo, split by
brightness/saturation (runner = bright & saturated, pin = navy); see git history of this README for the recipe.

## Run
```bash
cd showcase
npm install
npm run dev          # http://localhost:5174   (add ?t=27 to open paused at 27 s)
npm run build        # typecheck + production build into dist/
npm run typecheck
```
Layout switches automatically: wide (16:9 stage) on desktop, tall (4:5 stage) on portrait/mobile.
With `prefers-reduced-motion: reduce` autoplay is off; use the scene buttons or scrubber.

## Render the video
```bash
npm run video:studio   # preview/scrub in Remotion Studio
npm run video:still    # single PNG -> out/still.png
npm run video:render   # out/fitflex-showcase.mp4  (1920x1080, 30fps, 60s)
```
Remotion downloads a headless Chrome on first run and needs `ffmpeg`-compatible codecs (bundled). Note Remotion's
[licence](https://www.remotion.dev/docs/license) — free for individuals/small teams, a company licence is required above that.

## Replace assets
| What | Where |
|---|---|
| Logo / icon | `public/brand/fitflex-logo.svg`, `fitflex-icon.png` (copied from `fitflexmobile/assets/brand`) |
| Fonts | `public/fonts/` (Inter, OFL) |
| Real app screenshots | Replace a screen body in `src/scenes/*.tsx` with `<img>` — or keep the HTML mock-ups |
| Copy / colours | `src/shared/content.ts` |
| CTA links | `CTAS[].href` in `content.ts` (`null` = visible dashed placeholder) |
| App-download QR | `APP_QR_IMAGE` in `content.ts` (drop a verified PNG in `public/`) |
| Music / voice-over | `AUDIO.music`, `AUDIO.voiceOver` in `content.ts` (files in `public/audio/`; only licensed material) |

## Accuracy rules baked in
- Every phone shows an **"Illustrative sample data"** tag; all TZS figures and names are samples.
- No testimonials, partner gyms, ratings, revenue results or fake download links.
- Customer scene carries "Gym access depends on the pass you choose."
- The QR code on phones is decorative artwork, not a scannable code.
- `FEATURE_STATUS` in `content.ts` records which showcased capabilities exist in the product vs. concept.

## Checks performed
See `MISSING_INPUTS.md` ("Verification") for what was run and what was not.
