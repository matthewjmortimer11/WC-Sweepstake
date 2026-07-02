# Phase 3 · Role Cards (all 20, consistent design)

**Goal:** re-generate all **20 role cards** to one **consistent** template + a
single **card back**, matching the new board and action cards. Role art already
exists in the digital game in the "V3b" style; this phase locks a uniform frame,
typography and family colour-coding so the physical set feels like one deck.

> Prepend the **STYLE BLOCK** from `01-ART-DIRECTION.md` to every prompt.

---

## 1. Physical spec

| Property | Value |
|----------|-------|
| Trim size | **2.5 in × 3.5 in** (poker; 63 × 88 mm) — matches action cards |
| Bleed | +0.125 in each edge → **2.75 × 3.75 in** |
| Safe zone | text/values **0.125 in** inside trim |
| Resolution | **300 DPI** → trim **750 × 1050 px**, with bleed **825 × 1125 px** |
| Orientation | **Portrait** |
| Colour | CMYK for print (design in RGB palette) |
| Template name | *"V3b Vertical Asymmetric Editorial"* (the existing role-card template) |

*(These match the existing `cards/roles/manifest.json`: trim `2.5x3.5in`,
`750x1050`. Regenerated fronts can drop straight back into the digital game using
the file names in §6.)*

---

## 2. Card layout template ("Vertical Asymmetric Editorial", portrait)

Top → bottom, cream parchment inside a **family-tinted** frame with gold hairlines:

1. **Header band (~30%):** the role **name** in large gilded serif caps; a small
   **family crest** and a **rarity ribbon** (Unique / Rare / Uncommon / Common).
   Asymmetric: name left-weighted, crest top-right.
2. **Portrait panel (~46%):** a single engraved character portrait, candlelit,
   symbolic props that hint at the role. No words in the art.
3. **Flavour line (~8%):** the italic flavour quote, ink-soft `#5B4C38`.
4. **Ability footer (remainder):** 1–3 abilities, each as
   **`⟡ Name — [timing]: effect`** in compact ink serif on a faint ledger inset.
   Show a small **wax timing seal** per ability (T/M/R/D/V/! — see
   `01-ART-DIRECTION.md`). For fighters, show duel bonuses as small
   **⚔+N / 🛡+N** roundels in a bottom corner.

Family accent colours the frame + header band + footer rule.

---

## 3. Family theming

| Family | Accent | Crest | Portrait mood |
|--------|--------|-------|---------------|
| Royal | `#8C2F23` + heavy gold | Crown | Regal, gilded, imperious |
| Cursed | `#6B2420` | Cracked/inverted crown, faint rot | Secret, shadowed, unsettling |
| Succession | `#5A6E3A` moss | Branching family tree / laurel | Ambitious, scheming, hungry |
| Knight | `#4A5568` slate | Sword & helm | Martial, cold steel |
| Guard | `#5B4C38` | Shield & gate | Stolid, dutiful, watchful |
| Thief / Spy | `#3A3530` | Mask / eye | Shadowy, sly |
| Advisor | `#2A2014` | Quill & candle | Scholarly, quiet power |

---

## 4. Master role-card prompt template (paste, then fill the `<…>`)

```
[STYLE BLOCK from 01-ART-DIRECTION.md]

COMPONENT: one portrait role card, 2.5x3.5in trim at 300 DPI (design at
825x1125 px incl. 0.125in bleed), CMYK, template "V3b Vertical Asymmetric
Editorial". Cream parchment inside a <FAMILY ACCENT HEX> frame with gold
hairlines; keep all type 0.125in inside trim.

LAYOUT:
- Header band (~30%): role name "<NAME>" in large gilded serif caps, left-
  weighted; a small <FAMILY CREST> crest top-right with a "<RARITY>" ribbon.
- Portrait panel (~46%): an engraved candlelit portrait of <PORTRAIT SUBJECT>,
  symbolic props: <PROPS>. NO words in the art.
- Flavour line: italic quote "<FLAVOUR>".
- Ability footer on faint ledger inset, each ability with a small wax timing
  seal:
  <ABILITY LINES: "⟡ <Ability> — [<timing>]: <effect>">
<IF FIGHTER: - duel bonus roundels in a bottom corner: ⚔+<atk> / 🛡+<def>.>

Warm candlelight, soft vignette, dignified. <Cursed only: shadowed, faint
cursed-maroon rot, unsettling.>
```

Timing letters for the seals: Setup→use `T`, AtLocation→`T`, Movement→`M`,
Reaction→`R`, Duel→`D`, Vote→`V`, Manual→`!`.

---

## 5. The 20 roles (text + portrait direction)

Ability format below: **Name [timing]** — effect. Print verbatim.

### Royal — accent `#8C2F23`

**KING** · Unique · public-capable
*Flavour:* "The crown is heavy, expensive and deeply resented."
*Abilities:*
- Claim Crown [Setup] — Claim control of the Throne if you privately prove King when challenged.
- Royal Command [At Throne] — Use Tax, Pardon or Decree. *(No challenge if public/confirmed controller.)*
- Royal Tax Exemption [Reaction] — Ignore tax from Queen or successor.
*Portrait:* a weary crowned king on his throne, orb & sceptre, heavy gold. Props: crown, sceptre.

**QUEEN** · Unique · public-capable
*Flavour:* "Merciful in public, ruthless in private."
*Abilities:*
- Claim Crown [Setup] — Claim control of the Throne if you privately prove Queen when challenged.
- Royal Command [At Throne] — Use Tax, Pardon or Decree.
- Sanctuary [Reaction] — Prevent one player from losing Reputation this round.
*Portrait:* a poised queen, a protective hand extended, a dove or veil. Props: coronet, ring.

### Cursed — accent `#6B2420` (make it visibly sinister)

**THE CURSED ONE** · Unique · **hidden only (never public)**
*Flavour:* "The kingdom rots around you."
*Abilities:*
- Final Rite [At Graveyard] — At end of turn at the Graveyard, if corruption is 8+, reveal this card and win.
*Note to print:* "No normal powers. If another effect reveals or discards this card, the loyal players win."
*Portrait:* a hooded figure half-dissolving into moss and cursed-maroon rot, a cracked/inverted crown, creeping decay. Unsettling, shadowed.

### Succession — accent `#5A6E3A`

**FIRSTBORN NOBLE** · Unique · public-capable
*Flavour:* "Born first. Never allowed to forget it."
*Abilities:*
- First Claim [Manual] — At Throne during succession: claim immediately unless challenged by hidden King/Queen.
- Tax Exempt [Reaction] — Ignore royal tax.
- Inheritance Right [Manual] — When royal wealth is split, gain +1 extra gold if available.
*Portrait:* a proud eldest heir at the head of a family portrait, laurel. Props: family tree, signet.

**SECONDBORN NOBLE** · Rare · public-capable
*Flavour:* "Polite smile, sharpened knife."
*Abilities:*
- Second Claim [Manual] — At Throne during succession: claim the Throne. Must survive 1 full round.
- Quiet Ambition [At Tavern/Market] — Gain 1 Reputation if a royal has lost a role card this game.
*Portrait:* a smiling younger noble, one hand hidden behind the back holding a dagger. Props: goblet, concealed blade.

**TINY TYRANT** · Rare · public-capable
*Flavour:* "Too small for the crown, too dangerous to ignore."
*Abilities:*
- Third Claim [Manual] — At Throne during succession: claim the Throne. Must survive 2 full rounds.
- Tantrum [At Location, once/round] — Make one player at your location lose 1 Reputation.
- Too Young to Tax [Reaction] — Ignore royal tax.
- Tiny Tyrant Tax [At Throne] — If crowned, your Tax takes +1 extra gold from one chosen player.
*Portrait:* a small, furious child in an oversized crown mid-tantrum on the throne steps. Props: oversized crown, thrown toy sceptre.

**DISTANT COUSIN** · Rare · public-capable
*Flavour:* "Somewhere on the family tree. Probably."
*Abilities:*
- Weak Claim [Manual] — At Throne during succession: claim the Throne. Must survive 3 full rounds.
- Name Drop [At Tavern/Market] — Gain 1 gold by reminding everyone you are technically related.
- Dubious Bloodline [Manual] — After surviving a succession challenge, gain +1 Reputation.
*Portrait:* a shabby-genteel figure pointing hopefully at a distant branch of a family tree. Props: dog-eared genealogy, threadbare finery.

### Knight — accent `#4A5568` (show duel bonuses)

**ROYAL KNIGHT** · Uncommon · public-capable · ⚔+2 / 🛡+2
*Flavour:* "Honourable enough to be dangerous."
*Abilities:*
- Duel [Duel] — Start a normal duel against another player at your location.
- Defend the Crown [Reaction] — At Throne or Barracks: protect one royal from a duel consequence.
*Portrait:* a gleaming knight in royal livery, sword raised in salute. Props: crested shield, longsword.

**BLACK KNIGHT** · Uncommon · public-capable · ⚔+2 / 🛡+2
*Flavour:* "Nobody likes them. Everyone fears them."
*Abilities:*
- Duel [Duel] — Start a normal duel.
- Dirty Blow [Duel] — Duel at Tavern/Barracks/Graveyard: if you win, choose two duel consequences instead of one. Lose 1 Reputation.
*Portrait:* a menacing knight in blackened armour, visor down. Props: notched blade, dark plate.

**WANDERING KNIGHT** · Common · public-capable · ⚔+1 / 🛡+1
*Flavour:* "Always arriving exactly when inconvenient."
*Abilities:*
- Duel [Duel] — Start a normal duel.
- Stride [Movement] — Move 2 spaces instead of 1.
*Portrait:* a travel-worn errant knight on a dusty road, cloak flying. Props: travel pack, walking sword.

**YOUNG KNIGHT** · Common · public-capable · ⚔+2 / 🛡+0
*Flavour:* "Brave, stupid, often both."
*Abilities:*
- Duel [Duel] — Start a normal duel.
- Reckless Charge [Movement] — After moving into a location with another player, immediately start a duel. If you lose, lose 1 Reputation.
*Portrait:* an eager young squire-knight charging headlong, oversized helm askew. Props: dented helm, eager grin.

### Guard — accent `#5B4C38` (🛡 bonuses)

**ROYAL GUARD** · Uncommon · public-capable · 🛡+1
*Flavour:* "Loyal to the office, if not the person."
*Abilities:*
- Protect [Reaction] — Prevent one player from losing Reputation or being Driven Out.
- Guard the Throne [At Throne] — Your defence bonus becomes +2.
*Portrait:* a disciplined guard standing watch beside the throne, halberd upright. Props: tabard, halberd.

**GATE GUARD** · Common · public-capable · 🛡+1
*Flavour:* "A locked gate with boots."
*Abilities:*
- Block Route [At Location] — Choose one connected path. One named player may not use that path before your next turn.
- Hold Ground [Duel] — You cannot be Driven Out unless opponent wins by 3+.
*Portrait:* a broad guard barring a portcullis, arms crossed. Props: iron gate, ring of keys.

**GRAVEYARD GUARD** · Common · public-capable · 🛡+1
*Flavour:* "Someone has to watch the worst door in the kingdom."
*Abilities:*
- Watch the Dead [At Barracks/Graveyard] — Chosen player pays +1 gold if they buy a Graveyard card before your next turn.
- Stand Watch [At Graveyard] — Force one arriving player to lose 1 Reputation.
*Portrait:* a grim lantern-bearing guard at a graveyard gate in fog, moss on the stones. Props: lantern, spear.

**COURT FAVOURITE** · Common · public-capable · 🛡+1
*Flavour:* "Unbearable, but somehow invited to everything."
*Abilities:*
- Suck Up [At Throne] — Gain 1 Reputation if a royal controls the Throne.
- Favoured [Reaction, once/round] — Ignore one Tax per round.
*Portrait:* an over-dressed courtier fawning beside the throne, gaudy finery. Props: feathered fan, jewels.

### Thief / Spy — accent `#3A3530` (⚔+1)

**THIEF** · Common · public-capable · ⚔+1
*Flavour:* "Never guilty. Always nearby."
*Abilities:*
- Steal [At Location] — Take 1 gold from another player at your location.
- Slip Away [Reaction] — Ignore Tax.
*Portrait:* a sly cloaked figure palming a coin, half in shadow. Props: hood, cut purse.

**SPY** · Common · public-capable · ⚔+1
*Flavour:* "Knows too much, says too little."
*Abilities:*
- Peek [At Location] — Look at one random Action Card from another player at your location.
- False Trail [At Tavern/Market, once/game] — Move 1 Reputation loss from yourself to another player at your location.
*Portrait:* a watchful figure listening at a door, single visible eye. Props: keyhole, coded note.

### Advisor — accent `#2A2014`

**ROYAL ADVISOR** · Uncommon · public-capable
*Flavour:* "The real power is often standing beside the chair."
*Abilities:*
- Counsel [At Throne] — Draw 1 Royal Action Card for 2 gold even if you do not control the Throne.
- Whisper Vote [Vote] — During a formal vote at Throne, add +1 vote weight to either side.
*Portrait:* a robed advisor leaning to whisper beside an empty throne. Props: staff of office, scroll.

**COLLEGE ADVISOR** · Uncommon · public-capable
*Flavour:* "Has read the rules. May abuse them."
*Abilities:*
- Scholar [Movement] — You may move from College to Scrolls.
- Deep Research [At Scrolls] — Use the strong Scrolls action.
*Portrait:* a bespectacled scholar buried in open tomes and scrolls. Props: books, magnifying lens.

**TAVERN WHISPERER** · Common · public-capable
*Flavour:* "Nothing said here stays here."
*Abilities:*
- Rumour [At Tavern] — Choose one player at Tavern. They lose 1 Reputation unless they pay you 1 gold.
- Eavesdrop [At Tavern] — Look at one Action Card from another player at Tavern.
*Portrait:* a barkeep-gossip leaning in over a tankard, finger to lips. Props: tankard, whispering shadow.

---

## 6. Output file names (match the existing manifest)

Front faces (`static/dethrone/cards/roles/`):

| Role id | File name |
|---------|-----------|
| king | `king-card-v3b-poker.png` |
| queen | `queen-card-v3b-poker.png` |
| cursedone | `cursed-one-card-v3b-poker.png` |
| firstborn | `firstborn-noble-card-v3b-poker.png` |
| secondborn | `secondborn-noble-card-v3b-poker.png` |
| tinytyrant | `tiny-tyrant-card-v3b-poker.png` |
| distantcousin | `distant-cousin-card-v3b-poker.png` |
| royalknight | `royal-knight-card-v3b-poker.png` |
| blackknight | `black-knight-card-v3b-poker.png` |
| wanderingknight | `wandering-knight-card-v3b-poker.png` |
| youngknight | `young-knight-card-v3b-poker.png` |
| royalguard | `royal-guard-card-v3b-poker.png` |
| gateguard | `gate-guard-card-v3b-poker.png` |
| graveyardguard | `graveyard-guard-card-v3b-poker.png` |
| courtfavourite | `court-favourite-card-v3b-poker.png` |
| thief | `thief-card-v3b-poker.png` |
| spy | `spy-card-v3b-poker.png` |
| royaladvisor | `royal-advisor-card-v3b-poker.png` |
| collegeadvisor | `college-advisor-card-v3b-poker.png` |
| tavernwhisperer | `tavern-whisperer-card-v3b-poker.png` |

Card back: `role-card-back-v3b-poker.png`.

**Role card back prompt:**
```
[STYLE BLOCK]
COMPONENT: a role-card BACK, 2.5x3.5in trim at 300 DPI (825x1125 px incl. bleed),
portrait, CMYK. Cream parchment, antique-gold ornamental frame with illuminated
corner flourishes; centred, a large red wax royal seal stamped with a cracked
crown; a thin gilded serif arc reading "THE CURSED THRONE". Symmetrical,
mysterious, gives nothing away about the role. Warm candlelight.
```

---

## 7. Setup note (why there are duplicates in play)

At game start the app deals **exactly 3 × (player count)** role cards from the
pool of 20, **always including one Cursed One**. For a physical print run,
produce **multiple copies** of each role so a 6-player game (18 cards) can be
dealt — decide print quantities per role with the publisher, but every role needs
several copies except the single **Cursed One** used per game (print a few spares).

---

## 8. Acceptance checklist

- [ ] 20 fronts + 1 back, 2.5×3.5 in + bleed, 300 DPI, portrait, CMYK.
- [ ] Uniform "Vertical Asymmetric Editorial" template across all 20.
- [ ] Correct family accent, crest and rarity ribbon on each.
- [ ] Abilities printed verbatim with correct timing seals.
- [ ] Duel bonus roundels on knights/guards/thief/spy as listed.
- [ ] Cursed One reads as sinister and hides its function; King/Queen read regal.
- [ ] File names match §6 so assets fit the existing manifest.
