import { h, icon, clear } from "./dom.js";

export function toast(message, kind = "info") {
  const host = document.getElementById("toasts");
  const glyph = kind === "error" ? "alert" : kind === "success" ? "check" : "info";
  const el = h("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : "status" }, icon(glyph), h("div", {}, message));
  host.append(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 160);
  }, kind === "error" ? 6000 : 4000);
}

export function confirmDialog({ title, body, action, danger = false }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", { "aria-labelledby": "dlg-title" },
      h("div", { class: "dialog-body" }, h("h2", { id: "dlg-title" }, title), body ? h("p", {}, body) : null),
      h("footer", {},
        h("button", { class: "btn", type: "button", onclick: () => dialog.close("cancel") }, "Cancel"),
        h("button", { class: danger ? "btn primary danger-fill" : "btn primary", type: "button", onclick: () => dialog.close("ok") }, action)));
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ok");
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function aboutDialog() {
  const dialog = h("dialog", { "aria-labelledby": "about-title" },
    h("div", { class: "dialog-body" },
      h("h2", { id: "about-title" }, "About Crosswalk"),
      h("p", {}, "Each control maps to every framework requirement it satisfies, so one piece of evidence counts everywhere it applies."),
      h("p", {}, "Sample companies and evidence reset every 6 hours."),
      h("div", { class: "about-stack" },
        ["Spring Boot 4", "Java 21", "Postgres row-level security", "Vanilla JS", "Canvas", "Cloudflare Workers", "Railway"].map((t) => h("span", { class: "tag" }, t)))),
    h("footer", {},
      h("a", { class: "btn", href: "https://github.com/Mukela12/crosswalk", target: "_blank", rel: "noopener noreferrer" }, icon("external"), "Source"),
      h("button", { class: "btn primary", type: "button", onclick: () => dialog.close() }, "Close")));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("cw-theme", next); } catch {}
  window.dispatchEvent(new CustomEvent("cw:theme"));
}

export function themeToggle() {
  const btn = h("button", { class: "btn ghost icon-only", type: "button" });
  const paint = () => {
    const dark = currentTheme() === "dark";
    clear(btn).append(icon(dark ? "sun" : "moon"));
    btn.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    btn.title = dark ? "Light theme" : "Dark theme";
  };
  btn.addEventListener("click", toggleTheme);
  window.addEventListener("cw:theme", paint);
  paint();
  return btn;
}
