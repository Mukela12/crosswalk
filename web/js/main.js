import { h, clear, icon, brand, initials, FRAMEWORK_SHORT } from "./dom.js";
import { api } from "./api.js";
import { connectLive, disconnectLive, onLiveState } from "./live.js";
import { toast, themeToggle, aboutDialog, toggleTheme } from "./ui.js";
import { lordicon } from "./lordicon.js";
import { openPalette, prefetchControls } from "./palette.js";
import { startTour, tourSeen } from "./tour.js";
import { renderSignIn } from "./views/signin.js";
import { renderOverview } from "./views/overview.js";
import { renderControls } from "./views/controls.js";
import { renderAudit } from "./views/audit.js";

const app = document.getElementById("app");
const session = { me: null, scope: [] };
let shell = null;
let cleanup = null;
let currentRoute = null;

const ROUTES = [
  { re: /^\/$/, title: "Overview", nav: "/", lordicon: "overview", view: renderOverview },
  { re: /^\/controls(?:\/([A-Z]+-\d+))?\/?$/, title: "Controls", nav: "/controls", lordicon: "controls", view: renderControls },
  { re: /^\/audit\/?$/, title: "Audit log", nav: "/audit", lordicon: "audit", view: renderAudit },
];

export function navigate(url, { replace = false } = {}) {
  if (url === location.pathname + location.search) return route();
  history[replace ? "replaceState" : "pushState"](null, "", url);
  route();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});
window.addEventListener("popstate", () => route());

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && session.me) {
    event.preventDefault();
    openPalette({ navigate, session, actions });
  }
});

window.addEventListener("cw:signed-out", () => {
  if (!session.me) return;
  signedOut();
  toast("Your session ended. Sign in again.");
});

// Changes made by someone else in the same company.
window.addEventListener("cw:change", ({ detail }) => {
  if (detail.type === "reset") {
    toast("Sample data was reset");
    return;
  }
  if (!session.me || detail.actor === session.me.name) return;
  const verb = detail.type === "evidence.added" ? "added evidence to" : "removed evidence from";
  toast(`${detail.actor} ${verb} ${detail.control}`);
});

const actions = {
  toggleTheme,
  tour: () => { navigate("/"); setTimeout(startTour, 500); },
  signOut: async () => {
    try { await api.post("/api/logout"); } catch {}
    signedOut();
  },
};

function signedOut() {
  session.me = null;
  disconnectLive();
  teardown();
  shell?.destroy();
  shell = null;
  navigate("/sign-in", { replace: true });
}

function teardown() {
  if (typeof cleanup === "function") cleanup();
  else if (cleanup) cleanup.destroy();
  cleanup = null;
  currentRoute = null;
}

async function loadSession() {
  session.me = await api.get("/api/session");
  if (!session.me) throw new Error("Signed out");
  session.scope = (await api.get("/api/overview")).frameworks.map((f) => f.code);
  connectLive();
}

async function route() {
  const path = location.pathname;

  if (!session.me) {
    try { await loadSession(); } catch { session.me = null; }
  }

  if (!session.me) {
    teardown();
    shell = null;
    if (path !== "/sign-in") history.replaceState(null, "", "/sign-in");
    document.title = "Sign in | Crosswalk";
    clear(app);
    cleanup = renderSignIn(app, {
      onSignedIn: async () => {
        await loadSession();
        navigate("/", { replace: true });
      },
    });
    return;
  }

  if (path === "/sign-in") return navigate("/", { replace: true });
  const match = ROUTES.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  if (!match) return navigate("/", { replace: true });

  // Same page, new params (opening or closing a control): the view updates in place.
  if (shell && currentRoute === match.r && cleanup && cleanup.update) {
    cleanup.update(match.m.slice(1));
    return;
  }
  teardown();
  if (!shell) shell = buildShell();
  shell.setActive(match.r);
  document.title = `${match.r.title} | Crosswalk`;
  clear(shell.page);
  shell.page.style.setProperty("animation", "none");
  void shell.page.offsetWidth;
  shell.page.style.removeProperty("animation");
  cleanup = match.r.view(shell.page, { params: match.m.slice(1), session, navigate, setCrumb: shell.setCrumb });
  currentRoute = match.r;
  if (match.r.nav === "/" && !tourSeen()) setTimeout(() => { if (currentRoute === match.r) startTour(); }, 1100);
}

function buildShell() {
  clear(app);
  const me = session.me;

  const navLinks = ROUTES.map((r) => {
    const a = h("a", { href: r.nav, "data-link": true, dataset: { nav: r.nav } });
    a.append(lordicon(r.lordicon, { size: 18 }), r.title);
    return a;
  });

  const fwList = h("div", { class: "rail-section", "aria-label": "Framework readiness" }, h("h2", {}, "Readiness"));
  const fwLinks = {};
  for (const code of session.scope) {
    const bar = h("i", {});
    const pct = h("span", { class: "num" }, "");
    fwLinks[code] = { bar, pct };
    fwList.append(h("a", { class: "fw-link", href: `/controls?framework=${code}`, "data-link": true },
      h("span", {}, FRAMEWORK_SHORT[code] || code), pct, h("span", { class: "bar" }, bar)));
  }
  async function refreshScores() {
    try {
      const overview = await api.get("/api/overview");
      for (const f of overview.frameworks) {
        const link = fwLinks[f.code];
        if (!link) continue;
        const p = f.total ? f.covered / f.total : 0;
        link.pct.textContent = `${Math.round(p * 100)}%`;
        link.bar.style.setProperty("transform", `scaleX(${p})`);
      }
    } catch {}
  }
  refreshScores();
  prefetchControls();
  const onChange = () => { refreshScores(); prefetchControls(); };
  window.addEventListener("cw:change", onChange);

  const crumbs = h("div", { class: "crumbs" });
  const live = h("span", { class: "live", "aria-live": "polite" });
  const offLive = onLiveState((state) => {
    live.dataset.state = state;
    live.textContent = { live: "Live", connecting: "Connecting", offline: "Offline" }[state];
    live.title = state === "live" ? "Changes from your team appear as they happen" : "";
  });

  const search = h("button", { class: "search-trigger", type: "button", onclick: () => openPalette({ navigate, session, actions }) },
    icon("search"), h("span", {}, "Search"), h("kbd", {}, navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"));

  const page = h("div", { class: "page", id: "page" });
  app.append(h("div", { class: "shell" },
    h("aside", { class: "rail" },
      h("div", { class: "rail-head" }, brand()),
      h("div", { class: "workspace" },
        h("span", { class: "avatar" }, me.company.slice(0, 1)),
        h("div", {}, h("strong", {}, me.company), h("small", {}, me.industry))),
      search,
      h("nav", { class: "nav", "aria-label": "Main" }, navLinks),
      fwList,
      h("div", { class: "rail-foot" },
        h("div", { class: "me" },
          h("span", { class: "avatar" }, initials(me.name)),
          h("div", {}, h("strong", {}, me.name), h("small", {}, me.role === "LEAD" ? "Compliance lead" : "Auditor, read only")),
          h("button", { class: "btn ghost icon-only sm", type: "button", "aria-label": "Sign out", title: "Sign out", onclick: actions.signOut }, icon("logout"))))),
    h("div", { class: "main" },
      h("header", { class: "topbar" }, crumbs, h("div", { class: "spacer" }), live,
        h("button", { class: "btn ghost icon-only hide-narrow", type: "button", "aria-label": "About", title: "About", onclick: aboutDialog }, icon("info")),
        themeToggle()),
      h("main", {}, page))));

  let currentTitle = null;
  const renderCrumbs = (r, sub) => {
    clear(crumbs);
    if (sub) crumbs.append(h("a", { href: r.nav, "data-link": true }, r.title), icon("chevron", "sm"), h("h1", {}, sub));
    else crumbs.append(h("h1", {}, r.title));
  };

  return {
    page,
    setActive(r) {
      currentTitle = r;
      renderCrumbs(r, null);
      for (const a of navLinks) {
        if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    },
    setCrumb(sub) {
      if (currentTitle) renderCrumbs(currentTitle, sub);
    },
    destroy() {
      window.removeEventListener("cw:change", onChange);
      offLive();
    },
  };
}

route();
