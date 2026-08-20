# Phase 2 · Action Cards (all 76)

**Goal:** generate all **76 action-card fronts** plus card back(s), one consistent
template, deck-tinted. Do this after the board is print-ready.

> Prepend the **STYLE BLOCK** from `01-ART-DIRECTION.md` to every prompt.

---

## 1. Physical spec

| Property | Value |
|----------|-------|
| Trim size | **2.5 in × 3.5 in** (standard poker; 63 × 88 mm) — same as role cards, so they share sleeves |
| Bleed | +0.125 in each edge → **2.75 × 3.75 in** |
| Safe zone | keep text/values **0.125 in** inside trim |
| Resolution | **300 DPI** → trim **750 × 1050 px**, with bleed **825 × 1125 px** |
| Orientation | **Portrait** |
| Colour | CMYK for print (design in RGB palette) |

*(The digital game uses a small 400×224 landscape "vignette" per card for its UI.
For print we upgrade to full portrait cards. If you also want to refresh the
digital vignettes, crop the illustration band of each printed card to 400×224 and
save as `action-<id>-v3b.jpg` — see `05-PRINT-SPECS.md`.)*

---

## 2. Card layout template (portrait)

Top → bottom, all on cream parchment inside a deck-tinted frame:

1. **Title bar (top ~14%):** card name in gilded serif caps, centred; a small
   **deck crest** in the top corner.
2. **Timing seal (top corner, opposite the crest):** a small wax stamp with the
   timing letter — `T` turn, `M` movement, `R` reaction, `D` duel, `V` vote,
   `!` manual (see seal colours in `01-ART-DIRECTION.md`).
3. **Illustration panel (~46%):** the card's symbolic engraved motif (see tables).
   No words inside the art.
4. **Duel value roundel (only for Duel cards):** a bold number in a slate/ink
   wax roundel over the lower-left of the art (values noted in the tables).
5. **Rules text box (~26%):** the effect text in ink serif, centred, on a faint
   ledger-ruled inset.
6. **Footer strip (bottom ~8%):** the **deck name** in serif caps on the deck
   accent colour, with a thin gold rule above it. Corruption change (if any)
   shown as a small wax-red pip, e.g. "☩ +1".

Frame + footer use the **deck accent colour**; gold hairline throughout.

---

## 3. Deck theming (accent + crest + mood)

| Deck | Accent | Crest idea | Buy cost | Mood |
|------|--------|-----------|:--------:|------|
| **Market** | `#5B4C38` | scales & coin | 2g | Warm, mercantile, practical |
| **Tavern** | `#5B4C38` | tankard | 2g | Smoky, gossipy, shady |
| **Knowledge** | `#2A2014` | quill & scroll | 2g | Cool, scholarly, investigative |
| **Barracks** | `#4A5568` | crossed swords | 2g | Cold steel, martial |
| **Graveyard** | `#6B2420` | skull & candle | **4g** | Foggy, cursed-maroon glow, sinister |
| **Royal** | `#8C2F23` | crown & seal | 2g | Gilded, authoritative, regal |

Graveyard cards should feel visibly **corrupt** (moss, cursed-maroon glow, rot).

---

## 4. Master action-card prompt template (paste, then fill the `<…>`)

```
[STYLE BLOCK from 01-ART-DIRECTION.md]

COMPONENT: one portrait playing card, 2.5x3.5in trim at 300 DPI (design at
825x1125 px incl. 0.125in bleed), CMYK-ready, cream parchment inside a
<DECK ACCENT HEX> frame with gold hairlines. Keep all type 0.125in inside trim.

LAYOUT:
- Top title bar: "<CARD NAME>" in gilded serif caps, with a small <DECK CREST>
  crest in one top corner and a wax timing seal reading "<TIMING LETTER>" in the
  other top corner.
- Central illustration panel (~46% height): <MOTIF> — engraved/woodcut, symbolic,
  candlelit, NO words in the art.
<IF DUEL: - a bold duel value "<N>" in a slate wax roundel over the lower-left of
  the art.>
- Rules text box on faint ledger ruling: "<EFFECT TEXT>"
- Bottom footer strip in <DECK ACCENT HEX> with a gold rule: "<DECK> DECK"
<IF CORRUPTION: with a small wax-red pip "☩ <+/-N>".>

Warm candlelight, soft vignette. <Graveyard only: add a faint cursed-maroon glow
and creeping moss/rot.>
```

---

## 5. Full card list with motifs

Legend — **Timing:** T=on your turn · M=movement · R=reaction · D=duel · V=vote ·
!=manual/table. **Corr.** = corruption change printed on the card. **Duel** =
duel value roundel (only on duel cards).

### Market deck (13) — accent `#5B4C38`, crest: scales & coin

| # | Name | Timing | Duel | Corr. | Effect text (print verbatim) | Motif for the illustration |
|--:|------|:------:|:----:|:-----:|------------------------------|----------------------------|
| 1 | Secret Passage | M | — | — | Move to any connected location, then move one extra space. | A shadowed hidden stone archway/passage |
| 2 | Bribe | V | — | — | Give another player 1 gold to change or declare their vote. They may refuse. | A hand sliding gold coins across a table |
| 3 | Counterfeit Pass | M | — | — | Enter a restricted route/location this turn. | A forged travel pass with a faked wax seal |
| 4 | Quick Escape | R | — | — | After losing Reputation, move 1 space. | Running boots kicking up dust |
| 5 | Trade Licence | T | — | — | Make a Market-style immediate trade even if only one of you is at Market. | Merchant's scales with a stamped licence |
| 6 | Merchant's Map | M | — | — | Move to any location connected to your current one. | An unrolled trade map with route lines |
| 7 | Smuggler's Run | M | — | — | Move through the Graveyard without stopping there this turn. | A cloaked smuggler slipping past headstones at night |
| 8 | Guild Seal | R | — | — | Ignore one Tax this round. | A pressed guild wax seal / signet ring |
| 9 | Loaded Dice | D | 1 | — | If you lose, the duel is cancelled instead. | A pair of weighted dice, one subtly rigged |
| 10 | Fence | T | — | — | Discard an action card; gain gold equal to half its deck's buy cost (min 1). | Goods traded for coins under a counter |
| 11 | Caravan Manifest | T | — | — | Draw 1 Market card; another player at your location may draw 1 Market card. | A loaded merchant wagon / caravan |
| 12 | Spare Coin Purse | T | — | — | Gain 2 gold. | A drawstring coin purse spilling two coins |
| 13 | Market Day | T | — | — | All players at Market gain 1 gold. | A lively market stall, coins changing hands |

### Tavern deck (13) — accent `#5B4C38`, crest: tankard

| # | Name | Timing | Duel | Corr. | Effect text | Motif |
|--:|------|:------:|:----:|:-----:|-------------|-------|
| 1 | Rumour | T | — | — | Choose a player. They lose 1 Reputation unless they pay you 1 gold. | Two figures whispering over a tankard |
| 2 | False Rumour | T | — | +1 | Choose a player. They lose 1 Reputation. Corruption +1. | A poisonous whisper, faint cursed-maroon tint |
| 3 | Flee | D | — | — | Cancel a duel against you. Move up to 2 spaces. Lose 1 Reputation. | A figure fleeing out a tavern door |
| 4 | Blood Contract | ! | — | — | Make one future promise binding. If broken, breaker loses 1 Reputation and corruption +1. | Two hands over a contract sealed in blood-red wax |
| 5 | Drunken Alibi | R | — | — | Ignore one Reputation loss at Tavern. | A snoring drunk slumped over a tankard |
| 6 | Bought Round | T | — | — | Pay 1 gold: you and one other player at Tavern each gain 1 Reputation. | Two tankards clinking in a toast |
| 7 | Tavern Brawl | T | — | — | Start a duel with a player at Tavern. If you win, they lose 1 Reputation. | A chaotic tavern brawl, a flying stool |
| 8 | Whisper Network | T | — | — | Look at one hidden role card from a player at Tavern (they choose which). | A cupped hand at an ear, secrets passing |
| 9 | Loan Shark | T | — | — | Take 3 gold from another player at Tavern; they may refuse and lose 1 Reputation instead. | A menacing lender with coins and a hooked grin |
| 10 | Stitched Lip | R | — | — | Cancel one Rumour or False Rumour targeting you. | Lips sewn shut, a needle and thread |
| 11 | Performer's Tale | T | — | — | Gain 1 Reputation. | A bard's mask and lute |
| 12 | Hangover Cure | T | — | — | Remove Wounded or regain 1 Reputation if at 1–2. | A steaming remedy bottle / tonic |
| 13 | Sow Doubt | T | — | — | Choose a player. They lose 1 Reputation unless they reveal a public role. | A spreading question mark of smoke |

### Knowledge deck (13) — accent `#2A2014`, crest: quill & scroll

| # | Name | Timing | Duel | Corr. | Effect text | Motif |
|--:|------|:------:|:----:|:-----:|-------------|-------|
| 1 | Call Out | T | — | +2 | Name one player and one hidden role. Corruption +2. If correct, target reveals/discards that role and caller gains one extra shown role. If wrong, caller loses 1 Reputation. If Cursed One correctly named, loyal players win. | A pointing accuser under candlelight, cursed-maroon tint |
| 2 | Trace Steps | T | — | — | Ask where one player moved from on their last turn. They must answer truthfully. | Muddy footprints tracked across a floor |
| 3 | Read the Records | T | — | — | Inspect one discard pile. | An open ledger / stack of records |
| 4 | Route Pass | M | — | — | Move from College to Scrolls. | An open gate onto a study path |
| 5 | Hidden Witness | V | — | — | During a vote, add +1 vote weight to either side. | A hooded witness with a single visible eye |
| 6 | Study Companion | T | — | — | Draw 1 Knowledge card; an ally at your location may look at your hand. | Two scholars at a study desk |
| 7 | Sealed Warrant | V | — | — | Start a Banish vote without seconder against a player with Rep ≤2. | A sealed warrant with a dark ribbon |
| 8 | Witness Statement | T | — | — | Ask one player: did they visit the Graveyard last round? They must answer truthfully. | A quill signing a statement |
| 9 | Old Prophecy | T | — | — | Peek at the top card of any deck. | A scrying crystal / candle-lit omen |
| 10 | Map of Tunnels | M | — | — | Move from Market to Scrolls or College to Barracks. | Dark tunnels beneath the city |
| 11 | Court Summons | T | — | — | Force one player to move to the Throne before their next turn (if able). | A herald's summons pointing to the throne |
| 12 | Alibi Check | T | — | — | Name a location; one player must truthfully say if they were there last round. | An hourglass beside a location map |
| 13 | Secret Ledger | T | — | — | Inspect one player's gold total privately; they may lie once per game. | A hidden ledger of coin counts |

### Barracks deck (12) — accent `#4A5568`, crest: crossed swords

| # | Name | Timing | Duel | Corr. | Effect text | Motif |
|--:|------|:------:|:----:|:-----:|-------------|-------|
| 1 | Hidden Knife | D | 3 | — | No extra effect. | A concealed dagger drawn from a sleeve |
| 2 | Shield | D | 2 | — | If you lose, ignore Shame. | A battered heraldic shield |
| 3 | Dirty Trick | D | 2 | +1 | Corruption +1. | A low blow / thrown sand, cursed-maroon tint |
| 4 | Arrest | T | — | — | Start a duel against a player at your location. If you win, choose Drive Out or Shame. | Iron manacles / shackles |
| 5 | Disarm | D | 1 | — | If you win, Disarm discards 3 random Action Cards instead of 2. | A sword knocked from a hand |
| 6 | Training Dummy | T | — | — | Draw 1 Barracks card. | A straw training dummy in the yard |
| 7 | Second Blade | D | 2 | — | If you win, choose an extra Shame or Disarm. | A warrior with a blade in each hand |
| 8 | Parry | D | 2 | — | If you lose, ignore Wound. | Blades meeting with a spark of parry |
| 9 | Intimidate | T | — | — | A player at your location loses 1 Reputation unless they pay you 2 gold. | A looming armoured fist |
| 10 | Challenged Again | D | — | — | After losing a duel, immediately challenge the same opponent again. | A sword raised again, defiant |
| 11 | Iron Gauntlet | D | 1 | — | Defender cannot play Flee. | A heavy iron gauntlet |
| 12 | Veteran's Warning | R | — | — | Cancel a duel you did not start. | A battle-worn regiment banner |

### Graveyard deck (13) — accent `#6B2420`, crest: skull & candle · **buy 4g** · make these visibly corrupt

| # | Name | Timing | Duel | Corr. | Effect text | Motif |
|--:|------|:------:|:----:|:-----:|-------------|-------|
| 1 | Grave Pact | T | — | +1 | Draw 2 Graveyard cards, keep 1, discard 1. Corruption +1. | Pale hands rising from a grave, maroon glow |
| 2 | Blackmail | R | — | — | Cancel a vote targeting you. Lose 1 Reputation. | A threatening sealed letter |
| 3 | Cursed Blade | D | 4 | +1 | If you win, loser also loses 1 Reputation. Corruption +1. | A sword wreathed in cursed-maroon flame |
| 4 | Soul Debt | T | — | +1 | Gain 5 gold. Corruption +1. | A glowing soul trapped in a jar, coins beside it |
| 5 | Royal Sacrifice | T | — | −3 | At Graveyard: if you have King or Queen, reveal and discard that royal role. Lower corruption by 3. If no royal remains active, succession begins. | A crown laid upon a coffin |
| 6 | Mourning Veil | R | — | — | Ignore one Call Out targeting you. | A black mourning veil hiding a face |
| 7 | Spirit Coin | T | — | +1 | Gain 2 gold. Corruption +1. | A ghostly coin with a faint face |
| 8 | Bone Dice | T | — | +1 | Roll: on high, gain 4 gold; on low, lose 1 Reputation. Corruption +1. | Dice carved from bone |
| 9 | Grave Dust | T | — | −1 | Lower corruption by 1. Lose 1 Reputation. | A funerary urn spilling grey dust |
| 10 | Last Rites | T | — | +1 | If corruption is 6+, gain 1 Reputation. Corruption +1. | A single guttering funeral candle |
| 11 | Stolen Offering | T | — | — | Take 1 gold from each player at Graveyard. | Coins stolen from a grave offering |
| 12 | Wraith Whisper | T | — | — | Look at one random card from the Graveyard discard pile. | A wraith whispering from the fog |
| 13 | Forbidden Tome | T | — | +2 | Draw 1 Graveyard card. Corruption +2. | A chained forbidden grimoire glowing maroon |

### Royal deck (12) — accent `#8C2F23`, crest: crown & seal · gilded

| # | Name | Timing | Duel | Corr. | Effect text | Motif |
|--:|------|:------:|:----:|:-----:|-------------|-------|
| 1 | Royal Decree | V | — | — | Start a formal vote without seconder. | An unfurled royal decree with a gold seal |
| 2 | Pardon | T | — | — | Give one player +1 Reputation. | A white dove / pardon ribbon |
| 3 | Tax Collector | T | — | — | Take 1 gold from each non-exempt player. | A heavy tax coffer being filled |
| 4 | Royal Guard Detail | R | — | — | Cancel Drive Out or Shame against a royal or Throne controller. | A royal guard's gilded shield |
| 5 | Emergency Council | V | — | — | All players at Throne and Market must vote. Others may abstain. | A summoned council around a table |
| 6 | Queen's Favour | T | — | — | Give one player +1 Reputation; you gain 1 gold from the bank. | A single gold-touched rose (a queen's favour) |
| 7 | Succession Edict | T | — | — | Open succession immediately. | An empty crown on a cushion |
| 8 | Herald | T | — | — | All players learn your public role; gain 1 Reputation. | A herald blowing a banner-hung horn |
| 9 | Royal Purse | T | — | — | Gain 3 gold if you control the Throne. | A gilded royal purse |
| 10 | Banish Letter | V | — | — | Start Banish against a player with Rep ≤1 without seconder. | A banishment letter with a broken seal |
| 11 | Kneel | R | — | — | Ignore one formal vote targeting you if a royal controls the Throne. | A figure kneeling before the throne |
| 12 | Crown Witness | V | — | — | During a vote at Throne, add +2 vote weight to either side. | Scales of justice topped with a crown |

**Total: 13 + 13 + 13 + 12 + 13 + 12 = 76 cards.**

---

## 6. Card back(s)

Simplest: **one universal action-card back**.

```
[STYLE BLOCK]
COMPONENT: a playing-card BACK, 2.5x3.5in trim at 300 DPI (825x1125 px incl.
bleed), portrait, CMYK. Cream parchment with an antique-gold ornamental frame and
illuminated corner flourishes; centred, a red wax seal stamped with a small
cracked crown over crossed quill-and-sword; the words "THE CURSED THRONE" in a
thin gilded serif arc. Symmetrical, no deck-specific colour. Warm candlelight.
```

**Optional:** six deck-tinted backs (same design, frame recoloured to each deck
accent, deck crest in the seal) if you want decks visually separable face-down.

---

## 7. Acceptance checklist

- [ ] 76 fronts, each 2.5×3.5 in + bleed, 300 DPI, portrait, CMYK.
- [ ] Correct deck accent, crest and footer on every card.
- [ ] Correct timing seal; duel value roundel on all and only duel cards.
- [ ] Corruption pip shown where the table lists a value.
- [ ] Effect text printed verbatim and legible at size.
- [ ] Graveyard cards read as corrupt; Royal cards read as gilded.
- [ ] At least one card back.
