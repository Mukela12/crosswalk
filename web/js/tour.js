// A three-step tour shown once per browser after the first sign-in. Each step spotlights
// a real element; nothing is mocked.
import { h, clear } from "./dom.js";
import { lordicon } from "./lordicon.js";

const KEY = "cw-tour-done";

const STEPS = [
  {
    target: ".crosswalk canvas",
    title: "One control, every framework",
    body: "Each dot is a control and each line maps it to a framework. Hover a dot to see it, click to open it.",
  },
  {
    target: '.nav a[href="/controls"]',
    title: "Add evidence once",
    body: "Open any control to attach a file or link. Every framework it maps to updates together.",
  },
  {
    target: ".live",
    title: "Watch it live",
    body: "Sign in as the auditor in a second window. Changes land there as they happen.",
  },
];

export function tourSeen() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}

export function startTour() {
  let index = 0;
  const spot = h("div", { class: "tour-spot", "aria-hidden": "true" });
  const step = h("span", { class: "step" });
  const title = h("h2", { id: "tour-title" });
  const body = h("p", {});
  const dots = h("div", { class: "tour-dots", "aria-hidden": "true" }, STEPS.map(() => h("i", {})));
  const back = h("button", { class: "btn ghost sm", type: "button", onclick: () => go(index - 1) }, "Back");
  const next = h("button", { class: "btn primary sm", type: "button", onclick: () => (index === STEPS.length - 1 ? end() : go(index + 1)) });
  const card = h("div", { class: "tour-card", role: "dialog", "aria-modal": "false", "aria-labelledby": "tour-title" },
    h("div", { class: "head" }, h("div", { style: null }, lordicon("shield", { size: 28, hover: "self" })),
      h("button", { class: "btn ghost sm", type: "button", onclick: end }, "Skip")),
    step, title, body,
    h("footer", {}, dots, h("div", { class: "form-actions" }, back, next)));
  document.body.append(spot, card);

  function place() {
    const s = STEPS[index];
    const el = document.querySelector(s.target);
    if (!el) return end();
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {});
    spot.style.setProperty("top", `${r.top - pad}px`);
    spot.style.setProperty("left", `${r.left - pad}px`);
    spot.style.setProperty("width", `${r.width + pad * 2}px`);
    spot.style.setProperty("height", `${r.height + pad * 2}px`);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top = r.bottom + 14;
    if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 14);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12);
    if (r.width < 260 && r.right + cw + 24 < innerWidth && r.height < 80) {
      left = r.right + 16;
      top = Math.min(Math.max(12, r.top + r.height / 2 - ch / 2), innerHeight - ch - 12);
    }
    card.style.setProperty("top", `${top}px`);
    card.style.setProperty("left", `${left}px`);
  }

  function go(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[index];
    step.textContent = `${index + 1} of ${STEPS.length}`;
    title.textContent = s.title;
    body.textContent = s.body;
    back.disabled = index === 0;
    clear(next).append(index === STEPS.length - 1 ? "Done" : "Next");
    [...dots.children].forEach((d, n) => d.classList.toggle("on", n === index));
    place();
    next.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  }

  function end() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
    spot.remove();
    card.remove();
  }

  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => go(0));
}
