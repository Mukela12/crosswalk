// Command palette (Cmd/Ctrl+K): jump to any control by code, title or requirement ref,
// move between pages, export a framework, switch theme or sign out.
import { h, icon, clear, statusBadge, FRAMEWORK_SHORT } from "./dom.js";
import { api } from "./api.js";

let dialogEl = null;
let controlsCache = null;
let pending = null;

/** Loads controls ahead of time so the palette opens with results. */
export function prefetchControls() {
  pending = api.get("/api/controls").then((list) => { controlsCache = list; return list; }).catch(() => controlsCache);
  return pending;
}

export function highlight(text, query) {
  if (!query) return [text];
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return [text];
  return [text.slice(0, i), h("mark", {}, text.slice(i, i + query.length)), text.slice(i + query.length)];
}

export async function openPalette({ navigate, session, actions }) {
  if (dialogEl) return;
  const input = h("input", { type: "text", placeholder: "Search controls, requirements and pages", "aria-label": "Search", autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "true", "aria-controls": "palette-list" });
  const list = h("div", { class: "palette-list", id: "palette-list", role: "listbox" });
  dialogEl = h("dialog", { class: "palette", "aria-label": "Command palette" },
    h("div", { class: "palette-input" }, icon("search", "lg"), input, h("kbd", {}, "esc")),
    list,
    h("div", { class: "palette-foot", "aria-hidden": "true" },
      h("span", {}, h("kbd", {}, "↑"), h("kbd", {}, "↓"), "Move"),
      h("span", {}, h("kbd", {}, "↵"), "Open"),
      h("span", {}, h("kbd", {}, "esc"), "Close")));
  document.body.append(dialogEl);
  dialogEl.addEventListener("close", () => { dialogEl.remove(); dialogEl = null; });
  dialogEl.addEventListener("click", (e) => { if (e.target === dialogEl) dialogEl.close(); });
  dialogEl.showModal();
  input.focus();

  let controls = controlsCache || [];
  let loading = !controlsCache;
  let items = [];
  let active = 0;

  const pages = [
    { label: "Overview", icon: "overview", run: () => navigate("/") },
    { label: "Controls", icon: "controls", run: () => navigate("/controls") },
    { label: "Audit log", icon: "audit", run: () => navigate("/audit") },
  ];
  const commands = [
    ...session.scope.map((code) => ({
      label: `Export ${FRAMEWORK_SHORT[code] || code} readiness`, hint: "CSV", icon: "download",
      run: () => { const a = h("a", { href: `/api/reports/${code}`, download: "" }); document.body.append(a); a.click(); a.remove(); },
    })),
    { label: "Switch theme", icon: "moon", run: actions.toggleTheme },
    { label: "Show the tour", icon: "info", run: actions.tour },
    { label: "Sign out", icon: "logout", run: actions.signOut },
  ];

  function render() {
    const q = input.value.trim().toLowerCase();
    const match = (s) => s.toLowerCase().includes(q);
    const ctrl = controls.filter((c) => !q || match(c.code) || match(c.title) || match(c.domain) || c.refs.some((r) => match(r.ref)));
    const pg = pages.filter((p) => !q || match(p.label));
    const cmd = commands.filter((c) => !q || match(c.label));
    items = [];
    clear(list);
    const group = (title, entries, build) => {
      if (!entries.length) return;
      list.append(h("div", { class: "palette-group", role: "presentation" }, title));
      for (const entry of entries) {
        const index = items.length;
        const row = build(entry);
        row.id = `pal-${index}`;
        row.setAttribute("role", "option");
        row.addEventListener("pointermove", () => select(index, false));
        row.addEventListener("click", () => choose(index));
        items.push({ row, run: entry.run });
        list.append(row);
      }
    };
    group("Controls", ctrl.slice(0, q ? 12 : 6), (c) => {
      const refHit = q && !match(c.code) && !match(c.title) ? c.refs.find((r) => match(r.ref)) : null;
      c.run = () => navigate(`/controls/${c.code}`);
      return h("div", { class: "palette-item" },
        h("span", { class: "mono" }, c.code.split("-")[0]),
        h("span", { class: "label" }, highlight(c.title, q),
          h("small", {}, refHit ? [FRAMEWORK_SHORT[refHit.framework], " ", highlight(refHit.ref, q)] : highlight(c.code, q))),
        statusBadge(c.status));
    });
    group("Go to", pg, (p) => h("div", { class: "palette-item" }, icon(p.icon), h("span", { class: "label" }, highlight(p.label, q)), null));
    group("Actions", cmd, (c) => h("div", { class: "palette-item" }, icon(c.icon), h("span", { class: "label" }, highlight(c.label, q)), c.hint ? h("kbd", {}, c.hint) : null));
    if (loading && !ctrl.length) list.prepend(h("div", { class: "palette-group", role: "presentation" }, "Controls"), h("div", { class: "palette-item", "aria-disabled": "true" }, h("span", { class: "spinner" }), h("span", { class: "label faint" }, "Loading controls"), null));
    else if (!items.length) list.append(h("p", { class: "palette-empty" }, `Nothing matches "${input.value.trim()}"`));
    select(0, false);
  }

  function select(index, scroll = true) {
    if (!items.length) return;
    active = (index + items.length) % items.length;
    items.forEach((it, i) => it.row.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `pal-${active}`);
    if (scroll) items[active].row.scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    const item = items[index];
    if (!item) return;
    dialogEl.close();
    item.run();
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); select(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); select(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(active); }
  });

  render();
  try {
    controls = (await (controlsCache ? prefetchControls() : pending || prefetchControls())) || [];
  } catch {}
  loading = false;
  if (dialogEl) render();
}
