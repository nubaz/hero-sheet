// Pure data and geometry for the radial skill map. No DOM here, so it can be tested.
//
// Layout rules:
//   angle  - each branch owns a sector. Sector width = a small base share + a share proportional to its node count.
//            Sectors run clockwise in BRANCHES order, starting at the top.
//   radius - nodes sit on rings (bands) counted from the centre: 0 core (instructions, memory, hooks, plugins),
//            1 in use (lit, half-lit, unrated), 2 asleep / missed / locked, 3 not installed (catalogue candidates).
//            Inside a band, nodes fill rows outward; the busiest packs and most-used nodes come first, so they sit nearest the centre.
//            Band start radii are shared by all sectors, so the rings are true circles.
//   size   - node radius grows with use in the last 30 days (log scale, 17 to 27 units). Core nodes and ghosts are fixed.
//   no overlap - a row at radius r holds floor(sector arc / TAN) nodes, rows are ROW apart, so any two circles stay apart.

export const BRANCHES = ['code', 'design', 'research', 'writing', 'data', 'automation', 'memory', 'communication', 'finance', 'system', 'other'];
export const PLACES = ['cli', 'synced', 'desktop', 'connector'];
export const CORE_KINDS = new Set(['instructions', 'memory', 'hook', 'plugin']);
export const VERDICT_ORDER = ['active', 'rare', 'unknown', 'missed', 'asleep', 'disabled'];
export const CAND_STATUS = ['candidate', 'tested', 'rejected'];

export const TAN = 84;        // minimum distance between node centres along a ring
export const ROW = 92;        // distance between rows
export const HERO_R = 56;
export const GAP_BAND = 1.3;  // empty annulus between bands, in rows

export const baseName = (name) => String(name == null ? '' : name).split(':').pop().trim().toLowerCase();
export const nodeKey = (c) => `${c.kind}:${baseName(c.name)}`;
export const isLit = (n) => n.verdict === 'active' || n.verdict === 'rare';

const vRank = (v) => { const i = VERDICT_ORDER.indexOf(v); return i < 0 ? 2 : i; };

/** One node per capability: cards with the same kind and the same name after the last colon merge. */
export function mergeCards(cards) {
  const map = new Map();
  for (const c of cards) {
    const k = nodeKey(c);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(c);
  }
  const nodes = [];
  for (const [key, group] of map) {
    const lead = group.find((c) => c.title) || group[0];
    const places = PLACES.filter((p) => group.some((c) => c.surface === p));
    const usage = { uses30d: 0, lifetimeUses: 0, missed30d: 0 };
    for (const c of group) {
      usage.uses30d += c.usage.uses30d || 0;
      usage.lifetimeUses += c.usage.lifetimeUses || 0;
      usage.missed30d += c.usage.missed30d || 0;
      if (c.usage.lastUsedAt && (!usage.lastUsedAt || c.usage.lastUsedAt > usage.lastUsedAt)) usage.lastUsedAt = c.usage.lastUsedAt;
    }
    const verdict = group.map((c) => c.verdict).sort((a, b) => vRank(a) - vRank(b))[0];
    const branches = group.map((c) => c.branch).filter((b) => b !== 'other');
    nodes.push({
      id: key, key, ghost: false, kind: lead.kind, name: lead.name.split(':').pop(),
      fullNames: [...new Set(group.map((c) => c.name))],
      title: lead.title, summary: lead.summary, description: lead.description,
      branch: branches[0] || lead.branch, packs: [...new Set(group.map((c) => c.pack))], pack: lead.pack,
      places, cards: group, duplicate: places.length > 1 || group.length > 1,
      verdict, usage, enabled: group.some((c) => c.enabled !== false),
      version: (group.find((c) => c.version) || {}).version, update: (group.find((c) => c.update) || {}).update,
      startupTokensEst: lead.startupTokensEst, staticTokensEst: lead.staticTokensEst, inferred: group.every((c) => c.inferred),
    });
  }
  return nodes;
}

/** Validates the optional candidates file; anything malformed is dropped. */
export function normalizeCandidates(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const c of raw) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) continue;
    const id = typeof c.id === 'string' && c.id ? c.id : `cand-${c.name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id, name: c.name, title: c.title && typeof c.title === 'object' ? c.title : undefined,
      summary: c.summary && typeof c.summary === 'object' ? c.summary : undefined,
      branch: BRANCHES.includes(c.branch) ? c.branch : 'other',
      status: CAND_STATUS.includes(c.status) ? c.status : 'candidate',
      score: typeof c.score === 'number' && Number.isFinite(c.score) ? c.score : undefined,
      url: typeof c.url === 'string' && /^https?:\/\//i.test(c.url) ? c.url : undefined,
      kind: typeof c.kind === 'string' ? c.kind : 'skill',
      installed: c.installed === true,
    });
  }
  return out;
}

/** A candidate that matches an installed node is not drawn as a ghost; the node carries it as `catalog`. */
export function attachCandidates(nodes, cands) {
  const byBase = new Map(nodes.map((n) => [baseName(n.name), n]));
  const ghosts = [];
  for (const c of cands) {
    const hit = byBase.get(baseName(c.name));
    if (hit) { hit.catalog = c; continue; }
    ghosts.push({
      id: c.id, key: c.id, ghost: true, kind: c.kind, name: c.name, title: c.title, summary: c.summary, branch: c.branch,
      status: c.status, score: c.score, url: c.url, installedFlag: c.installed, verdict: c.status, places: [], cards: [], pack: 'candidates',
      packs: ['candidates'], usage: { uses30d: 0 }, duplicate: false,
    });
  }
  return ghosts;
}

export function nodeRadius(n) {
  if (n.ghost) return 18;
  if (CORE_KINDS.has(n.kind)) return 21;
  return Math.round(17 + Math.min(10, Math.log2(1 + (n.usage.uses30d || 0)) * 2.2));
}

const bandOf = (n) => {
  if (n.ghost) return 3;
  if (CORE_KINDS.has(n.kind)) return 0;
  return n.verdict === 'asleep' || n.verdict === 'missed' || n.verdict === 'disabled' ? 2 : 1;
};

function orderInBand(list) {
  const groups = new Map();
  for (const n of list) {
    const g = groups.get(n.pack) || { pack: n.pack, items: [], best: 0 };
    g.items.push(n); g.best = Math.max(g.best, n.usage.uses30d || 0); groups.set(n.pack, g);
  }
  const ordered = [...groups.values()].sort((a, b) => b.best - a.best || a.pack.localeCompare(b.pack));
  const out = [];
  for (const g of ordered) {
    g.items.sort((a, b) => vRank(a.verdict) - vRank(b.verdict) || (b.usage.uses30d || 0) - (a.usage.uses30d || 0) || a.name.localeCompare(b.name));
    out.push(...g.items);
  }
  return out;
}

/** Fills rows outward inside the angular range [a0, a1]. Returns the radius of the last row. */
function fillSector(list, a0, a1, rStart, place) {
  const th = a1 - a0;
  let r = rStart;
  let i = 0;
  let last = rStart;
  let guard = 0;
  while (i < list.length && guard++ < 5000) {
    const cap = Math.floor((th * r) / TAN);
    if (cap < 1) { r += ROW * 0.5; continue; }
    const take = Math.min(cap, list.length - i);
    for (let j = 0; j < take; j++) place(list[i + j], r, a0 + (th * (j + 0.5)) / take);
    last = r; r += ROW; i += take;
  }
  return last;
}

/** Computes positions for every node, plus the sectors and rings to draw. */
export function layoutMap(items) {
  const placed = [];
  const put = (n, r, a, band, sector) => { n.x = r * Math.cos(a); n.y = r * Math.sin(a); n.a = a; n.d = r; n.band = band; n.sector = sector; n.r = nodeRadius(n); placed.push(n); };

  // core ring around the hero
  const core = items.filter((n) => !n.ghost && CORE_KINDS.has(n.kind));
  const rest = items.filter((n) => !core.includes(n));
  let coreEnd = HERO_R + 14;
  const coreOrder = orderInBand(core);
  {
    let r = HERO_R + ROW * 0.85;
    let i = 0;
    let row = 0;
    while (i < coreOrder.length) {
      const cap = Math.max(1, Math.floor((2 * Math.PI * r) / TAN));
      const take = Math.min(cap, coreOrder.length - i);
      for (let j = 0; j < take; j++) put(coreOrder[i + j], r, -Math.PI / 2 + ((j + (row % 2 ? 0.5 : 0)) * 2 * Math.PI) / take, 0, null);
      coreEnd = r; r += ROW; i += take; row++;
    }
  }

  // sectors
  const used = BRANCHES.filter((b) => rest.some((n) => n.branch === b));
  const m = used.length;
  const gap = m > 1 ? (6 * Math.PI) / 180 : 0;
  const avail = 2 * Math.PI - gap * m;
  const total = rest.length || 1;
  const base = (0.28 * avail) / (m || 1);
  const sectors = [];
  let a = -Math.PI / 2 + gap / 2;
  for (const b of used) {
    const members = rest.filter((n) => n.branch === b);
    const width = base + (0.72 * avail * members.length) / total;
    sectors.push({ branch: b, a0: a, a1: a + width, mid: a + width / 2, members, lit: members.filter(isLit).length, total: members.filter((n) => !n.ghost).length, ghosts: members.filter((n) => n.ghost).length });
    a += width + gap;
  }

  const rings = [];
  let bandStart = coreEnd + ROW * GAP_BAND;
  let outer = coreEnd;
  for (const band of [1, 2, 3]) {
    let any = false;
    let bandEnd = bandStart;
    for (const s of sectors) {
      const list = orderInBand(s.members.filter((n) => bandOf(n) === band));
      if (!list.length) continue;
      any = true;
      const end = fillSector(list, s.a0, s.a1, bandStart, (n, r, ang) => put(n, r, ang, band, s.branch));
      bandEnd = Math.max(bandEnd, end);
    }
    if (any) {
      rings.push({ band, r: bandStart - ROW * 0.72 });
      outer = bandEnd;
      bandStart = bandEnd + ROW * GAP_BAND;
    }
  }
  const innerR = coreEnd + ROW * 0.72;
  const outerR = outer + ROW * 0.8;
  for (const s of sectors) { s.innerR = innerR; s.outerR = outerR; }
  return { placed, sectors, rings, innerR, outerR, coreEnd, heroR: HERO_R };
}
