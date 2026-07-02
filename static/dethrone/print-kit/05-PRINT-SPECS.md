# 05 · Print Production Specs

Consolidated, printer-facing specs for the whole edition. These are baked into
the phase files too; this page is the single reference for a print shop or
print-on-demand service (e.g. The Game Crafter, MakePlayingCards, a local litho
printer).

---

## 1. Global rules

- **Resolution:** 300 DPI minimum on every asset at final trim size.
- **Colour:** design in the RGB palette (`01-ART-DIRECTION.md`), **export CMYK**
  for print. Expect gold/wax reds to shift slightly; proof before a full run.
- **Bleed:** 0.125 in (3.175 mm) on every edge of every component.
- **Safe margin:** keep text and essential art 0.125 in inside the trim for
  cards, **0.5 in** inside the trim for the board.
- **File formats:** PNG or TIFF (flattened) for hand-off; keep layered source if
  the tool allows. No transparency in final print files (flatten onto cream).
- **Fonts:** outline/rasterise all type before hand-off so the printer doesn't
  need the serif font installed.

---

## 2. Component dimensions

| Component | Trim | +Bleed | Pixels @300DPI (trim) | Pixels @300DPI (+bleed) | Orient. |
|-----------|------|--------|-----------------------|-------------------------|---------|
| **Board** | 20 × 20 in | 20.25 × 20.25 in | 6000 × 6000 | **6075 × 6075** | square |
| **Action card** (×76) | 2.5 × 3.5 in | 2.75 × 3.75 in | 750 × 1050 | **825 × 1125** | portrait |
| **Action card back** | 2.5 × 3.5 in | 2.75 × 3.75 in | 750 × 1050 | 825 × 1125 | portrait |
| **Role card** (×20) | 2.5 × 3.5 in | 2.75 × 3.75 in | 750 × 1050 | **825 × 1125** | portrait |
| **Role card back** | 2.5 × 3.5 in | 2.75 × 3.75 in | 750 × 1050 | 825 × 1125 | portrait |
| Box lid (optional) | 20 × 20 in | 20.25 × 20.25 in | 6000 × 6000 | 6075 × 6075 | square |
| Rules booklet (optional) | A5 (5.83 × 8.27 in) | +0.125 in | 1748 × 2480 | 1823 × 2555 | portrait |
| Player aid (optional) | 2.5 × 3.5 in | 2.75 × 3.75 in | 750 × 1050 | 825 × 1125 | portrait |

> **Board resolution fallback:** if the generator can't emit 6075 px square in a
> single pass, produce the composition at the largest square size available and
> upscale to 6075 px, or generate the 4 fold-quadrants at 300 DPI and stitch
> (roads must align across seams). See `02-BOARD-MAP.md` §1.

---

## 3. Board folding

- Standard board = **quad-fold (2 × 2)**: one horizontal + one vertical fold
  through the centre, folding to ~10 × 10 in.
- Keep site **pins, name plaques and roads clear of both centre fold lines** —
  leave a ~0.25 in quiet strip along each centreline (fields/quiet art only).
- The recommended site coordinates in `02-BOARD-MAP.md` §4 already avoid the
  centre cross; verify after generation.

---

## 4. Card stock & finish (recommended)

- **Cards:** 300–330 gsm black-core linen-finish card stock; standard poker size
  so role + action cards share sleeves (63 × 88 mm sleeves).
- **Board:** mounted on 2 mm greyboard, matte or satin finish (matte suits the
  parchment look; avoid high gloss).
- **Box:** rigid two-piece square box sized to the folded board (~10.5 × 10.5 in).

---

## 5. Print quantities (discuss with publisher)

- **Board:** ×1.
- **Action cards:** the deck is **76 unique** cards; print 1 of each unless the
  publisher wants spares. (Digital game reshuffles discards, so 1× each is enough
  for physical play.)
- **Role cards:** deals are **3 × player count** from 20 roles (up to 18 cards for
  6 players), always including **one Cursed One**. Print **multiple copies of each
  role** so a full table can be dealt; print only a **few Cursed One** copies (one
  is used per game). Final counts are a publisher decision — a safe starting point
  is 3× of each non-Cursed role and 2× Cursed One.

---

## 6. Output file naming (matches the game's manifests)

Naming assets this way lets them drop back into the digital game and keeps the
print set organised.

**Board / map** (`static/dethrone/cards/map/`)
- `board-cursed-throne-20in-300dpi.png` — the printable board (new, print-only).
- `kingdom-background-v3b.jpg` — optional refreshed digital background (1536×1024).
- `location-<id>-v3b.jpg` — optional refreshed site banners. ids: `market,
  tavern, college, scrolls, throne, barracks, graveyard`.

**Action cards** (`static/dethrone/cards/action/`)
- Print fronts: `print-action-<id>-front.png` (825×1125).
- Digital vignette (optional): `action-<id>-v3b.jpg` (400×224, crop of the art band).
- Back: `print-action-back.png` (+ optional `print-action-back-<deck>.png`).
- `<id>` values are the ids in `03-ACTION-CARDS.md` (e.g. `secret_passage`,
  `cursed_blade`, `royal_purse`).

**Role cards** (`static/dethrone/cards/roles/`)
- Print fronts: `<slug>-card-v3b-poker.png` — exact names in `04-ROLE-CARDS.md` §6
  (e.g. `king-card-v3b-poker.png`, `cursed-one-card-v3b-poker.png`).
- Back: `role-card-back-v3b-poker.png`.

Keep a `manifest.json` alongside each set (mirror the existing ones) listing
template, pixels, palette and the id→filename map.

---

## 7. Optional player-aid text (turn structure)

If you print a player-aid card, use this text (from the game's rules):

**Setup:** each player starts at **Market**, with **2 gold**, **3 Reputation**,
**2 action cards**. Each holds **3 role cards** (1 public, 2 hidden). One player
is secretly the **Cursed One**. Corruption starts at **0**.

**On your turn:**
1. **Move** to a connected site (1 space; some roles/cards move further).
2. Take a **location action** (basic or strong) and/or **play action cards**, use
   **role abilities**, or **Parley** (challenge, vote, duel, trade, call out).
3. Resolve any prompts (reactions, duels, etc.).
4. **End turn** — you must be at the **hand limit (≤5 action cards)**. Play passes
   left; a new **round** begins when the turn order wraps.

**How the game ends:**
- **Cursed side wins** if corruption reaches **10**, if **2 innocents** are
  eliminated, or via the **Final Rite** (Cursed One at Graveyard, corruption ≥8,
  at end of turn).
- **Loyal side wins** if the **Cursed One is correctly revealed** (e.g. a correct
  Call Out or a failed vote that exposes them).

**Location actions quick list:**
- **Throne** — Petition (+1 Rep) / Royal Command (controller only).
- **Market** — Buy 2g / Haggle 3g (draw 2 keep 1).
- **Tavern** — Work the Room (+2 gold) / Backroom Deal (draw Tavern card 2g).
- **College** — Study 2g (Knowledge) / Recover 2g.
- **Scrolls** — Research 2g / Deep Research 2g (investigate).
- **Barracks** — Arm 2g (Barracks card) / Serious Duel (once per game).
- **Graveyard** — Scavenge (+3 gold, −1 Rep) / Buy Graveyard card 4g (corruption +1).

---

## 8. Pre-press checklist

- [ ] Every asset 300 DPI at final trim.
- [ ] 0.125 in bleed on all cards/box; 0.125 in card safe margin; 0.5 in board safe margin.
- [ ] Board key art clears the centre fold cross.
- [ ] CMYK export; gold + wax-red proofed.
- [ ] Type outlined/rasterised; files flattened onto cream (no transparency).
- [ ] File names per §6; a manifest accompanies each set.
- [ ] 76 action fronts + back(s); 20 role fronts + back; 1 board.
