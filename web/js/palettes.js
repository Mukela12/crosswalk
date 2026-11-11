import { cssVar, rgba } from "./field.js";

/** Overview band: sits on the page background, nodes coloured by control status. */
export function bandPalette() {
  const ink = cssVar("--ink");
  const met = cssVar("--met");
  return {
    line: rgba(ink, 0.09),
    lineActive: (a) => rgba(met, a),
    pulse: (a) => rgba(met, a),
    node: rgba(ink, 0.5),
    anchor: rgba(ink, 0.45),
    anchorFill: cssVar("--bg"),
    status: {
      MET: met,
      EXPIRING: cssVar("--expiring"),
      STALE: cssVar("--stale"),
      MISSING: rgba(ink, 0.35),
    },
    label: null,
    lineDim: rgba(ink, 0.035),
    halo: rgba(ink, 0.08),
    statusLine: (status) => rgba({ MET: met, EXPIRING: cssVar("--expiring"), STALE: cssVar("--stale") }[status] || ink, status === "MISSING" ? 0.3 : 0.62),
  };
}

/** Sign-in panel: always on the dark panel, one accent for pulses. */
export function artPalette() {
  const ink = cssVar("--panel-ink");
  const accent = cssVar("--panel-accent");
  return {
    line: rgba(ink, 0.1),
    lineActive: (a) => rgba(accent, a * 0.8),
    pulse: (a) => rgba(accent, a),
    node: rgba(ink, 0.55),
    anchor: rgba(ink, 0.55),
    anchorFill: cssVar("--panel"),
    status: {},
    label: (a) => rgba(ink, a),
  };
}
