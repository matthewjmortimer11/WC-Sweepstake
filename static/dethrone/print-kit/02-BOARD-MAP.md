# Phase 1 · The Board / Map (Monopoly-size, print-ready)

**Goal:** one large, square, illustrated **kingdom board** — the same footprint as
a standard Monopoly board — with the game's **7 sites** and the **roads** that
connect them, painted in the V3b parchment style. This is the hero physical
component; get it print-ready before moving to the decks.

> Prepend the **STYLE BLOCK** from `01-ART-DIRECTION.md` to every prompt below.

---

## 1. Physical spec (the important bit)

| Property | Value |
|----------|-------|
| Shape | **Square** |
| Trim size | **20 in × 20 in** (508 × 508 mm) — standard Monopoly board footprint |
| Bleed | **+0.125 in** each edge → full art **20.25 × 20.25 in** |
| Safe zone | keep essential art/labels **0.5 in** inside the trim |
| Resolution | **300 DPI** → trim **6000 × 6000 px**, with bleed **6075 × 6075 px** |
| Colour | **CMYK** for print (design in the RGB palette, convert on export) |
| Fold | **Quad-fold (2 × 2)**: horizontal + vertical fold through the centre. **Keep site pins, labels and roads clear of the two centre fold lines** (a ~0.25 in dead strip along each centreline). |

> If Fable 5 cannot output 6075 px in one pass: generate the composition at the
> largest square resolution it supports, then upscale to 6075 px, **or** generate
> the four quadrants separately at 300 DPI using the layout coordinates below and
> stitch them (roads must line up across the seams).

---

## 2. The 7 sites (locations)

The board is a **node-and-road map**, not a perimeter track. Players move between
connected sites. Each site is an illustrated location with a **name plaque**.

| Site | Name plaque | Danger? | Theme to illustrate |
|------|-------------|:-------:|---------------------|
| `market` | **MARKET** | no | Bustling stalls, scales, coins, awnings. Trade & tools. **Starting site** (mark subtly). Also the central crossroads/hub. |
| `tavern` | **TAVERN** | no | Warm candlelit inn, tankards, shadowy gossip, a lute. Rumours. |
| `college` | **COLLEGE** | no | Cloister, books, training yard. Study & recovery. |
| `scrolls` | **SCROLLS / ARCHIVE** | no | A hushed archive of rolled scrolls and ledgers. Investigation. (A spur reachable only from College.) |
| `throne` | **THRONE** | no | The seat of power: an ornate empty throne under a gilded canopy. Politics. Most gilded, most important-looking site. |
| `barracks` | **BARRACKS** | no | Armoury, duelling ground, racks of blades and shields. Force. |
| `graveyard` | **GRAVEYARD** | **YES** | Fog, leaning headstones, moss, a faint cursed-maroon glow. Dark power & desperate gold. Visibly the most sinister site. |

Mark the **Graveyard** as dangerous (moss + cursed-maroon glow, colder light).
Mark the **Market** as the start with a small compass rose or "START" flourish.

---

## 3. The roads (connections) — draw exactly these

There are **7 roads**. Each is a two-way path between sites. Draw them as
**curved painted roads** with a subtle gold outline; draw the two roads that
touch the **Graveyard** in **cursed-maroon (`#6B2420`) with a dashed/broken
edge** to signal danger.

```
market  — tavern
market  — college
market  — throne
college — scrolls
throne  — barracks
tavern  — graveyard      (danger road: cursed-maroon, dashed)
barracks— graveyard      (danger road: cursed-maroon, dashed)
```

**Do NOT connect any other pairs.** In particular there is no direct
Market–Graveyard, Tavern–Throne, College–Throne, or Scrolls–anything-but-College
road. Adjacency is the ruleset — keep it exact.

> Flavour note for the map key: *"The Graveyard links the Tavern and the
> Barracks."* You can print that as a small legend line.

---

## 4. Recommended layout (square coordinates)

Positions are given as **percent of the board width/height from the top-left
corner**, tuned so all 7 roads are clean and non-crossing on a square. Place the
centre of each site pin here:

| Site | x % | y % |
|------|----:|----:|
| `scrolls` | 18 | 16 |
| `college` | 40 | 26 |
| `throne` | 62 | 40 |
| `market` | 26 | 52 |
| `barracks` | 82 | 60 |
| `tavern` | 30 | 76 |
| `graveyard` | 58 | 84 |

At 6000 px trim, multiply the percentages by 60 to get pixel centres (e.g.
Throne = 3720, 2400). This layout keeps every road clear of the centre fold
cross (50 % / 50 %). Verify no road runs directly along a fold line before
finalising.

ASCII sketch of the intended arrangement (not to scale):

```
   SCROLLS
        \
         COLLEGE
              \
        MARKET —— THRONE
        /   \         \
      /       \         BARRACKS
   TAVERN      \        /
       \        \      /
        \        \    /
         ———— GRAVEYARD
```

---

## 5. Composition & framing

- **Full-bleed illustrated map**: a hand-painted/engraved kingdom seen from a
  gentle bird's-eye, on aged parchment, like an antique treasure map.
- **Ornate gold border frame** just inside the trim (but outside the safe zone);
  illuminated-manuscript corner flourishes.
- **Title cartouche** at the top or one corner: *THE CURSED THRONE* in gilded
  serif caps on a parchment banner, with a small red wax seal.
- **Compass rose** near the Market (start) in antique gold.
- **Name plaques**: each site gets a small cream plaque with gold rule and the
  site name in serif caps (see `01-ART-DIRECTION.md` typography). Keep plaques
  legible at print size.
- **Corruption reminder** (optional): a thin decorative "corruption vial" or a
  0–10 wax-red track along one border, since corruption is the game's doomsday
  clock. Optional — the app/tokens can also track this.
- Leave the **centre cross** relatively quiet (fields, roads curving around it)
  so the fold doesn't bisect a key site or label.

---

## 6. Master board prompt (paste this)

```
[STYLE BLOCK from 01-ART-DIRECTION.md]

COMPONENT: a single square game board, 20x20 inch trim at 300 DPI (design at
6075x6075 px including 0.125in bleed), CMYK-ready. Keep all key art and labels
0.5in inside the trim, and keep the site pins/labels/roads clear of the two
centre fold lines (a quad-folding board).

SUBJECT: an illustrated antique map of a small medieval kingdom on aged
parchment, bird's-eye, engraved/painted, with an ornate antique-gold border
frame and illuminated corner flourishes. A gilded title cartouche reads "THE
CURSED THRONE" with a small red wax seal, plus an antique-gold compass rose.

Place seven illustrated sites with small cream name-plaques (serif caps), at
these positions (x%, y% from top-left):
- SCROLLS (18,16): a hushed archive of rolled scrolls and ledgers.
- COLLEGE (40,26): a cloister with books and a small training yard.
- THRONE (62,40): the seat of power, an ornate empty throne under a gilded
  canopy — the grandest, most gilded site.
- MARKET (26,52): bustling stalls, scales and coins; the central crossroads and
  the START (add a subtle "start" flourish here).
- BARRACKS (82,60): an armoury and duelling ground with blades and shields.
- TAVERN (30,76): a warm candlelit inn with tankards and shadowy gossip.
- GRAVEYARD (58,84): fog, leaning mossy headstones and a faint cursed-maroon
  glow — clearly the dangerous site, colder light.

Connect the sites with seven curved painted roads with a subtle gold outline,
EXACTLY these and no others:
market-tavern, market-college, market-throne, college-scrolls, throne-barracks,
tavern-graveyard, barracks-graveyard.
Render the two roads touching the Graveyard (tavern-graveyard and
barracks-graveyard) in cursed-maroon (#6B2420) with a dashed/broken edge to show
danger; all other roads in warm gold-outlined stone.

Warm candlelight, soft corner vignette, richly detailed but readable. No
photorealism, no 3D, no modern elements, no text painted into the scenery beyond
the named plaques and title cartouche.
```

**Optional second pass — clean overlay:** if the painted plaques/roads aren't
crisp enough for play, generate the illustrated map **without** plaques/roads,
then have Fable 5 (or a layout tool) add a clean vector overlay of the 7 gold
plaques and the 7 roads using the coordinates in §4. This mirrors how the digital
board is built (AI-painted background + crisp road/plaque overlay).

---

## 7. Output files

Save as (see `05-PRINT-SPECS.md` for the full naming convention):

- `board-cursed-throne-20in-300dpi.png` (or `.tif`) — full board with bleed.
- Optionally the seven **location vignettes** (square-ish crops of each site) as
  `location-<id>-v3b.jpg` if you also want to refresh the digital game's site
  banners. IDs: `market, tavern, college, scrolls, throne, barracks, graveyard`.

---

## 8. Acceptance checklist

- [ ] Square, 20 × 20 in trim + 0.125 in bleed, 300 DPI, CMYK export.
- [ ] All 7 sites present, correctly named, correctly themed.
- [ ] Exactly the 7 roads listed — no extra connections.
- [ ] Graveyard roads shown as danger (cursed-maroon, dashed); Graveyard clearly sinister.
- [ ] Market marked as start; compass rose present.
- [ ] Title cartouche + gold frame + corner flourishes present.
- [ ] Nothing critical crosses the centre fold lines; 0.5 in safe margin respected.
- [ ] Palette + serif typography match the STYLE BLOCK.
