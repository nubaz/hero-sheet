# Skill tree and progression screen patterns: research for Hero Sheet

Date: 2026-11-17. Goal: pick proven screen patterns for ~190 unlinked abilities, 11 domains, packs of 2 to 20, six states (in use, rarely used, asleep, missed, disabled, not yet acquired), no prerequisite links.

## How this was verified

"Seen" means I downloaded the screenshot from Interface In Game (IIG) or the developer's own site and looked at the image. "Read" means I opened the page and read the text. Anything else is marked UNVERIFIED.

Seen (screenshots opened and inspected):
- Cyberpunk 2077 perks hub: https://interfaceingame.com/screenshots/cyberpunk-2077-perks/
- Diablo IV beta skill tree (French client): https://interfaceingame.com/screenshots/diablo-iv-beta-skill-tree/
- God of War (2018) skills: https://interfaceingame.com/screenshots/god-of-war-skills/
- Assassin's Creed Odyssey abilities: https://interfaceingame.com/screenshots/assassins-creed-odyssey-abilities/
- Assassin's Creed Valhalla skills: https://interfaceingame.com/screenshots/assassins-creed-valhalla-skills/
- Hades Mirror of Night: https://interfaceingame.com/screenshots/hades-mirror-of-night/
- Path of Exile skill tree (zoomed-in view): https://interfaceingame.com/screenshots/path-of-exile-skill-tree/
- Slay the Spire relic collection: https://interfaceingame.com/screenshots/slay-the-spire-collection/
- Hollow Knight charms: https://interfaceingame.com/screenshots/hollow-knight-charms/
- The Witcher 3 character screen (level 2, mostly locked): https://interfaceingame.com/screenshots/the-witcher-3-wild-hunt-character/
- Genshin Impact constellation: https://interfaceingame.com/screenshots/genshin-impact-mobile-constellation/
- Horizon Forbidden West skill-tree hub: https://interfaceingame.com/screenshots/horizon-forbidden-west-skill-tree/
- Monster Hunter World forge tree: https://interfaceingame.com/screenshots/monster-hunter-world-tree/
- Grim Dawn Devotion window (official image): https://www.grimdawn.com/wp-content/uploads/sites/3/2019/09/devotion_UI01.jpg

Read as text:
- Grim Dawn official Devotion guide: https://www.grimdawn.com/guide/character/devotion
- PoE wiki, Passive skill: https://www.poewiki.net/wiki/Passive_skill_tree
- Cyberpunk 2.0 perks (Gamer Guides): https://gamerguides.com/cyberpunk-2077/guide/introduction/guide-information/perk-changes-in-cyberpunk-2-0-how-perks-work-in-patch-2-0
- PC Gamer on the Cyberpunk 2.0 redesign: https://pcgamer.com/cyberpunk-2077s-20-overhaul-was-inspired-by-the-old-school-design-of-diablo-2s-skill-trees-and-dooms-relentless-combat (fetched and indexed; I relied on the search summary of its claim, not a close reading)
- Hades Mirror (Fextralife): https://hades.wiki.fextralife.com/Mirror+of+the+Night
- UESP Skyrim Leveling: https://en.uesp.net/wiki/Skyrim:Leveling
- Wikipedia Final Fantasy X (Sphere Grid section): https://en.wikipedia.org/wiki/Final_Fantasy_X
- Wikipedia Technology tree: https://en.wikipedia.org/wiki/Technology_tree
- Tuts+ talent tree primer: https://code.tutsplus.com/lets-spec-into-talent-trees-a-primer-for-game-designers--gamedev-6691a
- Community ARPG proposals (fan, opinionated): https://diablo-proposals.web.app/guidelines
- PoE passive tree analysis (fan write-up): https://saschb2b.github.io/game-mechanics/games/path-of-exile/passive-tree
- Last Epoch dev blog thread: https://forum.lastepoch.com/t/passive-skill-systems/1270 (fetched; not studied closely)

UNVERIFIED or not opened:
- Game UI Database (gameuidatabase.com): HTTP 403 for every request. No screens taken from it. IIG was used instead.
- Fextralife-style Fandom wikis (FFX Sphere Grid, Grim Dawn, Cyberpunk, Hades, Civ VI, Witcher): HTTP 403.
- GDC talks: nothing found. A fan page says Grinding Gear Games gave a GDC 2019 talk on the shared passive tree. I could not open the talk. Treat that claim as UNVERIFIED. The skills.sh note crediting Jonathan Blow with progressive disclosure and "Chris Taylor 2016 GDC Designing Tech Trees" came from a search snippet only. UNVERIFIED.
- Screens I did not see as images: The Elder Scrolls V Skyrim constellations (only UESP text: perk screen is entered by centring a skill constellation; clicking a star below its text then confirms with Yes/No), Final Fantasy X sphere grid (only the Wikipedia description: a pre-set grid of interconnected nodes, characters move by earning Sphere Levels and apply Spheres to nodes), Civilization VI tech tree, Baldur's Gate 3 level-up screen, Last Epoch passive and skill trees, Path of Exile 2, Borderlands 3 skill trees (the IIG Borderlands screen I opened was the Quick Change menu, not the skill tree), Diablo IV beyond the one beta screen, Frostpunk, Genshin Talents, Hades Codex.
- Exact visible-node counts below are my counting on the screenshots, rounded. They are approximate.

## 1. Patterns found

### P1. Hub of big branch cards, then a branch panel (Horizon Forbidden West, Cyberpunk 2077, Assassin's Creed Odyssey)
Seen: Horizon https://interfaceingame.com/screenshots/horizon-forbidden-west-skill-tree/ ; Cyberpunk https://interfaceingame.com/screenshots/cyberpunk-2077-perks/ ; Odyssey https://interfaceingame.com/screenshots/assassins-creed-odyssey-abilities/
- Structure. Horizon opens on six tall colour-coded columns, one per branch (Warrior, Trapper, Hunter, Survivor, Infiltrator, Machine Master), each with an icon, a name and an owned/total counter (0/36, 0/25, 0/34, and so on). The focused column shows its description. A tutorial tip says to pick one and click to open it. Cyberpunk shows five attribute hexagons around a central level badge, each with its value, and a side panel for the focused one (hold to buy, click to open perks). Odyssey shows three branch columns (Hunter, Warrior, Assassin) at once with an icon grid under each.
- Nodes visible at once. Overview: 5 to 6 cards. Odyssey single screen: about 35 abilities plus 9 slots below.
- Branch separation. Colour per branch and spatial columns. No lines between branches.
- States. Odyssey: gold glowing icon with a rank like 3/3 = owned; dim grey-teal silhouette = not owned; ring highlight = cursor. Counter per card shows progress.
- Drill. Focus a card, click to open it. Side tooltip with description, image and a purchase prompt.
- Why readable. Few big targets, a number that answers "how complete is this branch", and a fixed detail panel.
- Fit: very high. 11 domains is more than six but still a single row or a 2-row grid of cards. Counters map onto our "owned / total" and "in use / total". Prereq lines are optional in this pattern, so nothing to fake.

### P2. Grouped icon grid with silhouettes (collection screens: Slay the Spire, Hollow Knight, Hades boons)
Seen: Slay the Spire https://interfaceingame.com/screenshots/slay-the-spire-collection/ ; Hollow Knight https://interfaceingame.com/screenshots/hollow-knight-charms/
- Structure. Slay the Spire relic collection is a scrolling page with sections titled Starter, Common, Uncommon and so on, each with a one-line description. Each section holds a grid of about 10 icons per row. Found items show in full colour. Seen-but-not-owned items show as black silhouettes. Never-seen items show as padlocks. Hover on a silhouette says "Unknown: This relic remains to be seen." Hollow Knight charms are a grid of slots with the selected charm enlarged and a detail pane on the right (cost, description). Equipped and notch counters sit top-left.
- Nodes visible at once. Roughly 30 to 40 icons per screen.
- Separation. Heading plus a short description per section. No lines.
- States. Full colour, silhouette, padlock: three clear tiers without text. Text appears only on hover.
- Drill. Hover or select shows the detail. No separate page.
- Why readable. Same icon size everywhere, regular rows, state read from the icon alone, section headings explain the group.
- Fit: very high. Our packs of 2 to 20 are exactly "sections with a heading and a row of icons". Our six states need more than three treatments, see the recommendation. Silhouette matches "not yet acquired".

### P3. Constellation map (Grim Dawn Devotion, Skyrim, Genshin Impact)
Seen: Grim Dawn official image https://www.grimdawn.com/wp-content/uploads/sites/3/2019/09/devotion_UI01.jpg ; Genshin https://interfaceingame.com/screenshots/genshin-impact-mobile-constellation/ ; Skyrim text only (UESP).
- Structure. Grim Dawn shows a night sky with roughly 50 constellations drawn as animals and objects, spread over coloured nebula regions. Each constellation has 3 to 8 stars joined by lines. A left panel lists five affinity counts and points available (50/50 unlocked in the image). Constellations that you have worked on glow gold; the rest are faint blue-white outlines. The official guide says every constellation except the Crossroads needs affinity first, and that brighter stars grant a Celestial Power. A Zoom control sits at the top. Genshin shows one constellation of 6 stars with a list of six locked named skills on the right.
- Skyrim (read, not seen): you centre a skill's constellation to open that skill's perk tree, then click a star.
- Nodes visible at once. Grim Dawn: about 50 constellations and a few hundred stars, readable because only a few are lit.
- Separation. Colour of the nebula plus empty space between figures.
- States. Brightness and colour: lit gold, dim outline, unreachable (not yet shown or hidden until affinity). Padlocks in Genshin.
- Drill. Zoom into one constellation, hover for the power.
- Why readable. Whole map is memorable (shapes act as labels), progress shows as light.
- Fit: medium to high as an overview of packs. A pack of 2 to 20 becomes one constellation. Risk: lines between stars read as prerequisites, and 190 unlinked items would need custom drawn figures. Use lines only as a faint outline, or none.

### P3b. Single-branch tree page (Diablo IV, God of War, Witcher 3, Cyberpunk perk page)
Seen: D4 https://interfaceingame.com/screenshots/diablo-iv-beta-skill-tree/ ; God of War https://interfaceingame.com/screenshots/god-of-war-skills/ ; Witcher 3 https://interfaceingame.com/screenshots/the-witcher-3-wild-hunt-character/
- Structure. Diablo IV: pan-and-zoom canvas with hub nodes joined by thick red lines for the taken path, small leaf nodes, "3/5" rank badges, a keyword search box top right, a Refund All button and spent/available counters. God of War: two columns (Ranged Combat, Close Combat) of rows numbered 2 to 5, padlocks with the required tier number in place of the icon, and a detail panel naming the exact lock reason ("Requires Axe upgrade 2", "Requires Vitality 0/125"). Witcher 3: five coloured tabs along the top, a 5-by-3 grid of skills per branch with row padlocks showing a point threshold (8, 20, 30), a points-in-branch counter, and a second grid on the right for mutagen slots.
- Nodes visible at once: D4 about 40; God of War about 14 per weapon; Witcher about 15 skills.
- Separation. Tabs (Witcher), weapon icons (God of War), centre hubs (D4).
- States. Colour fill vs grey; padlock with number; bright red path line; rank text.
- Drill. Tabs then cursor.
- Cyberpunk 2.0 perk trees hold about 33 to 38 perks per attribute, grouped in clusters of one central perk plus subordinate ones; levels need an attribute threshold (4, 9, 15, 20) (Gamer Guides).
- Fit: low for the main view, because these layouts exist to show "you must take A before B", and we have no such rule. Useful parts to borrow: the rank/count badge, the lock-reason line in the detail panel, the search box and the refund/reset controls.

### P4. Giant shared web (Path of Exile, PoE 2, Diablo IV Paragon, Last Epoch partly)
Seen: PoE https://interfaceingame.com/screenshots/path-of-exile-skill-tree/ ; read: https://www.poewiki.net/wiki/Passive_skill_tree
- Structure. About 1,500 nodes on one canvas (fan analysis; the wiki describes it as roughly circular with three equal sectors, blue magic, red melee, green ranged, around a central wheel, with class start points on the inner wheel). Small, notable and keystone nodes differ in size. Jewel sockets and masteries add more layers. The seen screenshot is a close zoom: about 100 nodes, clusters in rings, glowing gold lines for allocated paths, a search box, "points left" counters, Apply, Cancel and Reset buttons, and a tooltip.
- Separation. Region colour (by attribute), distance, cluster rings.
- States. Allocated = gold lines and bright frames; unallocated = dim. Pathing costs points, so lines carry meaning.
- Readability. Poor for newcomers. The fan analysis says Grinding Gear Games acknowledged the tree is impenetrable for new players and PoE 2 tightened the default view (UNVERIFIED, secondary source). The shape comes from shared prerequisites and pathing, which we do not have. PoE's own wiki shows features that help: search highlighting, one-click full refund (version notes).
- Fit: poor, and it is the pattern the owner's first attempt resembled (rings and sectors).

### P5. Tech tree and forge tree (Civilization, Monster Hunter World, Frostpunk)
Seen: Monster Hunter World https://interfaceingame.com/screenshots/monster-hunter-world-tree/ ; read: https://en.wikipedia.org/wiki/Technology_tree
- Structure. MHW: a horizontal tree with one row per monster line, nodes in a chain left to right, branches dropping to other rows, a List / Tree / Zoom tab bar at top and an info panel with required materials on the right.
- Strength. The same screen has three views of the same data (List, Tree, Zoom), which is a useful pattern in itself.
- Fit: poor as a tree (every edge is an upgrade dependency). Good as an example of a switch between views.
- Civ VI tech tree and Frostpunk tech tree: UNVERIFIED visually. Wikipedia says Civ techs usually have multiple prerequisites. This is the opposite of our data.

### P6. Plain ranked list with columns (Hades Mirror of Night)
Seen: https://interfaceingame.com/screenshots/hades-mirror-of-night/ ; read: https://hades.wiki.fextralife.com/Mirror+of+the+Night
- Structure. A single column of 10 talents with icon, name, current value and the cost or a MAX tag, in a decorative frame. Tooltip at the side. The first four are free; then you spend Chthonic Keys to unlock the next batch of two. Alternative versions are unlocked later through dialogue.
- States. Cost button vs grey MAX. Hidden items appear later (progressive reveal).
- Fit: medium. It cannot hold 190 as is, but it is the clearest model for a flat, sortable ledger with a state column.

### P7. Sphere grid (Final Fantasy X)
Read only: https://en.wikipedia.org/wiki/Final_Fantasy_X . Visual UNVERIFIED. A pre-set grid of connected nodes you walk over and fill with spheres. Movement-through-nodes is the point. Not suited: we have no adjacency.

### P8. Menu-style choice (Baldur's Gate 3 level-up, Borderlands 3)
UNVERIFIED visually (BG3 only read on bg3.wiki; a Borderlands skill tree screen was not found). BG3 gives a level-up choice of class and features; no 190-node overview exists to learn from.

## 2. Recommendation: three patterns that fit best

### Rank 1. Domain hub, then a pack-grouped icon grid (P1 + P2)
Games: Horizon Forbidden West, Cyberpunk 2077, Assassin's Creed Odyssey, Slay the Spire, Hollow Knight.

First view. A row or a 2-row grid of 11 domain cards (Code, Design, Research, Writing, Data, Automation, Memory, Communication, Finance, System, Other). Each card shows an icon, the name, and a tally like "34 abilities: 12 in use, 5 missed". A thin segmented bar under the title shows the six states in proportion. Missed is the one accent colour, so the owner sees at once where gaps are. A global strip on top shows totals per state, with each total clickable as a filter, and a search box.

Click on a card. The page switches to that domain (no new route needed; a side panel or an in-page view). It holds one heading per pack ("Pack name, 7 abilities") followed by a row of equal icons, like Slay the Spire's Starter/Common sections. Each icon shows its state by treatment: full colour plus a glow for in use, full colour and no glow for rarely used, desaturated for asleep, a dashed amber ring for missed, a struck-through grey for disabled, a black silhouette with a padlock for not yet acquired. Rank-style badges (like "3/3") can show use count. Hover or select shows a fixed detail pane on the right with name, state, last used, and a "why missed" line (modelled on God of War's lock-reason line). Pack headings can collapse. A back button or the hub strip returns to the first view.

Why first. It is the least risky: the pattern appears in five shipped games, needs no art, scales to 190 with only two levels, and shows the six states without relying on lines.

### Rank 2. Constellation sky for the overview (P3)
Games: Grim Dawn Devotion, Skyrim, Genshin Impact.

First view. A dark canvas where each domain is a coloured nebula region and each pack is a small constellation (stars = abilities). In use stars are bright, rarely used dim gold, asleep pale blue, missed pulsing amber, disabled hollow, not yet acquired a faint dot-only outline. Lines between stars are drawn only as a faint ring or outline, not as links, to avoid implying prerequisites. Pack name appears on hover. About 11 domains and an estimated 30 to 40 packs fit on one screen, like Grim Dawn's roughly 50.

Click. Zoom animates into the pack. The stars grow into the icon grid with names (the detail pane of Rank 1). A domain click zooms to its nebula.

Why second. It gives the character-sheet mood the owner wants and is proven at about this density. Costs: needs a layout algorithm for packs and a way to keep a 20-star pack legible; also needs a plain-list fallback for accessibility. Use it as a second tab ("Sky") beside the Rank 1 view.

### Rank 3. Flat ledger with filters and a states column (P6, P5's List/Tree/Zoom idea, Diablo IV and PoE search)
Games: Hades Mirror of Night, Monster Hunter World (List tab), Diablo IV and PoE (search box).

First view. A dense table of all 190 rows: icon, name, domain, pack, state chip, last used. Sort and group controls, state chips as filters, keyword search that highlights matches. A "missed" preset acts as a to-do list.

Click. Row opens the same detail pane. Why third. It does not give the RPG feel but solves "find this ability" and "what should I fix", which no pretty view does well. Keep it as a tab of the same page, like MHW's List / Tree / Zoom bar.

## 3. Patterns to avoid for this data

- Giant shared web with rings and sectors (PoE, D4 Paragon). Its shape comes from prerequisite paths. Without them it is decoration, and our first attempt already showed the result. 100 nodes in a zoomed PoE screen is already hard to scan; 190 plus six states is worse.
- Tiered tree with padlock gates (God of War, Witcher 3, Cyberpunk perk pages, Diablo II style). Locks mean "you must buy the row above". Our "not yet acquired" is not that, and rows would invent a hierarchy.
- Tech tree and sphere grid (Civ, MHW forge tree, FFX). Edges mean dependency or adjacency.
- Single small constellation or list per item (Genshin's 6-star constellation, Hades Mirror's 10 rows as the only view). They do not hold 190.
- Radial rings of dots (the first attempt). No shipped game in the set uses this as a main view for a flat set. UNVERIFIED as a negative claim; I just did not find one.

## 4. Readability rules the sources agree on

Grounded in what I saw or read, not in a general design authority:
1. One level of overview with a handful of big targets (Horizon 6 columns, Cyberpunk 5 hexes, Witcher 5 tabs), then the detail. Even the biggest trees open at a zoomed level (the PoE screen I saw shows about 100 nodes).
2. Icons for scanning, text on demand: every screen I opened shows icons plus a fixed detail pane or tooltip with the words (Cyberpunk, D4, God of War, Odyssey, Hades, Hollow Knight). The Last Epoch forum suggestion for small category symbols on nodes comes from a forum post (secondary).
3. Show progress as a number per group: Horizon 0/34, Witcher "points in branch", D4 3/5, Odyssey 3/3, Slay the Spire section grouping.
4. Three or four visible state treatments at most, using brightness and shape, not colour alone: lit vs dim vs padlock (Odyssey, Slay the Spire, God of War, Witcher). Six states needs shape and a legend, not six hues.
5. Say why something is locked in words: God of War's detail pane names the exact requirement.
6. Provide search and a reset or refund control (D4, PoE both show them in the screenshot).
7. Group with a heading and a one-line description (Slay the Spire).
8. Reveal gradually when content is big: Hades unlocks talents in batches; Grim Dawn hides constellations until affinity is earned. For us, the not-yet-acquired state can be shown as silhouettes rather than hidden.
9. Keep counts per screen low: from the screenshots, 5 to 15 per branch (Cyberpunk, Witcher), 30 to 40 per screen for dense grids (Odyssey, Slay the Spire, Hollow Knight), and a few hundred only when most of it is dim (Grim Dawn).
10. Newcomers find huge shared graphs intimidating. Source is a fan analysis plus forum threads, so UNVERIFIED as a developer statement.

The Tuts+ primer says low-tier nodes should show what to expect later and that tiers gate power. It is about prerequisite trees, so only the "show a preview" idea carries over.

## 5. Open questions
- Verify Skyrim, Last Epoch, BG3, Civ VI, FFX and Borderlands 3 screens visually (Game UI Database was unreachable).
- Find a primary source for the "tree is intimidating" claim (a GDC or developer interview).
- Decide the six state treatments and check them in grayscale.
