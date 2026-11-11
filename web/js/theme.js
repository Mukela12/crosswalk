// Applied before first paint (loaded as a blocking script; inline scripts are blocked by the CSP).
(function () {
  var stored = null;
  try { stored = localStorage.getItem("cw-theme"); } catch (e) {}
  var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
