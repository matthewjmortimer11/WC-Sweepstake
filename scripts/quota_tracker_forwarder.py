#!/usr/bin/env python3
"""
Local bridge: accept inbound tracker POSTs and forward to the Quota Tracker app.

Run this on your laptop alongside the dashboard (default target http://127.0.0.1:8765).
Expose this forwarder with Cloudflare Tunnel or ngrok so cloud agents can POST safely.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

LISTEN_HOST = os.environ.get("QUOTA_BRIDGE_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("QUOTA_BRIDGE_PORT", "9876"))
TARGET_BASE = os.environ.get("QUOTA_TRACKER_TARGET", "http://127.0.0.1:8765").rstrip("/")
BRIDGE_TOKEN = os.environ.get("QUOTA_TRACKER_TOKEN", "").strip()


class ForwarderHandler(BaseHTTPRequestHandler):
    server_version = "QuotaTrackerForwarder/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _unauthorized(self) -> None:
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":"unauthorized"}')

    def _bad_request(self, message: str) -> None:
        self.send_response(400)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        body = json.dumps({"error": message}).encode("utf-8")
        self.wfile.write(body)

    def _auth_ok(self) -> bool:
        if not BRIDGE_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {BRIDGE_TOKEN}"

    def do_GET(self) -> None:
        if self.path in {"/", "/health"}:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {
                "ok": True,
                "service": "quota-tracker-forwarder",
                "target": TARGET_BASE,
                "auth_required": bool(BRIDGE_TOKEN),
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        if not self.path.startswith("/api/trackers/"):
            self.send_response(404)
            self.end_headers()
            return
        if not self._auth_ok():
            self._unauthorized()
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        if not raw:
            self._bad_request("expected JSON body")
            return
        try:
            json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._bad_request("invalid JSON")
            return

        target_url = f"{TARGET_BASE}{self.path}"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        request = urllib.request.Request(target_url, data=raw, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read()
                self.send_response(response.status)
                for key, value in response.headers.items():
                    if key.lower() in {"content-type", "content-length"}:
                        self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            body = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json"))
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.URLError as exc:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            message = json.dumps(
                {
                    "error": "quota tracker unreachable",
                    "detail": str(exc.reason),
                    "target": TARGET_BASE,
                }
            ).encode("utf-8")
            self.wfile.write(message)


def main() -> int:
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ForwarderHandler)
    print(
        f"Quota tracker forwarder listening on http://{LISTEN_HOST}:{LISTEN_PORT} "
        f"-> {TARGET_BASE}",
        file=sys.stderr,
    )
    if BRIDGE_TOKEN:
        print("Bridge token auth: enabled", file=sys.stderr)
    else:
        print("Bridge token auth: disabled (set QUOTA_TRACKER_TOKEN to enable)", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
