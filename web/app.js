import { makeT, pick, LANGS } from './i18n.js';
import { emblem, glyphOutline, esc, MARK, ICON_CHEVRON, ICON_SEARCH } from './emblem.js';
import { BRANCHES, PLACES, mergeCards, normalizeCandidates, attachCandidates, layoutMap, isLit } from './layout.js';
import { createMap } from './map.js';

const PLACE_KEY = { cli: 'surfaceCli', synced: 'surfaceSynced', desktop: 'surfaceDesktop', connector: 'surfaceConnector' };
const VERDICTS = ['active', 'rare', 'unknown', 'missed', 'asleep', 'disabled'];
const KIND_BRANCH = { mcp_server: 'system', memory: 'memory', instructions: 'memory', hook: 'automation', scheduled_task: 'automation' };

const $ = (sel, root = document) => root.querySelector(sel);

const ui = { lang: 'en', view: 'map', place: '', mode: 'present', cand: true, q: '', sel: null, branch: '', collapsed: new Set() };
let state = null;
let cards = [];
let nodes = [];
let ghosts = [];
let candidates = [];
let layout = null;
let derived = null;
let t = makeT('en');
let map = null;

/* ---------- data ---------- */

function normalize(raw) {
  const c = { ...raw };
  c.usage = raw.usage || { uses30d: 0 };
  c.verdict = raw.verdict === 'dead_weight' ? 'asleep' : (VERDICTS.includes(raw.verdict) ? raw.verdict : 'unknown');
  c.branch = BRANCHES.includes(raw.branch) ? raw.branch : (raw.surface === 'connector' ? 'system' : (KIND_BRANCH[raw.kind] || 'other'));
  c.pack = raw.pack || (raw.surface === 'connector' ? 'connectors' : raw.surface === 'synced' ? 'synced' : raw.surface === 'desktop' ? 'desktop'
    : (raw.origin && raw.origin !== 'user' ? raw.origin : 'user'));
  return c;
}

function derive(list) {
  const lifetime = list.reduce((a, c) => a + (c.usage.lifetimeUses || 0), 0);
  const kinds = {};
  for (const c of list) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  const count = (v) => list.filter((c) => c.verdict === v).length;
  return {
    items: list.length, active: count('active'), asleep: count('asleep'), missed: count('missed'), dup: list.filter((n) => n.duplicate).length,
    level: Math.max(1, Math.floor(Math.sqrt(lifetime / 4))), topKind: top ? top[0] : 'none',
  };
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return { data: await r.json(), source: r.headers.get('x-hero-sheet-source') };
}

async function loadState() {
  try {
    const { data, source } = await getJson('/state.json');
    return { data, sample: source === 'sample' };
  } catch { /* fall through to the static sample */ }
  const { data } = await getJson('./sample-state.json');
  return { data, sample: true };
}

async function loadCandidates(sample) {
  for (const url of ['/candidates.json', ...(sample ? ['./sample-candidates.json'] : [])]) {
    try {
      const { data } = await getJson(url);
      const list = normalizeCandidates(data);
      if (list.length || url.startsWith('/')) return list;
    } catch { /* optional file */ }
  }
  return [];
}

/* ---------- text helpers ---------- */

const num = (n) => (n == null ? t('unknownVal') : Number(n).toLocaleString(ui.lang));
const title = (n) => pick(n.title, ui.lang, n.name);
const summary = (n) => pick(n.summary, ui.lang, n.description || '');
const packLabel = (p) => { const k = `packs.${p}`; const s = t(k); return s === k ? p : s; };
const branchLabel = (b) => t(`branches.${b}`);
const placeName = (p) => t(PLACE_KEY[p]);
const stateKey = (n) => (n.ghost ? `cs_${n.status}` : `v_${n.verdict}`);

function lastUsedText(n) {
  const at = n.usage.lastUsedAt;
  if (!at) return t('never');
  const ref = Date.parse(state.generatedAt) || Date.now();
  const days = Math.round((ref - Date.parse(at)) / 864e5);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days > 400) return new Date(at).toLocaleDateString(ui.lang);
  return t('daysAgo', { n: days });
}

function verdictNote(n) {
  return n.verdict === 'missed' ? t('vd_missed', { n: n.usage.missed30d || 0 }) : t(`vd_${n.verdict}`);
}

/* ---------- filtering ---------- */

const searching = () => ui.q.trim() !== '';
function matchesQuery(n) {
  const q = ui.q.trim().toLowerCase();
  return !q || [n.name, n.title && n.title.en, n.title && n.title.ru, ...(n.fullNames || [])].some((s) => s && s.toLowerCase().includes(q));
}
function matchesPlace(n) {
  if (!ui.place) return true;
  return ui.mode === 'present' ? n.places.includes(ui.place) : !n.places.includes(ui.place);
}
const passes = (n) => matchesQuery(n) && matchesPlace(n);
const allItems = () => (ui.cand ? [...nodes, ...ghosts] : nodes);
const filtering = () => searching() || !!ui.place;

/* ---------- map ---------- */

function ariaOf(n) {
  const where = n.ghost ? t(`cs_${n.status}`) : `${t(`v_${n.verdict}`)}; ${n.places.map(placeName).join(', ') || t('placeAbsent')}`;
  return `${title(n)}, ${where}`;
}

function marks() {
  if (!filtering()) return { hit: null, dim: null };
  const hit = new Set();
  const dim = new Set();
  for (const n of allItems()) (passes(n) ? hit : dim).add(n.id);
  return { hit, dim };
}

function mapModel() {
  return {
    layout, t, titleOf: title, ariaOf, packLabel, heroName: (state.hero && state.hero.name) || t('appTitle'),
    selId: ui.sel && ui.sel.type === 'node' ? ui.sel.id : null, mark: marks(), branch: ui.branch,
  };
}

function mapInset() {
  const c = $('#chips');
  return ui.view === 'map' && c && getComputedStyle(c).position === 'absolute' ? Math.round(c.getBoundingClientRect().width) + 14 : 0;
}

function renderMap() {
  map.setInset(mapInset());
  layout = layoutMap(allItems());
  $('#map-svg-host').setAttribute('aria-label', t('mapLabel'));
  map.render(mapModel());
}

/* ---------- list ---------- */

function listNodeHTML(n) {
  const sel = ui.sel && ui.sel.type === 'node' && ui.sel.id === n.id;
  const st = n.ghost ? `ghost g-${n.status}` : `s-${n.verdict}`;
  const mark = !n.ghost && n.verdict === 'missed' ? `<span class="mark mark-missed">${MARK.missed}</span>`
    : !n.ghost && n.verdict === 'disabled' ? `<span class="mark mark-disabled">${MARK.disabled}</span>` : '';
  const disc = n.ghost ? `<span class="gl">${glyphOutline(n.kind, 30, 1.4)}</span>` : emblem({ id: n.id, name: n.name, kind: n.kind }, 'n');
  const pips = n.ghost ? '' : `<span class="pips-l" aria-hidden="true">${PLACES.map((p) => `<i class="${n.places.includes(p) ? 'on' : ''}"></i>`).join('')}</span>`;
  const dup = n.duplicate ? `<span class="dup-l" aria-hidden="true">×${Math.max(n.places.length, n.cards.length)}</span>` : '';
  return `<li><button type="button" class="node ${st}" data-id="${esc(n.id)}" aria-pressed="${!!sel}" aria-label="${esc(ariaOf(n))}">
<span class="ring"><span class="disc">${disc}</span>${mark}${dup}</span>${pips}
<span class="label">${esc(title(n))}</span></button></li>`;
}

const vRank = (n) => (n.ghost ? 9 : VERDICTS.indexOf(n.verdict));

function listHTML() {
  const list = allItems().filter(passes);
  if (!list.length) return `<p class="empty">${esc(searching() ? t('noMatch', { q: ui.q.trim() }) : t('noItems'))}</p>`;
  const byBranch = new Map();
  for (const n of list) {
    if (!byBranch.has(n.branch)) byBranch.set(n.branch, new Map());
    const packs = byBranch.get(n.branch);
    if (!packs.has(n.pack)) packs.set(n.pack, []);
    packs.get(n.pack).push(n);
  }
  let html = '';
  for (const b of BRANCHES) {
    const packs = byBranch.get(b);
    if (!packs) continue;
    const all = [...packs.values()].flat();
    const real = all.filter((n) => !n.ghost);
    const lit = real.filter(isLit).length;
    const open = filtering() || !ui.collapsed.has(b);
    const ratio = real.length ? Math.round((lit / real.length) * 100) : 0;
    const names = [...packs.keys()].sort((x, y) => (x === 'user' ? -1 : y === 'user' ? 1 : x === 'candidates' ? 1 : y === 'candidates' ? -1 : x.localeCompare(y)));
    html += `<section class="branch" id="lb-${b}" data-branch="${b}">
<h2><button type="button" class="branch-head" data-branch="${b}" aria-expanded="${open}" aria-controls="br-${b}" title="${esc(t(open ? 'collapse' : 'expand'))}">
<span class="chev">${ICON_CHEVRON}</span><span class="b-name">${esc(branchLabel(b))}</span>
<span class="b-lit"><span class="b-bar" aria-hidden="true"><i style="width:${ratio}%"></i></span>${esc(t('litOf', { lit, total: real.length }))}</span></button></h2>
<div class="packs" id="br-${b}"${open ? '' : ' hidden'}>`;
    for (const p of names) {
      const items = packs.get(p).slice().sort((x, y) => vRank(x) - vRank(y) || title(x).localeCompare(title(y), ui.lang));
      html += `<div class="pack"><h3>${esc(packLabel(p))}</h3><ul class="nodes">${items.map(listNodeHTML).join('')}</ul></div>`;
    }
    html += '</div></section>';
  }
  return html;
}

function renderList() { $('#tree').innerHTML = listHTML(); }

/* ---------- header, toolbar, legend ---------- */

function topHTML() {
  const d = derived;
  const lbl = (k) => esc(t(k));
  return `<header class="hero">
<div class="hero-id"><div class="crest">${emblem({ id: 'hero', name: 'Hero', kind: 'agent' }, 'h')}</div>
<div><h1>${esc((state.hero && state.hero.name) || t('appTitle'))}</h1>
<p class="sub">${esc(t('level', { n: d.level, cls: t(`classes.${d.topKind}`) }))}</p></div></div>
<dl class="totals">
<div><dd>${num(d.items)}</dd><dt>${lbl('totalItems')}</dt></div>
<div><dd>${num(d.active)}</dd><dt>${lbl('totalActive')}</dt></div>
<div><dd>${num(d.asleep)}</dd><dt>${lbl('totalAsleep')}</dt></div>
<div><dd>${num(d.missed)}</dd><dt>${lbl('totalMissed')}</dt></div>
<div><dd>${num(d.dup)}</dd><dt>${lbl('totalDup')}</dt></div></dl>
<div class="hero-tools">
<button type="button" class="quiet" id="open-quests">${lbl('quests')}</button>
<div class="seg" role="group" aria-label="${esc(t('language'))}">${LANGS.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${ui.lang === l}" lang="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
</header>
<div class="toolbar">
<div class="seg" role="group" aria-label="${esc(t('view'))}" id="views">${['map', 'list'].map((v) => `<button type="button" data-view="${v}" aria-pressed="${ui.view === v}">${lbl(v === 'map' ? 'viewMap' : 'viewList')}</button>`).join('')}</div>
<div class="where" role="group" aria-label="${esc(t('where'))}">
<span class="where-l">${lbl('where')}</span>
<div class="seg" role="group" aria-label="${esc(t('where'))}" id="modes">${['present', 'missing'].map((m) => `<button type="button" data-mode="${m}" aria-pressed="${ui.mode === m}"${ui.place ? '' : ' disabled'}>${lbl(m === 'present' ? 'modePresent' : 'modeMissing')}</button>`).join('')}</div>
<div class="seg wide" role="group" aria-label="${esc(t('whereHelp'))}" id="places">
<button type="button" data-place="" aria-pressed="${ui.place === ''}">${lbl('whereAny')}</button>
${PLACES.map((p) => `<button type="button" data-place="${p}" aria-pressed="${ui.place === p}">${esc(placeName(p))}<small>${nodes.filter((n) => n.places.includes(p)).length}</small></button>`).join('')}</div></div>
<label class="toggle"><input type="checkbox" id="tog-cand"${ui.cand ? ' checked' : ''}${ghosts.length ? '' : ' disabled'}><span>${lbl('showCandidates')}${ghosts.length ? `<small>${ghosts.length}</small>` : ''}</span></label>
<label class="search">${ICON_SEARCH}<span class="sr-only">${lbl('search')}</span><input type="search" id="q" value="${esc(ui.q)}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off"></label>
</div>
<div class="status-line" id="status-line" aria-live="polite"></div>`;
}

function chipsHTML() {
  if (!layout) return '';
  const chips = layout.sectors.map((s) => {
    const ratio = s.total ? Math.round((s.lit / s.total) * 100) : 0;
    return `<button type="button" class="chip" data-chip="${s.branch}" aria-pressed="${ui.branch === s.branch}" title="${esc(t('flyTo', { name: branchLabel(s.branch) }))}">
<span class="chip-n">${esc(branchLabel(s.branch))}</span><span class="chip-bar" aria-hidden="true"><i style="width:${ratio}%"></i></span><small>${s.lit}/${s.total}${s.ghosts ? ` +${s.ghosts}` : ''}</small></button>`;
  }).join('');
  return `<button type="button" class="chip chip-all" data-chip="" aria-pressed="${ui.branch === ''}">${esc(t('allBranches'))}</button>${chips}`;
}

function legendHTML() {
  const mk = (v, extra = '') => `<li class="s-${v}"><span class="ring sm"><span class="disc"></span>${v === 'missed' ? `<span class="mark">${MARK.missed}</span>` : v === 'disabled' ? `<span class="mark">${MARK.disabled}</span>` : ''}</span>${esc(t(`legendNote.${v}`))}${extra}</li>`;
  const maps = ['ghost', 'dup', 'pips', 'depth'].map((k) => `<li class="lg-${k}"><span class="lg-ic" aria-hidden="true"></span>${esc(t(`legendMap.${k}`))}</li>`).join('');
  return `<details class="legend-wrap"><summary>${esc(t('legend'))}</summary><ul class="legend">${['active', 'rare', 'asleep', 'missed', 'disabled', 'unknown'].map((v) => mk(v)).join('')}${maps}</ul></details>`;
}

function footHTML() {
  const bits = [];
  if (state.__sample) bits.push(`<strong>${esc(t('sample'))}.</strong> ${esc(t('sampleNote'))}`);
  if (state.enriched === false) bits.push(esc(t('notEnriched')));
  const when = state.generatedAt ? new Date(state.generatedAt).toLocaleDateString(ui.lang, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  bits.push(`${esc(t('generated', { date: when }))}, ${esc(t('usageFrom', { src: state.usageSource || '?' }))}. ${esc(t('estimatesNote'))}`);
  return bits.map((b) => `<p>${b}</p>`).join('');
}

function updateStatus() {
  const el = $('#status-line');
  if (!el) return;
  if (!filtering()) { el.textContent = ''; return; }
  const items = allItems();
  const n = items.filter(passes).length;
  el.textContent = t('matchCount', { n, total: items.length });
}

/* ---------- drawer ---------- */

function factRow(label, value, est) {
  return `<div><dt>${esc(label)}${est ? ` <span class="est">(${esc(t('estimate'))})</span>` : ''}</dt><dd>${value}</dd></div>`;
}

function placesBlock(n) {
  const rows = PLACES.map((p) => {
    const on = n.places.includes(p);
    return `<li class="${on ? 'on' : 'off'}"><i class="pm" aria-hidden="true"></i><span>${esc(placeName(p))}</span><b>${esc(t(on ? 'placeHere' : 'placeAbsent'))}</b></li>`;
  }).join('');
  const dup = n.duplicate ? `<p class="dup-note">${esc(n.places.length > 1 ? t('dupNote', { n: n.places.length }) : t('dupNoteCards'))}</p>` : '';
  return `<h3 class="d-h">${esc(t('placesTitle'))}</h3><ul class="places">${rows}</ul><p class="d-note">${esc(t('sameSet'))}</p>${dup}`;
}

function nodeDrawer(n) {
  if (n.ghost) return ghostDrawer(n);
  const u = n.usage;
  const tok = (v) => (v ? esc(t('tokens', { n: num(v) })) : esc(t('unknownVal')));
  const sum = summary(n);
  const rows = [
    factRow(t('uses30'), num(u.uses30d)),
    factRow(t('usesLife'), num(u.lifetimeUses)),
    factRow(t('missed30'), num(u.missed30d || 0)),
    factRow(t('lastUsed'), esc(lastUsedText(n))),
    factRow(t('startupCost'), tok(n.startupTokensEst), true),
    factRow(t('fullCost'), tok(n.staticTokensEst), true),
    n.version ? factRow(t('version'), esc(n.version)) : '',
    n.update ? factRow(t('updateAvail'), esc(t('updateLine', { installed: n.update.installed, latest: n.update.latest }))) : '',
  ].join('');
  const cat = n.catalog ? `<p class="d-note">${esc(t('catalogNote', { status: t(`cat_${n.catalog.status}`) }))}${n.catalog.score != null ? ` ${esc(t('score'))}: ${Math.round(n.catalog.score * 100)}%.` : ''}</p>` : '';
  return `<div class="d-head"><span class="ring lg s-${n.verdict}"><span class="disc">${emblem({ id: n.id, name: n.name, kind: n.kind }, 'd')}</span></span>
<div><h2 id="d-title" tabindex="-1">${esc(title(n))}</h2>
<p class="d-meta">${esc(t(`kinds.${n.kind}`))} · ${esc(branchLabel(n.branch))} · ${esc(packLabel(n.pack))}</p></div></div>
<p class="stamp s-${n.verdict}"><b>${esc(t(`v_${n.verdict}`))}.</b> ${esc(verdictNote(n))}</p>
${sum ? `<p class="d-sum">${esc(sum)}</p>` : ''}
${placesBlock(n)}
<h3 class="d-h">${esc(t('details'))}</h3>
<dl class="facts">${rows}</dl>
${cat}
${n.inferred ? `<p class="d-note">${esc(t('inferred'))}</p>` : ''}
<details class="raw"><summary>${esc(t('rawDescription'))}</summary>
<p>${esc(n.description || t('noDescription'))}</p>
<p class="d-note">${esc(t('technicalName'))}: ${n.fullNames.map((x) => `<code>${esc(x)}</code>`).join(', ')}</p></details>`;
}

function ghostDrawer(n) {
  const sum = summary(n);
  const link = n.url ? `<p class="d-note"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(t('openLink'))}</a></p>` : '';
  return `<div class="d-head"><span class="ring lg ghost g-${n.status}"><span class="disc"><span class="gl">${glyphOutline(n.kind, 40, 1.3)}</span></span></span>
<div><h2 id="d-title" tabindex="-1">${esc(title(n))}</h2>
<p class="d-meta">${esc(t(`kinds.${n.kind}`))} · ${esc(branchLabel(n.branch))}</p></div></div>
<p class="stamp ghost g-${n.status}"><b>${esc(t(`cs_${n.status}`))}.</b> ${esc(t('candNote'))}</p>
${sum ? `<p class="d-sum">${esc(sum)}</p>` : ''}
<dl class="facts">${n.score != null ? factRow(t('score'), `${Math.round(n.score * 100)}%`) : ''}${factRow(t('candBranch'), esc(branchLabel(n.branch)))}</dl>
${n.installedFlag ? `<p class="d-note">${esc(t('candInstalledFlag'))}</p>` : ''}${link}
<details class="raw"><summary>${esc(t('technicalName'))}</summary><p><code>${esc(n.name)}</code></p></details>`;
}

function questsDrawer() {
  const rules = state.rules || [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  const list = rules.map((r) => {
    const st = r.rate >= r.target ? ['questOn', 'ok'] : r.rate >= r.target * 0.6 ? ['questBehind', 'mid'] : ['questOff', 'low'];
    const w = Math.max(0, Math.min(100, r.rate * 100));
    return `<li class="quest"><h3>${esc(r.title)}</h3>
<div class="q-track" role="img" aria-label="${esc(`${pct(r.rate)} / ${pct(r.target)}`)}"><i class="q-fill ${st[1]}" style="width:${w}%"></i><b class="q-mark" style="left:${Math.min(100, r.target * 100)}%"></b></div>
<p class="q-line"><strong>${esc(st[0] ? t(st[0]) : '')}.</strong> ${esc(t('questLine', { rate: pct(r.rate), target: pct(r.target), matched: r.matched, total: r.total }))}</p></li>`;
  }).join('');
  const warns = (state.warnings || []).map((w) => `<li>${esc(w.source)}: ${esc(w.message)}</li>`).join('');
  return `<div class="d-head"><div><h2 id="d-title" tabindex="-1">${esc(t('quests'))}</h2><p class="d-meta">${esc(t('questsIntro'))}</p></div></div>
${rules.length ? `<ul class="quest-list">${list}</ul>` : `<p class="d-note">${esc(t('questsNone'))}</p>`}
${warns ? `<details class="raw"><summary>${esc(t('warnings'))}</summary><ul class="warns">${warns}</ul></details>` : ''}`;
}

const findItem = (id) => nodes.find((n) => n.id === id) || ghosts.find((n) => n.id === id);

function renderDrawer() {
  const dr = $('#drawer');
  const body = $('#drawer-body');
  let html = '';
  if (ui.sel) {
    if (ui.sel.type === 'quests') html = questsDrawer();
    else {
      const n = findItem(ui.sel.id);
      if (n) html = nodeDrawer(n);
      else ui.sel = null;
    }
  }
  body.innerHTML = html;
  dr.hidden = !ui.sel;
  document.body.classList.toggle('drawer-open', !!ui.sel);
}

function syncPressed() {
  const id = ui.sel && ui.sel.type === 'node' ? ui.sel.id : null;
  document.querySelectorAll('.node').forEach((n) => n.setAttribute('aria-pressed', String(!!id && id === n.dataset.id)));
  if (map) map.setSelected(id);
}

function select(sel, focus = true) {
  ui.sel = sel;
  renderDrawer();
  syncPressed();
  if (sel && focus) $('#d-title').focus({ preventScroll: true });
}

function closeDrawer() {
  const prev = ui.sel;
  select(null);
  if (prev && prev.type === 'node') {
    const n = document.querySelector(`[data-id="${CSS.escape(prev.id)}"]`);
    if (n && n.focus) n.focus({ preventScroll: true });
  } else if (prev) {
    $('#open-quests').focus();
  }
}

/* ---------- views ---------- */

function applyView() {
  const isMap = ui.view === 'map';
  $('#map-stage').hidden = !isMap;
  $('#tree').hidden = isMap;
  $('#chips').hidden = false;
  document.body.classList.toggle('is-map', isMap);
  if (isMap) renderMap(); else renderList();
}

function refreshFilter() {
  updateStatus();
  document.querySelectorAll('[data-place]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === ui.place)));
  document.querySelectorAll('[data-mode]').forEach((b) => { b.disabled = !ui.place; });
  if (ui.view === 'map') map.setMarks(mapModel()); else renderList();
}

function setBranch(b) {
  ui.branch = b;
  document.querySelectorAll('[data-chip]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.chip === b)));
  if (ui.view === 'map') {
    map.setMarks(mapModel());
    if (b) map.flyBranch(b); else map.fit();
  } else if (b) {
    const sec = document.getElementById(`lb-${b}`);
    ui.collapsed.delete(b);
    renderList();
    const s2 = document.getElementById(`lb-${b}`) || sec;
    if (s2) s2.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } else window.scrollTo({ top: 0 });
}

function paintAll() {
  document.documentElement.lang = ui.lang;
  document.title = t('appTitle');
  layout = layoutMap(allItems());
  $('#top').innerHTML = topHTML();
  $('#chips').innerHTML = chipsHTML();
  $('#legend').innerHTML = legendHTML();
  $('#foot').innerHTML = footHTML();
  $('#close-drawer').setAttribute('aria-label', t('close'));
  document.querySelectorAll('[data-zoom]').forEach((b) => { b.setAttribute('aria-label', t(b.dataset.zoom === 'in' ? 'zoomIn' : b.dataset.zoom === 'out' ? 'zoomOut' : 'fitAll')); b.title = b.getAttribute('aria-label'); });
  $('#map-hint').textContent = t('mapHint');
  updateStatus();
  applyView();
  renderDrawer();
}

/* ---------- wiring ---------- */

function persist(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } }

function pickNode(id) {
  const same = ui.sel && ui.sel.type === 'node' && ui.sel.id === id;
  select(same ? null : { type: 'node', id }, !same);
}

function wire() {
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest('.map-svg')) return;
    const node = target.closest('.node');
    if (node) { pickNode(node.dataset.id); return; }
    const head = target.closest('.branch-head');
    if (head) {
      const b = head.dataset.branch;
      ui.collapsed.has(b) ? ui.collapsed.delete(b) : ui.collapsed.add(b);
      const open = !ui.collapsed.has(b) || filtering();
      head.setAttribute('aria-expanded', String(open));
      head.title = t(open ? 'collapse' : 'expand');
      $(`#br-${b}`).hidden = !open;
      return;
    }
    const chip = target.closest('[data-chip]');
    if (chip) { setBranch(ui.branch === chip.dataset.chip ? '' : chip.dataset.chip); return; }
    const zoom = target.closest('[data-zoom]');
    if (zoom) { const z = zoom.dataset.zoom; if (z === 'fit') { setBranch(''); } else map.zoomBy(z === 'in' ? 1.5 : 1 / 1.5); return; }
    const view = target.closest('[data-view]');
    if (view) {
      ui.view = view.dataset.view;
      persist('hero-sheet-view', ui.view);
      document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === view)));
      applyView();
      return;
    }
    const lang = target.closest('[data-lang]');
    if (lang) {
      ui.lang = lang.dataset.lang;
      persist('hero-sheet-lang', ui.lang);
      t = makeT(ui.lang);
      paintAll();
      $(`[data-lang="${ui.lang}"]`).focus();
      return;
    }
    const place = target.closest('[data-place]');
    if (place) { ui.place = place.dataset.place; refreshFilter(); return; }
    const mode = target.closest('[data-mode]');
    if (mode && !mode.disabled) {
      ui.mode = mode.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === mode)));
      refreshFilter();
      return;
    }
    if (target.closest('#open-quests')) { select(ui.sel && ui.sel.type === 'quests' ? null : { type: 'quests' }); return; }
    if (target.closest('#close-drawer')) closeDrawer();
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'tog-cand') {
      ui.cand = e.target.checked;
      if (!ui.cand && ui.sel && ui.sel.type === 'node' && ghosts.some((g) => g.id === ui.sel.id)) select(null, false);
      $('#chips').innerHTML = (layout = layoutMap(allItems()), chipsHTML());
      updateStatus();
      if (ui.view === 'map') renderMap(); else renderList();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'q') { ui.q = e.target.value; refreshFilter(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sel) closeDrawer();
    if (e.key === 'Enter' && e.target && e.target.id === 'q' && searching()) {
      const first = allItems().find(passes);
      if (first) { if (ui.view === 'map') map.flyNode(first.id); select({ type: 'node', id: first.id }, false); }
    }
  });
}

async function boot() {
  try {
    const l = localStorage.getItem('hero-sheet-lang'); if (LANGS.includes(l)) ui.lang = l;
    const v = localStorage.getItem('hero-sheet-view'); if (v === 'map' || v === 'list') ui.view = v;
  } catch { /* defaults */ }
  t = makeT(ui.lang);
  document.documentElement.lang = ui.lang;
  map = createMap($('#map-svg-host'), {
    onNode: (id) => pickNode(id),
    onBranch: (b) => setBranch(b),
    onBackground: () => { if (ui.sel) closeDrawer(); },
  });
  wire();
  try {
    const { data, sample } = await loadState();
    state = data;
    state.__sample = sample;
    cards = (state.cards || []).map(normalize);
    nodes = mergeCards(cards);
    candidates = await loadCandidates(sample);
    ghosts = attachCandidates(nodes, candidates);
    derived = derive(nodes);
    paintAll();
  } catch (err) {
    console.error(err);
    $('#tree').hidden = false;
    $('#map-stage').hidden = true;
    $('#tree').innerHTML = `<p class="empty">${esc(t('loadFailed'))}</p>`;
  }
}

boot();
