# Adding a new Wheesht game

This is the canonical checklist for adding a party game so it appears on the
`/games` dashboard and inherits the shared editorial theme. It's written to be
followed start-to-finish by a person **or** an AI agent.

The five existing games (`codenames`/Cipher, `imposter`, `dial`, `charades`,
`whoami`) all follow the same shape. The quickest path is to copy the simplest
one — **`imposter`** — and rename.

## 1. Create the game module

Copy `imposter/` to `yourgame/` and rename the internals. A game module is:

```
yourgame/
  __init__.py     # from .router import router ;  __all__ = ["router"]
  game.py         # pure rules: MoveError, Settings, YourGame (state machine)
  manager.py      # Room / Player / Manager (in-memory rooms + WebSocket broadcast)
  router.py       # APIRouter: GET page, POST /yourgame/api/rooms, GET assets, WS
```

In `router.py` rename every `/imposter` path to `/yourgame` (page route,
`/yourgame/api/rooms`, `/yourgame/assets/{filename}`, `/yourgame/ws/{code}`),
and point `_TEMPLATE`/`_ASSETS` at your template and `static/yourgame/`.

## 2. Register the router in `main.py`

Two lines, next to the other games (around `main.py:1189` and `main.py:1199`):

```python
from yourgame import router as yourgame_router   # noqa: E402
app.include_router(yourgame_router)
```

## 3. Add the game to the dashboard registry

Add ONE entry to `GAMES` in [`game_registry.py`](../game_registry.py). The
dashboard renders itself from this list — you do **not** edit `templates/games.html`.

```python
GameCard(
    slug="yourgame",              # must match [data-game="yourgame"] in theme.css
    title="Your Game",
    route="/yourgame",            # the page route from step 1
    tagline="One line on how it plays.",
    icon=_IC_YOURGAME,            # inner SVG markup (paths), viewBox 0 0 32 32
    players="3–10 players", playtime="15 min",
)
```

Define `_IC_YOURGAME` above `GAMES` as the inner markup of a 32×32 line icon
(paths/circles only — the `<svg>` wrapper and white stroke come from the theme).

## 4. Give the game its accent colour

Add one line to the per-game block in
[`static/shared/theme.css`](../static/shared/theme.css):

```css
[data-game="yourgame"]{--accent:#RRGGBB; --accent-2:#DARKER; --accent-ink:#FFFFFF;}
```

`--accent` is the game's signature colour, `--accent-2` a darker shade for the
3D button shadow, `--accent-ink` the text colour that sits on the accent
(white for saturated hues, `#1A1A1A` on yellow).

## 5. Theme the game page

Copy `static/imposter/styles.css` to `static/yourgame/styles.css` and
`templates/imposter.html` to `templates/yourgame.html`, then:

- Template `<head>`: keep
  `<link rel="stylesheet" href="/shared/theme.css" />` **before** the game's own
  stylesheet, set `<html data-game="yourgame">`, keep
  `<meta name="color-scheme" content="light" />`, and update the title/icon.
- Stylesheet: the shared tokens (`--bg`, `--panel`, `--ink`, `--accent`,
  `--radius`, `--font`, `--head`, `--shadow`, `--ease`) come from the theme — only
  keep game-specific colours in your `:root`. Consume `var(--…)` everywhere; don't
  hardcode dark hexes (the light canvas is `--bg`, white cards are `--panel`,
  subtle fills are `--panel-2`, dark toasts use `--ink` with `#fff` text).

## 6. Verify

- `uvicorn main:app --reload` (needs Python 3.11+ for `tomllib`).
- `/games` shows the new card, generated from `GAMES`.
- `/yourgame` renders with the shared theme and your accent; the "← Games"
  link returns to the hub.
- Create a room and join from a second tab to confirm live play.
- `pytest` stays green.

## Design system reference

- **Canvas** cream `#F4EEE3`, **ink** `#1A1A1A`, **brand** yellow `#F5C800`.
- **Display** Bricolage Grotesque, **body** Hanken Grotesk (loaded by `theme.css`).
- **Signature motif** white cards, 3px black border, chunky `0 6px 0` offset shadow.
- Per-game accents today: Cipher violet, Imposter red, Dial teal, Charades amber,
  Who Am I? green.
