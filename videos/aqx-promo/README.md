# Apex Sports Intelligence — Promo Pack

High-end product promo + marketing art for **Apex Sports Intelligence**.

## Video

- **MP4:** [`renders/video.mp4`](renders/video.mp4) (~41s, 16:9, VO + bed)
- **Contact sheet:** [`snapshots/contact-sheet.jpg`](snapshots/contact-sheet.jpg)
- **Composition:** `index.html` + `compositions/frames/01–07`
- **Brief / board:** `BRIEF.md`, `STORYBOARD.md`, `SCRIPT.md`

Narration: Kokoro `am_michael` (offline). Music bed: ambient pad (HeyGen retrieve unavailable without sign-in; MusicGen timed out on first run).

> Native `hyperframes render` hit Windows Chrome `spawn EINVAL` in this environment; Docker Desktop was not running. Final MP4 was encoded from HyperFrames snapshots + VO/BGM (same visuals as Studio snapshots). Re-run `npx hyperframes render --skill=product-launch-video --quality high --output renders/video.mp4` when Docker/Chrome spawn works for a frame-perfect encode.

## Marketing art (SVG → PNG @2×)

| Asset | SVG | PNG |
|-------|-----|-----|
| Logo wide | `marketing/svg/logo-lockup-wide.svg` | `marketing/png/logo-lockup-wide.png` |
| Logo square | `marketing/svg/logo-lockup-square.svg` | `marketing/png/logo-lockup-square.png` |
| Three pillars | `marketing/svg/diagram-three-pillars.svg` | `marketing/png/diagram-three-pillars.png` |
| Hero poster 1920×1080 | `marketing/svg/poster-hero-1920x1080.svg` | `marketing/png/poster-hero-1920x1080.png` |
| Social 1080 | `marketing/svg/social-promo-1080.svg` | `marketing/png/social-promo-1080.png` |
| Story 1080×1920 | `marketing/svg/story-promo-1080x1920.svg` | `marketing/png/story-promo-1080x1920.png` |
| Feature flow | `marketing/svg/diagram-feature-flow.svg` | `marketing/png/diagram-feature-flow.png` |

Re-rasterize: `cd marketing && node rasterize.mjs`
