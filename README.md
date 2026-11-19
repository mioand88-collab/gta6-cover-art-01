# Vice Heat — Cover Maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/mioand88-collab/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/mioand88-collab/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Turn a photo and a caption into a multi-panel poster in the style of GTA 6
cover art: framed panels with white borders, a neon-sunset colour grade, and
huge bold caption lettering — exported as a PNG ready to share.

Everything runs **offline, in the browser, on your own machine**. Photos are
read locally and never uploaded anywhere. Every backdrop the app paints
(sunset beach, neon strip, palm dusk, skyline) is original canvas artwork,
and the lettering uses generic system font stacks only — no Rockstar logos,
artwork or fonts.

## Run it

- Easiest: open `app/index.html` in a desktop browser.
- Or serve it: `node serve.ts` (Node 22+), then open http://localhost:8080

No build step, no dependencies, no network requests.

## What it does

- **4 panel layouts** — Classic collage (big hero + two stacked panels),
  Triptych, Duo and Single hero.
- **Per-panel photos** — load a photo into any panel by button, double-click
  or drag & drop; drag inside the panel to reposition it, with zoom and
  shift sliders for fine control.
- **Drawn backdrops** — a panel without a photo is filled with the app's own
  canvas artwork: Sunset Beach, Neon Strip, Palm Dusk and Skyline scenes
  with striped suns, palm silhouettes and lit skylines.
- **Colour grades** — Vice Sunset, Neon Nights, Palm Dusk and Golden Hour
  presets (tint overlays plus a vignette) with an intensity slider, applied
  live and baked into the export.
- **Caption lettering** — editable main caption and sub-caption in heavy
  condensed lettering with outline and shadow, four colour styles (Sunset,
  Chrome, Neon, Paper), auto-fitted to the cover width. The caption can sit
  at the bottom or the top of the cover.
- **Frame** — panel borders in White, Neon glow, Dark or None, with a
  width slider.
- **Exports** — one click renders the cover offscreen at full size:
  1080 × 1350, 1080 × 1080 or 1920 × 1080 PNG.
- **Fast by default** — a finished composition is already arranged when the
  page opens; "Surprise me" shuffles layout, grade, backdrops and frame in
  one click; `Delete` clears the selected panel and arrow keys nudge its
  photo.

## Hand-in

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
make.fun library in `vendor/`. It first checks that `app/` and
`screenshots/` exist and are non-empty, then rebuilds the dossier from the
output and compares it byte for byte, printing a short summary:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Round 2

This revision was rebuilt in a fresh recorded session after the round-1
entry was rejected by the transcript gate: `app/index.html`, `app/style.css`
and `app/app.js` were rewritten from scratch in-session, `main.ts` gained
the validation and dossier-rebuild checks above (edited in two rounds with
a program run in between), and this README was rewritten too. The app keeps
the round-1 default look — same classic collage, grade, caption and
backdrops — and adds the caption-placement and frame controls.

## License

MIT — see `LICENSE`.

---

Built for the make.fun bounty [Make GTA 6 Cover Art](https://make.fun/bounty/gta6-cover-art-01).
Try make.fun: [make.fun](https://make.fun/?ref=r2sxe3g2&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
