/* Vice Heat — Cover Maker.
   A fully offline, single-file cover art app: pick a panel layout, drop a photo
   into any panel, choose a colour grade and a caption, export a PNG poster.
   Every backdrop is drawn with canvas paths — no image files, no network. */

(function () {
  'use strict';

  /* ---------- Small deterministic random helper ----------
     Backdrops sprinkle stars, sea sparkles and lit windows. A seeded
     generator keeps the preview and the exported PNG identical. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  /* ---------- Catalogues ---------- */

  var LAYOUTS = {
    classic:  { label: 'Classic collage', panels: ['Hero', 'Top right', 'Bottom right'] },
    triptych: { label: 'Triptych',        panels: ['Left', 'Centre', 'Right'] },
    duo:      { label: 'Duo',             panels: ['Left', 'Right'] },
    single:   { label: 'Single hero',     panels: ['Cover'] }
  };

  var BACKDROP_ORDER = ['beach', 'neon', 'palm', 'skyline'];
  var BACKDROP_LABELS = {
    beach:   'Sunset Beach',
    neon:    'Neon Strip',
    palm:    'Palm Dusk',
    skyline: 'Skyline'
  };

  var GRADES = {
    sunset: { label: 'Vice Sunset', top: 'rgba(255, 64, 128, 1)', bottom: 'rgba(255, 150, 40, 1)', strength: 0.55 },
    neon:   { label: 'Neon Nights', top: 'rgba(64, 40, 255, 1)',  bottom: 'rgba(255, 43, 214, 1)', strength: 0.62 },
    dusk:   { label: 'Palm Dusk',   top: 'rgba(120, 40, 200, 1)', bottom: 'rgba(255, 90, 120, 1)', strength: 0.5 },
    golden: { label: 'Golden Hour', top: 'rgba(255, 190, 60, 1)', bottom: 'rgba(255, 110, 30, 1)', strength: 0.5 }
  };

  var CAPTION_STYLES = {
    sunset: { label: 'Sunset', stops: ['#ffd23d', '#ff7a5e', '#ff3d7e', '#ff2e7e'], outline: '#2a0a33' },
    chrome: { label: 'Chrome', stops: ['#ffffff', '#dfe6f2', '#9aa7bd', '#e8eef7'], outline: '#232838' },
    neon:   { label: 'Neon',   stops: ['#7df9ff', '#35e0ff', '#ff2bd6', '#b04df0'], outline: '#12082e' },
    paper:  { label: 'Paper',  stops: ['#ffffff', '#ffffff', '#f2eef7', '#ffffff'], outline: '#241533' }
  };

  var EXPORT_SIZES = {
    '1080x1350': { w: 1080, h: 1350 },
    '1080x1080': { w: 1080, h: 1080 },
    '1920x1080': { w: 1920, h: 1080 }
  };

  var FRAME_STYLES = {
    white: { label: 'White',     fill: '#f2eef7' },
    neon:  { label: 'Neon glow', fill: null }, /* gradient, built per render */
    dark:  { label: 'Dark',      fill: '#17102e' },
    none:  { label: 'None',      fill: '#0f0a22' }
  };

  /* ---------- State ---------- */

  function freshPanels() {
    return [
      { backdrop: 'beach',   photo: null },
      { backdrop: 'neon',    photo: null },
      { backdrop: 'palm',    photo: null }
    ];
  }

  function defaultState() {
    return {
      layout: 'classic',
      grade: 'sunset',
      gradeIntensity: 0.85,
      caption: 'VICE HEAT',
      subCaption: 'NEON NIGHTS \u2022 PALM CITY',
      captionStyle: 'sunset',
      captionPlace: 'bottom',
      frame: 'white',
      frameWidth: 9,
      exportSize: '1080x1350',
      selected: 0,
      panels: freshPanels()
    };
  }

  var state = defaultState();

  /* ---------- DOM ---------- */

  function $(id) { return document.getElementById(id); }

  var stage = $('stageCanvas');
  var stageCtx = stage.getContext('2d');
  var statusLine = $('statusLine');
  var panelSummary = $('panelSummary');
  var filePicker = $('filePicker');
  var zoomSlider = $('zoomSlider');
  var shiftXSlider = $('shiftXSlider');
  var shiftYSlider = $('shiftYSlider');
  var gradeSlider = $('gradeSlider');
  var frameWidthSlider = $('frameWidthSlider');
  var captionInput = $('captionInput');
  var subCaptionInput = $('subCaptionInput');

  function setStatus(text) { statusLine.textContent = text; }

  /* ---------- Panel geometry ---------- */

  function panelRectsFor(layout, W, H, gap) {
    var rects = [];
    if (layout === 'classic') {
      var innerW = W - 3 * gap;
      var heroW = innerW * 0.57;
      var rightW = innerW - heroW;
      var rightX = gap + heroW + gap;
      var innerH = H - 3 * gap;
      var topH = innerH * 0.53;
      var botH = innerH - topH;
      rects.push({ x: gap, y: gap, w: heroW, h: H - 2 * gap });
      rects.push({ x: rightX, y: gap, w: rightW, h: topH });
      rects.push({ x: rightX, y: gap + topH + gap, w: rightW, h: botH });
    } else if (layout === 'triptych') {
      var colW = (W - 4 * gap) / 3;
      for (var i = 0; i < 3; i++) {
        rects.push({ x: gap + i * (colW + gap), y: gap, w: colW, h: H - 2 * gap });
      }
    } else if (layout === 'duo') {
      var duoW = (W - 3 * gap) / 2;
      rects.push({ x: gap, y: gap, w: duoW, h: H - 2 * gap });
      rects.push({ x: gap + duoW + gap, y: gap, w: duoW, h: H - 2 * gap });
    } else {
      rects.push({ x: gap, y: gap, w: W - 2 * gap, h: H - 2 * gap });
    }
    return rects;
  }

  function visiblePanels() {
    return LAYOUTS[state.layout].panels.length;
  }

  function selectedPanel() {
    return state.panels[Math.min(state.selected, visiblePanels() - 1)];
  }

  function gapFor(W) {
    return state.frameWidth * (W / 1080);
  }

  /* ---------- Backdrop painters ----------
     Each painter fills one panel rect with original canvas artwork. */

  function skyGradient(ctx, x, y, w, h, stops) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  function stripedSun(ctx, cx, cy, r, colour, stripeColour) {
    var halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.9);
    halo.addColorStop(0, 'rgba(255, 120, 60, 0.55)');
    halo.addColorStop(1, 'rgba(255, 120, 60, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = colour;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    /* Cut the lower half into glowing stripes. */
    var stripe = r * 0.09;
    var yy = cy + r * 0.08;
    var n = 0;
    while (yy < cy + r) {
      var thick = stripe * (1 + n * 0.45);
      ctx.fillStyle = stripeColour;
      ctx.fillRect(cx - r, yy, r * 2, thick);
      yy += stripe * 1.7 + thick;
      n++;
    }
    ctx.restore();
  }

  function paintClouds(ctx, rng, x, y, w, h, colour, alpha) {
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < 3; i++) {
      var cw = w * (0.14 + rng() * 0.12);
      var cx = x + w * (0.05 + rng() * 0.75);
      var cy = y + h * (0.06 + rng() * 0.3);
      var ch = h * 0.018;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, ch / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx + cw * 0.18, cy - ch * 0.9, cw * 0.5, ch, ch / 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function paintBirds(ctx, rng, x, y, w, h, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.5, w * 0.002);
    ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var bx = x + w * (0.1 + rng() * 0.7);
      var by = y + h * (0.08 + rng() * 0.22);
      var s = w * (0.012 + rng() * 0.01);
      ctx.beginPath();
      ctx.moveTo(bx - s, by);
      ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.7, bx, by);
      ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by);
      ctx.stroke();
    }
  }

  function paintPalmFronds(ctx, px, py, size, colour, lean) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, size * 0.03);
    ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var ang = (-0.15 - i * 0.22) * Math.PI + lean;
      var ex = px + Math.cos(ang) * size;
      var ey = py + Math.sin(ang) * size * 0.75;
      var mx = px + Math.cos(ang) * size * 0.5;
      var my = py + Math.sin(ang) * size * 0.45 - size * 0.12;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + lean * size * 0.4, py + size * 0.35, px + lean * size * 0.5, py + size * 0.62);
    ctx.stroke();
  }

  function paintSelfieFigure(ctx, x, y, scale, colour) {
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    var headR = 9 * scale;
    var hx = x, hy = y;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    /* Torso and legs. */
    ctx.lineWidth = 13 * scale;
    ctx.beginPath();
    ctx.moveTo(hx, hy + headR);
    ctx.lineTo(hx, hy + 52 * scale);
    ctx.stroke();
    ctx.lineWidth = 8 * scale;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 52 * scale);
    ctx.lineTo(hx - 12 * scale, hy + 92 * scale);
    ctx.moveTo(hx, hy + 52 * scale);
    ctx.lineTo(hx + 12 * scale, hy + 92 * scale);
    ctx.stroke();
    /* Left arm down, right arm raised holding a phone. */
    ctx.lineWidth = 7 * scale;
    ctx.beginPath();
    ctx.moveTo(hx - 4 * scale, hy + 16 * scale);
    ctx.lineTo(hx - 26 * scale, hy + 44 * scale);
    ctx.moveTo(hx + 4 * scale, hy + 16 * scale);
    ctx.lineTo(hx + 26 * scale, hy - 14 * scale);
    ctx.stroke();
    ctx.fillRect(hx + 20 * scale, hy - 30 * scale, 11 * scale, 18 * scale);
  }

  function paintSunsetBeach(ctx, r, seed) {
    var rng = mulberry32(seed);
    var x = r.x, y = r.y, w = r.w, h = r.h;
    var horizon = y + h * 0.66;
    skyGradient(ctx, x, y, w, horizon - y, [
      [0, '#3d1a7d'], [0.35, '#8a1d8f'], [0.62, '#e0207c'], [0.85, '#ff5e3a'], [1, '#ff8a2e']
    ]);
    paintClouds(ctx, rng, x, y, w, horizon - y, '#7a2ea8', 0.5);
    paintBirds(ctx, rng, x, y, w, horizon - y, '#3d1a5e');
    stripedSun(ctx, x + w * 0.5, horizon - h * 0.1, w * 0.19, '#ffd21f', '#ff8a2e');
    /* Sea with sun sparkle. */
    var sea = ctx.createLinearGradient(0, horizon, 0, y + h);
    sea.addColorStop(0, '#5b1a7d');
    sea.addColorStop(1, '#1d0b3d');
    ctx.fillStyle = sea;
    ctx.fillRect(x, horizon, w, y + h - horizon);
    for (var i = 0; i < 90; i++) {
      var sx = x + rng() * w;
      var sy = horizon + rng() * (y + h - horizon);
      var spread = Math.abs(sx - (x + w * 0.5)) / (w * 0.5);
      if (rng() > spread * 0.8 + 0.15) continue;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255, 210, 60, 0.75)' : 'rgba(255, 140, 70, 0.6)';
      ctx.fillRect(sx, sy, w * (0.02 + rng() * 0.05), Math.max(1.5, h * 0.002));
    }
    /* Beach strip and figure. */
    ctx.fillStyle = '#160a2e';
    ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
    paintSelfieFigure(ctx, x + w * 0.42, y + h * 0.78, w / 340, '#160a2e');
    paintPalmFronds(ctx, x + w * 0.02, y + h * 0.86, w * 0.22, '#160a2e', 0.25);
    paintPalmFronds(ctx, x + w * 0.98, y + h * 0.9, w * 0.18, '#160a2e', -0.2);
  }

  function paintNeonStrip(ctx, r, seed) {
    var rng = mulberry32(seed);
    var x = r.x, y = r.y, w = r.w, h = r.h;
    var horizon = y + h * 0.62;
    skyGradient(ctx, x, y, w, horizon - y, [[0, '#0d0626'], [0.6, '#1a0f45'], [1, '#2a1258']]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var i = 0; i < 60; i++) {
      var s = rng();
      ctx.globalAlpha = 0.25 + s * 0.65;
      ctx.fillRect(x + rng() * w, y + rng() * (horizon - y), s > 0.9 ? 2 : 1.4, s > 0.9 ? 2 : 1.4);
    }
    ctx.globalAlpha = 1;
    /* Skyline. */
    var bx = x;
    while (bx < x + w) {
      var bw = w * (0.08 + rng() * 0.1);
      var bh = h * (0.12 + rng() * 0.3);
      ctx.fillStyle = '#0b061f';
      ctx.fillRect(bx, horizon - bh, bw, bh);
      ctx.fillStyle = 'rgba(53, 224, 255, 0.85)';
      var wins = Math.floor(bw / (w * 0.03));
      for (var k = 0; k < wins; k++) {
        if (rng() > 0.45) continue;
        ctx.fillRect(bx + 3 + k * w * 0.03, horizon - bh + 6 + rng() * (bh - 14), 3, 4);
      }
      bx += bw + w * 0.012;
    }
    /* Neon ring, glowing over the skyline. */
    var ringR = w * 0.26;
    var rcx = x + w * 0.5, rcy = y + h * 0.38;
    ctx.save();
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = w * 0.05;
    ctx.strokeStyle = '#ff2bd6';
    ctx.lineWidth = Math.max(3, w * 0.014);
    ctx.beginPath();
    ctx.arc(rcx, rcy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    /* Dark floor for the perspective grid to sit on. */
    var floor = ctx.createLinearGradient(0, horizon, 0, y + h);
    floor.addColorStop(0, '#1e0f4d');
    floor.addColorStop(1, '#0d0626');
    ctx.fillStyle = floor;
    ctx.fillRect(x, horizon, w, y + h - horizon);
    /* Perspective grid floor. */
    var vx = x + w * 0.5;
    ctx.strokeStyle = 'rgba(53, 224, 255, 0.55)';
    ctx.lineWidth = Math.max(1, w * 0.003);
    for (var g = -6; g <= 6; g++) {
      ctx.beginPath();
      ctx.moveTo(vx + g * w * 0.06, horizon);
      ctx.lineTo(vx + g * w * 0.22, y + h);
      ctx.stroke();
    }
    var gy = horizon;
    var step = (y + h - horizon) * 0.12;
    while (gy < y + h) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
      gy += step;
      step *= 1.55;
    }
    paintPalmFronds(ctx, x + w * 0.06, y + h * 0.6, w * 0.2, '#0b061f', 0.2);
    paintPalmFronds(ctx, x + w * 0.94, y + h * 0.62, w * 0.18, '#0b061f', -0.2);
  }

  function paintPalmDusk(ctx, r, seed) {
    var rng = mulberry32(seed);
    var x = r.x, y = r.y, w = r.w, h = r.h;
    skyGradient(ctx, x, y, w, h, [
      [0, '#4b1d8f'], [0.45, '#a02090'], [0.75, '#ff2e7e'], [1, '#ff7a2e']
    ]);
    paintClouds(ctx, rng, x, y, w, h * 0.6, '#8a2ea8', 0.45);
    paintBirds(ctx, rng, x, y, w, h * 0.5, '#3d1a5e');
    stripedSun(ctx, x + w * 0.68, y + h * 0.62, w * 0.22, '#ffd76a', '#ff8a2e');
    var ground = ctx.createLinearGradient(0, y + h * 0.88, 0, y + h);
    ground.addColorStop(0, '#2a0f4d');
    ground.addColorStop(1, '#160a2e');
    ctx.fillStyle = ground;
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
    paintPalmFronds(ctx, x + w * 0.08, y + h * 0.94, w * 0.3, '#160a2e', 0.2);
    paintPalmFronds(ctx, x + w * 0.9, y + h * 0.96, w * 0.22, '#160a2e', -0.25);
  }

  function paintSkyline(ctx, r, seed) {
    var rng = mulberry32(seed);
    var x = r.x, y = r.y, w = r.w, h = r.h;
    var horizon = y + h * 0.68;
    skyGradient(ctx, x, y, w, horizon - y, [
      [0, '#2a1258'], [0.5, '#c81d7a'], [0.85, '#ff7a2e'], [1, '#ffb03d']
    ]);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x + w * 0.72, y + h * 0.3, w * 0.11, 0, Math.PI * 2);
    ctx.fill();
    paintClouds(ctx, rng, x, y, w, horizon - y, '#7a2ea8', 0.4);
    var bx = x;
    var back = '#3d1a6e';
    while (bx < x + w) {
      var bw = w * (0.1 + rng() * 0.12);
      var bh = h * (0.1 + rng() * 0.2);
      ctx.fillStyle = back;
      ctx.fillRect(bx, horizon - bh, bw, bh);
      bx += bw + w * 0.02;
    }
    bx = x;
    while (bx < x + w) {
      var bw2 = w * (0.07 + rng() * 0.11);
      var bh2 = h * (0.18 + rng() * 0.28);
      ctx.fillStyle = '#12082e';
      ctx.fillRect(bx, horizon - bh2, bw2, bh2);
      ctx.fillStyle = 'rgba(255, 210, 90, 0.9)';
      for (var k = 0; k < Math.floor(bw2 / (w * 0.035)); k++) {
        if (rng() > 0.4) continue;
        ctx.fillRect(bx + 4 + k * w * 0.035, horizon - bh2 + 8 + rng() * (bh2 - 16), 3, 4);
      }
      bx += bw2 + w * 0.015;
    }
    ctx.fillStyle = '#160a2e';
    ctx.fillRect(x, horizon, w, y + h - horizon);
    ctx.fillStyle = 'rgba(255, 210, 90, 0.5)';
    for (var d = 0; d < 12; d++) {
      ctx.fillRect(x + w * 0.08 + d * w * 0.075, y + h * 0.86, w * 0.035, 2);
    }
  }

  var BACKDROP_PAINTERS = {
    beach: paintSunsetBeach,
    neon: paintNeonStrip,
    palm: paintPalmDusk,
    skyline: paintSkyline
  };

  /* ---------- Photos ---------- */

  function drawPhotoInto(ctx, panel, r) {
    var img = panel.photo.img;
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var scale = Math.max(r.w / iw, r.h / ih) * panel.photo.zoom;
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = r.x + (r.w - dw) / 2 + panel.photo.ox * (dw - r.w) / 2;
    var dy = r.y + (r.h - dh) / 2 + panel.photo.oy * (dh - r.h) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    /* A light warm wash so a photo sits in the poster's grade. */
    ctx.fillStyle = 'rgba(255, 90, 120, 0.08)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  /* ---------- Colour grade ---------- */

  function applyColourGrade(ctx, W, H) {
    var grade = GRADES[state.grade];
    var a = state.gradeIntensity;
    if (a <= 0) return;
    var tint = ctx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, grade.top);
    tint.addColorStop(1, grade.bottom);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = grade.strength * a;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = grade.strength * a * 0.7;
    ctx.fillRect(0, 0, W, H);
    /* Vignette: darken the corners so the caption pops. */
    ctx.globalCompositeOperation = 'source-over';
    var vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75
    );
    vig.addColorStop(0, 'rgba(10, 4, 26, 0)');
    vig.addColorStop(1, 'rgba(10, 4, 26, ' + (0.34 * a).toFixed(3) + ')');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---------- Caption ---------- */

  function fitFont(ctx, text, maxWidth, startPx, family, weight, spacing) {
    var px = startPx;
    while (px > 24) {
      ctx.font = weight + ' ' + Math.round(px) + 'px ' + family;
      if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
      if (ctx.measureText(text).width <= maxWidth) break;
      px *= 0.94;
    }
    return px;
  }

  function drawCaption(ctx, W, H) {
    var style = CAPTION_STYLES[state.captionStyle];
    var main = (state.caption || 'VICE HEAT').toUpperCase();
    var sub = (state.subCaption || '').toUpperCase();
    var top = state.captionPlace === 'top';
    var family = '"Arial Narrow", Impact, "Helvetica Neue", sans-serif';

    /* Readability scrim behind the lettering. */
    var zoneH = H * 0.21;
    var scrim = top
      ? ctx.createLinearGradient(0, 0, 0, zoneH)
      : ctx.createLinearGradient(0, H - zoneH, 0, H);
    if (top) {
      scrim.addColorStop(0, 'rgba(16, 5, 36, 0.62)');
      scrim.addColorStop(1, 'rgba(16, 5, 36, 0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, zoneH);
    } else {
      scrim.addColorStop(0, 'rgba(16, 5, 36, 0)');
      scrim.addColorStop(1, 'rgba(16, 5, 36, 0.62)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, H - zoneH, W, zoneH);
    }

    var cx = W / 2;
    var mainPx = fitFont(ctx, main, W * 0.94, Math.min(W * 0.17, H * 0.15), family, 900, W * 0.004);
    var subPx = fitFont(ctx, sub, W * 0.9, W * 0.042, family, 800, W * 0.011);

    var mainY, subY, barY;
    if (top) {
      mainY = H * 0.055 + mainPx * 0.8;
      subY = mainY + mainPx * 0.62 + subPx * 0.5;
      barY = subY + subPx * 0.9;
    } else {
      subY = H * 0.825;
      mainY = H * 0.91;
      barY = H * 0.98;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    /* Sub-caption: spaced yellow lettering with a dark edge. */
    if (sub) {
      ctx.font = '800 ' + Math.round(subPx) + 'px ' + family;
      if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(W * 0.011) + 'px';
      ctx.lineWidth = Math.max(2, subPx * 0.14);
      ctx.strokeStyle = '#241533';
      ctx.strokeText(sub, cx, subY);
      ctx.fillStyle = '#ffd94d';
      ctx.fillText(sub, cx, subY);
    }

    /* Main caption: gradient fill, heavy outline, soft drop shadow. */
    ctx.font = '900 ' + Math.round(mainPx) + 'px ' + family;
    if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(W * 0.004) + 'px';
    var grad = ctx.createLinearGradient(0, mainY - mainPx * 0.55, 0, mainY + mainPx * 0.55);
    var stops = style.stops;
    for (var i = 0; i < stops.length; i++) grad.addColorStop(i / (stops.length - 1), stops[i]);
    ctx.save();
    ctx.shadowColor = 'rgba(16, 5, 36, 0.75)';
    ctx.shadowBlur = mainPx * 0.06;
    ctx.shadowOffsetY = mainPx * 0.03;
    ctx.lineWidth = mainPx * 0.16;
    ctx.strokeStyle = style.outline;
    ctx.strokeText(main, cx, mainY);
    if (state.captionStyle === 'neon') {
      ctx.shadowColor = '#ff2bd6';
      ctx.shadowBlur = mainPx * 0.12;
    }
    ctx.fillStyle = grad;
    ctx.fillText(main, cx, mainY);
    ctx.restore();

    /* Underline bar in the accent pink. */
    ctx.fillStyle = '#ff4d8d';
    var barW = W * 0.52;
    ctx.fillRect(cx - barW / 2, barY, barW, Math.max(3, H * 0.006));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  /* ---------- Full cover render ---------- */

  function renderCover(ctx, W, H) {
    var gap = gapFor(W);
    var frame = FRAME_STYLES[state.frame];
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (state.frame === 'neon') {
      var fg = ctx.createLinearGradient(0, 0, W, H);
      fg.addColorStop(0, '#ff2bd6');
      fg.addColorStop(0.5, '#ff7a2e');
      fg.addColorStop(1, '#35e0ff');
      ctx.fillStyle = fg;
    } else {
      ctx.fillStyle = frame.fill;
    }
    ctx.fillRect(0, 0, W, H);

    var rects = panelRectsFor(state.layout, W, H, gap);
    var count = visiblePanels();
    for (var i = 0; i < count; i++) {
      var r = rects[i];
      var panel = state.panels[i];
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      BACKDROP_PAINTERS[panel.backdrop](ctx, r, 1000 + i * 733);
      if (panel.photo) drawPhotoInto(ctx, panel, r);
      ctx.restore();
      /* Selected panel gets a bright outline in the preview only. */
      if (ctx === stageCtx && i === state.selected) {
        ctx.save();
        ctx.strokeStyle = '#ff5e8a';
        ctx.lineWidth = Math.max(2, W * 0.004);
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.restore();
      }
    }

    applyColourGrade(ctx, W, H);
    drawCaption(ctx, W, H);
    ctx.restore();
  }

  /* ---------- Preview ---------- */

  function renderPreview() {
    var size = EXPORT_SIZES[state.exportSize];
    var scale = Math.min(864 / size.w, 1080 / size.h, 1);
    var pw = Math.round(size.w * scale);
    var ph = Math.round(size.h * scale);
    if (stage.width !== pw || stage.height !== ph) {
      stage.width = pw;
      stage.height = ph;
    }
    renderCover(stageCtx, pw, ph);
  }

  function refreshPanelSummary() {
    var i = Math.min(state.selected, visiblePanels() - 1);
    var panel = state.panels[i];
    var name = LAYOUTS[state.layout].panels[i];
    panelSummary.textContent =
      'Panel ' + (i + 1) + ' \u2014 ' + name +
      ' \u00b7 backdrop: ' + BACKDROP_LABELS[panel.backdrop] +
      (panel.photo ? ' \u00b7 photo loaded' : ' \u00b7 no photo yet');
    var photo = panel.photo;
    zoomSlider.value = photo ? Math.round(photo.zoom * 100) : 100;
    shiftXSlider.value = photo ? Math.round(photo.ox * 100) : 0;
    shiftYSlider.value = photo ? Math.round(photo.oy * 100) : 0;
  }

  function refreshAll() {
    refreshPanelSummary();
    renderPreview();
  }

  /* ---------- Controls ---------- */

  function bindChipRow(rowId, attr, apply) {
    var row = $(rowId);
    row.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-' + attr + ']');
      if (!btn) return;
      var chips = row.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.remove('is-active');
      btn.classList.add('is-active');
      apply(btn.getAttribute('data-' + attr));
      refreshAll();
    });
  }

  bindChipRow('layoutRow', 'layout', function (value) {
    state.layout = value;
    state.selected = 0;
    setStatus('Layout: ' + LAYOUTS[value].label + '. Click a panel to work on it.');
  });

  bindChipRow('gradeRow', 'grade', function (value) {
    state.grade = value;
    setStatus('Grade: ' + GRADES[value].label + '.');
  });

  bindChipRow('captionStyleRow', 'caption-style', function (value) {
    state.captionStyle = value;
    setStatus('Caption style: ' + CAPTION_STYLES[value].label + '.');
  });

  bindChipRow('captionPlaceRow', 'caption-place', function (value) {
    state.captionPlace = value;
    setStatus(value === 'top'
      ? 'Caption moved to the top of the cover.'
      : 'Caption back at the bottom of the cover.');
  });

  bindChipRow('frameRow', 'frame', function (value) {
    state.frame = value;
    setStatus('Frame: ' + FRAME_STYLES[value].label + '.');
  });

  bindChipRow('sizeRow', 'size', function (value) {
    state.exportSize = value;
    setStatus('Export size: ' + value.replace('x', ' \u00d7 ') + '.');
  });

  gradeSlider.addEventListener('input', function () {
    state.gradeIntensity = gradeSlider.value / 100;
    renderPreview();
  });

  frameWidthSlider.addEventListener('input', function () {
    state.frameWidth = Number(frameWidthSlider.value);
    renderPreview();
  });

  captionInput.addEventListener('input', function () {
    state.caption = captionInput.value;
    renderPreview();
  });

  subCaptionInput.addEventListener('input', function () {
    state.subCaption = subCaptionInput.value;
    renderPreview();
  });

  function bindPhotoSlider(slider, apply) {
    slider.addEventListener('input', function () {
      var panel = selectedPanel();
      if (!panel.photo) return;
      apply(panel.photo, Number(slider.value));
      renderPreview();
    });
  }

  bindPhotoSlider(zoomSlider, function (photo, v) { photo.zoom = v / 100; });
  bindPhotoSlider(shiftXSlider, function (photo, v) { photo.ox = v / 100; });
  bindPhotoSlider(shiftYSlider, function (photo, v) { photo.oy = v / 100; });

  /* ---------- Photos: load, drop, drag ---------- */

  function loadPhotoFile(file) {
    if (!file || file.type.indexOf('image/') !== 0) {
      setStatus('That file is not an image. Try a JPG or PNG photo.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var panel = selectedPanel();
        panel.photo = { img: img, zoom: 1, ox: 0, oy: 0 };
        refreshAll();
        setStatus('Photo loaded into panel ' + (state.selected + 1) +
          '. Drag it to reposition, or export when ready.');
      };
      img.onerror = function () { setStatus('Could not read that image file.'); };
      img.src = reader.result;
    };
    reader.onerror = function () { setStatus('Could not read that file.'); };
    reader.readAsDataURL(file);
  }

  $('loadPhotoBtn').addEventListener('click', function () { filePicker.click(); });
  filePicker.addEventListener('change', function () {
    loadPhotoFile(filePicker.files[0]);
    filePicker.value = '';
  });

  $('swapBackdropBtn').addEventListener('click', function () {
    var panel = selectedPanel();
    var next = BACKDROP_ORDER[(BACKDROP_ORDER.indexOf(panel.backdrop) + 1) % BACKDROP_ORDER.length];
    panel.backdrop = next;
    refreshAll();
    setStatus('Backdrop: ' + BACKDROP_LABELS[next] + '.');
  });

  $('clearPhotoBtn').addEventListener('click', function () {
    var panel = selectedPanel();
    if (!panel.photo) { setStatus('Panel ' + (state.selected + 1) + ' has no photo to clear.'); return; }
    panel.photo = null;
    refreshAll();
    setStatus('Photo cleared from panel ' + (state.selected + 1) + '. Backdrop restored.');
  });

  function canvasPoint(event) {
    var rect = stage.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (stage.width / rect.width),
      y: (event.clientY - rect.top) * (stage.height / rect.height)
    };
  }

  function panelAt(point) {
    var rects = panelRectsFor(state.layout, stage.width, stage.height, gapFor(stage.width));
    for (var i = 0; i < visiblePanels(); i++) {
      var r = rects[i];
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
    }
    return -1;
  }

  var drag = null;

  stage.addEventListener('pointerdown', function (event) {
    var point = canvasPoint(event);
    var hit = panelAt(point);
    if (hit < 0) return;
    state.selected = hit;
    refreshPanelSummary();
    renderPreview();
    var panel = selectedPanel();
    if (panel.photo) {
      var rects = panelRectsFor(state.layout, stage.width, stage.height, gapFor(stage.width));
      var r = rects[hit];
      var img = panel.photo.img;
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var scale = Math.max(r.w / iw, r.h / ih) * panel.photo.zoom;
      drag = {
        startX: point.x, startY: point.y,
        ox: panel.photo.ox, oy: panel.photo.oy,
        spanX: Math.max(1, iw * scale - r.w),
        spanY: Math.max(1, ih * scale - r.h)
      };
      stage.setPointerCapture(event.pointerId);
    }
  });

  stage.addEventListener('pointermove', function (event) {
    if (!drag) return;
    var panel = selectedPanel();
    if (!panel.photo) { drag = null; return; }
    var point = canvasPoint(event);
    panel.photo.ox = clamp(drag.ox + 2 * (point.x - drag.startX) / drag.spanX, -1, 1);
    panel.photo.oy = clamp(drag.oy + 2 * (point.y - drag.startY) / drag.spanY, -1, 1);
    refreshPanelSummary();
    renderPreview();
  });

  stage.addEventListener('pointerup', function () { drag = null; });
  stage.addEventListener('pointercancel', function () { drag = null; });

  stage.addEventListener('dblclick', function (event) {
    var hit = panelAt(canvasPoint(event));
    if (hit >= 0) { state.selected = hit; refreshPanelSummary(); filePicker.click(); }
  });

  stage.addEventListener('dragover', function (event) { event.preventDefault(); });
  stage.addEventListener('drop', function (event) {
    event.preventDefault();
    var hit = panelAt(canvasPoint(event));
    if (hit >= 0) state.selected = hit;
    if (event.dataTransfer.files.length) loadPhotoFile(event.dataTransfer.files[0]);
  });

  document.addEventListener('keydown', function (event) {
    var tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var panel = selectedPanel();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (panel.photo) {
        panel.photo = null;
        refreshAll();
        setStatus('Photo cleared from panel ' + (state.selected + 1) + '.');
      }
      return;
    }
    if (!panel.photo) return;
    var step = 0.03;
    if (event.key === 'ArrowLeft') { panel.photo.ox = clamp(panel.photo.ox - step, -1, 1); }
    else if (event.key === 'ArrowRight') { panel.photo.ox = clamp(panel.photo.ox + step, -1, 1); }
    else if (event.key === 'ArrowUp') { panel.photo.oy = clamp(panel.photo.oy - step, -1, 1); }
    else if (event.key === 'ArrowDown') { panel.photo.oy = clamp(panel.photo.oy + step, -1, 1); }
    else return;
    event.preventDefault();
    refreshAll();
  });

  /* ---------- Surprise, reset, export ---------- */

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function markChip(rowId, attr, value) {
    var chips = $(rowId).querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-' + attr) === value);
    }
  }

  $('surpriseBtn').addEventListener('click', function () {
    state.layout = pick(Object.keys(LAYOUTS));
    state.grade = pick(Object.keys(GRADES));
    state.captionStyle = pick(Object.keys(CAPTION_STYLES));
    state.frame = pick(Object.keys(FRAME_STYLES));
    state.gradeIntensity = 0.6 + Math.random() * 0.4;
    gradeSlider.value = Math.round(state.gradeIntensity * 100);
    for (var i = 0; i < state.panels.length; i++) {
      state.panels[i].backdrop = pick(BACKDROP_ORDER);
    }
    state.selected = 0;
    markChip('layoutRow', 'layout', state.layout);
    markChip('gradeRow', 'grade', state.grade);
    markChip('captionStyleRow', 'caption-style', state.captionStyle);
    markChip('frameRow', 'frame', state.frame);
    refreshAll();
    setStatus('Surprise! Layout, grade, backdrops and frame shuffled — photos kept.');
  });

  $('resetBtn').addEventListener('click', function () {
    var keepPhotos = state.panels.map(function (p) { return p.photo; });
    state = defaultState();
    for (var i = 0; i < keepPhotos.length; i++) state.panels[i].photo = keepPhotos[i];
    gradeSlider.value = 85;
    frameWidthSlider.value = 9;
    captionInput.value = state.caption;
    subCaptionInput.value = state.subCaption;
    markChip('layoutRow', 'layout', state.layout);
    markChip('gradeRow', 'grade', state.grade);
    markChip('captionStyleRow', 'caption-style', state.captionStyle);
    markChip('captionPlaceRow', 'caption-place', state.captionPlace);
    markChip('frameRow', 'frame', state.frame);
    markChip('sizeRow', 'size', state.exportSize);
    refreshAll();
    setStatus('Reset to the default cover. Your photos were kept.');
  });

  $('exportBtn').addEventListener('click', function () {
    var size = EXPORT_SIZES[state.exportSize];
    var off = document.createElement('canvas');
    off.width = size.w;
    off.height = size.h;
    renderCover(off.getContext('2d'), size.w, size.h);
    off.toBlob(function (blob) {
      if (!blob) { setStatus('Export failed — the browser could not render the PNG.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'vice-heat-' + size.w + 'x' + size.h + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      setStatus('Exported ' + size.w + ' \u00d7 ' + size.h + ' PNG. Share it anywhere.');
    }, 'image/png');
  });

  /* ---------- Start ---------- */

  refreshAll();
})();
