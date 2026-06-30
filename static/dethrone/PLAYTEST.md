# The Cursed Throne — Host playtest checklist

Use this script for a **first real-table online session** (4–5 players, each on their own phone).

## Before you start

1. Host opens `/dethrone` → **Create online room**.
2. Share the invite link (add `?name=Alice` so names pre-fill).
3. Set player count (4/5/6) to match who is at the table.
4. Everyone joins; host confirms names in the lobby (rename if needed).
5. Optional: **Fill empty seats with bots** only if you are stress-testing solo — skip for a real table.
6. Optional: adjust **balance toggles** in Test mode if experimenting.

## Deal & setup (≈5 min)

1. Host taps **Deal roles →** when all seats are filled.
2. Each player: **Reveal my roles** → pick one **public** role (Cursed One cannot be public).
3. Confirm privately: the Cursed One player has the card **hidden only**.
4. Host taps **Begin the game** when everyone shows “ready”.

## Core loop smoke test (≈15 min)

Run through these once before free play:

| Step | Who | What to verify |
|------|-----|----------------|
| 1 | Active player | Tap a glowing location on the map → moves there |
| 2 | Active player | Use one **location action** (e.g. Buy, Work the Room) |
| 3 | Active player | **End turn** — next player’s name appears in trackers |
| 4 | Anyone | Open **Private view** — hidden roles/cards visible only to that player |
| 5 | Active player | Draw until hand > 5 → app blocks **End turn** until discard-down |
| 6 | Anyone | **Parley** → run one **Call Out** (correct or wrong) — corruption +2 logged |
| 7 | Table | Run one **formal vote** (accuse or banish) — loser picks role privately |
| 8 | One player | Toggle aeroplane mode 10s → reconnect — same seat, same hidden cards |

## Win conditions (spot check)

- **Cursed win:** corruption reaches max, or 2 innocents eliminated, or Final Rite at Graveyard (corruption 8+).
- **Loyal win:** Cursed One role revealed (Call Out, vote, etc.).

## After the game

1. Host taps **Report** → save the markdown chronicle.
2. Note friction in the log (Test mode → **Add a playtest note**).
3. Compare report to what the table remembers — no hidden card names should appear.

## Common fixes at the table

- **“Not your turn”** — only the active player moves/acts; others wait.
- **Hand limit** — discard down before ending turn (banner appears on your screen).
- **Role loss** — only the affected player’s phone shows the discard picker.
- **Host left** — next connected player becomes host automatically.
