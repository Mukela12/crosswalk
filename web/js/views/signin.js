import { h, clear, append, icon, brand, initials, FRAMEWORK_SHORT } from "../dom.js";
import { api } from "../api.js";
import { themeToggle, aboutDialog } from "../ui.js";
import { CrosswalkField } from "../field.js";
import { artPalette } from "../palettes.js";
import { GRAPH, REQUIREMENT_COUNT } from "../graph-data.js";

// Public demo accounts. They sign in through the same form and endpoint as anyone else.
const DEMO_PASSWORD = "crosswalk-demo";
const DEMO_ACCOUNTS = [
  { email: "nadia@ledgerly.example", name: "Nadia Brooks", role: "Compliance lead", company: "Ledgerly" },
  { email: "tomas@halvorsen-audit.example", name: "Tomas Lindqvist", role: "External auditor", company: "Ledgerly" },
  { email: "imani@kestrelhealth.example", name: "Imani Mwale", role: "Compliance lead", company: "Kestrel Health" },
];

export function renderSignIn(root, { onSignedIn }) {
  const canvas = h("canvas", { "aria-hidden": "true" });
  const readHead = h("div", { class: "readout-head swap" });
  const readRefs = h("div", { class: "readout-refs swap" });
  const readout = h("div", { class: "readout", "aria-hidden": "true" }, readHead, readRefs);

  const email = h("input", { class: "input", type: "email", name: "email", autocomplete: "username", required: true, id: "email", placeholder: "you@company.com" });
  const password = h("input", { class: "input", type: "password", name: "password", autocomplete: "current-password", required: true, id: "password" });
  const reveal = h("button", { class: "btn ghost icon-only sm", type: "button", "aria-label": "Show password", "aria-pressed": "false" }, icon("eye"));
  reveal.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    reveal.setAttribute("aria-pressed", String(show));
    reveal.setAttribute("aria-label", show ? "Hide password" : "Show password");
    clear(reveal).append(icon(show ? "eye-off" : "eye"));
    password.focus();
  });
  const error = h("p", { class: "form-error", role: "alert" });
  const submit = h("button", { class: "btn primary", type: "submit" }, "Sign in");
  const accountButtons = [];

  function setBusy(busyButton) {
    submit.disabled = !!busyButton;
    for (const b of accountButtons) {
      b.disabled = !!busyButton;
      b.classList.toggle("busy", b === busyButton);
      clear(b.lastElementChild).append(b === busyButton ? h("span", { class: "spinner" }) : icon("chevron"));
    }
    if (busyButton === submit) clear(submit).append(h("span", { class: "spinner" }), "Signing in");
    else if (!busyButton) clear(submit).append("Sign in");
  }

  async function signIn(emailValue, passwordValue, button) {
    error.textContent = "";
    setBusy(button);
    try {
      const me = await api.post("/api/session", { email: emailValue, password: passwordValue });
      await onSignedIn(me);
    } catch (e) {
      error.textContent = e.message;
      setBusy(null);
    }
  }

  const form = h("form", {
    class: "signin-form", novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      if (!email.value.trim() || !password.value) {
        error.textContent = "Enter your email and password";
        (email.value.trim() ? password : email).focus();
        return;
      }
      signIn(email.value.trim(), password.value, submit);
    },
  },
    h("label", { class: "field", for: "email" }, h("span", {}, "Email"), email),
    h("div", { class: "field" }, h("label", { class: "field-label", for: "password" }, "Password"), h("div", { class: "input-wrap" }, password, reveal)),
    error,
    submit);

  for (const a of DEMO_ACCOUNTS) {
    const button = h("button", { class: "demo-account", type: "button" },
      h("span", { class: "avatar lg" }, initials(a.name)),
      h("span", {}, h("strong", {}, a.name), h("small", {}, `${a.role}, ${a.company}`)),
      h("span", { class: "go" }, icon("chevron")));
    button.addEventListener("click", () => {
      email.value = a.email;
      password.value = DEMO_PASSWORD;
      signIn(a.email, DEMO_PASSWORD, button);
    });
    accountButtons.push(button);
  }

  root.append(h("main", { class: "signin" },
    h("section", { class: "signin-art" }, canvas,
      h("p", { class: "art-stat" }, `${GRAPH.controls.length} controls, ${REQUIREMENT_COUNT} requirements, ${GRAPH.frameworks.length} frameworks`),
      readout),
    h("section", { class: "signin-panel" },
      h("div", { class: "signin-top" }, brand("/sign-in"), themeToggle()),
      h("div", { class: "signin-body" },
        h("h1", {}, "Sign in"),
        form,
        h("div", { class: "divider" }, "or try a demo account"),
        h("div", { class: "demo-accounts" }, accountButtons)),
      h("div", { class: "signin-foot" },
        h("span", {}, "Sample data resets every 6 hours"),
        h("button", { class: "btn ghost sm", type: "button", onclick: aboutDialog }, "About")))));

  // The readout names whichever control the artwork is mapping right now.
  const byCode = Object.fromEntries(GRAPH.controls.map((c) => [c.code, c]));
  let swapTimer = 0;
  function showControl(code) {
    const c = byCode[code];
    if (!c) return;
    readHead.classList.add("out");
    readRefs.classList.add("out");
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      clear(readHead).append(h("span", { class: "mono" }, c.code), h("strong", {}, c.title));
      append(clear(readRefs), Object.entries(c.refs).map(([fw, refs]) =>
        h("span", {}, h("b", {}, FRAMEWORK_SHORT[fw] || fw), h("span", { class: "mono" }, refs.join("  ")))));
      readHead.classList.remove("out");
      readRefs.classList.remove("out");
    }, 200);
  }

  const fwIndex = Object.fromEntries(GRAPH.frameworks.map((f, i) => [f.code, i]));
  const label = { SOC2: "SOC 2", ISO27001: "ISO/IEC 27001", HIPAA: "HIPAA Security Rule", PCIDSS: "PCI DSS" };
  const sub = { SOC2: "Trust Services Criteria", ISO27001: "2022, Annex A", HIPAA: "45 CFR 164", PCIDSS: "v4.0.1" };
  const field = new CrosswalkField(canvas, {
    layout: "art", palette: artPalette, idleMs: 2200,
    onFire: (code) => showControl(code),
  });
  field.setGraph({
    controls: GRAPH.controls.map((c) => ({ code: c.code, status: "MET" })),
    frameworks: GRAPH.frameworks.map((f) => ({ code: f.code, label: label[f.code], short: FRAMEWORK_SHORT[f.code], sub: sub[f.code] })),
    edges: GRAPH.controls.flatMap((c, i) => Object.keys(c.refs).map((fw) => [i, fwIndex[fw]])),
  });
  showControl(GRAPH.controls[0].code);
  document.fonts?.ready.then(() => field.relayout());
  const first = setTimeout(() => field.fire(GRAPH.controls[0].code), 500);

  return () => {
    clearTimeout(first);
    clearTimeout(swapTimer);
    field.destroy();
  };
}
