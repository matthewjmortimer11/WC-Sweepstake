"""Mission Control site registry, health checks, and git change mapping."""

from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parent / "sites.json"


@dataclass
class Site:
    id: str
    name: str
    path: str
    description: str
    paths: list[str]
    tests: str
    production_base: str = "https://wheesht.xyz"

    @property
    def url(self) -> str:
        return f"{self.production_base.rstrip('/')}{self.path}"

    def matches_file(self, file_path: str) -> bool:
        normalized = file_path.replace("\\", "/").lstrip("./")
        for prefix in self.paths:
            p = prefix.rstrip("/")
            if normalized == p or normalized.startswith(p + "/"):
                return True
        return False


@dataclass
class SiteHealth:
    site_id: str
    http_code: int | None
    status: str
    checked_at: str
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.site_id,
            "http_code": self.http_code,
            "status": self.status,
            "checked_at": self.checked_at,
            "error": self.error,
        }


@dataclass
class RecentChange:
    sha: str
    subject: str
    when: str
    site_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sha": self.sha,
            "subject": self.subject,
            "when": self.when,
            "sites": self.site_ids,
        }


def load_registry(path: Path | None = None) -> dict[str, Any]:
    data = json.loads((path or REGISTRY_PATH).read_text(encoding="utf-8"))
    return data


def load_sites(path: Path | None = None) -> list[Site]:
    data = load_registry(path)
    base = data.get("production_base", "https://wheesht.xyz")
    return [
        Site(
            id=s["id"],
            name=s["name"],
            path=s["path"],
            description=s["description"],
            paths=s.get("paths", []),
            tests=s.get("tests", ""),
            production_base=base,
        )
        for s in data["sites"]
    ]


def detect_sites_from_files(files: list[str], sites: list[Site] | None = None) -> list[Site]:
    sites = sites or load_sites()
    hits: list[Site] = []
    for site in sites:
        if any(site.matches_file(f) for f in files):
            hits.append(site)
    return hits


def detect_sites_from_git(repo_root: Path) -> list[Site]:
    sites = load_sites()
    files: list[str] = []
    for args in (
        ["diff", "--name-only", "HEAD"],
        ["diff", "--name-only", "--cached"],
        ["ls-files", "--modified", "--others", "--exclude-standard"],
    ):
        try:
            out = subprocess.check_output(["git", *args], cwd=repo_root, stderr=subprocess.DEVNULL, text=True)
            files.extend(line.strip() for line in out.splitlines() if line.strip())
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    return detect_sites_from_files(files, sites)


def primary_site(sites: list[Site]) -> Site | None:
    if not sites:
        return None
    priority = ["wheesht", "dethrone", "cipher", "qualification", "imposter", "dial", "charades", "whoami"]
    by_id = {s.id: s for s in sites}
    for site_id in priority:
        if site_id in by_id:
            return by_id[site_id]
    return sites[0]


def check_site_health(site: Site, timeout: float = 8.0) -> SiteHealth:
    now = datetime.now(timezone.utc).isoformat()
    request = urllib.request.Request(site.url, method="GET", headers={"User-Agent": "WheeshtMissionControl/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            code = response.status
            status = "live" if 200 <= code < 400 else "warning"
            return SiteHealth(site_id=site.id, http_code=code, status=status, checked_at=now)
    except urllib.error.HTTPError as exc:
        code = exc.code
        status = "warning" if code < 500 else "offline"
        return SiteHealth(site_id=site.id, http_code=code, status=status, checked_at=now, error=str(exc.reason))
    except Exception as exc:  # noqa: BLE001 — health probe
        return SiteHealth(site_id=site.id, http_code=None, status="offline", checked_at=now, error=str(exc))


def recent_changes(repo_root: Path, limit: int = 12) -> list[RecentChange]:
    sites = load_sites()
    try:
        out = subprocess.check_output(
            ["git", "log", f"-{limit}", "--pretty=format:%h|%s|%cr", "--name-only"],
            cwd=repo_root,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

    changes: list[RecentChange] = []
    current: RecentChange | None = None
    current_files: list[str] = []

    for line in out.splitlines():
        if "|" in line and re.match(r"^[0-9a-f]+\|", line):
            if current is not None:
                current.site_ids = [s.id for s in detect_sites_from_files(current_files, sites)]
                changes.append(current)
            sha, subject, when = line.split("|", 2)
            current = RecentChange(sha=sha, subject=subject, when=when)
            current_files = []
        elif line.strip() and current is not None:
            current_files.append(line.strip())

    if current is not None:
        current.site_ids = [s.id for s in detect_sites_from_files(current_files, sites)]
        changes.append(current)
    return changes


def build_sync_payload(repo_root: Path) -> dict[str, Any]:
    registry = load_registry()
    sites = load_sites()
    health = [check_site_health(s).to_dict() for s in sites]
    health_by_id = {h["id"]: h for h in health}

    site_cards = []
    for site in sites:
        h = health_by_id.get(site.id, {})
        site_cards.append(
            {
                "id": site.id,
                "name": site.name,
                "url": site.url,
                "path": site.path,
                "description": site.description,
                "tests": site.tests,
                "http_code": h.get("http_code"),
                "status": h.get("status", "unknown"),
                "checked_at": h.get("checked_at"),
            }
        )

    branch = None
    main_sha = None
    try:
        branch = subprocess.check_output(
            ["git", "branch", "--show-current"], cwd=repo_root, stderr=subprocess.DEVNULL, text=True
        ).strip()
        main_sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "main"], cwd=repo_root, stderr=subprocess.DEVNULL, text=True
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "repo": "WC-Sweepstake",
        "repo_url": registry.get("repo_url"),
        "branch": branch,
        "main_sha": main_sha,
        "links": registry.get("links", []),
        "sites": site_cards,
        "recent_changes": [c.to_dict() for c in recent_changes(repo_root)],
    }


def site_metrics(sites: list[Site]) -> list[dict[str, str]]:
    if not sites:
        return []
    primary = primary_site(sites)
    metrics = [
        {"label": "Site", "value": primary.name if primary else sites[0].name},
    ]
    if primary:
        metrics.append({"label": "URL", "value": primary.url.replace("https://", "")})
    if len(sites) > 1:
        metrics.append({"label": "Also", "value": ", ".join(s.name for s in sites[:3])})
    return metrics
