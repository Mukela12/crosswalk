import { h, clear, append, icon, fmt, statusBadge, STATUS_LABEL, FRAMEWORK_SHORT } from "../dom.js";
import { api } from "../api.js";
import { toast } from "../ui.js";
import { highlight } from "../palette.js";
import { openControlDrawer } from "./control-drawer.js";

const STATUSES = ["MET", "EXPIRING", "STALE", "MISSING"];

export function renderControls(root, { params: initialParams, session, navigate, setCrumb }) {
  let params = initialParams;
  const url = new URL(location.href);
  const state = {
    q: url.searchParams.get("q") || "",
    framework: url.searchParams.get("framework") || "",
    status: url.searchParams.get("status") || "",
  };
  const scope = session.scope;
  let rows = [];
  let visible = [];
  let coverage = {};
  let alive = true;
  let drawer = null;
  let searchTimer = 0;

  const search = h("input", {
    class: "input", type: "search", placeholder: "Search by control, title or ref", value: state.q,
    "aria-label": "Search controls", spellcheck: "false", autocomplete: "off",
  });
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = search.value.trim(); sync(); load(); }, 160);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) { search.value = ""; state.q = ""; sync(); load(); }
    if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0); }
  });

  const fwFilter = h("div", { class: "segmented", role: "group", "aria-label": "Framework" });
  const statusFilter = h("div", { class: "segmented", role: "group", "aria-label": "Status" });
  const resultCount = h("span", { class: "result-count", "aria-live": "polite" });
  const tableHost = h("section", { class: "panel" });

  root.append(
    h("div", { class: "toolbar" },
      h("label", { class: "search" }, icon("search"), search, h("kbd", {}, "/")),
      fwFilter, statusFilter, resultCount),
    tableHost);

  function sync() {
    const next = new URL(location.pathname, location.origin);
    for (const [k, v] of Object.entries(state)) if (v) next.searchParams.set(k, v);
    history.replaceState(null, "", next.pathname + next.search);
  }

  function renderFilters() {
    append(clear(fwFilter),
      [["", "All"], ...scope.map((c) => [c, FRAMEWORK_SHORT[c] || c])].map(([value, label]) =>
        h("button", {
          type: "button", "aria-pressed": String(state.framework === value),
          onclick: () => { state.framework = value; sync(); renderFilters(); load(); },
        }, label)));
    const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
    append(clear(statusFilter),
      [["", "Any status"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])].map(([value, label]) =>
        h("button", {
          type: "button", "aria-pressed": String(state.status === value),
          onclick: () => { state.status = value; sync(); renderFilters(); renderTable(); },
        }, label, value ? h("span", { class: "count" }, String(counts[value])) : null)));
  }

  function renderTable(flashCode) {
    visible = rows.filter((r) => !state.status || r.status === state.status);
    resultCount.textContent = `${visible.length} of ${rows.length} controls`;
    const columns = state.framework ? [state.framework] : scope;
    if (!visible.length) {
      clear(tableHost).append(h("div", { class: "empty-state" },
        icon("search", "lg"),
        h("strong", {}, state.q ? `No controls match "${state.q}"` : `No ${(STATUS_LABEL[state.status] || "").toLowerCase()} controls`),
        h("button", {
          class: "btn sm", type: "button",
          onclick: () => { state.q = ""; state.status = ""; search.value = ""; sync(); renderFilters(); load(); },
        }, "Clear filters")));
      return;
    }
    const q = state.q;
    const body = h("tbody", {}, visible.map((r, index) => {
      const refsBy = {};
      for (const ref of r.refs) (refsBy[ref.framework] ||= []).push(ref);
      return h("tr", {
        tabindex: "0", dataset: { code: r.code, index: String(index) }, "aria-selected": String(params[0] === r.code),
        class: flashCode === r.code ? "flash" : null,
        onclick: () => open(r.code),
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r.code); }
          else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); focusRow(index + 1); }
          else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); if (index === 0) search.focus(); else focusRow(index - 1); }
        },
      },
        h("td", {}, h("div", { class: "control-cell" },
          h("span", { class: "mono" }, highlight(r.code, q)), h("span", { class: "name" }, highlight(r.title, q)), h("small", {}, highlight(r.domain, q)))),
        h("td", {}, statusBadge(r.status), r.expiresOn ? h("span", { class: "when" }, expiryText(r)) : null),
        columns.map((fw) => h("td", {},
          refsBy[fw]?.length
            ? h("div", { class: "refs" }, refsBy[fw].map((ref) => h("span", { class: `ref ${r.status.toLowerCase()}`, title: ref.title }, highlight(ref.ref, q))))
            : h("span", { class: "dash", "aria-label": "Not mapped" }, "None"))),
        h("td", { class: "ev" }, String(r.evidenceCount), icon("chevron", "sm")));
    }));
    clear(tableHost).append(h("div", { class: "table-wrap" }, h("table", { class: "matrix" },
      h("thead", {}, h("tr", {},
        h("th", { scope: "col" }, "Control"),
        h("th", { scope: "col" }, "Status"),
        columns.map((fw) => h("th", { scope: "col" }, FRAMEWORK_SHORT[fw] || fw,
          coverage[fw] != null ? h("span", { class: "num", title: "Mapped requirements covered" }, `${coverage[fw]}%`) : null)),
        h("th", { scope: "col" }, "Evidence"))),
      body)));
  }

  function focusRow(i) {
    const rowsEl = tableHost.querySelectorAll("tbody tr");
    if (!rowsEl.length) return;
    rowsEl[Math.max(0, Math.min(rowsEl.length - 1, i))].focus();
  }

  function open(code) {
    navigate(`/controls/${code}${location.search}`);
  }

  async function load(flashCode) {
    const qs = new URLSearchParams();
    if (state.q) qs.set("q", state.q);
    if (state.framework) qs.set("framework", state.framework);
    try {
      const [list, overview] = await Promise.all([api.get(`/api/controls?${qs}`), api.get("/api/overview")]);
      rows = list;
      coverage = Object.fromEntries(overview.frameworks.map((f) => [f.code, f.total ? Math.round((f.covered / f.total) * 100) : 0]));
    } catch (e) {
      toast(e.message, "error");
      return;
    }
    if (!alive) return;
    renderFilters();
    renderTable(flashCode);
  }

  function openDrawer(code) {
    if (drawer && drawer.code === code) return;
    drawer?.close({ silent: true });
    setCrumb(code);
    drawer = openControlDrawer(code, {
      session,
      neighbours: () => {
        const i = visible.findIndex((r) => r.code === code);
        return { prev: i > 0 ? visible[i - 1].code : null, next: i >= 0 ? visible[i + 1]?.code : null };
      },
      go: (other) => open(other),
      onClose: () => {
        drawer = null;
        setCrumb(null);
        navigate(`/controls${location.search}`);
        tableHost.querySelector(`tr[data-code="${code}"]`)?.focus({ preventScroll: true });
      },
      onChanged: () => load(code),
    });
    drawer.code = code;
  }

  const onChange = ({ detail }) => {
    load(detail.control);
    if (drawer && detail.control === params[0]) drawer.refresh();
  };
  const onSlash = (e) => {
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement?.tagName || "") && !document.querySelector("dialog[open], .drawer.open")) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  };
  window.addEventListener("cw:change", onChange);
  document.addEventListener("keydown", onSlash);

  renderFilters();
  tableHost.append(h("div", { class: "panel-body" }, ...Array.from({ length: 6 }, () => h("div", { class: "skeleton" }))));
  load();
  if (params[0]) openDrawer(params[0]);

  return {
    update(next) {
      params = next;
      for (const tr of tableHost.querySelectorAll("tr[data-code]")) {
        tr.setAttribute("aria-selected", String(tr.dataset.code === params[0]));
      }
      if (params[0]) openDrawer(params[0]);
      else if (drawer) { drawer.close({ silent: true }); drawer = null; setCrumb(null); }
    },
    destroy() {
      alive = false;
      clearTimeout(searchTimer);
      window.removeEventListener("cw:change", onChange);
      document.removeEventListener("keydown", onSlash);
      drawer?.close({ silent: true });
    },
  };
}

function expiryText(r) {
  const days = fmt.daysUntil(r.expiresOn);
  if (r.status === "STALE") return `Expired ${fmt.date(r.expiresOn)}`;
  if (days <= 30) return days === 1 ? "1 day left" : `${days} days left`;
  return `Until ${fmt.date(r.expiresOn)}`;
}
