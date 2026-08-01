"""Central registry of Wheesht party games.

Adding a game to the dashboard is a single entry here — the ``/games`` handler in
main.py renders one hero card per :data:`GAMES` entry, so nothing in the template
needs editing. See docs/ADDING_A_GAME.md for the full add-a-game workflow.

``icon`` holds the inner markup of a 32×32 line-icon (paths only; the wrapping
``<svg viewBox="0 0 32 32">`` and stroke styling come from theme.css / render_cards).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class GameCard:
    slug: str          # matches [data-game="…"] in theme.css
    title: str
    route: str
    tagline: str
    icon: str          # inner SVG markup (paths), stroked via CSS
    players: str = ""
    playtime: str = ""
    status: str = "live"   # "live" or "soon"
    beta: bool = False     # renders a "Beta" pill on the card


# Bespoke single-stroke line icons, one per game (viewBox 0 0 32 32).
_IC_CIPHER = (
    '<path d="M4 13h24M8 13c0-4 3-6 8-6s8 2 8 6"/>'
    '<circle cx="11" cy="20" r="4"/><circle cx="21" cy="20" r="4"/><path d="M15 20h2"/>'
)
_IC_IMPOSTER = (
    '<path d="M6 8c6-2 14-2 20 0 0 8-3 16-10 16S6 16 6 8Z"/>'
    '<path d="M12 14c1-1 2-1 3 0M17 14c1-1 2-1 3 0"/><path d="M12 19c2 2 6 2 8 0"/>'
)
_IC_DIAL = (
    '<path d="M5 22a11 11 0 0 1 22 0"/><path d="M16 22 23 12"/>'
    '<circle cx="16" cy="22" r="2.2"/><path d="M8 22h1M23 22h1M16 11v1"/>'
)
_IC_CHARADES = (
    '<circle cx="17" cy="7" r="3"/>'
    '<path d="M17 11v8M17 13l7-2M17 15l-6 3M17 19l4 7M17 19l-5 6"/>'
)
_IC_WHOAMI = (
    '<rect x="6" y="7" width="20" height="18" rx="3"/>'
    '<path d="M16 12c2 0 3 1.3 3 3s-1.6 2.2-2.4 2.8S16 19 16 20"/><path d="M16 22.5v.2"/>'
)
_IC_DETHRONE = (
    '<path d="M6 24h20"/><path d="M6 24 4 10l6 5 6-9 6 9 6-5-2 14z"/>'
    '<path d="M11 24v-3M16 24v-4M21 24v-3"/>'
)
_IC_COVERSTORY = (
    '<path d="M8 6h13l3 3v17H8z"/><path d="M21 6v5h5"/>'
    '<path d="M11 15h10M11 19h8"/><circle cx="15" cy="23" r="2"/>'
)


GAMES: list[GameCard] = [
    GameCard(
        slug="cipher", title="Cipher", route="/play",
        tagline="Two spymasters, one grid of secret agents. Custom word packs and themes.",
        icon=_IC_CIPHER, players="4–12 players", playtime="15 min",
    ),
    GameCard(
        slug="imposter", title="Imposter", route="/imposter",
        tagline="Check your secret role, then work out who doesn't belong.",
        icon=_IC_IMPOSTER, players="3–12 players", playtime="10 min",
    ),
    GameCard(
        slug="dial", title="Dial", route="/wheel",
        tagline="The Psychic gives a clue; everyone guesses the hidden spot on the dial.",
        icon=_IC_DIAL, players="2–12 players", playtime="20 min",
    ),
    GameCard(
        slug="charades", title="Charades", route="/charades",
        tagline="Mime a celebrity while everyone guesses. Score as you go.",
        icon=_IC_CHARADES, players="4–16 players", playtime="15 min",
    ),
    GameCard(
        slug="whoami", title="Who Am I?", route="/whoami",
        tagline="Secret identities on your forehead — pick your packs, then guess.",
        icon=_IC_WHOAMI, players="2–12 players", playtime="15 min",
    ),
    GameCard(
        slug="coverstory", title="Cover Story", route="/coverstory",
        tagline="A cinematic location-deduction game. Everyone has a cover except the plant.",
        icon=_IC_COVERSTORY, players="3–16 players", playtime="7 min", beta=True,
    ),
    GameCard(
        slug="dethrone", title="The Cursed Throne", route="/dethrone",
        tagline="Scheme, duel, and betray your way to the crown on a hand-drawn map.",
        icon=_IC_DETHRONE, players="2–6 players", playtime="45 min", beta=True,
    ),
]


def _dethrone_enabled() -> bool:
    """Dethrone is beta; hide it from the hub by setting WHEESHT_SHOW_DETHRONE=0."""
    return os.environ.get("WHEESHT_SHOW_DETHRONE", "1") != "0"


def _visible(card: GameCard) -> bool:
    if card.slug == "dethrone" and not _dethrone_enabled():
        return False
    return card.status == "live"


def _hero(card: GameCard) -> str:
    meta = ""
    if card.beta:
        meta += '<span class="wa-pill wa-pill--beta">Beta</span>'
    meta += "".join(
        f'<span class="wa-pill">{escape(v)}</span>'
        for v in (card.players, card.playtime) if v
    )
    return (
        f'<a class="wa-hero" href="{escape(card.route)}" data-game="{escape(card.slug)}">'
        f'<span class="wa-hero__tile" aria-hidden="true">'
        f'<svg viewBox="0 0 32 32">{card.icon}</svg></span>'
        f'<span class="wa-hero__body">'
        f'<span class="wa-hero__title">{escape(card.title)}</span>'
        f'<span class="wa-hero__desc">{escape(card.tagline)}</span>'
        f'<span class="wa-meta">{meta}</span></span>'
        f'<span class="wa-hero__go" aria-hidden="true">→</span></a>'
    )


def render_cards() -> str:
    """Return the hero-card HTML block injected into templates/games.html."""
    return "\n".join(_hero(c) for c in GAMES if _visible(c))
