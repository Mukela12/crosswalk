// Lordicon animations played with lottie_light (no eval, so it runs under the strict CSP).
// The player loads lazily on first use, and icons are recoloured to the current text colour,
// then rebuilt when the theme changes.
import { h } from "./dom.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let lottiePromise = null;
const dataCache = new Map();
const live = new Set();

function loadLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  lottiePromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/lottie_light.min.js";
    script.onload = () => resolve(window.lottie);
    script.onerror = reject;
    document.head.append(script);
  });
  return lottiePromise;
}

async function animationData(name) {
  if (!dataCache.has(name)) dataCache.set(name, fetch(`/icons/lordicon/${name}.json`).then((r) => r.json()));
  return structuredClone(await dataCache.get(name));
}

function recolor(node, rgb) {
  if (Array.isArray(node)) {
    for (const n of node) recolor(n, rgb);
    return;
  }
  if (!node || typeof node !== "object") return;
  if ((node.ty === "fl" || node.ty === "st") && node.c && Array.isArray(node.c.k)) {
    const k = node.c.k;
    if (typeof k[0] === "number") node.c.k = [...rgb, k[3] ?? 1];
    else for (const frame of k) if (Array.isArray(frame.s)) frame.s = [...rgb, frame.s[3] ?? 1];
  }
  for (const value of Object.values(node)) if (value && typeof value === "object") recolor(value, rgb);
}

function colorOf(el) {
  const parts = getComputedStyle(el).color.match(/[\d.]+/g) || ["20", "23", "27"];
  return parts.slice(0, 3).map((n) => Number(n) / 255);
}

/**
 * @param {string} name file in /icons/lordicon without .json
 * @param {{size?: number, hover?: Element | "self"}} options element whose hover plays it
 */
export function lordicon(name, { size = 18, hover = null } = {}) {
  const host = h("span", { class: "lordicon", "aria-hidden": "true" });
  host.style.setProperty("--size", `${size}px`);
  let anim = null;

  host.build = async () => {
    if (!host.isConnected) return;
    try {
      const [lottie, data] = await Promise.all([loadLottie(), animationData(name)]);
      recolor(data, colorOf(host));
      anim?.destroy();
      host.replaceChildren();
      anim = lottie.loadAnimation({
        container: host, renderer: "svg", loop: false, autoplay: false, animationData: data,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      anim.goToAndStop(0, true);
    } catch {
      // Icons are decoration; a failed load leaves the label on its own.
    }
  };
  host.play = () => {
    if (anim && !reduceMotion.matches) anim.goToAndPlay(0, true);
  };

  requestAnimationFrame(() => {
    host.build();
    const trigger = hover === "self" ? host : hover || host.parentElement;
    trigger?.addEventListener("pointerenter", host.play);
  });
  live.add(host);
  return host;
}

window.addEventListener("cw:theme", () => {
  for (const host of live) {
    if (!host.isConnected) live.delete(host);
    else requestAnimationFrame(() => host.build());
  }
});
