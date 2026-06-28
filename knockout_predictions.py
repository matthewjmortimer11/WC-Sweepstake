"""
Knockout bracket prediction markets driven by organiser settings.

When enabled, injects per-fixture winner (or scoreline) markets for feed
fixtures in a configurable stage range. Keys use the ``ko_`` prefix and behave
like dynamic match markets: lock at kick-off, auto-grade from results.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

KO_PRED_STAGES: Tuple[str, ...] = ("r32", "r16", "qf", "sf", "final", "third")
_STAGE_INDEX = {s: i for i, s in enumerate(KO_PRED_STAGES)}

DEFAULT_KO_PRED: Dict[str, Any] = {
    "enabled": False,
    "fromStage": "r16",
    "toStage": "final",
    "type": "winner",
    "points": 5,
}


def _safe_market_key(fixture_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_]", "_", str(fixture_id or "x"))
    return f"ko_{slug}"


def normalise_knockout_predictions(raw: Any) -> Dict[str, Any]:
    """Return a cleaned organiser config with sensible defaults."""
    cfg = dict(DEFAULT_KO_PRED)
    if not isinstance(raw, dict):
        return cfg
    cfg["enabled"] = bool(raw.get("enabled"))
    from_st = str(raw.get("fromStage") or cfg["fromStage"])
    to_st = str(raw.get("toStage") or cfg["toStage"])
    if from_st not in _STAGE_INDEX:
        from_st = cfg["fromStage"]
    if to_st not in _STAGE_INDEX:
        to_st = cfg["toStage"]
    if _STAGE_INDEX[from_st] > _STAGE_INDEX[to_st]:
        from_st, to_st = to_st, from_st
    cfg["fromStage"] = from_st
    cfg["toStage"] = to_st
    pred_type = str(raw.get("type") or "winner").strip().lower()
    cfg["type"] = pred_type if pred_type in ("winner", "scoreline") else "winner"
    try:
        pts = int(raw.get("points", cfg["points"]))
    except (TypeError, ValueError):
        pts = cfg["points"]
    cfg["points"] = max(1, min(50, pts))
    return cfg


def stage_in_range(stage: str, from_stage: str, to_stage: str) -> bool:
    si = _STAGE_INDEX.get(stage)
    if si is None:
        return False
    return _STAGE_INDEX[from_stage] <= si <= _STAGE_INDEX[to_stage]


def _fixture_pair_ready(f: Dict[str, Any]) -> bool:
    a, b = f.get("a"), f.get("b")
    if not a or not b:
        return False
    if a == "TBD" or b == "TBD":
        return False
    return True


def _sort_key(f: Dict[str, Any]) -> Tuple[int, str, str]:
    st = str(f.get("stage") or "")
    return (_STAGE_INDEX.get(st, 99), str(f.get("dateISO") or ""), str(f.get("time") or ""))


def knockout_prediction_markets(
    fixtures: List[Dict[str, Any]],
    team_map: Dict[str, Dict[str, Any]],
    cfg: Dict[str, Any],
    *,
    existing_fixture_ids: Optional[Set[str]] = None,
    status_is_done,
    winner_of,
) -> List[Dict[str, Any]]:
    """
    Build ``ko_*`` markets for pickable knockout feed fixtures.

    ``status_is_done`` and ``winner_of`` are injected so tests need not import
    main.
    """
    cfg = normalise_knockout_predictions(cfg)
    if not cfg.get("enabled"):
        return []

    taken = set(existing_fixture_ids or ())
    from_st = cfg["fromStage"]
    to_st = cfg["toStage"]
    pred_type = cfg["type"]
    points = cfg["points"]
    out: List[Dict[str, Any]] = []

    candidates = [
        f for f in fixtures or []
        if stage_in_range(str(f.get("stage") or ""), from_st, to_st)
        and _fixture_pair_ready(f)
    ]
    candidates.sort(key=_sort_key)

    for f in candidates:
        fid = str(f.get("id") or "")
        if not fid or fid in taken:
            continue
        ta = team_map.get(f["a"], {})
        tb = team_map.get(f["b"], {})
        fa = ta.get("flag", f["a"])
        fb = tb.get("flag", f["b"])
        na = ta.get("name", f["a"])
        nb = tb.get("name", f["b"])
        fix_status = f.get("status", "upcoming")
        if status_is_done(f):
            fix_status = "done"
        market_id = _safe_market_key(fid)

        common = {
            "fixture_id": fid,
            "fixture_status": fix_status,
            "stage": f.get("stage"),
            "knockoutBracket": True,
            "dateISO": f.get("dateISO"),
            "time": f.get("time"),
        }

        if pred_type == "scoreline":
            market: Dict[str, Any] = {
                "key": market_id,
                "q": fa + " " + na + " vs " + fb + " " + nb + " — exact score?",
                "kind": "scoreline",
                "points": points,
                "options": [f["a"], f["b"]],
                "answer": None,
                **common,
            }
            sc = f.get("score")
            if status_is_done(f) and isinstance(sc, (list, tuple)) and len(sc) == 2 and None not in sc:
                market["answer"] = str(sc[0]) + "-" + str(sc[1])
        else:
            market = {
                "key": market_id,
                "q": fa + " " + na + " vs " + fb + " " + nb + " — who wins?",
                "kind": "team",
                "points": points,
                "options": [f["a"], f["b"]],
                "answer": None,
                **common,
            }
            if status_is_done(f):
                win = winner_of(f)
                if win == "HOME":
                    market["answer"] = f["a"]
                elif win == "AWAY":
                    market["answer"] = f["b"]

        out.append(market)
        taken.add(fid)
    return out
