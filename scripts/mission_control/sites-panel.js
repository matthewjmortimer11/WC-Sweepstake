/**
 * Sites panel for Mission Control — copy into ai-quota-dashboard/public/sites-panel.js
 * Expects GET /api/mission-control to return { sites, recent_changes, links, ... }
 * or falls back to last /api/sync payload shape.
 */
(function () {
  const root = document.getElementById("sites-panel");
  if (!root) return;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function statusDot(status, http) {
    if (status === "live" || http === 200) return "dot dot--live";
    if (status === "warning") return "dot dot--warn";
    return "dot dot--off";
  }

  function renderLinks(links) {
    if (!links?.length) return "";
    return `<div class="sites-links">${links
      .map((l) => `<a class="sites-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
      .join("")}</div>`;
  }

  function renderSites(sites) {
    if (!sites?.length) return "<p class=\"sites-empty\">No site data yet. Run <code>python3 scripts/sync_sites.py</code>.</p>";
    return `<div class="sites-grid">${sites
      .map((s) => {
        const code = s.http_code != null ? s.http_code : "—";
        return `<a class="sites-card" href="${esc(s.url)}" target="_blank" rel="noopener">
          <span class="${statusDot(s.status, s.http_code)}"></span>
          <span class="sites-card__name">${esc(s.name)}</span>
          <span class="sites-card__path">${esc(s.path)}</span>
          <span class="sites-card__meta">HTTP ${esc(code)}</span>
        </a>`;
      })
      .join("")}</div>`;
  }

  function renderChanges(changes) {
    if (!changes?.length) return "";
    return `<section class="sites-changes">
      <h3>Recent changes</h3>
      <ul>${changes
        .map((c) => {
          const tags = (c.sites || []).map((id) => `<span class="tag">${esc(id)}</span>`).join("");
          return `<li><code>${esc(c.sha)}</code> ${esc(c.subject)} <span class="muted">${esc(c.when)}</span> ${tags}</li>`;
        })
        .join("")}</ul>
    </section>`;
  }

  async function load() {
    root.innerHTML = "<p class=\"sites-loading\">Loading sites…</p>";
    try {
      const res = await fetch("/api/mission-control");
      const data = await res.json();
      root.innerHTML = `
        <header class="sites-header">
          <h2>Sites</h2>
          <p class="muted">Production health + repo links</p>
          ${renderLinks(data.links)}
        </header>
        ${renderSites(data.sites)}
        ${renderChanges(data.recent_changes)}
      `;
    } catch (err) {
      root.innerHTML = `<p class="sites-error">Could not load sites panel: ${esc(err.message)}</p>`;
    }
  }

  load();
  setInterval(load, 60_000);
})();
