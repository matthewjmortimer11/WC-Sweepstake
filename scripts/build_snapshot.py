#!/usr/bin/env python3
"""
Build the client-side data snapshot from the single source of truth.

`wc_data.generate_wc_data()` is the ONE definition of the tournament scenario
(teams, fixtures, predictions, fee, payouts, copy, meta). This script serialises
it to `static/app/wc-snapshot.js`, which the front-end loads as a fallback when
no server has injected `window.WC_DATA` (i.e. the static preview and the
standalone offline build).

In server mode `main.py` injects `window.WC_DATA` before this snapshot runs, so
the snapshot is a no-op. This guarantees the offline path and the live path use
identical data — replacing the old hand-maintained `static/app/mock-data.js`,
which had already drifted (stale payout model).

Run:  python scripts/build_snapshot.py
"""

import json
import sys
from pathlib import Path

# Make `import wc_data` work regardless of where the script is invoked from.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from wc_data import generate_wc_data  # noqa: E402

OUT = ROOT / "static" / "app" / "wc-snapshot.js"

HEADER = (
    "/* ===========================================================================\n"
    "   GENERATED FILE — DO NOT EDIT BY HAND.\n"
    "   Source of truth: wc_data.py (generate_wc_data()).\n"
    "   Regenerate:      python scripts/build_snapshot.py\n"
    "\n"
    "   Front-end data fallback. When a server injects window.WC_DATA (live mode),\n"
    "   this file is a no-op; with no server (static preview / standalone offline)\n"
    "   it seeds the same data the server would. One source, no drift.\n"
    "   =========================================================================== */\n"
)


def build() -> str:
    data = generate_wc_data()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Prevent any "</script>" inside string values from closing the host <script>.
    payload = payload.replace("</", "<\\/")
    return (
        HEADER
        + "(function () {\n"
        + "  if (window.WC_DATA) return; // server already injected real data\n"
        + "  window.WC_DATA = " + payload + ";\n"
        + "})();\n"
    )


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
