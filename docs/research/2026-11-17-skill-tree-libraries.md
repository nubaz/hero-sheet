# Skill tree / ability map: what to build on (research, 2026-11-17)

Goal: Hero Sheet draws about 190 abilities in about 11 domains, with packs inside domains, six states per ability, pan and zoom, a detail panel, light and dark themes, EN and RU. Today it is plain ES modules plus hand-written SVG. A build step is acceptable.

Method: GitHub API (stars, licence, last push, latest release), npm registry (version, licence, publish date), bundlephobia (min and gzip size), repo READMEs and file trees, and the live demos where they still exist. Numbers are as of 2026-11-16/17. "Unverified" means I could not open it or confirm the claim.

## Headline findings

1. There is no maintained, good-looking, ready-made skill tree library to adopt. The only well-known one, beautiful-skill-tree, is React-only, GPL-3.0 (cannot go into an MIT project), unmaintained, and its showcase sites are dead.
2. The game-quality look in real planners comes from three things: a canvas/WebGL renderer with a sprite atlas, a layout the data author fixed by hand (coordinates ship in the data), and framed node art. None of that is a library you install; it is art plus about 300 lines of code.
3. For ~190 nodes, performance is a non-issue for every option below, including SVG. Choose on look, effort and licence, not on node count.
4. Art is solved legally: game-icons.net (4,133 icons via Iconify, CC BY 3.0, attribution required) plus OFL fonts. Frames, rings and glows we draw ourselves in SVG/Canvas, which also keeps theming and states trivial.

## 1. Skill tree UI libraries

### beautiful-skill-tree (React)
- URL: https://github.com/andrico1234/beautiful-skill-tree
- Licence: GPL-3.0 (README says nothing; npm says "SEE LICENSE IN LICENSE"). Incompatible with shipping inside an MIT project.
- Stars 391. Last commit 2024-05-04; last npm publish 2022-04-11 (v1.7.1). Dead for practical purposes.
- Weight: 593 B gzip by bundlephobia for the entry, but it needs react >=16 and styled-components >=5 as peers.
- Build step: yes (React, styled-components).
- Gives: tree layout from nested data, tooltips, saved progress, theming. Writes we would still do: everything for packs, six states, pan and zoom, dark and light, i18n.
- Look: plain rounded tiles on connector lines, a UI widget rather than a game screen. Showcase links in the README: calisthenicsskills.com now shows a "sunset" notice; the Borderlands demo and the firebase demo return HTTP 200 but I did not render them (visuals unverified).
- Verdict: reject (licence, age, React lock-in).

### Other skill-tree repos found (all small, none reusable as a library)
- janu-sh/personal-skill-tree, MIT, 38 stars, pushed 2026-04-10. Vite + Tailwind + D3, JSON data, RPG-style tree. Demo-sized; a good tiny reference for D3 tree plus CSS skinning only. Look not verified (no live demo opened).
- NotVeryFun/VueSkillTree, MIT, 0 stars, 2026-10-10. A design tool that exports game data JSON, not a viewer.
- Preptics/SkillTreeOSS, MIT, 14 stars, 2026-10-20 (learning roadmap platform). Not opened beyond metadata; unverified usefulness.
- sicambria/skilltree AGPL-3.0, rossicler/enshrouded-skill-tree GPL-3.0, chrizel/skyrim GPL-3.0: licence blocks reuse. nokia/skilltree is archived.
- Svelte and Vue searches returned nothing relevant above 1 star. No newer or better dedicated library exists as of this date (searched GitHub by name and description; npm search not exhaustive).

## 2. Real game tree viewers and planners

### cvenzin/poe2-skilltree (best reference found)
- URL: https://github.com/cvenzin/poe2-skilltree, live at https://poe2planner.app/
- Licence: MIT (LICENSE file; GitHub shows NOASSERTION). Stars 1. Pushed 2026-11-07.
- Stack: Vite, React 19, TypeScript, PixiJS 8, pixi-viewport 6, floating-ui for tooltips. Build step: yes.
- Gives us: a working pattern for a large pre-laid-out node graph on PixiJS with pan, wheel and pinch zoom, search highlight, hover path preview, tooltips and URL-hash state. It is a reference to read, not a package.
- We would still write: node art, states, domains and packs, themes, i18n.
- Look: opened the live page. Dark background, thin gold line-art nodes in a dense disc; reads as PoE-like but restrained, not lavish. Small repo, one author, so treat as reference only.

### EmmittJ/SkillTree_TypeScript
- URL: https://github.com/EmmittJ/SkillTree_TypeScript
- Licence MIT, 25 stars, last push 2024-10-13. PixiJS 7 + pixi-viewport + pixi-essentials cull, built with bun. Renders the official Path of Exile passive tree from GGG's export. README missing (404), so details unverified beyond package.json. Older Pixi major; the PoE data flow (sprite atlas plus node coordinates from JSON) is the useful idea.

### Official PoE data: grindinggear/skilltree-export and poe2-skilltree-export
- Stars 219 (PoE 1) and 62 (PoE 2), pushed 2026-11-12 and 2026-09-04, no licence file shown. Data and sprite atlas references only. Shows the shape of a good tree data file: node id, x, y, group, orbit, icon key, connections. Do not copy the data or art (GGG assets).

### Path of Building (Community) and PoE2 fork
- https://github.com/PathOfBuildingCommunity/PathOfBuilding (5,521 stars, pushed 2026-11-16) and -PoE2 (1,948 stars, 2026-11-13). Licence NOASSERTION on GitHub. Lua desktop app on the Path of Building runtime. No usable web port found (searches returned only junk repos). Not reusable for a web page; useful only to see how a tree is laid out in orbits by group.

### PoESkillTree/PoESkillTree
- MIT, 676 stars, last push 2022-06-20. C# WPF desktop planner. Stale; skip.

### Last Epoch, Grim Dawn, Skyrim, FF sphere grid
- Musholic/LastEpochPlanner, 84 stars, NOASSERTION, 2026-04-29: Lua fork of Path of Building, desktop. Not reusable.
- Grim Dawn devotion tools (gddevotion, GD_DTTT, etc.): 0 to 4 stars, tiny. Not reusable.
- Skyrim: chrizel/skyrim (GPL-3.0, 24 stars), 4Integra/skyrim-perk-planner (React/TS, 0 stars, no licence). Not reusable.
- FF sphere grid: only aaronroe/ffx-sphere-grid, 1 star, data and algorithms, no renderer. No sphere grid viewer found.
- I did not open these beyond metadata and README snippets; unverified for rendering quality.

## 3. General graph and canvas libraries

Sizes are minified / gzip from bundlephobia unless noted. "Layout" means it computes positions.

| Library | Licence | Stars | Latest release | Size min / gzip | Build step | Notes |
|---|---|---|---|---|---|---|
| PixiJS 8 (https://github.com/pixijs/pixijs) | MIT | 48,774 | v8.23.0, 2026-11-11 | 995 KB / 282 KB (tree-shakable; real apps ship less) | Optional; ES modules from CDN work, bundler recommended | WebGL/WebGPU 2D. Sprites, Graphics, text, filters (glow, blur), masks. Used by both PoE viewers above. |
| pixi-viewport (https://github.com/pixijs-userland/pixi-viewport) | MIT | 1,221 | 7.0.3, 2026-11-14 | 212 KB unpacked | with Pixi | Drag, wheel, pinch, clamp, snap, animate-to-node. Used by both PoE viewers. |
| Konva (https://github.com/konvajs/konva) | MIT on npm (GitHub shows NOASSERTION) | 14,987 | 10.9.1, 2026-10-31 | 190 KB / 57 KB | Optional | Canvas 2D scene graph, hit testing, drag, tween. Simpler than Pixi, weaker effects, no WebGL. |
| React Flow / xyflow (https://github.com/xyflow/xyflow) | MIT | 39,045 | @xyflow/react 13.0.1, 2026-11-16 | 261 KB / 88 KB, needs React | Yes | Custom React nodes, pan, zoom, minimap, handles. Built for editors and diagrams, edges are bezier/step lines; fighting it to look like a game costs more than writing the nodes. Svelte version @xyflow/svelte 2.0.1 (same day); Vue Flow 1.48.2 (2026-01). Demos look like flowcharts. |
| Cytoscape.js (https://github.com/cytoscape/cytoscape.js) | MIT | 11,294 | v3.35.0, 2026-11-10 | 442 KB / 139 KB | Optional | Mature graph model, many layouts, style sheets. Node art via background-image is limited; look is "science graph". |
| Sigma.js (https://github.com/jacomyal/sigma.js) | MIT | 12,241 | 4.0.6, 2026-11-10 | 376 KB / 97 KB | Yes (plus graphology) | WebGL for thousands of nodes. Overkill; node programs are shader work. |
| D3 7.9.2 (https://github.com/d3/d3) | ISC | 113,948 | 2026-11-03 | modules: d3-zoom 53 KB / 18 KB, d3-hierarchy 15 KB / 6 KB, d3-force 16 KB / 6 KB | No (ESM from CDN) | Layout (tree, cluster, pack, radial, force) and zoom/pan, drives plain SVG. No rendering opinion. Fits the current no-build page. |
| AntV G6 (https://github.com/antvis/G6) | MIT | 12,400 | pushed 2026-11-13 | not measured | Yes | Full graph engine, canvas/WebGL, custom nodes. Heavy, mostly Chinese docs; not opened beyond the repo page. |
| vis-network (https://github.com/visjs/vis-network) | Apache-2.0 | 3,642 | pushed 2026-11-17 | not measured | Optional | Physics-looking hairball; unsuitable. |
| elkjs (https://github.com/kieler/elkjs) | EPL-2.0 OR GPL-3.0 (npm) | 2,902 | 0.12.1, 2026-10-28 | 1.46 MB / 447 KB | Optional | Best layered/compound layout (supports nested groups, which maps to domains and packs). Heavy and a layered-DAG look, not a game map. |
| dagre (https://github.com/dagrejs/dagre) | MIT | 5,857 | v2.0.0, 2025-11-23 (npm @dagrejs/dagre 3.1.3) | 47 KB / 16 KB | Optional | Simple layered layout, no real compound support. Wrong shape for a radial map. |
| three.js (https://github.com/mrdoob/three.js) | MIT | 118,676 | r187, 2026-10-30 | 742 KB / 186 KB | Yes in practice | A 2.5D camera is possible, but text, hit testing, accessibility and RU text all cost more than they give. Not worth it for 190 nodes. |
| react-d3-tree, reagraph | Not opened beyond reagraph (Apache-2.0, 1,101 stars, 2026-06-25) | | | | | Tree-style or 3D force; skip. |

Pan and zoom helpers for plain SVG: d3-zoom (above) or panzoom (anvaka, MIT, 2,014 stars, 6 KB gzip, last push 2026-03-30).

Layout approaches that look like a game, none of which are libraries:
- Hand or semi-hand authored coordinates in the data (PoE does exactly this). Each domain is a "constellation" cluster placed on a large ring or hex spiral; packs are tight sub-clusters inside it.
- Generate with d3-hierarchy (pack or cluster) per domain, place domain centres on a circle with generous gaps, then freeze the coordinates into a JSON file and tune by hand. Generated once, reviewed visually, committed.
- Sunburst/concentric rings were already rejected by the owner; avoid reintroducing them.

## 4. Art, icons, frames, fonts

### game-icons.net / game-icons/icons
- https://game-icons.net, https://github.com/game-icons/icons (1,369 stars, pushed 2026-04-23, GitHub shows NOASSERTION).
- Licence verified on the site and in license.txt: Creative Commons 3.0 BY, with CC0 for some contributors (for example Viscious Speed). Attribution required: credit the author (Lorc, Delapouite, etc.) and link the licence. Commercial use and modification allowed. Compatible with an MIT project as long as CREDITS.md plus an in-app credits line list the authors; MIT does not cover these files, the CC BY terms do.
- Weight: icons are single-path SVGs, mostly under 2 KB each. Iconify mirror @iconify/json game-icons set: 4,133 icons, npm @iconify-json/game-icons 1.2.4 (2026-04-24), 6.5 MB unpacked, license CC-BY-3.0. Pull only the ~190 needed, not the pack.
- Gives: the "RPG look" of the glyph itself, colourable with fill. The repo script colorize-svgs.sh recolours the whole set.
- Still ours: frames, rings, glow, state styling.

### Kenney assets
- https://kenney.nl/assets states its packs are CC0. I confirmed the CC0 statement on the site; I did not open a specific UI or RPG pack, so which pack has usable frames is unverified.

### OpenGameArt
- https://opengameart.org, per-asset licences (CC0, CC-BY, CC-BY-SA, GPL). Must be checked asset by asset. Avoid SA and GPL assets. Not searched in depth; unverified.

### RPG Awesome icon font
- https://github.com/nagoshiashumari/Rpg-Awesome, 953 stars, BSD-2-Clause per GitHub, last push 2021-07-15. Dated and smaller than game-icons; skip.

### Fonts (all SIL OFL 1.1, file OFL.txt present in google/fonts)
- Cinzel (variable weight, headings), MedievalSharp, Uncial Antiqua, IM Fell DW Pica, Almendra. OFL allows bundling in an MIT repo with the font licence file. Cyrillic support is not confirmed for every one of them; Cinzel has a Cyrillic extension in the Google Fonts release to my knowledge, unverified here. Pair a display face for titles with a plain UI sans for body and Russian detail text.

### Frames, textures, node sprites
- No properly licensed, ready-made "node frame" set was found that beats drawing our own. Recommended: draw frames in code (SVG paths or Pixi Graphics): double ring, bevelled octagon, rune notches, inner glow, plus a small pre-rendered noise texture. Six states map to ring colour, fill alpha, glow, a corner badge and a desaturation filter.

## Recommendation

### Primary stack
- Rendering: PixiJS 8 with pixi-viewport (WebGL, sprite per node, Graphics for rings and edges, glow and desaturate filters, smooth animate-to-node), vanilla ES modules plus Vite as the only build step. No React.
- Layout: author the coordinates. Generate a first draft with d3-hierarchy (pack per domain, domains on a ring or hex spiral), freeze it into `layout.json`, then hand-tune. Edges: gentle curves within a pack, a few long "domain bridge" arcs.
- Art: game-icons.net icons (CC BY 3.0, ~190 extracted SVGs, rasterised once into an atlas or kept as vector textures), self-drawn frames and rings per state, Cinzel for titles and a neutral sans for body. CREDITS.md plus an in-page credits link.
- UI outside the canvas: detail panel, language and theme toggles stay in plain DOM and CSS. This keeps EN and RU text, accessibility and search in HTML, and avoids rendering text in WebGL where it is hard.
- Reference code to read: cvenzin/poe2-skilltree (MIT) for the Pixi plus viewport plus hash-state pattern.
- Cost: extra build step and Pixi (~280 KB gzip tree-shaken less). Acceptable for a local tool.

### Second choice
- Stay in SVG, no framework: d3-zoom (or panzoom) for pan and zoom, d3-hierarchy for the first-draft layout, game-icons embedded as `<symbol>`/`<use>`, frames drawn as SVG with CSS variables for state and theme. About 30 KB gzip, can keep the current no-build setup, themes come free via CSS. Look ceiling is lower (no real glow shaders, heavier at zoomed-out with filters), but 190 nodes is well within SVG limits. If Pixi feels like too much, this is the pragmatic option.

### Avoid
- beautiful-skill-tree: GPL-3.0, React-only, unmaintained, demos dead.
- React Flow / Svelte Flow / Vue Flow and Cytoscape for the map: they give editor or hairball visuals and fight custom node art.
- Sigma.js and G6: thousands-of-nodes engines, wrong cost.
- Three.js 2.5D: high cost for little gain at this size.
- elkjs and dagre for the main layout: DAG look, not a game map (elkjs is also 447 KB gzip and EPL/GPL licensed).
- Concentric-ring auto layouts (already rejected).
- Copying PoE/GGG art or data, and any GPL, AGPL or SA assets.
- Using game-icons without author credit.

## Open items / unverified
- Visual quality of the Borderlands and Firebase beautiful-skill-tree demos (links answer 200, not rendered).
- G6, Sigma, Cytoscape, Konva demos not viewed; look judged from library type and knowledge, not screenshots.
- Which Kenney or OpenGameArt pack, if any, offers usable frames.
- Cyrillic coverage of each OFL font.
- Path of Building web ports: none found; a port may exist outside GitHub search.
