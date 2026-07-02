# The Cursed Throne — Fable 5 Print Kit

This folder is a **complete, self-contained hand-over package** for generating a
**print-ready physical edition** of *The Cursed Throne* (a.k.a. *Dethrone*) with
an image-generation model (**Fable 5**). Everything Fable 5 needs — visual style,
exact colours, fonts, layouts, print dimensions, the full text of every card, and
copy-paste prompts — lives here. You should not need to open the game code.

> The digital game already ships art in a "V3b" style (warm parchment, antique
> gold, wax-red, candlelit). This kit codifies that style so a physical edition
> comes out **visually consistent** with what already exists.

---

## The three phases (do them in this order)

The work is deliberately staged so you get a **playable, printable board game
first**, then flesh out the decks, then polish the identity art last.

| Phase | Deliverable | File | Why this order |
|------:|-------------|------|----------------|
| **1** | **The board / map** — one large square board, Monopoly size, print-ready | [`02-BOARD-MAP.md`](02-BOARD-MAP.md) | The board is the single most important physical component. Get it printable first. |
| **2** | **Action cards** — all 76 cards, fronts + backs | [`03-ACTION-CARDS.md`](03-ACTION-CARDS.md) | The main deck. Larger volume, so it comes after the board is locked. |
| **3** | **Role cards** — all 20 roles refreshed to one consistent design + back | [`04-ROLE-CARDS.md`](04-ROLE-CARDS.md) | Role art already exists; this phase re-generates it with **consistent** framing/typography to match the new board and action cards. |

Read these two first, they apply to **every** phase:

- [`01-ART-DIRECTION.md`](01-ART-DIRECTION.md) — the **style bible** and the
  reusable **STYLE BLOCK** you prepend to every single prompt.
- [`05-PRINT-SPECS.md`](05-PRINT-SPECS.md) — bleed, DPI, trim sizes, CMYK, fold
  lines, and the **exact output file names** (so assets drop straight back into
  the existing manifests).

---

## How to hand this to Fable 5

1. **Prime it once with the style.** Paste the whole of
   [`01-ART-DIRECTION.md`](01-ART-DIRECTION.md) (or at least the **STYLE BLOCK**)
   at the start of the session so every later prompt inherits the look.
2. **Work one phase at a time.** For each component, each file gives you a
   ready-to-paste prompt. Prompts are written as:
   **`[STYLE BLOCK] + [component template] + [this specific item]`.**
3. **Enforce the print spec.** Every prompt already states trim, bleed, DPI, and
   safe margins. Do not drop these — they are what makes the output printable.
4. **Name the outputs as specified** in [`05-PRINT-SPECS.md`](05-PRINT-SPECS.md).
   The names match the game's existing `manifest.json` files, so regenerated art
   can also be dropped back into the digital game if you ever want to.

---

## What "consistent" means here (the non-negotiables)

Every printed component must share:

- **Palette:** cream `#F4ECD6`, ink `#2A2014`, antique gold `#A8842C`, wax-red
  `#8C2F23`, cursed maroon `#6B2420`, moss `#5A6E3A`.
- **Typography:** a warm old-style serif (Iowan Old Style / Palatino / Georgia
  family) for all titles and body text. No modern sans-serif on the printed
  pieces.
- **Surface:** aged parchment / ledger paper, warm candlelight, subtle vignette,
  hand-inked line quality, gold-foil-look accents for royalty.
- **Faction accent colours** (roles) and **deck accent colours** (action cards)
  used consistently — see the tables in the phase files.

---

## Component checklist (tick as you go)

**Phase 1 — Board**
- [ ] 1 × illustrated kingdom board, square, Monopoly-size, with 7 sites + roads
- [ ] Fold-safe layout (art clears the fold gutters)

**Phase 2 — Action cards (76 fronts + backs)**
- [ ] 76 × action card fronts (see full list in `03-ACTION-CARDS.md`)
- [ ] 1 × universal action-card back (or 6 × deck-tinted backs — optional)

**Phase 3 — Role cards (20 fronts + back)**
- [ ] 20 × role card fronts (consistent design)
- [ ] 1 × role card back

**Shared / optional**
- [ ] Box lid + box wrap art (optional, prompt provided in `01-ART-DIRECTION.md`)
- [ ] Rules booklet cover (optional)
- [ ] Player aid card (turn structure) — text supplied in `05-PRINT-SPECS.md`

---

## Source of truth

All card text, abilities, locations and rules in this kit are transcribed from
the live game data (`static/dethrone/js/data.js`, `js/cards-extra.js`,
`dethrone/data.py`) and the design notes in
[`../README.md`](../README.md) and [`../PLAYTEST.md`](../PLAYTEST.md). If gameplay
text ever changes in the code, update the tables in this kit to match before
re-generating art.
