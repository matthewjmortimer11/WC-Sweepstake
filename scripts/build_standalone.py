#!/usr/bin/env python3
"""
Build the self-contained standalone HTML files from the single source of truth.

Both outputs are assembled from the SAME canonical pieces the live app uses —
crucially `static/app/wc-snapshot.js` (generated from wc_data.py) — so the
standalone builds can never drift from the server. This replaces the previous
hand-inlined copies that carried a stale data catalogue.

Outputs:
  • static/standalone.html          — online: React/Babel/fonts via CDN
  • static/standalone-offline.html  — offline: React + fonts inlined, JSX
                                       precompiled (no Babel, no network)

Build dependencies live in scripts/vendor/ (gitignored — populate once):
  react.development.js, react-dom.development.js, babel.min.js, fonts_inline.css
See scripts/vendor/README.md for how to fetch them.

Run:  python scripts/build_snapshot.py && python scripts/build_standalone.py
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
APP = STATIC / "app"
VENDOR = Path(__file__).resolve().parent / "vendor"

# Plain JS, load order matters: data snapshot → data layer → store.
PLAIN_JS = ["wc-snapshot.js", "data.js", "store.js"]

# JSX components, load order matters (mascot/ui before screens, app last).
# Keep this in lockstep with the <script> order in templates/index.html.
JSX = [
    ("app", "wheesht-mascot.jsx"),
    ("app", "ui.jsx"),
    ("..", "tweaks-panel.jsx"),
    ("app", "screens-hub.jsx"),
    ("app", "screens-hub2.jsx"),
    ("app", "screens-onboarding.jsx"),
    ("app", "screens-dashboard.jsx"),
    ("app", "screens-competition.jsx"),
    ("app", "screens-predictions.jsx"),
    ("app", "screens-games.jsx"),
    ("app", "screens-match-centre.jsx"),
    ("app", "screens-what-if.jsx"),
    ("app", "screens-admin.jsx"),
    ("app", "screens-chat.jsx"),
    ("app", "screens-dev.jsx"),
    ("app", "app.jsx"),
    ("app", "stage.jsx"),
]


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def strip_external(html: str) -> str:
    """Remove the preview's CDN/font links and src= script includes."""
    html = re.sub(r"<link[^>]+preconnect[^>]*>\s*", "", html, flags=re.I)
    html = re.sub(r"<link[^>]+googleapis\.com[^>]*>\s*", "", html, flags=re.I)
    html = re.sub(r"<script[^>]+unpkg\.com[^>]*></script>\s*", "", html, flags=re.I)
    html = re.sub(r"<script[^>]+\bsrc=[^>]*></script>\s*", "", html, flags=re.I)
    html = re.sub(r"<script[^>]+\bsrc=[\"'][^\"']+[\"'][^>]*>\s*", "", html, flags=re.I)
    return html.replace("<!-- WC_DATA_INJECTION -->", "")


def compile_jsx(src: str, filename: str) -> str:
    """Transpile JSX → JS via the vendored Babel using node (no network)."""
    babel = VENDOR / "babel.min.js"
    with tempfile.NamedTemporaryFile("w", suffix=".jsx", delete=False, encoding="utf-8") as f:
        f.write(src)
        srcfile = f.name
    node = (
        f"const Babel=require({str(babel)!r});"
        f"const fs=require('fs');"
        f"const code=fs.readFileSync({srcfile!r},'utf8');"
        f"process.stdout.write(Babel.transform(code,{{presets:['react'],filename:{filename!r}}}).code);"
    )
    out = subprocess.run(["node", "-e", node], capture_output=True, text=True)
    Path(srcfile).unlink(missing_ok=True)
    if out.returncode != 0:
        raise RuntimeError(f"Babel failed for {filename}: {out.stderr.strip()}")
    return out.stdout


def scaler_script() -> str:
    return (
        "\n<script>\n(function(){function fit(){var s=document.getElementById('scaler');"
        "if(!s)return;var pad=24;var sc=Math.min((window.innerWidth-pad)/402,"
        "(window.innerHeight-pad)/872);sc=Math.min(sc,1.18);"
        "s.style.transform='scale('+sc+')';}"
        "window.addEventListener('resize',fit);fit();setTimeout(fit,200);})();\n</script>\n"
    )


def build_offline() -> Path:
    html = strip_external(read(STATIC / "preview.html"))
    body_close = html.rfind("</body>")
    head, tail = html[:body_close], html[body_close:]

    # Fonts inlined into <head>.
    fonts = read(VENDOR / "fonts_inline.css")
    head = head.replace("</head>", f"<style>{fonts}</style>\n</head>", 1)

    out = head
    out += f"\n<script>\n{read(VENDOR / 'react.development.js')}\n</script>\n"
    out += f"\n<script>\n{read(VENDOR / 'react-dom.development.js')}\n</script>\n"
    out += scaler_script()
    for name in PLAIN_JS:
        out += f"\n<script>\n{read(APP / name)}\n</script>\n"
    for sub, name in JSX:
        path = (STATIC if sub == ".." else APP) / name
        out += f"\n<script>\n{compile_jsx(read(path), name)}\n</script>\n"
    out += tail

    dest = STATIC / "standalone-offline.html"
    dest.write_text(out, encoding="utf-8")
    return dest


def build_online() -> Path:
    """Online standalone: keep CDN React/Babel/fonts, inline only our own code."""
    html = read(STATIC / "preview.html")
    # Drop only our own app src= includes; keep the CDN <script>/<link> tags.
    html = re.sub(r"<script[^>]+\bsrc=[\"']app/[^\"']+[\"'][^>]*>\s*</script>\s*", "", html, flags=re.I)
    html = re.sub(r"<script[^>]+\bsrc=[\"']tweaks-panel\.jsx[\"'][^>]*>\s*</script>\s*", "", html, flags=re.I)
    html = html.replace("<!-- WC_DATA_INJECTION -->", "")
    body_close = html.rfind("</body>")
    head, tail = html[:body_close], html[body_close:]

    out = head
    for name in PLAIN_JS:
        out += f"\n<script>\n{read(APP / name)}\n</script>\n"
    for sub, name in JSX:
        path = (STATIC if sub == ".." else APP) / name
        out += f'\n<script type="text/babel">\n{read(path)}\n</script>\n'
    out += tail

    dest = STATIC / "standalone.html"
    dest.write_text(out, encoding="utf-8")
    return dest


def main() -> None:
    missing = [f for f in ("react.development.js", "react-dom.development.js",
                           "babel.min.js", "fonts_inline.css") if not (VENDOR / f).exists()]
    if missing:
        sys.exit(f"Missing vendored deps in {VENDOR}: {missing}\n"
                 f"See scripts/vendor/README.md to populate them.")
    for builder in (build_online, build_offline):
        dest = builder()
        print(f"Wrote {dest.relative_to(ROOT)} ({dest.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
