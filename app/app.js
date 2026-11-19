'use strict';
/* Vice Heat — Cover Maker.
 * A fully offline, single-file canvas app: it turns a photo and a caption
 * into a multi-panel GTA-style poster (sunset / neon grades, bold lettering)
 * and exports it as a PNG. Photos are read on the user's own machine and
 * never leave it; every backdrop is original artwork drawn in code. */

const canvas = document.getElementById('posterCanvas');
const ctx = canvas.getContext('2d');

/* ---------- catalogues ---------- */
const BACKDROPS = ['sunset', 'neon', 'palm', 'skyline'];
const BACKDROP_NAMES = {
  sunset: 'Sunset Beach',
  neon: 'Neon Strip',
  palm: 'Palm Dusk',
  skyline: 'Skyline',
};

const LAYOUTS = {
  classic: [
    { x: 0, y: 0, w: 0.615, h: 1, label: 'Left — hero' },
    { x: 0.615, y: 0, w: 0.385, h: 0.5, label: 'Top right' },
    { x: 0.615, y: 0.5, w: 0.385, h: 0.5, label: 'Bottom right' },
  ],
  triptych: [
    { x: 0, y: 0, w: 1 / 3, h: 1, label: 'Left' },
    { x: 1 / 3, y: 0, w: 1 / 3, h: 1, label: 'Middle' },
    { x: 2 / 3, y: 0, w: 1 / 3, h: 1, label: 'Right' },
  ],
  duo: [
    { x: 0, y: 0, w: 0.5, h: 1, label: 'Left' },
    { x: 0.5, y: 0, w: 0.5, h: 1, label: 'Right' },
  ],
  single: [
    { x: 0, y: 0, w: 1, h: 1, label: 'Full cover' },
  ],
};

const LAYOUT_NAMES = {
  classic: 'Classic collage',
  triptych: 'Triptych',
  duo: 'Duo',
  single: 'Single hero',
};

const GRADES = {
  vice: { stops: ['#ff2e88', '#ff7a1a', '#7a1fa2'], name: 'Vice Sunset' },
  neon: { stops: ['#2ec4ff', '#ff2ec4', '#1a0b6e'], name: 'Neon Nights' },
  palm: { stops: ['#ff2e88', '#c2188b', '#3a0a5e'], name: 'Palm Dusk' },
  golden: { stops: ['#ffb02e', '#ff7a1a', '#8a3a00'], name: 'Golden Hour' },
};

const CAPTION_STYLES = {
  sunset: { fill: ['#ffd23e', '#ff7a1a', '#ff2e88'], stroke: '#2a0a4a', glow: null },
  chrome: { fill: ['#ffffff', '#c3cede', '#5a6a80'], stroke: '#101828', glow: null },
  neon: { fill: ['#ff9ae2', '#ff2ec4', '#c2188b'], stroke: '#3d0a5e', glow: '#ff2ec4' },
  paper: { fill: ['#fdf6e3', '#f5efe0', '#d8cdb4'], stroke: '#241a2e', glow: null },
};

const FRAME_COLORS = {
  white: '#e9e7f2',
  neon: '#ff2ec4',
  dark: '#171226',
  none: '#0c0a1d',
};

const EXPORT_SIZES = ['1080x1350', '1080x1080', '1920x1080'];

/* ---------- state ---------- */
function freshState() {
  return {
    layout: 'classic',
    selected: 2,
    panels: [
      { backdrop: 'sunset', photo: null, zoom: 1, shiftX: 0, shiftY: 0 },
      { backdrop: 'neon', photo: null, zoom: 1, shiftX: 0, shiftY: 0 },
      { backdrop: 'palm', photo: null, zoom: 1, shiftX: 0, shiftY: 0 },
    ],
    grade: 'vice',
    gradeIntensity: 0.7,
    caption: 'VICE HEAT',
    subCaption: 'NEON NIGHTS • PALM CITY',
    captionStyle: 'sunset',
    captionPlacement: 'bottom',
    frame: 'white',
    frameWidth: 8,
    vignette: 0.35,
    exportSize: '1080x1350',
  };
}

let state = freshState();

/* ---------- small helpers ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function panelRects(W, H) {
  return LAYOUTS[state.layout].map(function (p) {
    return {
      x: p.x * W,
      y: p.y * H,
      w: p.w * W,
      h: p.h * H,
      label: p.label,
    };
  });
}

function gutterPx(W) {
  return state.frame === 'none' ? 0 : (state.frameWidth * W) / 1080;
}

/* Clip to a rectangle, run fn with local width/height, restore. */
function clipped(c, x, y, w, h, fn) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x, y);
  fn(w, h);
  c.restore();
}

function linear(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(function (color, i) {
    g.addColorStop(i / (stops.length - 1), color);
  });
  return g;
}

function disc(c, x, y, r, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/* A palm silhouette: curved trunk with drooping fronds. (x, y) is the base. */
function drawPalm(c, x, y, s, color) {
  const topX = x + s * 0.18;
  const topY = y - s;
  c.strokeStyle = color;
  c.lineWidth = Math.max(2, s * 0.05);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + s * 0.02, y - s * 0.55, topX, topY);
  c.stroke();
  c.lineWidth = Math.max(1.5, s * 0.035);
  for (let i = 0; i < 7; i++) {
    const a = (-Math.PI * 0.92) + (i * Math.PI * 0.27);
    const len = s * (0.42 + (i % 3) * 0.06);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.55 + s * 0.16;
    c.beginPath();
    c.moveTo(topX, topY);
    c.quadraticCurveTo(
      topX + Math.cos(a) * len * 0.5,
      topY + Math.sin(a) * len * 0.28 - s * 0.1,
      ex,
      ey,
    );
    c.stroke();
  }
}

/* A person taking a selfie, as a dark silhouette. (x, y) is the feet. */
function drawSelfiePerson(c, x, y, s, color) {
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineCap = 'round';
  disc(c, x, y - s * 0.84, s * 0.11, color);
  // Torso.
  c.beginPath();
  c.moveTo(x - s * 0.13, y - s * 0.72);
  c.lineTo(x + s * 0.13, y - s * 0.72);
  c.lineTo(x + s * 0.1, y - s * 0.28);
  c.lineTo(x - s * 0.1, y - s * 0.28);
  c.closePath();
  c.fill();
  // Legs.
  c.lineWidth = s * 0.07;
  c.beginPath();
  c.moveTo(x - s * 0.05, y - s * 0.3);
  c.lineTo(x - s * 0.09, y);
  c.moveTo(x + s * 0.05, y - s * 0.3);
  c.lineTo(x + s * 0.1, y);
  c.stroke();
  // Left arm down, right arm raised holding a phone.
  c.beginPath();
  c.moveTo(x - s * 0.12, y - s * 0.68);
  c.lineTo(x - s * 0.3, y - s * 0.42);
  c.moveTo(x + s * 0.12, y - s * 0.68);
  c.lineTo(x + s * 0.34, y - s * 0.98);
  c.stroke();
  c.save();
  c.translate(x + s * 0.36, y - s * 1.0);
  c.rotate(-0.25);
  c.fillRect(-s * 0.045, -s * 0.09, s * 0.09, s * 0.16);
  c.restore();
}

function drawBirds(c, points, color) {
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.lineCap = 'round';
  points.forEach(function (p) {
    c.beginPath();
    c.moveTo(p[0] - 7, p[1]);
    c.quadraticCurveTo(p[0] - 3, p[1] - 5, p[0], p[1]);
    c.quadraticCurveTo(p[0] + 3, p[1] - 5, p[0] + 7, p[1]);
    c.stroke();
  });
}

function drawSkyline(c, w, baseY, h, color, windowColor, seed) {
  const r = mulberry32(seed);
  let x = 0;
  c.fillStyle = color;
  while (x < w) {
    const bw = w * (0.06 + r() * 0.09);
    const bh = h * (0.18 + r() * 0.42);
    c.fillRect(x, baseY - bh, bw, bh);
    if (r() < 0.3) c.fillRect(x + bw * 0.42, baseY - bh - h * 0.09, bw * 0.16, h * 0.09);
    // Lit windows.
    c.fillStyle = windowColor;
    const cols = Math.max(1, Math.floor(bw / (w * 0.028)));
    const rows = Math.max(1, Math.floor(bh / (h * 0.055)));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (r() < 0.32) {
          c.globalAlpha = 0.35 + r() * 0.6;
          c.fillRect(x + bw * 0.14 + i * bw * 0.72 / cols, baseY - bh + h * 0.05 + j * bh * 0.8 / rows, Math.max(2, w * 0.008), Math.max(2, h * 0.012));
        }
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = color;
    x += bw + w * 0.012;
  }
}

/* ---------- backdrops: original canvas artwork ---------- */
const BACKDROP_PAINTERS = {
  sunset: function (c, w, h) {
    const r = mulberry32(11);
    c.fillStyle = linear(c, 0, 0, 0, h, ['#3b0a8a', '#a4138f', '#ff2e88', '#ff7a1a']);
    c.fillRect(0, 0, w, h);
    // Clouds.
    c.fillStyle = 'rgba(122, 31, 162, 0.5)';
    [[0.08, 0.16, 0.22], [0.62, 0.1, 0.18], [0.3, 0.3, 0.16]].forEach(function (cl) {
      c.beginPath();
      c.ellipse(w * cl[0], h * cl[1], w * cl[2], h * 0.022, 0, 0, Math.PI * 2);
      c.fill();
    });
    drawBirds(c, [[w * 0.2, h * 0.2], [w * 0.78, h * 0.24], [w * 0.45, h * 0.14]], 'rgba(42, 10, 74, 0.8)');
    // Sun with halo rings.
    const sx = w * 0.5;
    const sy = h * 0.6;
    disc(c, sx, sy, w * 0.3, 'rgba(255, 122, 26, 0.16)');
    disc(c, sx, sy, w * 0.21, 'rgba(255, 122, 26, 0.22)');
    disc(c, sx, sy, w * 0.13, '#ffd23e');
    // Ocean with light dashes.
    c.fillStyle = '#2a0a4a';
    c.fillRect(0, h * 0.72, w, h * 0.28);
    for (let i = 0; i < 110; i++) {
      const y = h * (0.74 + r() * 0.22);
      const len = w * (0.02 + r() * 0.09);
      c.globalAlpha = 0.15 + r() * 0.5;
      c.fillStyle = r() < 0.7 ? '#ffd23e' : '#ff7a1a';
      c.fillRect(r() * w, y, len, Math.max(1.5, h * 0.003));
    }
    c.globalAlpha = 1;
    // Shore and silhouettes.
    c.fillStyle = '#160a2e';
    c.fillRect(0, h * 0.95, w, h * 0.05);
    drawPalm(c, w * 0.07, h * 0.99, h * 0.26, '#160a2e');
    drawSelfiePerson(c, w * 0.42, h * 0.97, h * 0.17, '#160a2e');
  },

  neon: function (c, w, h) {
    const r = mulberry32(23);
    c.fillStyle = linear(c, 0, 0, 0, h, ['#0b0e2e', '#1c0b52', '#2a0a4a']);
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      c.globalAlpha = 0.25 + r() * 0.7;
      c.fillStyle = '#ffffff';
      c.fillRect(r() * w, r() * h * 0.55, 1.6, 1.6);
    }
    c.globalAlpha = 1;
    // Neon ring.
    c.save();
    c.strokeStyle = '#ff2ec4';
    c.shadowColor = '#ff2ec4';
    c.shadowBlur = w * 0.045;
    c.lineWidth = w * 0.016;
    c.beginPath();
    c.arc(w * 0.55, h * 0.36, w * 0.27, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255, 154, 226, 0.9)';
    c.lineWidth = w * 0.005;
    c.beginPath();
    c.arc(w * 0.55, h * 0.36, w * 0.27, 0, Math.PI * 2);
    c.stroke();
    drawSkyline(c, w, h * 0.68, h, '#0a0618', '#4fd8cf', 47);
    // Perspective grid floor.
    const horizon = h * 0.68;
    c.fillStyle = linear(c, 0, horizon, 0, h, ['#1a0b4a', '#12062e']);
    c.fillRect(0, horizon, w, h - horizon);
    c.strokeStyle = 'rgba(46, 196, 255, 0.55)';
    c.lineWidth = 1.4;
    for (let i = -6; i <= 6; i++) {
      c.beginPath();
      c.moveTo(w * 0.5 + i * w * 0.03, horizon);
      c.lineTo(w * 0.5 + i * w * 0.22, h);
      c.stroke();
    }
    for (let i = 1; i <= 7; i++) {
      const y = horizon + (h - horizon) * (i * i) / 49;
      c.globalAlpha = 0.25 + (i / 7) * 0.5;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.globalAlpha = 1;
    drawPalm(c, w * 0.04, h * 0.72, h * 0.16, '#0a0618');
    drawPalm(c, w * 0.96, h * 0.72, h * 0.14, '#0a0618');
  },

  palm: function (c, w, h) {
    const r = mulberry32(37);
    c.fillStyle = linear(c, 0, 0, 0, h, ['#4a0a7a', '#c2188b', '#ff5e3a', '#ff8c1a']);
    c.fillRect(0, 0, w, h);
    const sx = w * 0.66;
    const sy = h * 0.68;
    disc(c, sx, sy, w * 0.34, 'rgba(255, 210, 62, 0.14)');
    disc(c, sx, sy, w * 0.24, 'rgba(255, 210, 62, 0.2)');
    disc(c, sx, sy, w * 0.17, '#ffd23e');
    c.fillStyle = 'rgba(122, 31, 162, 0.45)';
    [[0.15, 0.22, 0.2], [0.7, 0.14, 0.16]].forEach(function (cl) {
      c.beginPath();
      c.ellipse(w * cl[0], h * cl[1], w * cl[2], h * 0.02, 0, 0, Math.PI * 2);
      c.fill();
    });
    drawBirds(c, [[w * 0.25, h * 0.18], [w * 0.55, h * 0.12]], 'rgba(42, 10, 74, 0.7)');
    c.fillStyle = '#1c0533';
    c.fillRect(0, h * 0.88, w, h * 0.12);
    for (let i = 0; i < 40; i++) {
      c.globalAlpha = 0.12 + r() * 0.4;
      c.fillStyle = '#ffb02e';
      c.fillRect(r() * w, h * (0.9 + r() * 0.08), w * (0.02 + r() * 0.06), 1.5);
    }
    c.globalAlpha = 1;
    drawPalm(c, w * 0.1, h * 0.94, h * 0.3, '#160a2e');
    drawPalm(c, w * 0.9, h * 0.94, h * 0.24, '#160a2e');
  },

  skyline: function (c, w, h) {
    const r = mulberry32(59);
    c.fillStyle = linear(c, 0, 0, 0, h, ['#1a0b4a', '#ff5e3a', '#ffb02e']);
    c.fillRect(0, 0, w, h);
    disc(c, w * 0.3, h * 0.28, w * 0.16, 'rgba(255, 243, 196, 0.25)');
    disc(c, w * 0.3, h * 0.28, w * 0.09, '#fff3c4');
    drawSkyline(c, w, h * 0.74, h, '#14082e', '#ffd23e', 91);
    // Water with warm reflections.
    c.fillStyle = '#241040';
    c.fillRect(0, h * 0.74, w, h * 0.26);
    for (let i = 0; i < 70; i++) {
      c.globalAlpha = 0.15 + r() * 0.45;
      c.fillStyle = r() < 0.6 ? '#ffb02e' : '#ff7a1a';
      c.fillRect(r() * w, h * (0.76 + r() * 0.2), w * (0.03 + r() * 0.08), 1.5);
    }
    c.globalAlpha = 1;
    drawPalm(c, w * 0.06, h * 0.78, h * 0.18, '#14082e');
  },
};

/* ---------- photo ---------- */
function drawPhoto(c, img, panel, x, y, w, h) {
  const base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const s = base * panel.zoom;
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const dx = x + (w - dw) / 2 + panel.shiftX * w;
  const dy = y + (h - dh) / 2 + panel.shiftY * h;
  c.drawImage(img, dx, dy, dw, dh);
}

/* ---------- render pipeline ---------- */
function renderInto(c, W, H, forExport) {
  const g = gutterPx(W);
  c.clearRect(0, 0, W, H);
  c.fillStyle = FRAME_COLORS[state.frame];
  c.fillRect(0, 0, W, H);

  const rects = panelRects(W, H);
  rects.forEach(function (rect, i) {
    const panel = state.panels[i];
    const x = rect.x + g;
    const y = rect.y + g;
    const w = rect.w - g * 2;
    const h = rect.h - g * 2;
    clipped(c, x, y, w, h, function (pw, ph) {
      if (panel.photo) {
        drawPhoto(c, panel.photo, panel, 0, 0, pw, ph);
      } else {
        BACKDROP_PAINTERS[panel.backdrop](c, pw, ph);
      }
    });
    if (!forExport && i === state.selected) {
      c.save();
      c.strokeStyle = '#4fd8cf';
      c.lineWidth = Math.max(2, W * 0.004);
      c.setLineDash([W * 0.012, W * 0.008]);
      c.strokeRect(x + 2, y + 2, w - 4, h - 4);
      c.restore();
    }
  });

  // Colour grade: a tint wash in overlay blend over the whole cover.
  const grade = GRADES[state.grade];
  if (state.gradeIntensity > 0) {
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.18 + 0.42 * state.gradeIntensity;
    c.fillStyle = linear(c, 0, 0, 0, H, grade.stops);
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  // Vignette: darken the edges so the caption pops.
  if (state.vignette > 0) {
    const v = c.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.42,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    v.addColorStop(0, 'rgba(8, 3, 20, 0)');
    v.addColorStop(1, 'rgba(8, 3, 20, ' + (state.vignette * 0.85).toFixed(3) + ')');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  drawCaption(c, W, H);
}

function fitFont(c, text, startPx, maxWidth, family) {
  let px = startPx;
  c.font = '900 ' + px + 'px ' + family;
  while (px > 24 && c.measureText(text).width > maxWidth) {
    px -= 2;
    c.font = '900 ' + px + 'px ' + family;
  }
  return px;
}

function drawCaption(c, W, H) {
  const main = (state.caption || '').toUpperCase();
  const sub = (state.subCaption || '').toUpperCase();
  if (!main && !sub) return;
  const family = '"Arial Narrow", "Helvetica Neue", Impact, sans-serif';
  const top = state.captionPlacement === 'top';

  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';

  let mainBaseline;
  let subBaseline;
  if (top) {
    subBaseline = H * 0.075;
    mainBaseline = H * 0.155;
  } else {
    subBaseline = H * 0.865;
    mainBaseline = H * 0.955;
  }

  if (sub) {
    const subPx = fitFont(c, sub, Math.round(W * 0.045), W * 0.92, family);
    try { c.letterSpacing = Math.round(subPx * 0.32) + 'px'; } catch (e) { /* older canvas */ }
    c.font = '900 ' + subPx + 'px ' + family;
    c.lineWidth = Math.max(2, subPx * 0.14);
    c.strokeStyle = '#2a0a4a';
    c.fillStyle = '#ffd23e';
    c.strokeText(sub, W / 2, subBaseline);
    c.fillText(sub, W / 2, subBaseline);
    try { c.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
  }

  if (main) {
    const mainPx = fitFont(c, main, Math.round(W * 0.17), W * 0.94, family);
    const style = CAPTION_STYLES[state.captionStyle];
    const grad = c.createLinearGradient(0, mainBaseline - mainPx, 0, mainBaseline + mainPx * 0.12);
    grad.addColorStop(0, style.fill[0]);
    grad.addColorStop(0.55, style.fill[1]);
    grad.addColorStop(1, style.fill[2]);
    c.font = '900 ' + mainPx + 'px ' + family;
    c.lineWidth = Math.max(3, mainPx * 0.085);
    c.strokeStyle = style.stroke;
    if (style.glow) {
      c.shadowColor = style.glow;
      c.shadowBlur = mainPx * 0.22;
    } else {
      c.shadowColor = 'rgba(10, 4, 24, 0.55)';
      c.shadowBlur = mainPx * 0.04;
      c.shadowOffsetY = mainPx * 0.02;
    }
    c.strokeText(main, W / 2, mainBaseline);
    c.fillStyle = grad;
    c.fillText(main, W / 2, mainBaseline);
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    // Pink underline bar beneath the main caption.
    const barW = W * 0.52;
    const barH = Math.max(3, H * 0.006);
    const barY = mainBaseline + mainPx * 0.1;
    if (barY + barH < H - 4) {
      c.fillStyle = linear(c, W / 2 - barW / 2, 0, W / 2 + barW / 2, 0, ['#ff2e88', '#ff7a1a', '#ffd23e']);
      c.fillRect(W / 2 - barW / 2, barY, barW, barH);
    }
  }
  c.restore();
}

function renderPreview() {
  renderInto(ctx, canvas.width, canvas.height, false);
}

function fitPreviewToExport() {
  const parts = state.exportSize.split('x');
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  const scale = 864 / w;
  canvas.width = 864;
  canvas.height = Math.round(h * scale);
  renderPreview();
}

/* ---------- export ---------- */
function exportPng() {
  const parts = state.exportSize.split('x');
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderInto(off.getContext('2d'), w, h, true);
  off.toBlob(function (blob) {
    if (!blob) {
      setStatus('Export failed — the browser could not make the PNG.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vice-heat-' + state.exportSize + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    setStatus('Exported vice-heat-' + state.exportSize + '.png — check your downloads.');
  }, 'image/png');
}

/* ---------- UI sync ---------- */
const $ = function (id) { return document.getElementById(id); };

function setStatus(text) {
  $('statusLine').textContent = text;
}

function markActive(rowId, attr, value) {
  document.querySelectorAll('#' + rowId + ' .chip').forEach(function (chip) {
    chip.classList.toggle('is-active', chip.getAttribute(attr) === value);
  });
}

function syncUI() {
  markActive('layoutRow', 'data-layout', state.layout);
  markActive('gradeRow', 'data-grade', state.grade);
  markActive('captionStyleRow', 'data-caption-style', state.captionStyle);
  markActive('captionPlaceRow', 'data-placement', state.captionPlacement);
  markActive('frameRow', 'data-frame', state.frame);
  markActive('exportRow', 'data-size', state.exportSize);
  $('zoomSlider').value = String(state.panels[state.selected].zoom);
  $('shiftXSlider').value = String(state.panels[state.selected].shiftX);
  $('shiftYSlider').value = String(state.panels[state.selected].shiftY);
  $('gradeSlider').value = String(state.gradeIntensity);
  $('captionInput').value = state.caption;
  $('subCaptionInput').value = state.subCaption;
  $('frameWidthSlider').value = String(state.frameWidth);
  $('vignetteSlider').value = String(Math.round(state.vignette * 100));
  const rects = panelRects(canvas.width, canvas.height);
  const panel = state.panels[state.selected];
  const label = rects[state.selected] ? rects[state.selected].label : '';
  $('panelStatus').textContent =
    'Panel ' + (state.selected + 1) + ' — ' + label +
    ' · backdrop: ' + BACKDROP_NAMES[panel.backdrop] +
    (panel.photo ? ' · photo loaded' : '');
}

function refresh() {
  syncUI();
  renderPreview();
}

/* ---------- photo loading ---------- */
function loadPhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('That file is not an image — pick a photo file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = function () {
      const panel = state.panels[state.selected];
      panel.photo = img;
      panel.zoom = 1;
      panel.shiftX = 0;
      panel.shiftY = 0;
      refresh();
      setStatus('Photo loaded into panel ' + (state.selected + 1) +
        '. Drag it to reposition, or export when ready.');
    };
    img.onerror = function () {
      setStatus('Could not read that image — try another photo file.');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function hitPanel(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = (clientX - r.left) * (canvas.width / r.width);
  const y = (clientY - r.top) * (canvas.height / r.height);
  const rects = panelRects(canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    if (x >= rects[i].x && x <= rects[i].x + rects[i].w &&
        y >= rects[i].y && y <= rects[i].y + rects[i].h) {
      return { index: i, x: x, y: y, rect: rects[i] };
    }
  }
  return null;
}

/* ---------- events ---------- */
function bindChipRow(rowId, attr, apply) {
  document.getElementById(rowId).addEventListener('click', function (e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    apply(chip.getAttribute(attr));
  });
}

bindChipRow('layoutRow', 'data-layout', function (v) {
  state.layout = v;
  state.selected = Math.min(state.selected, LAYOUTS[v].length - 1);
  refresh();
});
bindChipRow('gradeRow', 'data-grade', function (v) {
  state.grade = v;
  refresh();
});
bindChipRow('captionStyleRow', 'data-caption-style', function (v) {
  state.captionStyle = v;
  refresh();
});
bindChipRow('captionPlaceRow', 'data-placement', function (v) {
  state.captionPlacement = v;
  refresh();
});
bindChipRow('frameRow', 'data-frame', function (v) {
  state.frame = v;
  refresh();
});
bindChipRow('exportRow', 'data-size', function (v) {
  state.exportSize = v;
  fitPreviewToExport();
  syncUI();
});

$('zoomSlider').addEventListener('input', function (e) {
  state.panels[state.selected].zoom = parseFloat(e.target.value);
  renderPreview();
});
$('shiftXSlider').addEventListener('input', function (e) {
  state.panels[state.selected].shiftX = parseFloat(e.target.value);
  renderPreview();
});
$('shiftYSlider').addEventListener('input', function (e) {
  state.panels[state.selected].shiftY = parseFloat(e.target.value);
  renderPreview();
});
$('gradeSlider').addEventListener('input', function (e) {
  state.gradeIntensity = parseFloat(e.target.value);
  renderPreview();
});
$('frameWidthSlider').addEventListener('input', function (e) {
  state.frameWidth = parseInt(e.target.value, 10);
  renderPreview();
});
$('vignetteSlider').addEventListener('input', function (e) {
  state.vignette = parseInt(e.target.value, 10) / 100;
  renderPreview();
});
$('captionInput').addEventListener('input', function (e) {
  state.caption = e.target.value.toUpperCase();
  renderPreview();
});
$('subCaptionInput').addEventListener('input', function (e) {
  state.subCaption = e.target.value.toUpperCase();
  renderPreview();
});

$('loadPhotoBtn').addEventListener('click', function () { $('photoInput').click(); });
$('photoInput').addEventListener('change', function (e) {
  loadPhotoFile(e.target.files[0]);
  e.target.value = '';
});
$('swapBackdropBtn').addEventListener('click', function () {
  const panel = state.panels[state.selected];
  const next = (BACKDROPS.indexOf(panel.backdrop) + 1) % BACKDROPS.length;
  panel.backdrop = BACKDROPS[next];
  refresh();
  setStatus('Backdrop is now ' + BACKDROP_NAMES[panel.backdrop] + '.');
});
$('clearPhotoBtn').addEventListener('click', function () {
  const panel = state.panels[state.selected];
  if (panel.photo) {
    panel.photo = null;
    panel.zoom = 1;
    panel.shiftX = 0;
    panel.shiftY = 0;
    refresh();
    setStatus('Panel ' + (state.selected + 1) + ' is back to its ' +
      BACKDROP_NAMES[panel.backdrop] + ' backdrop.');
  }
});

$('surpriseBtn').addEventListener('click', function () {
  const layouts = Object.keys(LAYOUTS);
  const grades = Object.keys(GRADES);
  const styles = Object.keys(CAPTION_STYLES);
  const frames = Object.keys(FRAME_COLORS);
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  state.layout = pick(layouts);
  state.grade = pick(grades);
  state.captionStyle = pick(styles);
  state.frame = pick(frames);
  state.captionPlacement = Math.random() < 0.75 ? 'bottom' : 'top';
  state.gradeIntensity = 0.45 + Math.random() * 0.5;
  state.vignette = 0.15 + Math.random() * 0.45;
  state.frameWidth = 4 + Math.floor(Math.random() * 20);
  state.panels.forEach(function (panel) {
    panel.backdrop = pick(BACKDROPS);
  });
  state.selected = Math.min(state.selected, LAYOUTS[state.layout].length - 1);
  refresh();
  setStatus('Surprise! ' + LAYOUT_NAMES[state.layout] + ' · ' +
    GRADES[state.grade].name + ' grade · ' + state.captionStyle + ' lettering.');
});

$('resetBtn').addEventListener('click', function () {
  state = freshState();
  fitPreviewToExport();
  refresh();
  setStatus('Reset to the default Vice Heat cover.');
});

/* Canvas pointer: click to select, drag to move the photo, double-click to load. */
let drag = null;
canvas.addEventListener('pointerdown', function (e) {
  const hit = hitPanel(e.clientX, e.clientY);
  if (!hit) return;
  state.selected = hit.index;
  const panel = state.panels[hit.index];
  if (panel.photo) {
    drag = { x: hit.x, y: hit.y, rect: hit.rect, panel: panel };
    canvas.setPointerCapture(e.pointerId);
  }
  refresh();
});
canvas.addEventListener('pointermove', function (e) {
  if (!drag) return;
  const hit = hitPanel(e.clientX, e.clientY);
  if (!hit) return;
  drag.panel.shiftX = clamp(drag.panel.shiftX + (hit.x - drag.x) / drag.rect.w, -0.5, 0.5);
  drag.panel.shiftY = clamp(drag.panel.shiftY + (hit.y - drag.y) / drag.rect.h, -0.5, 0.5);
  drag.x = hit.x;
  drag.y = hit.y;
  syncUI();
  renderPreview();
});
canvas.addEventListener('pointerup', function () { drag = null; });
canvas.addEventListener('pointercancel', function () { drag = null; });
canvas.addEventListener('dblclick', function () { $('photoInput').click(); });
canvas.addEventListener('dragover', function (e) { e.preventDefault(); });
canvas.addEventListener('drop', function (e) {
  e.preventDefault();
  const hit = hitPanel(e.clientX, e.clientY);
  if (hit) state.selected = hit.index;
  if (e.dataTransfer.files.length > 0) loadPhotoFile(e.dataTransfer.files[0]);
});

document.addEventListener('keydown', function (e) {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const panel = state.panels[state.selected];
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (panel.photo) {
      panel.photo = null;
      panel.zoom = 1;
      panel.shiftX = 0;
      panel.shiftY = 0;
      refresh();
      setStatus('Panel ' + (state.selected + 1) + ' cleared back to its backdrop.');
    }
  } else if (e.key.indexOf('Arrow') === 0 && panel.photo) {
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowLeft') panel.shiftX = clamp(panel.shiftX - step, -0.5, 0.5);
    if (e.key === 'ArrowRight') panel.shiftX = clamp(panel.shiftX + step, -0.5, 0.5);
    if (e.key === 'ArrowUp') panel.shiftY = clamp(panel.shiftY - step, -0.5, 0.5);
    if (e.key === 'ArrowDown') panel.shiftY = clamp(panel.shiftY + step, -0.5, 0.5);
    e.preventDefault();
    syncUI();
    renderPreview();
  }
});

/* ---------- boot ---------- */
fitPreviewToExport();
refresh();

/* Export button: renders the cover at the chosen size and downloads it. */
$('exportBtn').addEventListener('click', exportPng);
