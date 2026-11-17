// Deterministic heraldic emblems (the Grimoire mockup's generator), plus the small drawn state marks.

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const GLYPH = {
  skill: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  plugin: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  mcp_server: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-3.7M8.3 13l7.4 3.7"/>',
  agent: '<path d="M5 20v-6a7 7 0 0114 0v6z"/><path d="M9 13h.01M15 13h.01M9 17h6"/>',
  hook: '<path d="M12 3v10a4 4 0 11-4-4"/><circle cx="12" cy="3.5" r="1"/>',
  scheduled_task: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  memory: '<path d="M5 4h9a4 4 0 014 4v12H9a4 4 0 01-4-4z"/><path d="M9 8h6M9 12h6"/>',
  instructions: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
};

const glyph = (kind, size, sw) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[kind] || GLYPH.skill}</svg>`;

/** Shield emblem. `scope` keeps gradient ids unique when the same card is drawn twice. */
export function emblem(card, scope = 'n', attrs = '') {
  if (card.art && /^(data:image\/|https?:\/\/|\/|\.\/)/i.test(card.art)) {
    return `<img class="emb emb-img" src="${esc(card.art)}" alt="" loading="lazy">`;
  }
  const r = rng(hash(card.name + card.kind));
  const hue = Math.floor(r() * 360);
  const hue2 = (hue + 40 + r() * 60) % 360;
  const id = `g${scope}${hash(card.id || card.name)}`;
  const rays = 6 + Math.floor(r() * 6);
  let ray = '';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ray += `<path d="M60 62 L${(60 + Math.cos(a) * 52).toFixed(1)} ${(62 + Math.sin(a) * 52).toFixed(1)}" stroke="hsl(${hue2} 60% 85% / .35)" stroke-width="${(2 + r() * 4).toFixed(1)}"/>`;
  }
  const pips = Math.floor(2 + r() * 4);
  let pp = '';
  for (let i = 0; i < pips; i++) pp += `<circle cx="${(24 + i * (72 / pips) + 6).toFixed(0)}" cy="${(96 + r() * 3).toFixed(0)}" r="2.2" fill="hsl(${hue2} 70% 80%)"/>`;
  return `<svg viewBox="0 0 120 124" class="emb" aria-hidden="true" focusable="false"${attrs ? ' ' + attrs : ''}>
<defs><radialGradient id="${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="hsl(${hue} 55% 46%)"/><stop offset="1" stop-color="hsl(${hue2} 60% 18%)"/></radialGradient></defs>
<path d="M60 4l50 14v44c0 28-22 48-50 58C32 110 10 90 10 62V18z" fill="url(#${id})" stroke="hsl(${hue2} 50% 78%)" stroke-width="3"/>
<path d="M60 12l42 12v38c0 23-18 40-42 49C36 102 18 85 18 62V24z" fill="none" stroke="hsl(${hue2} 50% 78% / .5)" stroke-width="1.2"/>
<g>${ray}</g>${pp}
<g transform="translate(36 38) scale(2)" color="hsl(${hue2} 80% 92%)">${glyph(card.kind, 24, 1.3)}</g></svg>`;
}

/** Outline glyph for a kind, 24x24 box, drawn in currentColor. Used by ghost (not yet learned) nodes. */
export const glyphOutline = (kind, size = 24, sw = 1.5, attrs = '') => glyph(kind, size, sw).replace('<svg ', `<svg ${attrs} `);

/** Small drawn marks that sit on a node medallion. */
export const MARK = {
  missed: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" /><path d="M8 4.2v4.4M8 11.1v.4" fill="none" stroke-width="1.8" stroke-linecap="round"/></svg>',
  disabled: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" /><rect x="5" y="7.2" width="6" height="4.6" rx="1" stroke-width="1.2"/><path d="M6.2 7.2V5.9a1.8 1.8 0 013.6 0v1.3" fill="none" stroke-width="1.2"/></svg>',
};

export const ICON_CLOSE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
export const ICON_CHEVRON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ICON_SEARCH = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
