# The Cursed Throne — Playtest Ledger

A single-device browser app to **playtest** the bluffing board game *The Cursed Throne* before
printing cards and a board. It is a **digital dealer + board tracker + referee assistant + log** —
it supports the social game, it does not replace it.

## How to run

No build step, no Node, no server, no internet. Just open the file:

```
open "index.html"          # macOS
```

or double-click `index.html` in Finder. State auto-saves to the browser's `localStorage`, so a
refresh resumes the same game.

> Built as plain HTML/CSS/JS with classic `<script>` tags specifically so it runs from `file://`
> at a table with no wifi. If you later want hot-reload, any static server works
> (`python3 -m http.server`), but it is not required.

## What is implemented (Phases 1–2)

### Phase 3 — Social mechanics
A **Parley & Conflict** panel launches helpers that guide + log; social judgement stays at the table.
- **Challenge (§19)**: pick claimant + challenger; record "proof valid" (challenger loses a role) or "failed bluff" (claimant loses a role) — routed through the role-discard helper.
- **Formal vote (§21)**: Accuse Cursed / Banish Threat, with Rep-weighted tally (Rep 5 = ×2), seconder/Decree flags, and extra-weight steppers (Whisper Vote / Hidden Witness). Ties fail. On a pass the target loses a role; Accuse adds **corruption +2** if the Cursed One isn't revealed, Banish adds **+1** if the target was innocent.
- **Duel (§22)**: attacker/defender (same location or override), auto public-role bonuses + manual card/power bonuses, ties to the defender. Winner picks a consequence — Disarm / Shame / Drive Out / Wound / Search — or, for a **Serious Duel** (Barracks, once per game, tracked), the loser discards a role. **Flee** cancels the duel (−1 Rep).
- **Call Out (§28)**: corruption +2, then the app checks privately — correct reveals that role (Cursed One → Loyal win) and the caller gains an extra shown role; wrong costs the caller 1 Rep and reveals nothing.
- **Trade (§25)**: immediate gold + one-card-each-way exchange.
- **Blood Contract (§25)**: sworn pacts tracked in a **Pacts** panel; marking one broken docks the breaker 1 Rep and adds corruption +1.

### Solo testing — bots
- At setup, mark any seat **Bot** (default: seat 1 is you, the rest are bots) so one person can exercise the systems. Bots skip pass-and-play (they auto-pick a public role).
- On a bot's turn you get **▶ Play turn** (one bot turn) and **⏩ Auto-play bots** (runs every bot until it's a human's turn or the game ends). Bots are a simple rules engine — move → one affordable location action → end turn; the Cursed bot heads to the Graveyard, buys corruption, and performs the Final Rite when corruption ≥ 8. Not a real opponent (the game is social) — just a flow-testing aid.

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

Everything social or rules-in-flux is manual: movement is *suggested* (legal moves highlighted) but
not hard-locked — the override dropdown always works; corruption only changes from actions that cause
it or from the referee controls; there are no challenge/vote/duel helpers yet. This matches the design
brief — guide and track, don't over-automate.

## Known limitations / not yet built

- **Phase 4**: Throne claim helper, royal removal, succession tracking.
- **Phase 5**: richer board art, exportable playtest report, full 76 action cards, balance toggles.
- Action cards are the §27 starter set (~30); the data model already scales to 76.

## File structure

```
index.html        shell; loads the scripts in order
css/styles.css    design tokens + components ("candlelit ledger" theme)
js/data.js        20 roles, board graph, starter action cards, constants
js/state.js       game state, logging, turn/round, trackers, save/load, win detection
js/setup.js       setup wizard + pass-and-play dealing
js/app.js         render loop, board/table/log UI, referee controls, event wiring
```

## Next improvements

Confirm Phase 1 around a real table (deal a 5-player game, check the Cursed One is always hidden and
never public), then proceed to Phase 2 (movement + location actions + role-discard helper).
