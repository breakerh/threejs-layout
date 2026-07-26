// Orthographic layout diagrams + placement report for any Three.js object.
//
// Drop-in: import it into a page that already builds a scene, call it once
// after the object exists, and you get top/side/front views drawn from the real
// measured bounding boxes plus a written report of what looks wrong.
//
//   import { inspectLayout } from './layout-inspector.js';
//   inspectLayout(THREE, myGroup);                    // floating panel
//   inspectLayout(THREE, myGroup, { mount: someDiv }); // inline
//
// No renderer, no canvas context loss, no interference with your scene — this
// is pure Box3 math drawn onto 2D canvases.
import { measureLayout, checkOverlaps, checkGrounding } from './scene-layout.js';

const VIEWS = [
  { key: 'top',   label: 'Top (X / Z)',   axisH: 'x', axisV: 'z', flipV: false, ground: false },
  { key: 'front', label: 'Front (X / Y)', axisH: 'x', axisV: 'y', flipV: true,  ground: true },
  { key: 'side',  label: 'Side (Z / Y)',  axisH: 'z', axisV: 'y', flipV: true,  ground: true },
];

export function colorForName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 50%)`;
}

// Draws one orthographic projection. Grid lines are 1 unit apart with every
// 5th labelled, so you can read distances straight off the picture.
export function drawView(canvas, entries, view, { groundY = 0, margin = 1, highlight = new Set() } = {}) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const { axisH, axisV, flipV } = view;
  ctx.clearRect(0, 0, W, H);

  let minH = Infinity, maxH = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const e of entries) {
    minH = Math.min(minH, e.box.min[axisH]); maxH = Math.max(maxH, e.box.max[axisH]);
    minV = Math.min(minV, e.box.min[axisV]); maxV = Math.max(maxV, e.box.max[axisV]);
  }
  if (!entries.length) { minH = minV = -1; maxH = maxV = 1; }
  if (view.ground) { minV = Math.min(minV, groundY); maxV = Math.max(maxV, groundY); }
  minH -= margin; maxH += margin; minV -= margin; maxV += margin;

  const scale = Math.min(W / (maxH - minH), H / (maxV - minV));
  const offX = (W - (maxH - minH) * scale) / 2;
  const offY = (H - (maxV - minV) * scale) / 2;
  const sx = h => offX + (h - minH) * scale;
  const sy = v => flipV ? H - offY - (v - minV) * scale : offY + (v - minV) * scale;

  ctx.font = '10px monospace';
  const step = (maxH - minH) > 60 ? 5 : 1;
  for (let h = Math.ceil(minH); h <= maxH; h += step) {
    const major = h % 5 === 0;
    ctx.strokeStyle = major ? '#b4b4b4' : '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(h), 0); ctx.lineTo(sx(h), H); ctx.stroke();
    if (major) { ctx.fillStyle = '#999'; ctx.fillText(h, sx(h) + 2, H - 4); }
  }
  for (let v = Math.ceil(minV); v <= maxV; v += step) {
    const major = v % 5 === 0;
    ctx.strokeStyle = major ? '#b4b4b4' : '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, sy(v)); ctx.lineTo(W, sy(v)); ctx.stroke();
    if (major) { ctx.fillStyle = '#999'; ctx.fillText(v, 2, sy(v) - 2); }
  }

  if (view.ground) {
    ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, sy(groundY)); ctx.lineTo(W, sy(groundY)); ctx.stroke();
  }

  for (const e of entries) {
    const x0 = sx(e.box.min[axisH]), x1 = sx(e.box.max[axisH]);
    const y0 = sy(e.box.min[axisV]), y1 = sy(e.box.max[axisV]);
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    const flagged = highlight.has(e.name);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = colorForName(e.name);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = flagged ? '#c0392b' : colorForName(e.name);
    ctx.lineWidth = flagged ? 3 : 1.5;
    if (flagged) ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

const fmt = n => (Math.round(n * 1000) / 1000).toFixed(3);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function reportHTML({ entries, overlaps, grounding, unit }) {
  const colliding = overlaps.filter(o => o.kind === 'colliding');
  const expected = overlaps.filter(o => o.kind !== 'colliding');
  const bugs = grounding.filter(g => g.likelyBug);
  const elevated = grounding.filter(g => !g.likelyBug);
  const out = [];

  out.push(`<p>${entries.length} objects measured. Sizes in ${esc(unit)}.</p>`);

  if (!colliding.length) {
    out.push(`<p class="ok">&#10003; No unexplained collisions between objects.</p>`);
  } else {
    out.push(`<p class="bad">&#9888; ${colliding.length} colliding pair(s) &mdash; independently placed objects that clash:</p><ul>`);
    for (const o of colliding) {
      out.push(`<li><b>${esc(o.a)}</b> &harr; <b>${esc(o.b)}</b> &mdash; intersects ${fmt(o.overlap.x)} &times; ${fmt(o.overlap.y)} &times; ${fmt(o.overlap.z)}, footprints share ${Math.round(o.footprintRatio * 100)}%, ${Math.round(o.verticalRatio * 100)}% of the shorter one's height</li>`);
    }
    out.push('</ul>');
  }

  if (expected.length) {
    out.push(`<details><summary>${expected.length} touching pair(s) that look deliberate (nested / concentric / stacked)</summary><ul>`);
    for (const o of expected) {
      out.push(`<li>${esc(o.a)} &harr; ${esc(o.b)} &mdash; <i>${o.kind}</i>, ${fmt(o.overlap.x)} &times; ${fmt(o.overlap.y)} &times; ${fmt(o.overlap.z)}</li>`);
    }
    out.push('</ul></details>');
  }

  if (!bugs.length) {
    out.push(`<p class="ok">&#10003; Everything placed at ground level actually touches the ground.</p>`);
  } else {
    out.push(`<p class="bad">&#9888; ${bugs.length} object(s) placed at ground level but not resting on it:</p><ul>`);
    for (const g of bugs) {
      out.push(`<li><b>${esc(g.name)}</b> &mdash; ${g.status === 'floating' ? `floats ${fmt(g.gap)} above` : `sunk ${fmt(-g.gap)} below`} the ground</li>`);
    }
    out.push('</ul>');
  }

  if (elevated.length) {
    out.push(`<details><summary>${elevated.length} object(s) off the ground on purpose (or with geometry-baked offsets)</summary><ul>`);
    for (const g of elevated) {
      out.push(`<li>${esc(g.name)} &mdash; ${g.status}, ${fmt(Math.abs(g.gap))} ${g.status === 'floating' ? 'above' : 'below'} ground${g.placedOnGround ? ' (position.y is 0 &mdash; likely a baked geometry offset)' : ''}</li>`);
    }
    out.push('</ul></details>');
  }

  return out.join('\n');
}

const PANEL_CSS = `
.tjs-layout { font: 13px/1.5 ui-monospace, 'Courier New', monospace; color: #222; background: #fff;
  border: 1px solid #ccc; border-radius: 8px; padding: 12px; box-sizing: border-box; }
.tjs-layout * { box-sizing: border-box; }
.tjs-layout h2 { font-size: 14px; margin: 0 0 8px; }
.tjs-layout .views { display: flex; gap: 12px; flex-wrap: wrap; }
.tjs-layout figure { margin: 0; }
.tjs-layout figcaption { font-size: 12px; color: #555; margin-bottom: 4px; }
.tjs-layout canvas { background: #fafaf8; border: 1px solid #ddd; display: block; max-width: 100%; }
.tjs-layout .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 10px 0; font-size: 11px; }
.tjs-layout .legend span { display: inline-flex; align-items: center; gap: 5px; }
.tjs-layout .sw { width: 11px; height: 11px; border: 1px solid #333; flex: none; }
.tjs-layout .ok { color: #1c6b34; }
.tjs-layout .bad { color: #b02a1e; }
.tjs-layout ul { margin: 4px 0; padding-left: 20px; }
.tjs-layout details { margin: 6px 0; color: #666; }
.tjs-layout summary { cursor: pointer; }
.tjs-layout--floating { position: fixed; right: 12px; top: 12px; bottom: 12px; width: min(760px, 46vw);
  overflow: auto; z-index: 99999; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
`;

/**
 * Measure an object, draw top/front/side views, and report placement problems.
 *
 * @param {object} THREE   your THREE namespace
 * @param {object} root    the Object3D whose *direct children* you want to check
 * @param {object} [opts]
 * @param {HTMLElement} [opts.mount]  where to render (default: floating panel on <body>)
 * @param {number} [opts.groundY=0]   ground plane height
 * @param {number} [opts.epsilon=0.02] tolerance, in scene units
 * @param {string} [opts.unit='m']    label only
 * @param {number} [opts.size=420]    canvas edge in px
 * @param {string[]} [opts.views]     subset of 'top' | 'front' | 'side'
 * @returns {{entries, overlaps, grounding, element}}
 */
export function inspectLayout(THREE, root, opts = {}) {
  const { mount, groundY = 0, unit = 'm', size = 420, views = ['top', 'front', 'side'], title } = opts;

  const entries = measureLayout(THREE, root, opts);
  const overlaps = checkOverlaps(entries, opts);
  const grounding = checkGrounding(entries, { groundY, ...opts });

  const highlight = new Set([
    ...overlaps.filter(o => o.kind === 'colliding').flatMap(o => [o.a, o.b]),
    ...grounding.filter(g => g.likelyBug).map(g => g.name),
  ]);

  if (!document.getElementById('tjs-layout-css')) {
    const style = document.createElement('style');
    style.id = 'tjs-layout-css';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  const panel = document.createElement('div');
  panel.className = 'tjs-layout' + (mount ? '' : ' tjs-layout--floating');
  panel.innerHTML = `
    <h2>Layout check &mdash; ${esc(title || root.name || 'scene')}</h2>
    <div class="views">${views.map(k => {
      const v = VIEWS.find(x => x.key === k);
      return `<figure><figcaption>${v.label}${v.ground ? ' &middot; green = ground' : ''}</figcaption>
        <canvas data-view="${k}" width="${size}" height="${size}"></canvas></figure>`;
    }).join('')}</div>
    <div class="legend">${entries.map(e =>
      `<span><i class="sw" style="background:${colorForName(e.name)}"></i>${esc(e.name)}</span>`).join('')}</div>
    <div class="report">${reportHTML({ entries, overlaps, grounding, unit })}</div>`;

  (mount || document.body).appendChild(panel);

  for (const key of views) {
    const view = VIEWS.find(v => v.key === key);
    drawView(panel.querySelector(`canvas[data-view="${key}"]`), entries, view, { groundY, highlight });
  }

  return { entries, overlaps, grounding, element: panel };
}
