# The Cursed Throne — Playtest Ledger

A single-device browser app to **playtest** the bluffing board game *The Cursed Throne* before
printing cards and a board. It is a **digital dealer + board tracker + referee assistant + log** —
it supports the social game, it does not replace it.

## How to run

### Online (recommended)

Open `/dethrone` on the Wheesht server. **Create online room** → share the invite link → everyone joins on their own phone. The server deals roles, tracks the board, and keeps hidden information private per player.

### Local pass-and-play

Choose **Local pass-and-play** on the start screen, or open with `#/local` in the URL. No server required beyond static hosting; state auto-saves to `localStorage`.

Offline file open still works:

```
open "index.html"          # macOS
```

## What is implemented (Phases 1–2)

### Phase 5 — playtest tooling & full card set
- **Board art** — illustrated V3b kingdom poster (`cards/map/kingdom-background-v3b.jpg`) with curved gold/cursed roads, labelled site plaques, player tokens and per-location vignettes (see `board.js`, `cards-map.js`)
- **Action card hand** — visible hand strip, **Hand** tab (playable count badge), archives deck peek at Scrolls, pact chips, hidden-role power reference
- **76 action cards** — full §27 deck in `cards-extra.js` (server synced in `dethrone/data.py`)
- **Playtest report** — **Report** button exports a markdown chronicle (public info only); online rooms also at `GET /dethrone/api/rooms/{code}/report`
- **Balance toggles** — host adjusts hand limit, corruption cap, Final Rite threshold, innocents to lose, starting gold/Rep in the lobby (online) or Test mode (local)

### Phase 6 — action cards & bot playtesting
- **Play action cards** — auto-resolve simple OnTurn cards from your private view (gold, Rep, corruption, draws, movement, Rumour/Pardon with target picker); online sync via `playCard` WebSocket message
- **Referee eliminate/restore** — host toggle now syncs online (`toggleElim`)
- **Smarter bots** — loyal bots Call Out / accuse the Cursed One (playtest engine sees hidden roles); bots auto-pick role discards when votes land; all-bot auto-play can end in a Loyal win

### Phase 7 — table playtest hardening
- **Host playtest guide** — in-app checklist (`Host playtest guide` / `Guide` button) + `PLAYTEST.md` for the full script
- **Lobby polish** — waiting banners for host/guests, kick bots/guests before deal, rename in lobby
- **Setup status** — who has chosen their public role before the host begins
- **Hand-limit enforcement** — cannot end turn over limit (server + client); prominent banner + toast on your turn
- **Chronicle filters** — All / Events / Corruption / System / Notes

### Phase 8 — Spectator mode
- **Watch link** — `#/room/ABCD/watch` (or **Copy watch link** in lobby); read-only WebSocket with `spectate=1`
- **Public view only** — board, court table, throne, pacts, chronicle; no hidden roles, card names, or actions
- **Host control** — **Allow spectators** checkbox in lobby (off before deal to close the room to watchers)
- **Mid-game join** — spectators can attach while play is in progress

### Phase 9 — Card auto-resolution expansion
- **Economy & location cards** — Tax Collector, Stolen Offering, Market Day, Loan Shark, Intimidate, Bought Round, Queen's Favour, Herald, Succession Edict, Caravan Manifest, Study Companion
- **Risk & investigation** — Bone Dice, Old Prophecy, Read Records, Wraith Whisper, Grave Pact (keep-one), Map of Tunnels
- **Duel starters** — Arrest and Tavern Brawl open the Duel helper after play (same-location target)
- **Private notes** — peek cards show only in your private view (`privateNote` banner); never leaked to other players or spectators
- **Online + local** — `playCard` WebSocket sync; local pass-and-play mirrors the same effects in `state.js`

### Phase 10 — Strong location actions
- **Royal Command** (Throne, controller only) — structured helper: Royal Tax (1g from each player), Royal Pardon (+1 Rep to one player), Royal Decree (opens formal vote with Decree pre-checked)
- **Serious Duel** (Barracks) — opens Duel helper with Serious mode on; once per game per player (tracked); loser discards a role on win
- **Deep Research** (Scrolls, 2 gold) — investigate: peek a draw pile, peek/cross-reference a discard pile, or interview a witness at the Scrolls (private note only)

### Phase 11 — Win conditions & tax enforcement
- **Final Rite (human)** — Cursed player at Graveyard with corruption high enough gets a private prompt on End turn: perform Final Rite (Cursed win) or pass
- **Tax exemptions** — Tax Collector and Royal Tax respect role exemptions (Firstborn, Tiny Tyrant, Spy, King vs Queen/successor), Court Favourite once/round, Guild Seal in hand
- **Deploy safety** — Dethrone JS syntax check in CI; cache-busted static assets on `/dethrone`

### Phase 12 — Card auto-play expansion & duel/vote hooks
- **New auto-play cards** — Fence (sell a card), Sow Doubt, Court Summons, Royal Sacrifice; vote starters Royal Decree, Sealed Warrant, Banish Letter, Emergency Council; helper openers Trade Licence, Blood Contract, Call Out
- **Duel card hooks** — Duel helper: pick duel cards from hand (Hidden Knife, Shield, Dirty Trick, etc.); auto-sum values; Iron Gauntlet blocks Flee; Loaded Dice / Shield / Parry / Disarm / Cursed Blade effects
- **Vote card hooks** — Hidden Witness (+1) and Crown Witness (+2) playable from hand during formal vote tally

### Phase 13 — Turn UX, mobile PWA, reactions
- **Turn dock** — sticky bottom bar on mobile: your turn, location, move/hand chips, Hand + End turn
- **Moved-this-turn** — tracked on board moves (resets each turn)
- **Installable PWA** — `manifest.webmanifest`, service worker, safe-area padding, 44px touch targets
- **Reaction framework** — Stitched Lip (Rumour), Mourning Veil (Call Out), Blackmail/Kneel (passed vote), Veteran's Warning (duel declared); private prompt to play or decline

### Phase 14 — Public role abilities & succession polish
- **Public role abilities** — AtLocation powers from your shown role appear on your turn (Steal, Peek, Rumour/Eavesdrop, Suck Up, Counsel, Quiet Ambition, Tantrum, Name Drop, Stand Watch); online via `useRoleAbility`
- **Royal role lost** — tracked when a King/Queen role is discarded (gates Quiet Ambition)
- **Succession polish** — claimants must be at the Throne and hold the role; helper filters eligible players/roles; quick-claim from actions panel; succession banner in turn dock and throne panel

### Phase 15 — Reaction expansion & bot depth
- **More reaction hooks** — Drunken Alibi / Quick Escape on reputation loss; Flee on duel declared; Royal Guard Detail on shame/drive vs royals
- **Reaction moves** — Quick Escape (1 space) and Flee (2 spaces) prompt board moves after play
- **Bot depth** — bots auto-resolve reactions, play simple auto-cards and public role abilities, richer local `bot.js` mirror

### Phase 16 — Bot social play & hand UX
- **Bot duels, trades, succession** — loyal bots duel same-location players, trade at Market, claim at Throne during succession; move toward Throne when succession is open
- **Turn dock parley** — ⚔ Duel / ⚖ Vote / ⇄ Trade shortcuts on mobile
- **Private hand groups** — action cards grouped by timing (OnTurn, Reaction, Duel, Vote); reaction cards labelled “when targeted”

### Phase 17 — Spectator polish & playtest report
- **Spectator turn dock** — sticky bar on mobile showing whose turn, location, round, and succession status
- **Spectator actions panel** — read-only list of the active player’s location actions; throne/succession panel without edit controls
- **Richer playtest report** — throne & succession sections, chronicle entry counts by kind (client export + `GET /dethrone/api/rooms/{code}/report`)

### Phase 18 — Card auto-play expansion & playtest polish
- **Investigation cards** — Whisper Network, Witness Statement, Alibi Check, Trace Steps, Secret Ledger auto-resolve with private notes (location history tracked per round)
- **Smuggler's Run** — Tavern ↔ Barracks movement through the Graveyard
- **Caravan Manifest** — optional ally at your location also draws Market
- **Guild Seal proactive** — play on your turn to ignore the next tax this round (still auto-consumes on tax if held)
- **Online waiting banner** — “Waiting for {name}…” when it is not your turn; manual cards labelled in private hand

### Phase 19 — Role card art in the UI
- **V3b poker portraits** — 20 role faces + card back at `cards/roles/` (750×1050; see `manifest.json`)
- **Setup & private flows** — role picks, hidden roles, and lose-a-role screens show card art; cover screens show card backs
- **The Court** — public-role thumbnail beside each player’s shown role name
- **Client helpers** — `js/cards-roles.js` (`CT.roleCardUrl`, `CT.roleCardImg`, `CT.roleCardPickHtml`)

### Phase 4 — Throne & Succession
A **Throne & Succession** panel tracks the crown and the line of succession.
- **Throne control (§23)**: King / Queen / Successor controllers, set manually or via the **Claim helper** (claimant + crown; unchallenged → crowned, or challenged → "proof valid" crowns them and the challenger loses a role / "bluff" costs the claimant a role). Claim order is recorded.
- **Royal removal (§23)**: discarding/revealing a King or Queen role automatically strips that crown's Throne control.
- **Succession (§24, manual-first)**: open succession, record claims (Firstborn / Secondborn / Tiny Tyrant / Distant Cousin) with their rank and survive-window; each claim shows rounds-left and only **Resolve**s once matured; resolving seats the successor and closes succession.

### Phase 3 — Social mechanics
A **Parley & Conflict** panel launches helpers that guide + log; social judgement stays at the table.
- **Challenge (§19)**: pick claimant + challenger; record "proof valid" (challenger loses a role) or "failed bluff" (claimant loses a role) — routed through the role-discard helper.
- **Formal vote (§21)**: Accuse Cursed / Banish Threat, with Rep-weighted tally (Rep 5 = ×2), seconder/Decree flags, and extra-weight steppers (Whisper Vote / Hidden Witness). Ties fail. On a pass the target loses a role; Accuse adds **corruption +2** if the Cursed One isn't revealed, Banish adds **+1** if the target was innocent.
- **Duel (§22)**: attacker/defender (same location or override), auto public-role bonuses + manual card/power bonuses, ties to the defender. Winner picks a consequence — Disarm / Shame / Drive Out / Wound / Search — or, for a **Serious Duel** (Barracks, once per game, tracked), the loser discards a role. **Flee** cancels the duel (−1 Rep).
- **Call Out (§28)**: corruption +2, then the app checks privately — correct reveals that role (Cursed One → Loyal win) and the caller gains an extra shown role; wrong costs the caller 1 Rep and reveals nothing.
- **Trade (§25)**: immediate gold + one-card-each-way exchange.
- **Blood Contract (§25)**: sworn pacts tracked in a **Pacts** panel; marking one broken docks the breaker 1 Rep and adds corruption +1.

### Solo testing — bots

- **Online:** in the lobby, the host can **Fill empty seats with bots**, then deal as normal. The host runs bot turns with ▶ / ⏩ (server-side logic).
- **Local:** mark any seat **Bot** at setup so one person can exercise the systems on one device.
- Bots are a simple rules engine — not a real opponent (the game is social), but they exercise board/economy/win conditions.

### Phase 2 — Core play
- **Legal movement**: the active player's connected locations are highlighted on the board; click one to move there. The per-player "Move to" dropdown remains as a manual override.
- **Location actions (§13)**: each location shows its basic + strong action as buttons for the active player, with gold costs enforced and effects applied automatically — Petition (+1 Rep, cap 4), Buy / Backroom / Study / Research / Arm (pay → draw the right deck), Haggle (draw 2, **keep-one** helper), Work the Room (+2g), Scavenge (+3g, −1 Rep), Buy Graveyard Card (pay 4, **corruption +1**, draw), Recover (clear Wound or regain Rep). **Royal Command**, **Serious Duel**, and **Deep Research** open structured helpers (Phase 10).
- **Deck draws (§26)**: per-deck draw piles + discard piles; auto-reshuffle when a pile runs dry. Draws are logged generically (no card-name leak).
- **Hand-limit handling**: a reminder appears when a hand exceeds 5, with a private discard-down helper.
- **Role-discard helper (§20)** — the central flow: cover screen → the player privately picks which card to lose → only the discarded card is revealed. Discarding a hidden role reveals it; discarding the **Cursed One ends the game for the Loyal side**; losing the last role eliminates the player and increments innocents-lost (which can trigger the Cursed win).

### Phase 1 — Foundation

- **Setup wizard**: choose 4/5/6 players → enter names → deal.
- **Dealing (§8)**: builds a deck of exactly `3 × players` role cards, always including **one Cursed One**, shuffles, deals 3 each.
- **Pass-and-play role selection**: per-player cover screen → reveal 3 roles → choose **1 public** (the Cursed One is locked to hidden). The other 2 stay hidden.
- **Starting state**: everyone at the Market, 2 gold, 3 Reputation; 2 action cards each; corruption 0; round 1; first player random or chosen.
- **Trackers**: round, active player, corruption (0–10 with a "vial" + Final-Rite warning at 8), innocents lost (0–2), Throne controller.
- **Board**: all 7 locations with the exact connection map, player tokens, active-player highlight, Throne (gold) / Market (connector) / Graveyard (danger) styling.
- **Court table (§30)**: per player — public role, location, gold, Reputation, hidden-role count, action-card count, wounded / serious-duel / Throne markers. Hidden roles & card names never shown publicly.
- **Private view (§29)**: cover screen → reveal that player's hidden roles + action cards → hide.
- **Referee controls (§32)**: manual ± for corruption, innocents, per-player gold & Reputation; move any player; eliminate/restore; declare a winner; add a playtest note.
- **Turn/round tracking (§11)**: End turn advances the active player, skips eliminated, ticks the round on wrap.
- **Win detection (§9)**: Cursed win auto-fires at corruption 10 or 2 innocents lost; manual declare for either side.
- **Save/load (§33)**: auto-save, resume on refresh, export to JSON file, import from pasted JSON, new game (with confirm).
- **Chronicle log (§34)**: timestamped, round-tagged entries; corruption changes always log a reason; no hidden info leaks.

## What is manual (by design)

Table talk and bluffing stay verbal. The app guides, tracks, and enforces mechanical consequences.

**Online:** Challenge, formal vote, duel, royal claim, Call Out, trade, and Blood Contracts all sync through the server. When a player must lose a role, their device prompts them privately — only the discarded card is revealed to the table.

## Known limitations / not yet built

- Bots still skip nuanced table talk — they now duel, trade, and claim succession when sensible, but won't bluff or negotiate.
- Action cards that need table judgement (Call Out helper, Blood Contract, Vote/Duel timing cards) stay manual — auto-play covers the mechanical subset in `CT.AUTO_PLAY` / `CARD_AUTO_EFFECTS` (expanded through Phase 18).
- Reaction cards can be played proactively from hand when listed in `CT.AUTO_PLAY` (e.g. Guild Seal); others still fire when targeted.

## Next improvements

Run `PLAYTEST.md` at a real table, log friction, then plan the next phase (remaining manual cards, more card auto-play, or playtest-driven polish).

```
index.html        shell; loads the scripts in order
css/styles.css    design tokens + components ("candlelit ledger" theme)
js/data.js        20 roles, board graph, starter action cards, constants
js/cards-extra.js extends to full 76-card deck
js/balance.js     playtest balance toggles
js/report.js      markdown playtest report export
js/state.js       game state, logging, turn/round, trackers, save/load, win detection
js/setup.js       setup wizard + pass-and-play dealing
js/app.js         render loop, board/table/log UI, referee controls, event wiring
```

## Next improvements

Run `PLAYTEST.md` at a real table, log friction, then plan the next phase (remaining manual cards, more card auto-play, or playtest-driven polish).
