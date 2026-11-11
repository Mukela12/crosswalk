// The Canvas background renderer: controls on one side, frameworks on the other, a curve for
// every mapping. When evidence lands on a control, a pulse runs down each of its curves at
// once, which is the product's idea drawn literally: one piece of evidence, many frameworks.
//
// Redraws only while something moves, pauses off-screen and in hidden tabs, scales for
// high-DPI screens, and draws a still frame under prefers-reduced-motion.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function rgba(hex, alpha) {
  const v = hex.trim().replace("#", "");
  const n = parseInt(v.length === 3 ? v.split("").map((c) => c + c).join("") : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class CrosswalkField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{layout: "band" | "art", palette: () => object, idleMs?: number, onArrive?: (fw: string) => void}} options
   */
  constructor(canvas, { layout = "band", palette, idleMs = 0, onArrive, onHover, onSelect, onFire } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.layout = layout;
    this.readPalette = palette;
    this.palette = palette();
    this.idleMs = idleMs;
    this.onArrive = onArrive;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.onFire = onFire;
    this.focusControl = -1;
    this.focusFramework = -1;
    this.controls = [];
    this.frameworks = [];
    this.edges = [];
    this.pulses = [];
    this.raf = 0;
    this.idleTimer = 0;
    this.visible = true;
    this.last = performance.now();

    this.frame = this.frame.bind(this);
    this.onTheme = () => {
      this.palette = this.readPalette();
      this.draw();
    };
    window.addEventListener("cw:theme", this.onTheme);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.kick();
    });
    this.io.observe(canvas);

    if (onHover || onSelect) {
      this.onMove = (e) => this.pointer(e);
      this.onLeave = () => this.setFocusControl(-1);
      this.onClick = (e) => {
        const i = this.hit(e);
        if (i >= 0) this.onSelect?.(this.controls[i].code);
      };
      canvas.addEventListener("pointermove", this.onMove);
      canvas.addEventListener("pointerleave", this.onLeave);
      canvas.addEventListener("click", this.onClick);
    }
  }

  /** Index of the control node under the pointer, or -1. */
  hit(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = -1, bestD = Infinity;
    this.controls.forEach((c, i) => {
      const d = this.vertical ? Math.hypot((x - c.x) * 0.5, y - c.y) : Math.hypot(x - c.x, (y - c.y) * 0.45);
      if (d < bestD) { bestD = d; best = i; }
    });
    const spacing = this.controls.length > 1 ? Math.abs(this.controls[1].x - this.controls[0].x) || 20 : 20;
    return bestD <= Math.max(10, Math.min(16, spacing / 2)) ? best : -1;
  }

  pointer(e) {
    this.setFocusControl(this.hit(e));
  }

  setFocusControl(i) {
    if (i === this.focusControl) return;
    this.focusControl = i;
    this.canvas.classList.toggle("pointing", i >= 0);
    const c = this.controls[i];
    this.onHover?.(c ? { ...c, x: c.x, y: c.y } : null);
    this.draw();
  }

  /** Highlight every mapping into one framework (or clear with null). */
  focusOn(frameworkCode) {
    const j = frameworkCode == null ? -1 : this.frameworks.findIndex((f) => f.code === frameworkCode);
    if (j === this.focusFramework) return;
    this.focusFramework = j;
    this.draw();
  }

  /**
   * @param {{controls: {code: string, status?: string}[], frameworks: {code: string, label?: string, sub?: string}[],
   *          edges: [number, number][], anchorX?: (index: number, width: number) => number}} graph
   */
  setGraph({ controls, frameworks, edges, anchorX }) {
    this.controls = controls.map((c) => ({ ...c, glow: 0 }));
    this.frameworks = frameworks.map((f) => ({ ...f, glow: 0 }));
    this.edges = edges.map(([c, f]) => ({ c, f, glow: 0 }));
    this.anchorX = anchorX;
    this.resize();
    this.scheduleIdle();
  }

  updateStatuses(statusByCode) {
    for (const c of this.controls) if (statusByCode[c.code]) c.status = statusByCode[c.code];
    this.draw();
  }

  relayout() {
    this.layoutNodes();
    this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    this.layoutNodes();
    this.draw();
  }

  layoutNodes() {
    const { w, h } = this;
    if (!w) return;
    const n = this.controls.length;
    const m = this.frameworks.length;
    this.vertical = this.layout === "art" && w >= 520;

    if (this.vertical) {
      // Leave room at the bottom for the readout card on the sign-in panel.
      const top = Math.max(64, h * 0.09), bottom = h - Math.max(150, h * 0.15);
      this.controls.forEach((c, i) => {
        c.x = Math.max(64, w * 0.2);
        c.y = top + ((bottom - top) * i) / Math.max(1, n - 1);
      });
      this.frameworks.forEach((f, j) => {
        f.x = Math.min(w - 150, w * 0.64);
        f.y = top + (bottom - top) * (0.14 + (0.72 * j) / Math.max(1, m - 1));
      });
    } else {
      const pad = this.layout === "art" ? 20 : 10;
      const topY = this.layout === "art" ? 28 : 10;
      const bottomY = this.layout === "art" ? h - 100 : h - 7;
      this.controls.forEach((c, i) => {
        c.x = pad + ((w - 2 * pad) * (i + 0.5)) / n;
        c.y = topY;
      });
      this.frameworks.forEach((f, j) => {
        f.x = this.anchorX ? this.anchorX(j, w) : (w * (j + 0.5)) / m;
        f.y = bottomY;
      });
    }

    for (const e of this.edges) {
      const a = this.controls[e.c], b = this.frameworks[e.f];
      if (this.vertical) {
        const dx = b.x - a.x;
        e.p = [a, { x: a.x + dx * 0.5, y: a.y }, { x: b.x - dx * 0.5, y: b.y }, b];
      } else {
        const dy = b.y - a.y;
        e.p = [a, { x: a.x, y: a.y + dy * 0.6 }, { x: b.x, y: b.y - dy * 0.55 }, b];
      }
    }
  }

  /** Light every mapping of one control and send a pulse down each. */
  fire(code, { strength = 1 } = {}) {
    const ci = this.controls.findIndex((c) => c.code === code);
    if (ci < 0) return;
    const control = this.controls[ci];
    control.glow = strength;
    this.onFire?.(code, strength);
    const now = performance.now();
    this.edges.forEach((e) => {
      if (e.c !== ci) return;
      e.glow = Math.max(e.glow, strength);
      if (reduceMotion.matches) {
        this.frameworks[e.f].glow = strength;
        this.onArrive?.(this.frameworks[e.f].code, strength);
      } else {
        this.pulses.push({ edge: e, start: now + Math.random() * 120, dur: 1100 + Math.random() * 350, strength });
      }
    });
    if (reduceMotion.matches) this.draw();
    else this.kick();
  }

  kick() {
    if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const decay = Math.pow(0.5, dt / 520);

    this.pulses = this.pulses.filter((p) => {
      const t = (now - p.start) / p.dur;
      if (t < 1) return true;
      const fw = this.frameworks[p.edge.f];
      fw.glow = Math.max(fw.glow, p.strength);
      this.onArrive?.(fw.code, p.strength);
      return false;
    });
    let active = this.pulses.length > 0;
    for (const list of [this.edges, this.controls, this.frameworks]) {
      for (const item of list) {
        if (item.glow > 0.004) {
          item.glow *= this.pulses.some((p) => p.edge === item) ? 1 : decay;
          active = true;
        } else item.glow = 0;
      }
    }
    this.draw(now);
    if (active) this.kick();
  }

  draw(now = performance.now()) {
    const { ctx, w, h, palette: p } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);

    const focusing = this.focusControl >= 0 || this.focusFramework >= 0;
    const inFocus = (e) => e.c === this.focusControl || e.f === this.focusFramework;
    const ordered = focusing ? [...this.edges.filter((e) => !inFocus(e)), ...this.edges.filter(inFocus)] : this.edges;
    for (const e of ordered) {
      if (!e.p) continue;
      if (e.glow > 0) {
        ctx.strokeStyle = p.lineActive(Math.min(1, 0.18 + e.glow * 0.7));
        ctx.lineWidth = 1.25;
      } else if (focusing && inFocus(e)) {
        const status = this.controls[e.c].status;
        ctx.strokeStyle = p.statusLine ? p.statusLine(status) : p.lineActive(0.6);
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = focusing && p.lineDim ? p.lineDim : p.line;
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.moveTo(e.p[0].x, e.p[0].y);
      ctx.bezierCurveTo(e.p[1].x, e.p[1].y, e.p[2].x, e.p[2].y, e.p[3].x, e.p[3].y);
      ctx.stroke();
    }

    for (const pulse of this.pulses) {
      const t = (now - pulse.start) / pulse.dur;
      if (t < 0) continue;
      const [a, b, c, d] = pulse.edge.p;
      for (let k = 6; k >= 0; k--) {
        const tt = easeInOut(Math.max(0, Math.min(1, t - k * 0.018)));
        const pt = cubic(a, b, c, d, tt);
        ctx.fillStyle = p.pulse((1 - k / 7) * pulse.strength);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, k === 0 ? 2.6 : 2.2 - k * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.controls.forEach((c, i) => {
      const color = p.status[c.status] || p.node;
      const focused = i === this.focusControl;
      if (focused) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = p.halo || "rgba(127,127,127,0.15)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(c.x, c.y, (focused ? 3.6 : 2.6) + c.glow * 1.6, 0, Math.PI * 2);
      if (c.status === "MISSING") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (this.vertical && p.label) {
        ctx.font = "500 10px 'Plex Mono', ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = c.glow > 0 ? p.label(0.5 + c.glow * 0.5) : p.label(0.32);
        ctx.fillText(c.code, c.x - 10, c.y);
      }
    });

    for (const f of this.frameworks) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.anchorFill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = f.glow > 0 ? p.pulse(0.35 + f.glow * 0.65) : p.anchor;
      ctx.stroke();
      if (f.glow > 0) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4.5 + f.glow * 7, 0, Math.PI * 2);
        ctx.strokeStyle = p.pulse(f.glow * 0.35);
        ctx.stroke();
      }
      if (this.layout === "art" && p.label && f.label) {
        ctx.textBaseline = "middle";
        if (this.vertical) {
          ctx.textAlign = "left";
          ctx.font = "500 13px 'Plex Sans', ui-sans-serif, sans-serif";
          ctx.fillStyle = p.label(0.9);
          ctx.fillText(f.label, f.x + 16, f.y - 8);
          ctx.font = "400 10.5px 'Plex Mono', ui-monospace, monospace";
          ctx.fillStyle = p.label(0.45);
          ctx.fillText(f.sub || "", f.x + 16, f.y + 9);
        } else {
          ctx.textAlign = "center";
          ctx.font = "500 11.5px 'Plex Sans', ui-sans-serif, sans-serif";
          ctx.fillStyle = p.label(0.85);
          ctx.fillText(f.label, f.x, f.y + 20);
        }
      }
    }
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (!this.idleMs || reduceMotion.matches) return;
    this.idleTimer = setTimeout(() => {
      if (this.visible && !document.hidden && this.controls.length) {
        const pool = this.controls.filter((c) => c.status !== "MISSING");
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick) this.fire(pick.code, { strength: this.layout === "art" ? 1 : 0.45 });
      }
      this.scheduleIdle();
    }, this.idleMs * (0.7 + Math.random() * 0.6));
  }

  destroy() {
    if (this.onMove) {
      this.canvas.removeEventListener("pointermove", this.onMove);
      this.canvas.removeEventListener("pointerleave", this.onLeave);
      this.canvas.removeEventListener("click", this.onClick);
    }
    cancelAnimationFrame(this.raf);
    clearTimeout(this.idleTimer);
    this.ro.disconnect();
    this.io.disconnect();
    window.removeEventListener("cw:theme", this.onTheme);
  }
}
