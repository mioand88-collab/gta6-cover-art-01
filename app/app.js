/* Vice Heat — Cover Maker.
   An offline multi-panel poster maker: load a photo into any panel, pick a
   layout, grade it like a neon sunset, stamp a bold caption, export a PNG.
   Everything is drawn on canvas from the files in this folder. No network. */
'use strict';

/* ---------- small deterministic random (backdrops look the same every load) ---------- */
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- layouts: panel rectangles as fractions of the cover ---------- */
const LAYOUTS = {
  classic: {
    label: 'Classic collage',
    panels: [
      { name: 'Hero', rect: [0, 0, 0.60, 1] },
      { name: 'Top right', rect: [0.60, 0, 0.40, 0.56] },
      { name: 'Bottom right', rect: [0.60, 0.56, 0.40, 0.44] },
    ],
  },
  triptych: {
    label: 'Triptych',
    panels: [
      { name: 'Left', rect: [0, 0, 1 / 3, 1] },
      { name: 'Centre', rect: [1 / 3, 0, 1 / 3, 1] },
      { name: 'Right', rect: [2 / 3, 0, 1 / 3, 1] },
    ],
  },
  duo: {
    label: 'Duo',
    panels: [
      { name: 'Left', rect: [0, 0, 0.52, 1] },
      { name: 'Right', rect: [0.52, 0, 0.48, 1] },
    ],
  },
  single: {
    label: 'Single hero',
    panels: [{ name: 'Hero', rect: [0, 0, 1, 1] }],
  },
};

/* ---------- colour grades ---------- */
const GRADES = {
  vice: { label: 'Vice Sunset', top: [88, 20, 140], mid: [255, 77, 141], bottom: [255, 122, 48], sat: 0.65, con: 0.20 },
  neon: { label: 'Neon Nights', top: [8, 10, 70], mid: [57, 213, 232], bottom: [255, 45, 150], sat: 0.45, con: 0.30 },
  dusk: { label: 'Palm Dusk', top: [0, 66, 88], mid: [64, 178, 160], bottom: [255, 158, 84], sat: 0.35, con: 0.14 },
  gold: { label: 'Golden Hour', top: [120, 60, 10], mid: [255, 176, 66], bottom: [214, 90, 30], sat: 0.40, con: 0.12 },
};

/* ---------- caption lettering styles ---------- */
const LETTER_STYLES = {
  sunset: { stops: ['#ffe259', '#ffa751', '#ff4d8d'], stroke: '#2a0a3a', sub: '#ffd23d' },
  chrome: { stops: ['#ffffff', '#c9d4e8', '#5d6f92'], stroke: '#0a0a14', sub: '#e8eefc' },
  neon: { stops: ['#b8fbff', '#39d5e8', '#ff4dd2'], stroke: '#12002e', sub: '#7df9ff' },
  paper: { stops: ['#fff6e3', '#ffe9bd', '#ffd9a0'], stroke: '#40160a', sub: '#ffffff' },
};

const BACKDROPS = ['sunset-beach', 'neon-strip', 'palm-dusk', 'skyline'];
const BACKDROP_NAMES = {
  'sunset-beach': 'Sunset Beach',
  'neon-strip': 'Neon Strip',
  'palm-dusk': 'Palm Dusk',
  'skyline': 'Skyline',
};
const CAPTION_FONT = '"Arial Narrow", "Liberation Sans Narrow", Impact, "Helvetica Neue", sans-serif';

/* ---------- state ---------- */
function freshPanel(backdrop) {
  return { img: null, backdrop, zoom: 1, ox: 0, oy: 0 };
}
function defaultState() {
  return {
    layout: 'classic',
    grade: 'vice',
    intensity: 0.7,
    letter: 'sunset',
    caption: 'VICE HEAT',
    subcaption: 'NEON NIGHTS • PALM CITY',
    selected: 0,
    panels: [freshPanel('sunset-beach'), freshPanel('neon-strip'), freshPanel('palm-dusk')],
  };
}
let state = defaultState();
let aspect = { w: 1080, h: 1350 };

/* ---------- backdrop painting (the app's own artwork for empty panels) ---------- */
function skyGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function stripedSun(ctx, cx, cy, r, topCol, botCol) {
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, topCol);
  g.addColorStop(1, botCol);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(20,6,40,0.85)';
  let gap = r * 0.06;
  for (let yy = cy + r * 0.08; yy < cy + r; yy += gap * 2.1) {
    ctx.fillRect(cx - r, yy, r * 2, gap);
    gap *= 1.35;
  }
  ctx.restore();
}

function skyline(ctx, x, yBase, w, hMax, seed, colour, litCol, litChance) {
  const rnd = seededRandom(seed);
  ctx.fillStyle = colour;
  let bx = x;
  while (bx < x + w) {
    const bw = w * (0.05 + rnd() * 0.09);
    const bh = hMax * (0.3 + rnd() * 0.7);
    ctx.fillRect(bx, yBase - bh, bw, bh);
    if (rnd() > 0.6) ctx.fillRect(bx + bw * 0.3, yBase - bh - hMax * 0.08, bw * 0.4, hMax * 0.08);
    if (litCol) {
      ctx.fillStyle = litCol;
      const cols = Math.max(1, Math.floor(bw / (w * 0.03)));
      const rows = Math.max(2, Math.floor(bh / (hMax * 0.14)));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rnd() < litChance) {
            ctx.globalAlpha = 0.5 + rnd() * 0.5;
            ctx.fillRect(bx + (c + 0.5) * (bw / cols) - w * 0.006, yBase - bh + (r + 0.5) * (bh / rows), w * 0.012, hMax * 0.05);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = colour;
    }
    bx += bw + w * 0.008;
  }
}

function palmTree(ctx, x, y, scale, flip, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip * scale, scale);
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  // trunk: a leaning stack of segments
  let px = 0, py = 0;
  const lean = 0.16;
  for (let i = 0; i < 9; i++) {
    const wdt = 13 - i * 1.05;
    ctx.beginPath();
    ctx.arc(px, py, wdt / 2, 0, Math.PI * 2);
    ctx.fill();
    px += lean * 11;
    py -= 12.5;
  }
  // fronds
  const crownX = px, crownY = py;
  const fronds = [[-95, -38], [-70, -52], [-38, -62], [-4, -66], [30, -58], [58, -42], [82, -22]];
  for (const [fx, fy] of fronds) {
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(crownX + fx * 0.55, crownY + fy, crownX + fx, crownY + fy + 34);
    ctx.stroke();
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(crownX + fx * 0.6, crownY + fy + 8, crownX + fx * 0.92, crownY + fy + 44);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(crownX - 5, crownY + 4, 6, 0, Math.PI * 2);
  ctx.arc(crownX + 6, crownY + 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintBackdrop(ctx, x, y, w, h, variant) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (variant === 'sunset-beach') {
    skyGradient(ctx, x, y, w, h, [[0, '#2b1055'], [0.35, '#8e2a8f'], [0.62, '#e84e8a'], [0.8, '#ff8c42'], [1, '#ffc65c']]);
    stripedSun(ctx, x + w * 0.52, y + h * 0.60, Math.min(w, h) * 0.30, '#ffd76e', '#ff5e7a');
    // sea
    const seaY = y + h * 0.74;
    const sg = ctx.createLinearGradient(0, seaY, 0, y + h);
    sg.addColorStop(0, '#7a2d6e');
    sg.addColorStop(1, '#1c0f3d');
    ctx.fillStyle = sg;
    ctx.fillRect(x, seaY, w, h * 0.26);
    const rnd = seededRandom(42);
    ctx.fillStyle = 'rgba(255,190,90,0.5)';
    for (let i = 0; i < 42; i++) {
      const ry = seaY + rnd() * h * 0.22;
      const rw = w * (0.02 + rnd() * 0.10) * (0.4 + (ry - seaY) / (h * 0.26));
      ctx.fillRect(x + w * 0.52 - rw / 2 + (rnd() - 0.5) * w * 0.08, ry, rw, 2.2);
    }
    ctx.fillStyle = '#160a2e';
    ctx.fillRect(x, y + h * 0.965, w, h * 0.035);
    palmTree(ctx, x + w * 0.10, y + h * 1.0, Math.min(w, h) / 300, 1, '#160a2e');
    palmTree(ctx, x + w * 0.94, y + h * 1.0, Math.min(w, h) / 360, -1, '#160a2e');
  } else if (variant === 'neon-strip') {
    skyGradient(ctx, x, y, w, h, [[0, '#03041c'], [0.55, '#141452'], [0.8, '#3d1160'], [1, '#0a0620']]);
    const rnd = seededRandom(7);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.3 + rnd() * 0.7;
      ctx.fillRect(x + rnd() * w, y + rnd() * h * 0.4, 2, 2);
    }
    ctx.globalAlpha = 1;
    // neon ring sun
    ctx.save();
    ctx.strokeStyle = '#ff4dd2';
    ctx.lineWidth = Math.min(w, h) * 0.02;
    ctx.shadowColor = '#ff4dd2';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.44, Math.min(w, h) * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    skyline(ctx, x, y + h * 0.78, w, h * 0.34, 99, '#070418', '#39d5e8', 0.30);
    // chrome grid floor
    ctx.strokeStyle = 'rgba(57,213,232,0.55)';
    ctx.lineWidth = 1.6;
    const floorY = y + h * 0.78;
    for (let i = 0; i <= 10; i++) {
      const fx = x + (i / 10) * w;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5 + (fx - x - w * 0.5) * 0.24, floorY);
      ctx.lineTo(fx + (fx - x - w * 0.5) * 0.7, y + h);
      ctx.stroke();
    }
    for (let i = 1; i <= 5; i++) {
      const gy = floorY + (i * i) * h * 0.008;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }
    palmTree(ctx, x + w * 0.06, y + h * 0.86, Math.min(w, h) / 380, 1, '#05020f');
    palmTree(ctx, x + w * 0.97, y + h * 0.88, Math.min(w, h) / 420, -1, '#05020f');
  } else if (variant === 'palm-dusk') {
    skyGradient(ctx, x, y, w, h, [[0, '#0b4f5c'], [0.45, '#3d9e8f'], [0.72, '#f2b879'], [1, '#ff8c69']]);
    ctx.save();
    ctx.fillStyle = 'rgba(255,236,180,0.9)';
    ctx.shadowColor = '#ffdf9e';
    ctx.shadowBlur = 60;
    ctx.beginPath();
    ctx.arc(x + w * 0.68, y + h * 0.40, Math.min(w, h) * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(9,42,48,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.82);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.74, x + w * 0.55, y + h * 0.82);
    ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.9, x + w, y + h * 0.84);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.fill();
    palmTree(ctx, x + w * 0.16, y + h * 0.94, Math.min(w, h) / 260, 1, '#07222a');
    palmTree(ctx, x + w * 0.88, y + h * 0.98, Math.min(w, h) / 300, -1, '#07222a');
    palmTree(ctx, x + w * 0.55, y + h * 1.02, Math.min(w, h) / 430, 1, 'rgba(7,34,42,0.7)');
  } else { // skyline
    skyGradient(ctx, x, y, w, h, [[0, '#1d0b38'], [0.5, '#5b2160'], [0.78, '#c94f7c'], [1, '#ff9a5c']]);
    const rnd = seededRandom(1234);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 46; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.6;
      ctx.fillRect(x + rnd() * w, y + rnd() * h * 0.34, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(x + w * 0.8, y + h * 0.16, Math.min(w, h) * 0.07, 0, Math.PI * 2);
    ctx.fill();
    skyline(ctx, x, y + h * 0.86, w, h * 0.30, 555, 'rgba(38,14,64,0.75)', null, 0);
    skyline(ctx, x, y + h * 0.88, w, h * 0.44, 31, '#150826', '#ffb35c', 0.22);
    const wg = ctx.createLinearGradient(0, y + h * 0.88, 0, y + h);
    wg.addColorStop(0, 'rgba(30,10,50,0.92)');
    wg.addColorStop(1, 'rgba(12,4,26,1)');
    ctx.fillStyle = wg;
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
  }
  ctx.restore();
}

/* ---------- cover rendering ---------- */
function drawPanelImage(ctx, img, px, py, pw, ph, panel) {
  const ia = img.naturalWidth / img.naturalHeight;
  const pa = pw / ph;
  let dw, dh;
  if (ia > pa) { dh = ph; dw = ph * ia; } else { dw = pw; dh = pw / ia; }
  dw *= panel.zoom;
  dh *= panel.zoom;
  const dx = px + (pw - dw) / 2 + panel.ox * pw;
  const dy = py + (ph - dh) / 2 + panel.oy * ph;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function applyGrade(ctx, W, H) {
  const g = GRADES[state.grade];
  const i = state.intensity;
  if (i <= 0) return;
  const [tr, tg, tb] = g.top, [mr, mg, mb] = g.mid, [br, bg, bb] = g.bottom;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${tr},${tg},${tb},${0.42 * i})`);
  grad.addColorStop(0.5, `rgba(${mr},${mg},${mb},${0.10 * i})`);
  grad.addColorStop(1, `rgba(${br},${bg},${bb},${0.38 * i})`);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // vignette to seat the caption
  const vg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.36, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(8,2,20,${0.38 * i})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function fitFont(ctx, text, maxWidth, startSize, weight) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${CAPTION_FONT}`;
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size *= 0.92;
    ctx.font = `${weight} ${size}px ${CAPTION_FONT}`;
  }
  return size;
}

function drawCaption(ctx, W, H) {
  const cap = (state.caption || '').trim();
  const sub = (state.subcaption || '').trim();
  if (!cap && !sub) return;
  const style = LETTER_STYLES[state.letter];
  // readability shade behind the words
  const shade = ctx.createLinearGradient(0, H * 0.58, 0, H);
  shade.addColorStop(0, 'rgba(8,2,18,0)');
  shade.addColorStop(0.55, 'rgba(8,2,18,0.38)');
  shade.addColorStop(1, 'rgba(8,2,18,0.62)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.58, W, H * 0.42);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '0px'; } catch (e) { /* older engines */ }

  let subBaseline = 0;
  if (sub) {
    const subSize = fitFont(ctx, sub, W * 0.86, H * 0.036, 700);
    try { ctx.letterSpacing = `${Math.max(2, subSize * 0.32)}px`; } catch (e) { /* ignore */ }
    subBaseline = H * 0.845;
    ctx.lineWidth = subSize * 0.16;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,4,24,0.9)';
    ctx.strokeText(sub, W / 2, subBaseline);
    ctx.fillStyle = style.sub;
    ctx.fillText(sub, W / 2, subBaseline);
    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
  }
  if (cap) {
    const size = fitFont(ctx, cap.toUpperCase(), W * 0.93, H * 0.155, 900);
    const grad = ctx.createLinearGradient(0, H * 0.86 - size, 0, H * 0.97);
    style.stops.forEach((col, idx) => grad.addColorStop(idx / (style.stops.length - 1), col));
    const base = H * 0.955;
    ctx.lineWidth = size * 0.17;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = style.stroke;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = size * 0.055;
    ctx.strokeText(cap.toUpperCase(), W / 2, base);
    ctx.fillStyle = grad;
    ctx.fillText(cap.toUpperCase(), W / 2, base);
    ctx.shadowOffsetY = 0;
    // thin underline flourish in the mid grade colour
    const [mr, mg, mb] = GRADES[state.grade].mid;
    ctx.fillStyle = `rgba(${mr},${mg},${mb},0.95)`;
    const uw = Math.min(W * 0.5, ctx.measureText(cap.toUpperCase()).width * 0.7);
    ctx.fillRect(W / 2 - uw / 2, base + size * 0.13, uw, Math.max(3, H * 0.006));
  }
}

function renderCover(ctx, W, H, forExport) {
  const layout = LAYOUTS[state.layout];
  const border = Math.max(4, Math.round(W * 0.009));
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, W, H);
  const grade = GRADES[state.grade];
  layout.panels.forEach((def, idx) => {
    const panel = state.panels[idx];
    const px = def.rect[0] * W + border;
    const py = def.rect[1] * H + border;
    const pw = def.rect[2] * W - border * 2;
    const ph = def.rect[3] * H - border * 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    if (panel.img) {
      if ('filter' in ctx) {
        ctx.filter = `saturate(${1 + grade.sat * state.intensity}) contrast(${1 + grade.con * state.intensity}) brightness(${1 + 0.04 * state.intensity})`;
      }
      drawPanelImage(ctx, panel.img, px, py, pw, ph, panel);
      if ('filter' in ctx) ctx.filter = 'none';
    } else {
      paintBackdrop(ctx, px, py, pw, ph, panel.backdrop);
    }
    ctx.restore();
    if (!forExport && idx === state.selected) {
      ctx.strokeStyle = '#ff4d8d';
      ctx.lineWidth = Math.max(3, W * 0.004);
      ctx.strokeRect(px - border * 0.4, py - border * 0.4, pw + border * 0.8, ph + border * 0.8);
    }
  });
  applyGrade(ctx, W, H);
  drawCaption(ctx, W, H);
}

/* ---------- editor wiring ---------- */
const canvas = document.getElementById('cover');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const selNameEl = document.getElementById('sel-name');
const zoomEl = document.getElementById('zoom');
const shiftXEl = document.getElementById('shift-x');
const shiftYEl = document.getElementById('shift-y');
const fileEl = document.getElementById('photo-file');

function setStatus(msg) { statusEl.textContent = msg; }

function render() {
  renderCover(ctx, canvas.width, canvas.height, false);
}

function syncPanelControls() {
  const def = LAYOUTS[state.layout].panels[state.selected];
  const panel = state.panels[state.selected];
  selNameEl.textContent = `Panel ${state.selected + 1} — ${def.name} · backdrop: ${BACKDROP_NAMES[panel.backdrop]}${panel.img ? ' · photo loaded' : ''}`;
  zoomEl.value = Math.round(panel.zoom * 100);
  shiftXEl.value = Math.round(panel.ox * 100);
  shiftYEl.value = Math.round(panel.oy * 100);
}

function selectPanel(idx) {
  state.selected = Math.max(0, Math.min(idx, LAYOUTS[state.layout].panels.length - 1));
  syncPanelControls();
  render();
}

function markChips(rowEl, attr, value) {
  rowEl.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-on', chip.dataset[attr] === value);
  });
}

function setAspect(w, h) {
  aspect = { w, h };
  const scale = 1080 / Math.max(w, h);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  render();
}

/* layout + grade + lettering chips */
document.getElementById('layout-row').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-layout]');
  if (!btn) return;
  state.layout = btn.dataset.layout;
  markChips(ev.currentTarget, 'layout', state.layout);
  selectPanel(Math.min(state.selected, LAYOUTS[state.layout].panels.length - 1));
});
document.getElementById('grade-row').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-grade]');
  if (!btn) return;
  state.grade = btn.dataset.grade;
  markChips(ev.currentTarget, 'grade', state.grade);
  render();
});
document.getElementById('letter-row').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-letter]');
  if (!btn) return;
  state.letter = btn.dataset.letter;
  markChips(ev.currentTarget, 'letter', state.letter);
  render();
});

/* caption text */
document.getElementById('caption').addEventListener('input', (ev) => { state.caption = ev.target.value; render(); });
document.getElementById('subcaption').addEventListener('input', (ev) => { state.subcaption = ev.target.value; render(); });
document.getElementById('intensity').addEventListener('input', (ev) => { state.intensity = ev.target.value / 100; render(); });

/* selected panel controls */
zoomEl.addEventListener('input', () => { state.panels[state.selected].zoom = zoomEl.value / 100; render(); });
shiftXEl.addEventListener('input', () => { state.panels[state.selected].ox = shiftXEl.value / 100; render(); });
shiftYEl.addEventListener('input', () => { state.panels[state.selected].oy = shiftYEl.value / 100; render(); });
document.getElementById('clear-photo').addEventListener('click', () => {
  state.panels[state.selected].img = null;
  syncPanelControls();
  render();
});
document.getElementById('cycle-backdrop').addEventListener('click', () => {
  const panel = state.panels[state.selected];
  const next = BACKDROPS[(BACKDROPS.indexOf(panel.backdrop) + 1) % BACKDROPS.length];
  panel.backdrop = next;
  syncPanelControls();
  render();
});
document.getElementById('load-photo').addEventListener('click', () => fileEl.click());

function loadPhotoInto(idx, file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.panels[idx].img = img;
    state.panels[idx].zoom = 1;
    state.panels[idx].ox = 0;
    state.panels[idx].oy = 0;
    selectPanel(idx);
    setStatus(`Photo loaded into panel ${idx + 1}. Drag it to reposition, or export when ready.`);
  };
  img.onerror = () => setStatus('That file could not be read as an image.');
  img.src = url;
}
fileEl.addEventListener('change', () => {
  loadPhotoInto(state.selected, fileEl.files[0]);
  fileEl.value = '';
});

/* canvas: click to select, drag to reposition */
function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * (canvas.width / r.width),
    y: (ev.clientY - r.top) * (canvas.height / r.height),
  };
}
function panelAt(x, y) {
  const layout = LAYOUTS[state.layout];
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    const [fx, fy, fw, fh] = layout.panels[i].rect;
    if (x >= fx * canvas.width && x <= (fx + fw) * canvas.width && y >= fy * canvas.height && y <= (fy + fh) * canvas.height) return i;
  }
  return 0;
}
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  const p = canvasPoint(ev);
  const idx = panelAt(p.x, p.y);
  selectPanel(idx);
  const panel = state.panels[idx];
  drag = { x: p.x, y: p.y, ox: panel.ox, oy: panel.oy };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = canvasPoint(ev);
  const def = LAYOUTS[state.layout].panels[state.selected];
  const panel = state.panels[state.selected];
  if (!panel.img) return;
  panel.ox = Math.max(-0.6, Math.min(0.6, drag.ox + (p.x - drag.x) / (def.rect[2] * canvas.width)));
  panel.oy = Math.max(-0.6, Math.min(0.6, drag.oy + (p.y - drag.y) / (def.rect[3] * canvas.height)));
  shiftXEl.value = Math.round(panel.ox * 100);
  shiftYEl.value = Math.round(panel.oy * 100);
  render();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('dblclick', (ev) => {
  selectPanel(panelAt(...(() => { const p = canvasPoint(ev); return [p.x, p.y]; })()));
  fileEl.click();
});

/* drag & drop photos onto panels */
const stageEl = document.getElementById('stage');
['dragenter', 'dragover'].forEach((name) => stageEl.addEventListener(name, (ev) => {
  ev.preventDefault();
  stageEl.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((name) => stageEl.addEventListener(name, (ev) => {
  ev.preventDefault();
  stageEl.classList.remove('dragging');
}));
stageEl.addEventListener('drop', (ev) => {
  const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (!file) return;
  const r = canvas.getBoundingClientRect();
  const x = (ev.clientX - r.left) * (canvas.width / r.width);
  const y = (ev.clientY - r.top) * (canvas.height / r.height);
  loadPhotoInto(panelAt(x, y), file);
});

/* keyboard: delete clears, arrows nudge */
document.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT' && ev.target.type === 'text') return;
  const panel = state.panels[state.selected];
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    panel.img = null;
    syncPanelControls();
    render();
  } else if (ev.key.startsWith('Arrow')) {
    const step = ev.shiftKey ? 0.05 : 0.015;
    if (ev.key === 'ArrowLeft') panel.ox -= step;
    if (ev.key === 'ArrowRight') panel.ox += step;
    if (ev.key === 'ArrowUp') panel.oy -= step;
    if (ev.key === 'ArrowDown') panel.oy += step;
    panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox));
    panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy));
    shiftXEl.value = Math.round(panel.ox * 100);
    shiftYEl.value = Math.round(panel.oy * 100);
    render();
    ev.preventDefault();
  }
});

/* randomize + reset */
document.getElementById('randomize').addEventListener('click', () => {
  const rnd = Math.random;
  const layouts = Object.keys(LAYOUTS);
  state.layout = layouts[Math.floor(rnd() * layouts.length)];
  const grades = Object.keys(GRADES);
  state.grade = grades[Math.floor(rnd() * grades.length)];
  state.intensity = 0.45 + rnd() * 0.55;
  const letters = Object.keys(LETTER_STYLES);
  state.letter = letters[Math.floor(rnd() * letters.length)];
  const shuffled = [...BACKDROPS].sort(() => rnd() - 0.5);
  state.panels.forEach((panel, i) => { panel.backdrop = shuffled[i % shuffled.length]; });
  document.getElementById('intensity').value = Math.round(state.intensity * 100);
  markChips(document.getElementById('layout-row'), 'layout', state.layout);
  markChips(document.getElementById('grade-row'), 'grade', state.grade);
  markChips(document.getElementById('letter-row'), 'letter', state.letter);
  selectPanel(Math.min(state.selected, LAYOUTS[state.layout].panels.length - 1));
  setStatus('New mix: layout, grade and backdrops shuffled. Your photos stayed put.');
});
document.getElementById('reset').addEventListener('click', () => {
  const photos = state.panels.map((p) => p.img);
  state = defaultState();
  state.panels.forEach((p, i) => { p.img = photos[i] || null; });
  document.getElementById('caption').value = state.caption;
  document.getElementById('subcaption').value = state.subcaption;
  document.getElementById('intensity').value = Math.round(state.intensity * 100);
  markChips(document.getElementById('layout-row'), 'layout', state.layout);
  markChips(document.getElementById('grade-row'), 'grade', state.grade);
  markChips(document.getElementById('letter-row'), 'letter', state.letter);
  selectPanel(0);
  setStatus('Back to the classic Vice Heat composition.');
});

/* export at full size, offscreen */
function exportPng(w, h) {
  setAspect(w, h);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off.getContext('2d'), w, h, true);
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-heat-cover-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus(`Exported a ${w} × ${h} PNG — check your downloads.`);
  }, 'image/png');
}
document.getElementById('export-45').addEventListener('click', () => exportPng(1080, 1350));
document.getElementById('export-11').addEventListener('click', () => exportPng(1080, 1080));
document.getElementById('export-169').addEventListener('click', () => exportPng(1920, 1080));

/* go */
syncPanelControls();
render();
window.__appReady = true;
