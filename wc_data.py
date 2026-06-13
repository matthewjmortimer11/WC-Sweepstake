"""
World Cup Sweepstake data generation.

The tournament-specific DATA lives in a config file under tournaments/ (TOML);
this module reads it and assembles the app payload. Nothing tournament-specific
is hardcoded here, so a new tournament is a new config file (+ WC_TOURNAMENT),
not a code change.

Select the active tournament with the WC_TOURNAMENT env var
(default: "world-cup-2026").
"""

import datetime as _dt
import os
import tomllib
from pathlib import Path

_TOURNAMENTS_DIR = Path(__file__).resolve().parent / "tournaments"
_DEFAULT_TOURNAMENT = "world-cup-2026"

# Weekday/month labels for fixture date formatting (date.weekday(): Mon=0).
_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_COLORS = ["#E8272A", "#1a7a44", "#0a3b8c", "#7A3FB0", "#E07A1A", "#0d8a8a", "#C0246B", "#3a6ea5"]


def _initials(name: str) -> str:
    parts = name.strip().split()
    if not parts:
        return "?"
    i = parts[0][0] if parts[0] else "?"
    if len(parts) > 1 and parts[1] and parts[1][0].isalpha():
        i += parts[1][0]
    return i.upper()


def load_config(tournament: str | None = None) -> dict:
    """Load and return the raw tournament config dict."""
    name = tournament or os.environ.get("WC_TOURNAMENT", _DEFAULT_TOURNAMENT)
    path = _TOURNAMENTS_DIR / f"{name}.toml"
    if not path.exists():
        raise FileNotFoundError(f"Tournament config not found: {path}")
    with path.open("rb") as f:
        return tomllib.load(f)


def _build_teams(cfg: dict) -> list[dict]:
    # Pre-tournament: no games played, so every team is still in (stage 'group').
    # Results later flip alive/stage/rounds per team.
    return [
        {
            "name": t["name"], "code": t["code"], "flag": t["flag"],
            "group": t["group"], "color": t["color"], "odds": t["odds"],
            "stage": "group", "alive": True, "rounds": 0,
        }
        for t in cfg["teams"]
    ]


def _build_fixtures(cfg: dict, teams: list[dict]) -> list[dict]:
    """Group-stage round-robin, generated from the schedule config.

    (Phase 3 replaces this with the real provider schedule.)
    """
    sch = cfg["schedule"]
    start = sch["start_date"]
    if isinstance(start, _dt.datetime):
        start = start.date()
    times = sch["times"]
    venues = sch["venues"]
    # round_robin: per-matchday list of [home_slot, away_slot] pairings.
    rr = [[tuple(pair) for pair in md] for md in sch["round_robin"]]

    groups = sorted({t["group"] for t in teams})
    group_size = cfg["qualification"]["group_size"]

    fixtures: list[dict] = []
    vi = 0
    fid = 0
    for gi, g in enumerate(groups):
        gteams = [t for t in teams if t["group"] == g]
        if len(gteams) < group_size:
            continue
        for md in range(len(rr)):
            day_offset = md * 6 + gi // 2
            date = start + _dt.timedelta(days=day_offset)
            for pidx, (ia, ib) in enumerate(rr[md]):
                a, b = gteams[ia], gteams[ib]
                fixtures.append({
                    "id": f"f{fid}", "group": g, "matchday": md + 1,
                    "stage": "group",
                    "a": a["code"], "b": b["code"],
                    "dateISO": date.isoformat(),
                    "dateLabel": f"{_DOW[date.weekday()]} {date.day} {_MON[date.month - 1]}",
                    "time": times[(gi + pidx) % len(times)],
                    "venue": venues[vi % len(venues)],
                    "status": "upcoming", "score": None, "winner": None,
                })
                vi += 1
                fid += 1
    fixtures.sort(key=lambda f: (f["dateISO"], f["time"]))
    return fixtures


def _build_people(cfg: dict, teams: list[dict]) -> list[dict]:
    """Build the pre-seeded participant list from the [[roster]] config section."""
    roster = cfg.get("roster", [])
    league_code = (cfg.get("league") or {}).get("code", "OI")
    team_map = {t["code"]: t for t in teams}
    people = []
    for i, entry in enumerate(roster):
        code = entry["team"]
        t = team_map.get(code, {})
        name = entry["name"]
        people.append({
            "id": entry["id"],
            "name": name,
            "initials": _initials(name),
            "team": code,
            "color": _COLORS[i % len(_COLORS)],
            "department": "",
            "location": "Edinburgh",
            "city": "Edinburgh",
            "ltMember": False,
            "leadership": False,
            "gender": "—",
            "stage": t.get("stage", "group"),
            "alive": t.get("alive", True),
            "isYou": False,
            "isDemo": False,
            "isOI": True,
            "leagueCode": league_code,
            "picks": {},
            "predScore": 0,
            "joinedAt": 0,
        })
    return people


def _build_predictions(cfg: dict) -> list[dict]:
    # answer=None → still open; once a result is set, the grader settles each pick.
    out = []
    for m in cfg["markets"]:
        out.append({
            "key": m["key"], "q": m["q"], "kind": m["kind"],
            "points": m["points"], "answer": None, "options": m["options"],
        })
    return out


def generate_wc_data(tournament: str | None = None) -> dict:
    cfg = load_config(tournament)

    teams = _build_teams(cfg)
    fixtures = _build_fixtures(cfg, teams)
    predictions = _build_predictions(cfg)
    people = _build_people(cfg, teams)
    r16: list = []  # no knockout fixtures until the group stage resolves

    fee = cfg["entry"]["fee"]
    charity_split = cfg["entry"]["charity_split"]
    pot = len(people) * fee

    # Half of every entry goes to charity; the rest is a single winner-takes-all
    # pot for whoever holds the champion.
    payouts = [
        {"place": "Winner", "pct": 1.0 - charity_split,
         "label": "holds the champion — takes the whole pot"},
        {"place": "Charity", "pct": charity_split, "label": "half of every entry"},
    ]

    lines = dict(cfg["lines"])

    # Public descriptor for the pre-seeded league (password intentionally omitted
    # — it is hashed into Postgres on startup and never travels to the client).
    league_cfg = cfg.get("league") or {}
    league = {
        "code": league_cfg.get("code", "OI"),
        "name": league_cfg.get("name", cfg["sweepstake_name"]),
        "seeded": bool(league_cfg.get("seeded", True)),
    }

    still_in = sum(1 for p in people if p["alive"])
    out_count = sum(1 for p in people if not p["alive"])
    teams_left = sum(1 for t in teams if t["alive"])
    m = cfg["meta"]

    meta = {
        "id": cfg["id"],
        "competitionCode": cfg.get("competition_code", "WC"),
        "name": cfg["sweepstake_name"],
        "season": cfg["season"],
        "stageLabel": m["stage_label"],
        "phase": cfg["phase"],
        "maxTeams": len(teams),
        "groupSize": len(people),
        "stillIn": still_in,
        "out": out_count,
        "teamsLeft": teams_left,
        "kickoff": m["kickoff"],
        "finalVenue": m["final_venue"],
        "finalDate": m["final_date"],
        "adminPin": str(m.get("admin_pin", "")),
        "predictionsLocked": False,
        # Config-derived, additive — lets the UI/grader stop hardcoding the
        # bracket and home-nation logic (consumed from Phase 3 onward).
        "stageLadder": cfg["stage_ladder"],
        "stageLabels": dict(cfg["stage_labels"]),
        "specialTeams": list(cfg["special_teams"]),
        "qualification": dict(cfg["qualification"]),
    }

    return {
        "teams": teams,
        "people": people,
        "r16": r16,
        "fixtures": fixtures,
        "predictions": predictions,
        "fee": fee,
        "pot": pot,
        "charitySplit": charity_split,
        "payouts": payouts,
        "lines": lines,
        "league": league,
        "meta": meta,
    }


def get_league_seed(tournament: str | None = None) -> dict:
    """Seed values for the pre-assigned league, including the plaintext password
    from config (used once at startup to create/refresh the hashed League row).
    Never expose this to the client."""
    cfg = load_config(tournament)
    league_cfg = cfg.get("league") or {}
    return {
        "code": league_cfg.get("code", "OI"),
        "name": league_cfg.get("name", cfg["sweepstake_name"]),
        "password": league_cfg.get("password", ""),
        "seeded": bool(league_cfg.get("seeded", True)),
    }
