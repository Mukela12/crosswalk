import { h, clear, icon, fmt, initials, statusBadge, STATUS_LABEL } from "../dom.js";
import { api } from "../api.js";
import { CrosswalkField } from "../field.js";
import { bandPalette } from "../palettes.js";
import { toast } from "../ui.js";

const ACTION = {
  EVIDENCE_ADDED: "added evidence to",
  EVIDENCE_REMOVED: "removed evidence from",
  REPORT_EXPORTED: "exported",
};
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function renderOverview(root, { navigate }) {
  const band = h("canvas", { role: "img", "aria-label": "Controls mapped to frameworks. Hover a dot to see a control." });
  const tip = h("div", { class: "node-tip", role: "tooltip" });
  const tiles = h("div", { class: "frameworks" });
  const statusPanel = h("section", { class: "panel" });
  const attention = h("section", { class: "panel" });
  const activity = h("section", { class: "panel" });

  root.append(
    h("div", { class: "crosswalk" }, band, tip),
    tiles,
    h("div", { class: "overview-grid" }, h("div", { class: "stack" }, statusPanel, attention), activity));
  tiles.append(...[0, 1, 2].map(() => h("div", { class: "skeleton tile" })));
  for (const p of [statusPanel, attention, activity]) {
    p.append(h("div", { class: "panel-body" }, h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })));
  }

  let field = null;
  let tileByCode = {};
  let controlsByCode = {};
  let alive = true;
  let seenAudit = null;

  async function load({ fresh = false } = {}) {
    const [overview, controls, audit] = await Promise.all([
      api.get("/api/overview"), api.get("/api/controls"), api.get("/api/audit?limit=40"),
    ]);
    if (!alive) return;
    controlsByCode = Object.fromEntries(controls.map((c) => [c.code, c]));
    renderTiles(overview, fresh);
    renderStatus(overview);
    renderAttention(controls);
    renderActivity(audit.filter((e) => e.action !== "SIGNED_IN").slice(0, 10), fresh);
    renderBand(overview, controls);
  }

  function renderTiles(overview, fresh) {
    tiles.style.setProperty("--fw-count", String(overview.frameworks.length));
    if (tiles.querySelector(".skeleton")) clear(tiles);
    tileByCode = Object.fromEntries([...tiles.querySelectorAll(".fw-tile")].map((t) => [t.dataset.code, t]));
    for (const f of overview.frameworks) {
      const pct = f.total ? Math.round((f.covered / f.total) * 100) : 0;
      let tile = tileByCode[f.code];
      if (!tile) {
        tile = h("article", {
          class: "panel fw-tile", dataset: { code: f.code, pct: String(pct) }, tabindex: "0", role: "link",
          onclick: (e) => { if (!e.target.closest("a")) navigate(`/controls?framework=${f.code}`); },
          onkeydown: (e) => { if (e.key === "Enter") navigate(`/controls?framework=${f.code}`); },
          onpointerenter: () => field?.focusOn(f.code),
          onpointerleave: () => field?.focusOn(null),
        },
          h("header", {},
            h("div", {}, h("h2", {}, f.name), h("p", { class: "version" }, f.version)),
            h("a", {
              class: "btn ghost icon-only sm", href: `/api/reports/${encodeURIComponent(f.code)}`, download: "",
              "aria-label": `Export ${f.name} readiness as CSV`, title: "Export CSV",
            }, icon("download"))),
          h("div", { class: "fw-score" }, h("strong", {}, `${pct}%`), h("span", { class: "of" }), h("span", { class: "delta" })),
          h("div", { class: "meter", "aria-hidden": "true" }, h("i", {})));
        tiles.append(tile);
        tileByCode[f.code] = tile;
      }
      const before = Number(tile.dataset.pct);
      tile.querySelector(".of").textContent = `${f.covered} of ${f.total} requirements`;
      requestAnimationFrame(() => tile.querySelector(".meter > i").style.setProperty("transform", `scaleX(${pct / 100})`));
      if (fresh && before !== pct) {
        countTo(tile.querySelector(".fw-score strong"), before, pct);
        const delta = tile.querySelector(".delta");
        delta.textContent = `${pct > before ? "+" : ""}${pct - before}%`;
        delta.classList.toggle("down", pct < before);
        delta.classList.add("show");
        clearTimeout(delta._t);
        delta._t = setTimeout(() => delta.classList.remove("show"), 4000);
      } else {
        tile.querySelector(".fw-score strong").textContent = `${pct}%`;
      }
      tile.dataset.pct = String(pct);
      tile.setAttribute("aria-label", `${f.name}: ${pct}% of mapped requirements covered. Open its controls.`);
    }
  }

  function renderStatus(overview) {
    const counts = overview.controls;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const bar = h("div", { class: "stack-bar", role: "img", "aria-label": Object.entries(counts).map(([k, v]) => `${v} ${STATUS_LABEL[k]}`).join(", ") },
      Object.entries(counts).map(([k, v]) => {
        if (!v) return null;
        const seg = h("i", { class: k.toLowerCase(), title: `${STATUS_LABEL[k]}: ${v}` });
        seg.style.setProperty("flex-grow", String(v));
        return seg;
      }));
    clear(statusPanel).append(
      h("div", { class: "panel-head" }, h("h2", {}, "Controls"), h("span", { class: "count" }, `${total} in scope`)),
      h("div", { class: "panel-body" }, bar,
        h("div", { class: "legend" }, Object.entries(counts).map(([k, v]) =>
          h("a", { href: `/controls?status=${k}`, "data-link": true }, h("span", { class: "num" }, String(v)), statusBadge(k))))));
  }

  function renderAttention(controls) {
    const items = controls
      .filter((c) => c.status === "EXPIRING" || c.status === "STALE")
      .sort((a, b) => (a.expiresOn || "").localeCompare(b.expiresOn || ""));
    const head = h("div", { class: "panel-head" }, h("h2", {}, "Needs attention"), h("span", { class: "count" }, String(items.length)));
    if (!items.length) {
      clear(attention).append(head, h("div", { class: "empty-state" }, icon("check", "lg"), h("strong", {}, "Nothing expiring"), "All evidence is valid for at least 30 days"));
      return;
    }
    clear(attention).append(head, h("ul", { class: "list" },
      items.map((c) => {
        const days = fmt.daysUntil(c.expiresOn);
        const when = days < 0 ? `Expired ${fmt.date(c.expiresOn)}` : days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
        return h("li", {}, h("a", { class: "attn", href: `/controls/${c.code}`, "data-link": true },
          h("span", { class: "mono" }, c.code),
          h("span", { class: "title" }, c.title),
          h("span", { class: "when" }, when),
          h("span", { class: `pill ${c.status.toLowerCase()}` }, STATUS_LABEL[c.status])));
      })));
  }

  function renderActivity(events, fresh) {
    const head = h("div", { class: "panel-head" }, h("h2", {}, "Activity"),
      h("a", { class: "btn ghost sm", href: "/audit", "data-link": true }, "Audit log"));
    if (!events.length) {
      clear(activity).append(head, h("div", { class: "empty-state" }, h("strong", {}, "No activity yet"), "Evidence changes and exports appear here"));
      return;
    }
    const body = h("div", {});
    let lastDay = null;
    let list = null;
    for (const e of events) {
      const day = dayLabel(e.at);
      if (day !== lastDay) {
        body.append(h("div", { class: "day" }, day));
        list = h("ul", { class: "feed" });
        body.append(list);
        lastDay = day;
      }
      const isNew = fresh && seenAudit && !seenAudit.has(e.id);
      list.append(h("li", { class: isNew ? "fresh" : null },
        h("span", { class: "avatar" }, initials(e.actor)),
        h("span", { class: "what" },
          h("strong", {}, e.actor), " ", ACTION[e.action] || e.action.toLowerCase().replace("_", " "), " ",
          e.control ? h("a", { class: "code-link", href: `/controls/${e.control}`, "data-link": true }, e.control) : null,
          e.action === "REPORT_EXPORTED" ? h("strong", {}, e.detail) : null,
          e.detail && e.action !== "REPORT_EXPORTED" ? h("span", { class: "detail" }, e.detail) : null),
        h("time", { datetime: e.at, title: fmt.dateTime(e.at) }, timeLabel(e.at))));
    }
    seenAudit = new Set(events.map((e) => e.id));
    clear(activity).append(head, body);
  }

  function renderBand(overview, controls) {
    const fws = overview.frameworks.map((f) => f.code);
    const statusByCode = Object.fromEntries(controls.map((c) => [c.code, c.status]));
    if (field) {
      field.updateStatuses(statusByCode);
      return;
    }
    field = new CrosswalkField(band, {
      layout: "band",
      palette: bandPalette,
      idleMs: 2800,
      onArrive: (code, strength) => {
        if (strength < 0.9) return;
        const tile = tileByCode[code];
        if (!tile) return;
        tile.classList.remove("pulse");
        void tile.offsetWidth;
        tile.classList.add("pulse");
      },
      onHover: (node) => {
        if (!node) {
          tip.classList.remove("show");
          return;
        }
        const c = controlsByCode[node.code];
        clear(tip).append(
          h("span", { class: "mono" }, node.code),
          h("strong", {}, c ? c.title : node.code),
          c ? statusBadge(c.status) : null);
        tip.style.setProperty("left", `${Math.min(Math.max(node.x, 100), band.clientWidth - 100)}px`);
        tip.style.setProperty("top", `${node.y}px`);
        tip.classList.add("show");
      },
      onSelect: (code) => navigate(`/controls/${code}`),
    });
    field.setGraph({
      controls: controls.map((c) => ({ code: c.code, status: c.status })),
      frameworks: fws.map((code) => ({ code })),
      edges: controls.flatMap((c, i) => [...new Set(c.refs.map((r) => r.framework))].map((fw) => [i, fws.indexOf(fw)]).filter(([, j]) => j >= 0)),
      anchorX: (j, width) => {
        const tile = tileByCode[fws[j]];
        const stacked = new Set(Object.values(tileByCode).map((t) => Math.round(t.getBoundingClientRect().left))).size < fws.length;
        if (!tile || stacked) return (width * (j + 0.5)) / fws.length;
        const bandRect = band.getBoundingClientRect();
        const r = tile.getBoundingClientRect();
        return r.left - bandRect.left + r.width / 2;
      },
    });
  }

  const onChange = async ({ detail }) => {
    try {
      await load({ fresh: true });
      if (detail.control) field?.fire(detail.control);
    } catch (e) {
      toast(e.message, "error");
    }
  };
  window.addEventListener("cw:change", onChange);
  const ro = new ResizeObserver(() => field?.relayout());
  ro.observe(tiles);
  const clock = setInterval(() => {
    for (const t of activity.querySelectorAll("time")) t.textContent = timeLabel(t.getAttribute("datetime"));
  }, 60_000);

  load().catch((e) => toast(e.message, "error"));

  return () => {
    alive = false;
    clearInterval(clock);
    window.removeEventListener("cw:change", onChange);
    ro.disconnect();
    field?.destroy();
  };
}

function countTo(el, from, to) {
  if (reduceMotion.matches) {
    el.textContent = `${to}%`;
    return;
  }
  const start = performance.now();
  const dur = 650;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${Math.round(from + (to - from) * eased)}%`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function dayLabel(iso) {
  const d = new Date(iso);
  const diff = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}

function timeLabel(iso) {
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (seconds < 3600) return fmt.relative(iso);
  if (seconds < 86_400 * 2) return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
}
