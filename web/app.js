import { makeT, pick, LANGS } from './i18n.js';
import { emblem, esc, MARK, ICON_CLOSE, ICON_CHEVRON, ICON_SEARCH } from './emblem.js';

const BRANCHES = ['code', 'design', 'research', 'writing', 'data', 'automation', 'memory', 'communication', 'finance', 'system', 'other'];
const SURFACES = [['', 'surfaceAll'], ['cli', 'surfaceCli'], ['synced', 'surfaceSynced'], ['desktop', 'surfaceDesktop'], ['connector', 'surfaceConnector']];
const VERDICTS = ['active', 'rare', 'unknown', 'missed', 'asleep', 'disabled'];
const KIND_BRANCH = { mcp_server: 'system', memory: 'memory', instructions: 'memory', hook: 'automation', scheduled_task: 'automation' };

const $ = (sel, root = document) => root.querySelector(sel);

const ui = { lang: 'en', surface: '', q: '', sel: null, collapsed: new Set() };
let state = null;
let cards = [];
let derived = null;
let t = makeT('en');

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
    items: list.length, active: count('active'), asleep: count('asleep'), missed: count('missed'),
    level: Math.max(1, Math.floor(Math.sqrt(lifetime / 4))), topKind: top ? top[0] : 'none',
  };
}

async function loadState() {
  try {
    const r = await fetch('/state.json', { cache: 'no-store' });
    if (r.ok) return { data: await r.json(), sample: r.headers.get('x-hero-sheet-source') === 'sample' };
  } catch { /* fall through to the static sample */ }
  const r = await fetch('./sample-state.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('no state');
  return { data: await r.json(), sample: true };
}

/* ---------- text helpers ---------- */

const num = (n) => (n == null ? t('unknownVal') : Number(n).toLocaleString(ui.lang));
const title = (c) => pick(c.title, ui.lang, c.name);
const summary = (c) => pick(c.summary, ui.lang, c.description || '');
const packLabel = (p) => { const k = `packs.${p}`; const s = t(k); return s === k ? p : s; };
const branchLabel = (b) => t(`branches.${b}`);
const isLit = (c) => c.verdict === 'active' || c.verdict === 'rare';

function lastUsedText(c) {
  const at = c.usage.lastUsedAt;
  if (!at) return t('never');
  const ref = Date.parse(state.generatedAt) || Date.now();
  const days = Math.round((ref - Date.parse(at)) / 864e5);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days > 400) return new Date(at).toLocaleDateString(ui.lang);
  return t('daysAgo', { n: days });
}

function verdictNote(c) {
  return c.verdict === 'missed' ? t('vd_missed', { n: c.usage.missed30d || 0 }) : t(`vd_${c.verdict}`);
}

/* ---------- tree ---------- */

function visibleCards() {
  const q = ui.q.trim().toLowerCase();
  return cards.filter((c) => (!ui.surface || c.surface === ui.surface)
    && (!q || [c.name, c.title && c.title.en, c.title && c.title.ru].some((s) => s && s.toLowerCase().includes(q))));
}

const vRank = (c) => VERDICTS.indexOf(c.verdict);

function nodeHTML(c) {
  const state = c.verdict;
  const mark = state === 'missed' ? `<span class="mark mark-missed">${MARK.missed}</span>`
    : state === 'disabled' ? `<span class="mark mark-disabled">${MARK.disabled}</span>` : '';
  const sel = ui.sel && ui.sel.id === c.id;
  return `<li><button type="button" class="node s-${state}" data-id="${esc(c.id)}" aria-pressed="${sel}" aria-label="${esc(title(c))}, ${esc(t(`v_${state}`))}">
<span class="ring"><span class="disc">${emblem(c, 'n')}</span>${mark}</span>
<span class="label">${esc(title(c))}</span></button></li>`;
}

function treeHTML() {
  const list = visibleCards();
  if (!list.length) {
    return `<p class="empty">${esc(ui.q.trim() ? t('noMatch', { q: ui.q.trim() }) : t('noItems'))}</p>`;
  }
  const searching = ui.q.trim() !== '';
  const byBranch = new Map();
  for (const c of list) {
    if (!byBranch.has(c.branch)) byBranch.set(c.branch, new Map());
    const packs = byBranch.get(c.branch);
    if (!packs.has(c.pack)) packs.set(c.pack, []);
    packs.get(c.pack).push(c);
  }
  let html = '';
  for (const b of BRANCHES) {
    const packs = byBranch.get(b);
    if (!packs) continue;
    const all = [...packs.values()].flat();
    const lit = all.filter(isLit).length;
    const open = searching || !ui.collapsed.has(b);
    const ratio = all.length ? Math.round((lit / all.length) * 100) : 0;
    const names = [...packs.keys()].sort((x, y) => (x === 'user' ? -1 : y === 'user' ? 1 : x.localeCompare(y)));
    html += `<section class="branch" data-branch="${b}">
<h2><button type="button" class="branch-head" data-branch="${b}" aria-expanded="${open}" aria-controls="br-${b}" title="${esc(t(open ? 'collapse' : 'expand'))}">
<span class="chev">${ICON_CHEVRON}</span><span class="b-name">${esc(branchLabel(b))}</span>
<span class="b-lit"><span class="b-bar" aria-hidden="true"><i style="width:${ratio}%"></i></span>${esc(t('litOf', { lit, total: all.length }))}</span></button></h2>
<div class="packs" id="br-${b}"${open ? '' : ' hidden'}>`;
    for (const p of names) {
      const nodes = packs.get(p).slice().sort((x, y) => vRank(x) - vRank(y) || title(x).localeCompare(title(y), ui.lang));
      html += `<div class="pack"><h3>${esc(packLabel(p))}</h3><ul class="nodes">${nodes.map(nodeHTML).join('')}</ul></div>`;
    }
    html += '</div></section>';
  }
  return html;
}

function renderTree() { $('#tree').innerHTML = treeHTML(); }

/* ---------- header and toolbar ---------- */

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
<div><dd>${num(d.missed)}</dd><dt>${lbl('totalMissed')}</dt></div></dl>
<div class="hero-tools">
<button type="button" class="quiet" id="open-quests">${lbl('quests')}</button>
<div class="seg" role="group" aria-label="${esc(t('language'))}">${LANGS.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${ui.lang === l}" lang="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
</header>
<div class="toolbar">
<div class="seg wide" role="group" aria-label="${esc(t('surface'))}" id="surfaces">${SURFACES.map(([v, k]) => `<button type="button" data-surface="${v}" aria-pressed="${ui.surface === v}">${lbl(k)}<small>${v ? cards.filter((c) => c.surface === v).length : cards.length}</small></button>`).join('')}</div>
<label class="search">${ICON_SEARCH}<span class="sr-only">${lbl('search')}</span><input type="search" id="q" value="${esc(ui.q)}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off"></label>
</div>
<details class="legend-wrap"><summary>${esc(t('legend'))}</summary><ul class="legend">${['active', 'rare', 'asleep', 'missed', 'disabled', 'unknown'].map((v) => `<li class="s-${v}"><span class="ring sm"><span class="disc"></span>${v === 'missed' ? `<span class="mark">${MARK.missed}</span>` : v === 'disabled' ? `<span class="mark">${MARK.disabled}</span>` : ''}</span>${esc(t(`legendNote.${v}`))}</li>`).join('')}</ul></details>`;
}

function footHTML() {
  const bits = [];
  if (state.__sample) bits.push(`<strong>${esc(t('sample'))}.</strong> ${esc(t('sampleNote'))}`);
  if (state.enriched === false) bits.push(esc(t('notEnriched')));
  const when = state.generatedAt ? new Date(state.generatedAt).toLocaleDateString(ui.lang, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  bits.push(`${esc(t('generated', { date: when }))}, ${esc(t('usageFrom', { src: state.usageSource || '?' }))}. ${esc(t('estimatesNote'))}`);
  return bits.map((b) => `<p>${b}</p>`).join('');
}

/* ---------- drawer ---------- */

function factRow(label, value, est) {
  return `<div><dt>${esc(label)}${est ? ` <span class="est">(${esc(t('estimate'))})</span>` : ''}</dt><dd>${value}</dd></div>`;
}

function cardDrawer(c) {
  const u = c.usage;
  const tok = (n) => (n ? esc(t('tokens', { n: num(n) })) : esc(t('unknownVal')));
  const sum = summary(c);
  const rows = [
    factRow(t('uses30'), num(u.uses30d)),
    factRow(t('usesLife'), num(u.lifetimeUses)),
    factRow(t('missed30'), num(u.missed30d || 0)),
    factRow(t('lastUsed'), esc(lastUsedText(c))),
    factRow(t('startupCost'), tok(c.startupTokensEst), true),
    factRow(t('fullCost'), tok(c.staticTokensEst), true),
    c.version ? factRow(t('version'), esc(c.version)) : '',
    c.update ? factRow(t('updateAvail'), esc(t('updateLine', { installed: c.update.installed, latest: c.update.latest }))) : '',
  ].join('');
  return `<div class="d-head"><span class="ring lg s-${c.verdict}"><span class="disc">${emblem(c, 'd')}</span></span>
<div><h2 id="d-title" tabindex="-1">${esc(title(c))}</h2>
<p class="d-meta">${esc(t(`kinds.${c.kind}`))} · ${esc(t(`surface${c.surface[0].toUpperCase()}${c.surface.slice(1)}`))} · ${esc(packLabel(c.pack))}</p></div></div>
<p class="stamp s-${c.verdict}"><b>${esc(t(`v_${c.verdict}`))}.</b> ${esc(verdictNote(c))}</p>
${sum ? `<p class="d-sum">${esc(sum)}</p>` : ''}
<dl class="facts">${rows}</dl>
${c.inferred ? `<p class="d-note">${esc(t('inferred'))}</p>` : ''}
<details class="raw"><summary>${esc(t('rawDescription'))}</summary>
<p>${esc(c.description || t('noDescription'))}</p>
<p class="d-note">${esc(t('technicalName'))}: <code>${esc(c.name)}</code></p></details>`;
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

function renderDrawer() {
  const dr = $('#drawer');
  const body = $('#drawer-body');
  let html = '';
  if (ui.sel) {
    if (ui.sel.type === 'quests') html = questsDrawer();
    else {
      const c = cards.find((x) => x.id === ui.sel.id);
      if (c) html = cardDrawer(c);
      else ui.sel = null;
    }
  }
  body.innerHTML = html;
  dr.hidden = !ui.sel;
  document.body.classList.toggle('drawer-open', !!ui.sel);
}

function syncPressed() {
  document.querySelectorAll('.node').forEach((n) => n.setAttribute('aria-pressed', String(!!ui.sel && ui.sel.type === 'card' && ui.sel.id === n.dataset.id)));
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
  if (prev && prev.type === 'card') {
    const n = document.querySelector(`.node[data-id="${CSS.escape(prev.id)}"]`);
    if (n) n.focus();
  } else if (prev) {
    $('#open-quests').focus();
  }
}

/* ---------- boot ---------- */

function paintAll() {
  document.documentElement.lang = ui.lang;
  document.title = t('appTitle');
  $('#top').innerHTML = topHTML();
  $('#foot').innerHTML = footHTML();
  $('#close-drawer').setAttribute('aria-label', t('close'));
  renderTree();
  renderDrawer();
}

function wire() {
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const node = target.closest('.node');
    if (node) {
      const same = ui.sel && ui.sel.type === 'card' && ui.sel.id === node.dataset.id;
      select(same ? null : { type: 'card', id: node.dataset.id }, !same);
      return;
    }
    const head = target.closest('.branch-head');
    if (head) {
      const b = head.dataset.branch;
      ui.collapsed.has(b) ? ui.collapsed.delete(b) : ui.collapsed.add(b);
      const open = !ui.collapsed.has(b) || ui.q.trim() !== '';
      head.setAttribute('aria-expanded', String(open));
      head.title = t(open ? 'collapse' : 'expand');
      $(`#br-${b}`).hidden = !open;
      return;
    }
    const lang = target.closest('[data-lang]');
    if (lang) {
      ui.lang = lang.dataset.lang;
      try { localStorage.setItem('hero-sheet-lang', ui.lang); } catch { /* storage may be blocked */ }
      t = makeT(ui.lang);
      paintAll();
      $(`[data-lang="${ui.lang}"]`).focus();
      return;
    }
    const surf = target.closest('[data-surface]');
    if (surf) {
      ui.surface = surf.dataset.surface;
      document.querySelectorAll('[data-surface]').forEach((b) => b.setAttribute('aria-pressed', String(b === surf)));
      renderTree();
      return;
    }
    if (target.closest('#open-quests')) {
      select(ui.sel && ui.sel.type === 'quests' ? null : { type: 'quests' });
      return;
    }
    if (target.closest('#close-drawer')) closeDrawer();
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'q') { ui.q = e.target.value; renderTree(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sel) closeDrawer();
  });
}

async function boot() {
  try { const l = localStorage.getItem('hero-sheet-lang'); if (LANGS.includes(l)) ui.lang = l; } catch { /* default English */ }
  t = makeT(ui.lang);
  document.documentElement.lang = ui.lang;
  wire();
  try {
    const { data, sample } = await loadState();
    state = data;
    state.__sample = sample;
    cards = (state.cards || []).map(normalize);
    derived = derive(cards);
    paintAll();
  } catch {
    $('#tree').innerHTML = `<p class="empty">${esc(t('loadFailed'))}</p>`;
  }
}

boot();
