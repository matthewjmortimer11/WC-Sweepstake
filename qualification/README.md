# Qualification tracker (Wheesht extension)

Tracks whether a target team — **Scotland (`SCO`) by default, but any team** —
is on course to reach the World Cup 2026 knockouts as one of the **eight best
third-placed teams** (12 groups of 4; top two per group + eight best thirds
advance).

It is a self-contained feature module, separate from the game/sweepstake code,
served at **`/qualification`** with a JSON API at **`/api/qualification`**.

## A note on the stack

The brief described a TypeScript/Tailwind engine. This repository is a
**Python / FastAPI** app (Jinja templates, `pytest`), and reusing the *existing*
football data layer — `provider.CanonicalFixture` → the Football-Data.org / mock
adapter → `sync.fixture_cache` — meant building in Python. A parallel TS data
layer would have been exactly the second provider the brief told us to avoid.
The engine still follows the agreed shape; Python just spells the function names
in `snake_case` (`build_group_tables` ≡ `buildGroupTables`, …).

## Layout

| File | Role |
|------|------|
| `engine.py` | **Pure, provider-agnostic** scenario maths. No I/O. The core deliverable. |
| `router.py` | FastAPI shell: converts the existing fixture cache + team list into engine types, runs the engine, serves JSON + the page. |
| `../templates/qualification.html` | Mobile-first UI (dark navy / white / Scotland blue). |
| `../tests/test_qualification.py` | Engine unit + scenario tests (`pytest`). |

## Engine surface (`engine.py`)

Types: `Team`, `Fixture`, `MatchStatus`, `GroupStanding`, `ThirdPlaceStanding`,
`QualificationStatus`, `ScenarioRequirement`, `Band`, `ProviderAdapter`.

Pure functions: `build_group_tables`, `rank_group`, `get_third_placed_teams`,
`rank_third_placed_teams`, `get_target_team_status`, `simulate_fixture_outcome`,
`calculate_relevant_score_bands`, `calculate_what_target_needs`,
`explain_requirement`.

### Key behaviours

- **Group tables are recomputed from results**, never trusted from a feed. A
  live/half-time score counts as the current provisional result, so the picture
  flips in real time.
- **Group tables follow the official FIFA tie-break ladder**: points → goal
  difference → goals scored → **head-to-head** (points, then GD, then goals among
  the level teams) → fair play → deterministic fallback (in place of drawing lots).
- **Third-placed teams are ranked** by points → goal difference → goals scored →
  fair play → deterministic fallback (head-to-head doesn't apply across groups).
  Missing fair-play data is skipped (it never crashes or invents an order).
- **Qualification chance + per-game impact** (`projection.py`): a Monte-Carlo
  simulation of the remaining group games (evenly-matched assumption) using the
  exact same ranking rules, reporting the target's chance and how each remaining
  game's result swings it. Clearly presented as an estimate, not a betting price.
- **Scoreline bands (0–0 … 8–8) collapse** into human conditions: *any result
  works*, *no realistic result helps*, *avoid defeat*, *win*, *win by N+*,
  *draw only*, *must not win*, *must not win by N+*, *to lose*, bounded
  intervals, etc. Same-group dependencies combine with **AND**.
- Everything is **parameterised by `target_team_id`** and computed from
  tournament state — no hard-coded Scotland permutations.

## Data source & config

Reads the same data the rest of the app does (`sync.fixture_cache`, falling back
to the generated baseline) and the team list from the active tournament config
(`tournaments/world-cup-2026.toml`, `WC_TOURNAMENT`). The qualification cutoff
follows the config's `best_third_qualifiers` (8). No API key reaches the client.

Live data needs `FOOTBALL_DATA_API_KEY`; without it the mock adapter is used and
the tracker shows the pre-tournament baseline (and a stale-data banner).

## Tests

```bash
pip install -r requirements-dev.txt
pytest tests/test_qualification.py
```
