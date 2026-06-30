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
- **Board art** — hand-illustrated campaign map (see `board.js`)
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
- **Location actions (§13)**: each location shows its basic + strong action as buttons for the active player, with gold costs enforced and effects applied automatically — Petition (+1 Rep, cap 4), Buy / Backroom / Study / Research / Arm (pay → draw the right deck), Haggle (draw 2, **keep-one** helper), Work the Room (+2g), Scavenge (+3g, −1 Rep), Buy Graveyard Card (pay 4, **corruption +1**, draw), Recover (clear Wound or regain Rep). Royal Command / Deep Research / Serious Duel are log-only "manual" buttons for now.
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

- Bots still skip most social nuance (duels, trades, throne claims) — they hunt the Cursed One so all-bot runs can test a Loyal win, not to simulate table talk.
- Action cards that need table judgement (Call Out helper, Blood Contract, most Vote/Duel/Reaction cards) stay manual — auto-play covers the mechanical OnTurn subset listed in `CT.AUTO_PLAY` / `CARD_AUTO_EFFECTS`.

## File structure

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

Run `PLAYTEST.md` at a real table, log friction, then proceed to Phase 9 (more card auto-resolution) or Phase 10 (structured strong location actions).
