// The radial map: SVG drawing, pan and zoom (mouse, trackpad, touch, keyboard) and the fly-to animation.
// All geometry comes from layout.js; all text comes from the model the app passes in.

import { emblem, glyphOutline, esc } from './emblem.js';
import { PLACES, HERO_R, ROW } from './layout.js';

const K_MIN = 0.12;
const K_MAX = 5;
const LOD = { mid: 0.5, near: 1.15, deep: 2.2 };
const NS = 'http://www.w3.org/2000/svg';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;

function wedgePath(s) {
  const span = Math.min(s.a1 - s.a0, Math.PI * 2 - 0.002);
  const a1 = s.a0 + span;
  const big = span > Math.PI ? 1 : 0;
  return `M${pt(s.outerR, s.a0)}A${s.outerR} ${s.outerR} 0 ${big} 1 ${pt(s.outerR, a1)}L${pt(s.innerR, a1)}A${s.innerR} ${s.innerR} 0 ${big} 0 ${pt(s.innerR, s.a0)}Z`;
}
function arcPath(r, a0, a1) {
  const span = Math.min(a1 - a0, Math.PI * 2 - 0.002);
  return `M${pt(r, a0)}A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${pt(r, a0 + span)}`;
}

const ellipsize = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
function wrap2(s, n) {
  const words = s.split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= n) lines[lines.length - 1] = `${cur} ${w}`;
    else if (lines.length < 2) lines.push(w);
    else lines[1] = `${lines[1]} ${w}`;
  }
  return lines.slice(0, 2).map((l) => ellipsize(l, n));
}

const MARKS = {
  missed: '<circle cx="8" cy="8" r="7"/><path d="M8 4.2v4.4M8 11.1v.4" fill="none" stroke-width="1.8" stroke-linecap="round"/>',
  disabled: '<circle cx="8" cy="8" r="7"/><rect x="5" y="7.2" width="6" height="4.6" rx="1" stroke-width="1.2"/><path d="M6.2 7.2V5.9a1.8 1.8 0 013.6 0v1.3" fill="none" stroke-width="1.2"/>',
  candidate: '<circle cx="8" cy="8" r="7"/><path d="M8 4.5v7M4.5 8h7" fill="none" stroke-width="1.8" stroke-linecap="round"/>',
  tested: '<circle cx="8" cy="8" r="7"/><path d="M4.8 8.3l2.2 2.2 4.2-4.6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  rejected: '<circle cx="8" cy="8" r="7"/><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" fill="none" stroke-width="1.8" stroke-linecap="round"/>',
  catalog: '<circle cx="8" cy="8" r="7"/><path d="M4.8 8.3l2.2 2.2 4.2-4.6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
const mark = (kind, x, y, size, cls) => `<g class="mk ${cls || ''}" transform="translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${(size / 16).toFixed(3)})">${MARKS[kind]}</g>`;

export function createMap(root, cb) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'map-svg lod-mid');
  svg.setAttribute('role', 'group');
  svg.setAttribute('tabindex', '0');
  svg.innerHTML = '<defs><pattern id="dust" width="150" height="150" patternUnits="userSpaceOnUse"><circle cx="20" cy="30" r="1.1"/><circle cx="95" cy="70" r="0.8"/><circle cx="130" cy="120" r="1.3"/><circle cx="55" cy="125" r="0.7"/></pattern>'
    + '<radialGradient id="glow"><stop offset="0" stop-color="var(--gold)" stop-opacity=".34"/><stop offset=".55" stop-color="var(--gold)" stop-opacity=".08"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></radialGradient></defs>'
    + '<rect class="dust" width="100%" height="100%" fill="url(#dust)"/><g class="world"></g>';
  root.prepend(svg);
  const world = svg.querySelector('.world');
  const dust = svg.querySelector('#dust');

  let W = 800; let H = 600;
  let view = { x: 400, y: 300, k: 0.5 };
  let model = null;
  let anim = 0;
  let needFit = true;
  let sized = false;
  let inset = 0; // left strip covered by the branch list
  let lodNow = '';
  const els = new Map();

  /* ---------- view ---------- */
  function lodName(k) { return k >= LOD.deep ? 'deep' : k >= LOD.near ? 'near' : k >= LOD.mid ? 'mid' : 'far'; }
  function apply() {
    world.setAttribute('transform', `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`);
    dust.setAttribute('patternTransform', `translate(${(view.x * 0.35).toFixed(1)} ${(view.y * 0.35).toFixed(1)}) scale(${(0.6 + view.k * 0.4).toFixed(3)})`);
    svg.style.setProperty('--inv', clamp(1 / view.k, 1, 2.6).toFixed(3));
    const l = lodName(view.k);
    if (l !== lodNow) {
      lodNow = l;
      svg.setAttribute('class', `map-svg lod-${l}${l === 'deep' ? ' lod-near' : ''}`);
      if (cb.onLod) cb.onLod(l);
    }
  }
  function zoomAt(px, py, f) {
    const k2 = clamp(view.k * f, K_MIN, K_MAX);
    const r = k2 / view.k;
    view.x = px - (px - view.x) * r;
    view.y = py - (py - view.y) * r;
    view.k = k2;
    apply();
  }
  function toView(target, animate) {
    cancelAnimationFrame(anim);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce) { view = { ...target }; apply(); return; }
    const from = { ...view };
    const c0 = { x: (W / 2 - from.x) / from.k, y: (H / 2 - from.y) / from.k };
    const c1 = { x: (W / 2 - target.x) / target.k, y: (H / 2 - target.y) / target.k };
    const dist = Math.hypot(c1.x - c0.x, c1.y - c0.y) * Math.min(from.k, target.k);
    const dur = clamp(420 + dist * 0.35, 450, 1100);
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
      // a slight pull-back in the middle makes long trips read as flying, not sliding
      const k = from.k * ((target.k / from.k) ** e);
      const lift = Math.sin(Math.PI * e) * Math.min(0.35, dist / 2400);
      const kk = k * (1 - lift);
      const cx = c0.x + (c1.x - c0.x) * e;
      const cy = c0.y + (c1.y - c0.y) * e;
      view = { k: kk, x: W / 2 - cx * kk, y: H / 2 - cy * kk };
      apply();
      if (p < 1) anim = requestAnimationFrame(step);
      else { view = { ...target }; apply(); }
    };
    anim = requestAnimationFrame(step);
  }
  function fitBox(b, pad = 56) {
    const w = Math.max(1, b.maxx - b.minx);
    const h = Math.max(1, b.maxy - b.miny);
    const aw = Math.max(120, W - inset);
    const k = clamp(Math.min((aw - pad * 2) / w, (H - pad * 2) / h), K_MIN, K_MAX);
    const cx = (b.minx + b.maxx) / 2;
    const cy = (b.miny + b.maxy) / 2;
    return { k, x: inset + aw / 2 - cx * k, y: H / 2 - cy * k };
  }
  function allBox() {
    const R = model ? model.layout.outerR + 135 : 400;
    return { minx: -R, maxx: R, miny: -R, maxy: R };
  }
  function sectorBox(b) {
    const s = model.layout.sectors.find((x) => x.branch === b);
    if (!s) return allBox();
    let minx = Infinity; let miny = Infinity; let maxx = -Infinity; let maxy = -Infinity;
    const add = (x, y, m) => { minx = Math.min(minx, x - m); maxx = Math.max(maxx, x + m); miny = Math.min(miny, y - m); maxy = Math.max(maxy, y + m); };
    for (const n of s.members) add(n.x, n.y, n.r + 38);
    add(0, 0, 0);
    // include the wedge corners so the whole fan is in view, not only the filled part
    for (let i = 0; i <= 6; i++) {
      const a = s.a0 + ((s.a1 - s.a0) * i) / 6;
      add(s.innerR * Math.cos(a), s.innerR * Math.sin(a), 0);
    }
    return { minx, miny, maxx, maxy };
  }

  /* ---------- drawing ---------- */
  function nodeSVG(n) {
    const m = model;
    const r = n.r;
    const label = m.titleOf(n);
    const cls = ['mn', n.ghost ? `ghost g-${n.status}` : `s-${n.verdict}`, `band-${n.band}`];
    if (n.duplicate) cls.push('dup');
    if (n.catalog) cls.push('cat');
    let face;
    if (n.ghost) {
      face = `<circle class="gdisc" r="${r}"/><g class="gglyph">${glyphOutline(n.kind, r * 1.1, 1.4, `x="${(-r * 0.55).toFixed(1)}" y="${(-r * 0.55).toFixed(1)}"`)}</g>`
        + mark(n.status, r * 0.78, r * 0.78, 15, `st-${n.status}`);
    } else {
      face = `<circle class="halo" r="${r + 14}"/><circle class="rim" r="${r + 3}"/><path class="rim-half" d="M0 ${-(r + 3)}A${r + 3} ${r + 3} 0 0 1 0 ${r + 3}"/>`
        + `<circle class="disc" r="${r}"/><g class="emb-wrap">${emblem({ id: n.id, name: n.name, kind: n.kind }, 'm', `x="${(-r * 0.6).toFixed(1)}" y="${(-r * 0.62).toFixed(1)}" width="${(r * 1.2).toFixed(1)}" height="${(r * 1.24).toFixed(1)}"`)}</g>`;
      if (n.verdict === 'missed') face += mark('missed', r * 0.78, -r * 0.78, 15, 'st-missed');
      else if (n.verdict === 'disabled') face += mark('disabled', r * 0.78, -r * 0.78, 15, 'st-disabled');
      if (n.catalog) face += mark('catalog', r * 0.78, r * 0.78, 13, 'st-cat');
      if (n.duplicate) face += `<g class="dupb" transform="translate(${(-r * 0.8).toFixed(1)} ${(-r * 0.8).toFixed(1)})"><circle r="8.5"/><text y="3.4">×${Math.max(n.places.length, n.cards.length)}</text></g>`;
      const pips = PLACES.map((p, i) => `<rect class="pip${n.places.includes(p) ? ' on' : ''}" x="${((i - 1.5) * 9 - 3).toFixed(1)}" y="0" width="6" height="6" rx="1.2"/>`).join('');
      face += `<g class="pips" transform="translate(0 ${r + 9})">${pips}</g>`;
    }
    const ly = n.ghost ? r + 16 : r + 28;
    const one = esc(ellipsize(label, 14));
    const [l1, l2] = wrap2(label, 13);
    const lbl = `<text class="lbl" y="${ly}">${one}</text><text class="lbl2" y="${ly}"><tspan x="0">${esc(l1)}</tspan>${l2 ? `<tspan x="0" dy="11.5">${esc(l2)}</tspan>` : ''}</text>`;
    return `<g class="${cls.join(' ')}" data-id="${esc(n.id)}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(m.ariaOf(n))}"><title>${esc(label)}</title>${face}${lbl}</g>`;
  }

  function islands(layout) {
    let out = '';
    const labels = [];
    for (const s of layout.sectors) {
      for (const band of [1, 2]) {
        const list = layout.placed.filter((n) => n.sector === s.branch && n.band === band);
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            out += `<g class="island b${band}">${run.map((n) => `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r + 11}"/>`).join('')}</g>`;
            const cx = run.reduce((a, n) => a + n.x, 0) / run.length;
            const cy = run.reduce((a, n) => a + n.y, 0) / run.length;
            labels.push(`<text class="pk" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${esc(model.packLabel(run[0].pack))}</text>`);
          }
          run = [];
        };
        for (const n of list) { if (run.length && run[0].pack !== n.pack) flush(); run.push(n); }
        flush();
      }
    }
    return { out, labels: labels.join('') };
  }

  function render(m) {
    model = m;
    const L = m.layout;
    const t = m.t;
    let bg = `<circle class="vignette" r="${(L.outerR * 1.05).toFixed(0)}" fill="url(#glow)"/>`;
    for (const s of L.sectors) {
      const ratio = s.total ? s.lit / s.total : 0;
      const lblR = L.outerR + 52;
      const lx = lblR * Math.cos(s.mid);
      const ly = lblR * Math.sin(s.mid);
      const anchor = Math.abs(Math.cos(s.mid)) < 0.25 ? 'middle' : Math.cos(s.mid) > 0 ? 'start' : 'end';
      bg += `<g class="sector" data-branch="${s.branch}"><path class="wedge" style="--lit:${ratio.toFixed(3)}" d="${wedgePath(s)}"/>`
        + `<path class="spoke" d="M${pt(L.innerR, s.a0)}L${pt(L.outerR, s.a0)}"/>`
        + `<path class="track" d="${arcPath(L.outerR + 16, s.a0 + 0.012, s.a1 - 0.012)}"/>`
        + (s.lit ? `<path class="fill" d="${arcPath(L.outerR + 16, s.a0 + 0.012, s.a0 + 0.012 + Math.max(0.004, (s.a1 - s.a0 - 0.024) * ratio))}"/>` : '')
        + `<text class="bl" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}"><tspan class="bl-name">${esc(t(`branches.${s.branch}`))}</tspan><tspan class="bl-n" x="${lx.toFixed(1)}" dy="1.25em">${esc(t('litOf', { lit: s.lit, total: s.total }))}</tspan></text></g>`;
    }
    bg += `<circle class="ring-core" r="${L.innerR.toFixed(0)}"/>`;
    const names = { 1: t('ringUse'), 2: t('ringAsleep'), 3: t('ringCandidates') };
    for (const rg of L.rings) {
      const R = rg.r;
      bg += `<circle class="ring-line" r="${R.toFixed(0)}"/><path id="rp${rg.band}" class="rp" d="M${pt(R + 6, -Math.PI * 0.82)}A${R + 6} ${R + 6} 0 0 1 ${pt(R + 6, -Math.PI * 0.18)}"/>`
        + `<text class="ring-label"><textPath href="#rp${rg.band}" startOffset="50%" text-anchor="middle">${esc(names[rg.band])}</textPath></text>`;
    }
    const isl = islands(L);
    const hero = `<g class="hero-n"><circle class="h-rim" r="${HERO_R + 4}"/><circle class="h-disc" r="${HERO_R}"/>${emblem({ id: 'hero', name: 'Hero', kind: 'agent' }, 'mh', `x="${-HERO_R * 0.62}" y="${-HERO_R * 0.64}" width="${HERO_R * 1.24}" height="${HERO_R * 1.28}"`)}<text class="h-name" y="${HERO_R + 22}">${esc(m.heroName)}</text><text class="h-core" y="${-HERO_R - 12}">${esc(t('coreLabel'))}</text></g>`;
    world.innerHTML = `<g class="bg">${bg}</g><g class="isl">${isl.out}</g><g class="pks">${isl.labels}</g><g class="nodes">${hero}${L.placed.map(nodeSVG).join('')}</g>`;
    els.clear();
    world.querySelectorAll('.mn').forEach((e) => els.set(e.dataset.id, e));
    if (needFit && sized) { needFit = false; toView(fitBox(allBox(), 24), false); } else apply();
    setMarks(m);
    setSelected(m.selId);
  }

  function setMarks(m = model) {
    if (!m) return;
    const q = m.mark || { hit: null, dim: null };
    svg.classList.toggle('has-marks', !!(q.hit && q.hit.size) || !!(q.dim && q.dim.size));
    for (const [id, e] of els) {
      e.classList.toggle('hit', !!(q.hit && q.hit.has(id)));
      e.classList.toggle('dimmed', !!(q.dim && q.dim.has(id)));
    }
    world.querySelectorAll('.sector').forEach((e) => e.classList.toggle('focus', m.branch === e.dataset.branch));
  }
  function setSelected(id) {
    for (const e of els.values()) e.classList.remove('sel');
    if (id && els.has(id)) els.get(id).classList.add('sel');
  }

  /* ---------- input ---------- */
  const ptrs = new Map();
  let down = null;
  let pinch = null;
  const local = (e) => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(anim);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, target: e.target, moved: 0, vx: view.x, vy: view.y };
    else { down = null; pinch = null; }
    try { svg.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    const cur = local(e);
    ptrs.set(e.pointerId, cur);
    if (ptrs.size === 1 && down) {
      down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      if (down.moved > 5) { svg.classList.add('panning'); view.x = down.vx + (e.clientX - down.x); view.y = down.vy + (e.clientY - down.y); apply(); }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch) {
        view.x += mid.x - pinch.mid.x; view.y += mid.y - pinch.mid.y;
        zoomAt(mid.x, mid.y, d / pinch.d);
      }
      pinch = { d, mid };
    }
    void prev;
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    try { svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (ptrs.size < 2) pinch = null;
    svg.classList.remove('panning');
    if (e.type === 'pointerup' && down && down.moved <= 5 && ptrs.size === 0) {
      const el = down.target instanceof Element ? down.target : null;
      const node = el && el.closest('.mn');
      const sector = el && el.closest('.sector');
      if (node) cb.onNode(node.dataset.id);
      else if (sector) cb.onBranch(sector.dataset.branch);
      else cb.onBackground();
    }
    if (ptrs.size === 0) down = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnimationFrame(anim);
    const p = local(e);
    const line = e.deltaMode === 1 ? 16 : 1;
    const dx = e.deltaX * line;
    const dy = e.deltaY * line;
    const mouseWheel = e.deltaMode === 1 || (dx === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (e.ctrlKey || e.metaKey) zoomAt(p.x, p.y, Math.exp(-dy * 0.01));          // trackpad pinch arrives as ctrl+wheel
    else if (mouseWheel) zoomAt(p.x, p.y, Math.exp(-dy * 0.0016));               // mouse wheel zooms
    else { view.x -= dx; view.y -= dy; apply(); }                                // trackpad two-finger scroll pans
  }, { passive: false });

  // Safari reports trackpad pinch as gesture events
  let gs = 1;
  svg.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
  svg.addEventListener('gesturechange', (e) => { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, e.scale / gs); gs = e.scale; });

  svg.addEventListener('dblclick', (e) => {
    if (e.target instanceof Element && e.target.closest('.mn')) return;
    const p = local(e);
    zoomAt(p.x, p.y, 1.8);
  });

  svg.addEventListener('keydown', (e) => {
    const onNode = e.target instanceof Element && e.target.closest('.mn');
    if (onNode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cb.onNode(onNode.dataset.id); return; }
    const step = 70;
    const keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!onNode && keys[e.key]) { e.preventDefault(); view.x += keys[e.key][0]; view.y += keys[e.key][1]; apply(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(W / 2, H / 2, 1.3); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(W / 2, H / 2, 1 / 1.3); }
    else if (e.key === '0') { e.preventDefault(); toView(fitBox(allBox(), 24), true); }
  });
  svg.addEventListener('focusin', (e) => {
    const n = e.target instanceof Element && e.target.closest('.mn');
    if (!n || !model) return;
    const node = model.layout.placed.find((p) => p.id === n.dataset.id);
    if (!node) return;
    const sx = node.x * view.k + view.x;
    const sy = node.y * view.k + view.y;
    if (sx < 40 || sy < 40 || sx > W - 40 || sy > H - 40) toView({ k: view.k, x: W / 2 - node.x * view.k, y: H / 2 - node.y * view.k }, true);
  });

  const ro = new ResizeObserver(() => {
    const b = root.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (!sized) {
      sized = true; W = b.width; H = b.height;
      if (needFit && model) { needFit = false; toView(fitBox(allBox(), 24), false); }
      return;
    }
    view.x += (b.width - W) / 2; view.y += (b.height - H) / 2;
    W = b.width; H = b.height;
    apply();
  });
  ro.observe(root);
  { const b = root.getBoundingClientRect(); if (b.width && b.height) { W = b.width; H = b.height; sized = true; } }

  return {
    render, setMarks, setSelected,
    setInset(px) { inset = px; },
    fit: (animate = true) => toView(fitBox(allBox(), 24), animate),
    flyBranch(b) { if (model) toView(fitBox(sectorBox(b), 70), true); },
    flyNode(id) {
      const n = model && model.layout.placed.find((p) => p.id === id);
      if (!n) return;
      const k = Math.max(view.k, 1.5);
      toView({ k, x: W / 2 - n.x * k, y: H / 2 - n.y * k }, true);
    },
    zoomBy: (f) => zoomAt(W / 2, H / 2, f),
    get k() { return view.k; },
    get lod() { return lodNow; },
    el: svg,
    ROW,
  };
}
