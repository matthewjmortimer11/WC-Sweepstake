"""Growth funnel: join previews, public league teaser, SEO routes."""

import pytest

from conftest import make_league


async def test_join_page_shows_league_name(client):
    lg = await make_league(client, name="Growth Test League")
    r = await client.get(f"/join/{lg['code']}")
    assert r.status_code == 200
    assert "Growth Test League" in r.text
    assert "og:title" in r.text
    assert f"/?join={lg['code']}" in r.text


async def test_join_page_unknown_code(client):
    r = await client.get("/join/NOPE99")
    assert r.status_code == 404
    assert "League not found" in r.text


async def test_league_preview_public(client):
    lg = await make_league(client, name="Preview League")
    r = await client.get(f"/api/leagues/{lg['code']}/preview")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Preview League"
    assert "entrantCount" in data
    assert data["entrantCount"] == 0


async def test_league_preview_unknown(client):
    r = await client.get("/api/leagues/NOPE99/preview")
    assert r.status_code == 404


async def test_robots_and_sitemap(client):
    robots = await client.get("/robots.txt")
    assert robots.status_code == 200
    assert "Sitemap:" in robots.text
    sitemap = await client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "<urlset" in sitemap.text
    assert "/welcome" in sitemap.text
    assert "/join/OI" in sitemap.text
