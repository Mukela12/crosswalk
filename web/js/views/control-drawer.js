import { h, clear, append, icon, fmt, statusBadge, FRAMEWORK_SHORT } from "../dom.js";
import { api } from "../api.js";
import { toast, confirmDialog } from "../ui.js";
import { lordicon } from "../lordicon.js";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".csv", ".txt"];
const VALIDITY = [["6 months", 182], ["1 year", 365], ["2 years", 730]];

export function openControlDrawer(code, { session, neighbours, go, onClose, onChanged }) {
  const scrim = h("div", { class: "drawer-scrim" });
  const panel = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": `Control ${code}`, tabindex: "-1" });
  document.body.append(scrim, panel);
  requestAnimationFrame(() => {
    scrim.classList.add("open");
    panel.classList.add("open");
    panel.focus({ preventScroll: true });
  });

  let closed = false;
  let freshId = null;
  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    scrim.classList.remove("open");
    panel.classList.remove("open");
    setTimeout(() => { scrim.remove(); panel.remove(); }, 240);
    if (!silent) onClose();
  }
  function onKey(e) {
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "Escape") { close(); return; }
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName || "");
    if (typing) return;
    const { prev, next } = neighbours();
    if ((e.key === "k" || e.key === "ArrowUp") && prev) { e.preventDefault(); go(prev); }
    if ((e.key === "j" || e.key === "ArrowDown") && next) { e.preventDefault(); go(next); }
  }
  document.addEventListener("keydown", onKey);
  scrim.addEventListener("click", () => close());

  async function refresh() {
    let data;
    try {
      data = await api.get(`/api/controls/${encodeURIComponent(code)}`);
    } catch (e) {
      toast(e.message, "error");
      close();
      return;
    }
    if (!closed) render(data);
  }

  function render({ control: c, evidence, canEdit }) {
    const { prev, next } = neighbours();
    const byFw = {};
    for (const r of c.refs) (byFw[r.framework] ||= []).push(r);
    const formSection = canEdit ? h("section", {}, h("h3", {}, "Add evidence"), addForm(c)) : null;
    const scrollTop = panel.scrollTop;

    clear(panel).append(
      h("header", {},
        h("div", { class: "head-row" },
          h("span", { class: "mono" }, `${c.code}, ${c.domain}`),
          h("button", { class: "btn ghost icon-only sm", type: "button", "aria-label": "Previous control", title: "Previous (K)", disabled: !prev, onclick: () => go(prev) }, icon("up")),
          h("button", { class: "btn ghost icon-only sm", type: "button", "aria-label": "Next control", title: "Next (J)", disabled: !next, onclick: () => go(next) }, icon("down")),
          h("button", { class: "btn ghost icon-only sm", type: "button", "aria-label": "Close", title: "Close (Esc)", onclick: () => close() }, icon("x"))),
        h("h2", {}, c.title),
        h("div", { class: "meta" }, h("span", { class: `pill ${c.status.toLowerCase()}` }, statusBadge(c.status).textContent),
          c.expiresOn ? h("span", {}, c.status === "STALE" ? `Expired ${fmt.date(c.expiresOn)}` : `Valid until ${fmt.date(c.expiresOn)}`) : null,
          canEdit ? null : h("span", { class: "tag" }, "Read only"))),
      h("section", {}, h("p", { class: "desc" }, c.description)),
      h("section", {},
        h("h3", {}, "Maps to", h("span", { class: "faint num" }, `${c.refs.length} requirements`)),
        h("div", { class: "mapping" }, Object.entries(byFw).map(([fw, refs]) =>
          h("div", { class: "fw" },
            h("strong", {}, FRAMEWORK_SHORT[fw] || fw),
            h("ul", {}, refs.map((r) => h("li", {}, h("span", { class: `ref ${c.status.toLowerCase()}` }, r.ref), h("span", {}, r.title)))))))),
      h("section", {},
        h("h3", {}, "Evidence", h("span", { class: "faint num" }, String(evidence.length))),
        evidence.length
          ? h("ul", { class: "evidence" }, evidence.map((e) => evidenceItem(e, canEdit)))
          : h("div", { class: "empty-state" }, h("strong", {}, "No evidence yet"), canEdit ? "Add a file or link below" : "The compliance lead adds evidence here")),
      formSection);
    panel.scrollTop = scrollTop;
    freshId = null;
  }

  function evidenceItem(e, canEdit) {
    const days = fmt.daysUntil(e.expiresOn);
    const state = days < 0 ? "STALE" : days < 30 ? "EXPIRING" : "MET";
    const validity = days < 0 ? `Expired ${fmt.date(e.expiresOn)}` : days < 30 ? `${days} days left` : `Until ${fmt.date(e.expiresOn)}`;
    const open = e.kind === "FILE"
      ? h("a", { class: "btn ghost icon-only sm", href: `/api/evidence/${e.id}/file`, download: "", "aria-label": `Download ${e.fileName}`, title: "Download" }, icon("download"))
      : h("a", { class: "btn ghost icon-only sm", href: e.url, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open link", title: "Open link" }, icon("external"));
    const remove = canEdit ? h("button", {
      class: "btn ghost icon-only sm danger", type: "button", "aria-label": `Remove ${e.title}`, title: "Remove",
      onclick: async () => {
        const ok = await confirmDialog({ title: "Remove this evidence?", body: `${e.title} will be removed from ${code}. The audit log keeps a record of the removal.`, action: "Remove", danger: true });
        if (!ok) return;
        try {
          await api.del(`/api/evidence/${e.id}`);
          toast("Evidence removed", "success");
          await refresh();
          onChanged();
        } catch (err) {
          toast(err.message, "error");
        }
      },
    }, icon("trash")) : null;
    return h("li", { class: e.id === freshId ? "fresh" : null },
      h("span", { class: "glyph" }, icon(e.kind === "FILE" ? "file" : "link")),
      h("div", {}, h("strong", { title: e.title }, e.title),
        h("small", {}, h("span", { class: `status ${state.toLowerCase()}` }, validity),
          h("span", { class: "file" }, e.kind === "FILE" ? `${e.fileName}, ${fmt.bytes(e.sizeBytes)}` : safeHost(e.url)))),
      h("div", { class: "actions" }, open, remove));
  }

  function addForm(c) {
    const today = isoDate(new Date());
    let mode = "file";
    let chosen = null;
    let validity = 365;

    const title = h("input", { class: "input", name: "title", maxlength: "120", required: true, placeholder: `${c.title} evidence`, id: "ev-title" });
    const fileInput = h("input", { type: "file", accept: ACCEPT.join(","), class: "sr-only", tabindex: "-1" });
    const link = h("input", { class: "input", type: "url", name: "url", placeholder: "https://", inputmode: "url", id: "ev-link" });
    const collected = h("input", { class: "input", type: "date", name: "collectedOn", value: today, max: today, required: true, id: "ev-collected" });
    const expires = h("input", { class: "input", type: "date", name: "expiresOn", required: true, id: "ev-expires" });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn primary", type: "submit" }, "Add evidence");

    const dzName = h("strong", {});
    const dzHint = h("small", {});
    const dzAction = h("span", {});
    const dropzone = h("button", { class: "dropzone", type: "button" },
      h("span", { class: "glyph" }, lordicon("upload", { size: 22, hover: "self" })), h("span", {}, dzName, dzHint), dzAction);
    function paintDropzone() {
      dropzone.classList.toggle("has-file", !!chosen);
      dzName.textContent = chosen ? chosen.name : "Drop a file or browse";
      dzHint.textContent = chosen ? fmt.bytes(chosen.size) : "PDF, PNG, JPEG, CSV or TXT, up to 2 MB";
      clear(dzAction);
      if (chosen) {
        dzAction.append(h("span", {
          class: "btn ghost icon-only sm", role: "button", tabindex: "0", "aria-label": "Remove file",
          onclick: (e) => { e.stopPropagation(); chosen = null; fileInput.value = ""; paintDropzone(); },
        }, icon("x")));
      }
    }
    function accept(file) {
      error.textContent = "";
      if (!file) return;
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPT.includes(ext)) { error.textContent = "Upload a PDF, PNG, JPEG, CSV or TXT file"; return; }
      if (file.size > MAX_BYTES) { error.textContent = "Files can be up to 2 MB"; return; }
      chosen = file;
      if (!title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/^\w/, (m) => m.toUpperCase());
      paintDropzone();
    }
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => accept(fileInput.files[0]));
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
    dropzone.addEventListener("drop", (e) => { e.preventDefault(); dropzone.classList.remove("drag"); accept(e.dataTransfer.files[0]); });
    paintDropzone();

    const presets = h("div", { class: "presets", role: "group", "aria-label": "Valid for" });
    function setExpiry() {
      const base = new Date(`${collected.value || today}T00:00:00Z`);
      expires.value = isoDate(new Date(base.getTime() + validity * 86_400_000));
      append(clear(presets), VALIDITY.map(([label, days]) =>
        h("button", { type: "button", "aria-pressed": String(validity === days), onclick: () => { validity = days; setExpiry(); } }, label)));
    }
    collected.addEventListener("change", setExpiry);
    expires.addEventListener("change", () => { validity = 0; append(clear(presets), VALIDITY.map(([label, days]) =>
      h("button", { type: "button", "aria-pressed": "false", onclick: () => { validity = days; setExpiry(); } }, label))); });
    setExpiry();

    const sourceHost = h("div", { class: "field" });
    const toggle = h("div", { class: "segmented", role: "group", "aria-label": "Evidence type" });
    const paintSource = () => {
      append(clear(toggle),
        [["file", "File"], ["link", "Link"]].map(([value, label]) =>
          h("button", { type: "button", "aria-pressed": String(mode === value), onclick: () => { mode = value; error.textContent = ""; paintSource(); } }, label)));
      if (mode === "file") append(clear(sourceHost), dropzone, fileInput);
      else append(clear(sourceHost), h("label", { class: "field-label", for: "ev-link" }, "Link"), link);
    };
    paintSource();

    return h("form", {
      class: "add-form", novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        error.textContent = "";
        if (mode === "file" && !chosen) return void (error.textContent = "Choose a file to upload");
        if (mode === "link" && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link.value.trim())) return void (error.textContent = "Links must start with https://");
        if (!title.value.trim()) { title.focus(); return void (error.textContent = "Give the evidence a title"); }
        if (!expires.value || expires.value <= collected.value) return void (error.textContent = "Valid until must be after the collected date");
        const data = new FormData();
        data.set("title", title.value.trim());
        data.set("collectedOn", collected.value);
        data.set("expiresOn", expires.value);
        if (mode === "file") data.set("file", chosen);
        else data.set("url", link.value.trim());
        submit.disabled = true;
        clear(submit).append(h("span", { class: "spinner" }), "Adding");
        try {
          const saved = await api.form(`/api/controls/${encodeURIComponent(c.code)}/evidence`, data);
          freshId = saved.id;
          toast(`Evidence added to ${c.code}`, "success");
          await refresh();
          panel.querySelector(".evidence li.fresh")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          onChanged();
        } catch (err) {
          error.textContent = err.message;
          submit.disabled = false;
          clear(submit).append("Add evidence");
        }
      },
    },
      toggle,
      sourceHost,
      h("label", { class: "field", for: "ev-title" }, h("span", {}, "Title"), title),
      h("div", { class: "two" },
        h("label", { class: "field", for: "ev-collected" }, h("span", {}, "Collected"), collected),
        h("label", { class: "field", for: "ev-expires" }, h("span", {}, "Valid until"), expires)),
      presets,
      error,
      h("div", { class: "form-actions" }, submit));
  }

  clear(panel).append(h("header", {}, h("div", { class: "head-row" }, h("span", { class: "mono" }, code)), h("div", { class: "skeleton" })));
  refresh();
  return { close, refresh };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return url; }
}
