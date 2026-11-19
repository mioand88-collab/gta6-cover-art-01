# Vice Heat — Cover Maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/mioand88-collab/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/mioand88-collab/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Turn a photo and a caption into multi-panel poster cover art: the classic
collage of framed panels with white borders, a neon-sunset colour grade, and
big bold caption lettering — exported as a PNG ready to share.

Everything runs **offline, in the browser, on your own machine**. Your photos
are read locally and never uploaded anywhere. All artwork the app draws
itself (sunset beaches, neon strips, palm silhouettes, skylines) is original,
and the lettering uses generic system font stacks only.

## Run it

- Easiest: open `app/index.html` in a desktop browser.
- Or serve it: `node serve.ts` (Node 22+), then open http://localhost:8080

No build step, no dependencies, no network requests.

## Features

- **4 panel layouts** — Classic collage (big hero + two stacked panels),
  Triptych, Duo and Single hero, all with the genre's white panel borders.
- **Per-panel photos** — load a photo into any panel by button, double-click
  or drag & drop; drag inside the panel to reposition it, with zoom and
  shift sliders for fine control.
- **Drawn backdrops** — a panel without a photo is filled with the app's own
  canvas artwork: Sunset Beach, Neon Strip, Palm Dusk and Skyline scenes
  with striped suns, palm silhouettes and lit skylines.
- **Colour grades** — Vice Sunset, Neon Nights, Palm Dusk and Golden Hour
  presets (saturation/contrast plus gradient overlays and a vignette) with
  an intensity slider, applied live and baked into the export.
- **Caption lettering** — editable main caption and sub-caption in heavy
  condensed lettering with outline and shadow, four colour styles (Sunset,
  Chrome, Neon, Paper), auto-fitted to the cover width.
- **Exports** — one click renders the cover offscreen at full size:
  1080 × 1350, 1080 × 1080 or 1920 × 1080 PNG.
- **Fast by default** — a finished composition is already arranged when the
  page opens; "Surprise me" shuffles layout, grade and backdrops in one
  click; `Delete` clears the selected panel and arrow keys nudge its photo.

## Hand-in

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
make.fun library in `vendor/`:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.

---

Built for the make.fun bounty [Make GTA 6 Cover Art](https://make.fun/bounty/gta6-cover-art-01).
Try make.fun: [make.fun](https://make.fun/?ref=r2sxe3g2&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
