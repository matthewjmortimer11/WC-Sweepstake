"""Scotland third-place qualification tracker — a Wheesht extension.

A self-contained feature module (separate from the game/sweepstake code) that
tracks whether a target team (Scotland by default) is on course to qualify for
the World Cup 2026 knockouts as one of the eight best third-placed teams.

``engine`` is the pure, provider-agnostic scenario maths; ``router`` is the
FastAPI route that wraps it around the existing fixture data layer.

The router is intentionally *not* imported here so the engine (and its tests)
stay free of any FastAPI/DB import cost. main.py pulls it in explicitly with
``from qualification.router import router``.
"""

