"""Role card art manifest and client helper consistency."""

import json
import re
from pathlib import Path


def test_role_card_manifest_matches_client_map():
    manifest = json.loads(
        Path("static/dethrone/cards/roles/manifest.json").read_text(encoding="utf-8")
    )
    cards_js = Path("static/dethrone/js/cards-roles.js").read_text(encoding="utf-8")
    js_map = dict(re.findall(r'^\s+(\w+):\s+"([^"]+)"', cards_js, re.M))

    from dethrone.data import ROLE_IDS

    assert set(manifest["cards"]) == set(ROLE_IDS)
    assert set(js_map) == set(ROLE_IDS)
    for role_id in ROLE_IDS:
        assert manifest["cards"][role_id] == js_map[role_id]
        assert (Path("static/dethrone/cards/roles") / js_map[role_id]).is_file()


def test_role_card_pngs_are_portrait_poker_size():
    from PIL import Image

    roles_dir = Path("static/dethrone/cards/roles")
    for path in sorted(roles_dir.glob("*.png")):
        img = Image.open(path)
        w, h = img.size
        assert w == 750 and h == 1050, path.name
        assert h > w, path.name
