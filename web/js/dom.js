// Every node is built with DOM APIs and text goes in through text nodes, so data from the
// API is never parsed as HTML. Nothing in this app turns strings into markup.
const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "text") el.textContent = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, ...children);
  return el;
}

export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function icon(name, cls = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `icon ${cls}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

/** One control fanning out to three frameworks. */
export function mark() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("fill", "none");
  g.setAttribute("stroke", "currentColor");
  g.setAttribute("stroke-width", "1.8");
  g.setAttribute("stroke-linecap", "round");
  for (const d of ["M5 12C12 12 12 5 19 5", "M5 12h14", "M5 12C12 12 12 19 19 19"]) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    g.append(p);
  }
  svg.append(g);
  for (const [cx, cy, r] of [[5, 12, 2.6], [19, 5, 2], [19, 12, 2], [19, 19, 2]]) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", r);
    c.setAttribute("fill", "currentColor");
    svg.append(c);
  }
  return svg;
}

export function brand(href = "/") {
  return h("a", { class: "brand", href, "data-link": true }, mark(), "Crosswalk");
}

export function initials(name) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const fmt = {
  /** "2027-03-12" -> "12 Mar 2027" */
  date(iso) {
    return iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : "";
  },
  dateTime(iso) {
    return timeFmt.format(new Date(iso));
  },
  /** Days from today (UTC) to a date string. */
  daysUntil(iso) {
    const today = new Date();
    const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return Math.round((Date.parse(`${iso}T00:00:00Z`) - t) / 86_400_000);
  },
  relative(iso) {
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    const abs = Math.abs(seconds);
    if (abs < 45) return "just now";
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
    if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), "day");
    return timeFmt.format(new Date(iso));
  },
  bytes(n) {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  },
};

export const STATUS_LABEL = { MET: "Met", EXPIRING: "Expiring", STALE: "Stale", MISSING: "Missing" };

export function statusBadge(status, extra) {
  return h("span", { class: `status ${status.toLowerCase()}` }, STATUS_LABEL[status], extra);
}

export const FRAMEWORK_SHORT = { SOC2: "SOC 2", ISO27001: "ISO 27001", HIPAA: "HIPAA", PCIDSS: "PCI DSS" };
