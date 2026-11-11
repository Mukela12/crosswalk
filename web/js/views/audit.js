import { h, clear, append, icon, fmt, initials } from "../dom.js";
import { api } from "../api.js";
import { toast } from "../ui.js";

const ACTION = {
  EVIDENCE_ADDED: ["Added evidence", "upload"],
  EVIDENCE_REMOVED: ["Removed evidence", "trash"],
  SIGNED_IN: ["Signed in", "login"],
  REPORT_EXPORTED: ["Exported report", "download"],
};
const FILTERS = [
  ["all", "All", () => true],
  ["evidence", "Evidence", (e) => e.action.startsWith("EVIDENCE")],
  ["exports", "Exports", (e) => e.action === "REPORT_EXPORTED"],
  ["access", "Sign-ins", (e) => e.action === "SIGNED_IN"],
];

export function renderAudit(root) {
  const initial = new URL(location.href).searchParams.get("show");
  let filter = FILTERS.some(([k]) => k === initial) ? initial : "all";
  let events = [];
  let alive = true;
  let seen = null;

  const filters = h("div", { class: "segmented", role: "group", "aria-label": "Show" });
  const count = h("span", { class: "result-count" });
  const host = h("section", { class: "panel" });
  root.append(h("div", { class: "toolbar" }, filters, count), host);

  function paintFilters() {
    append(clear(filters), FILTERS.map(([key, label, test]) =>
      h("button", {
        type: "button", "aria-pressed": String(filter === key),
        onclick: () => {
          filter = key;
          const url = new URL(location.href);
          if (key === "all") url.searchParams.delete("show"); else url.searchParams.set("show", key);
          history.replaceState(null, "", url.pathname + url.search);
          paintFilters();
          paint(false);
        },
      }, label, key === "all" ? null : h("span", { class: "count" }, String(events.filter(test).length)))));
  }

  function paint(fresh) {
    const test = FILTERS.find(([k]) => k === filter)[2];
    const shown = events.filter(test);
    count.textContent = `${shown.length} events`;
    if (!shown.length) {
      clear(host).append(h("div", { class: "empty-state" }, h("strong", {}, "Nothing here yet"), "Activity of this kind appears as it happens"));
      return;
    }
    const body = h("tbody", {});
    let lastDay = null;
    for (const e of shown) {
      const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(e.at));
      if (day !== lastDay) {
        body.append(h("tr", { class: "day-row" }, h("td", { colspan: "5" }, day)));
        lastDay = day;
      }
      const [label, glyph] = ACTION[e.action] || [e.action, "info"];
      body.append(h("tr", { class: fresh && seen && !seen.has(e.id) ? "flash" : null },
        h("td", { class: "time" }, h("time", { datetime: e.at, title: fmt.relative(e.at) },
          new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(e.at)))),
        h("td", {}, h("span", { class: "who" }, h("span", { class: "avatar" }, initials(e.actor)), e.actor)),
        h("td", {}, h("span", { class: "act" }, icon(glyph, "sm"), label)),
        h("td", {}, e.control ? h("a", { class: "code-link", href: `/controls/${e.control}`, "data-link": true }, e.control) : null),
        h("td", { class: "detail", title: e.detail || "" }, e.detail || "")));
    }
    seen = new Set(events.map((e) => e.id));
    clear(host).append(h("div", { class: "table-wrap" }, h("table", { class: "log" },
      h("thead", {}, h("tr", {}, ["Time", "Who", "Action", "Control", "Detail"].map((t) => h("th", { scope: "col" }, t)))),
      body)));
  }

  async function load(fresh = false) {
    try {
      events = await api.get("/api/audit?limit=300");
    } catch (e) {
      toast(e.message, "error");
      return;
    }
    if (!alive) return;
    paintFilters();
    paint(fresh);
  }

  const onChange = () => load(true);
  window.addEventListener("cw:change", onChange);
  paintFilters();
  host.append(h("div", { class: "panel-body" }, ...Array.from({ length: 8 }, () => h("div", { class: "skeleton" }))));
  load();
  return () => {
    alive = false;
    window.removeEventListener("cw:change", onChange);
  };
}
