// Jarvis Core: a rotating particle sphere linked to module nodes. Pure canvas, no libraries.
// States: online, listening, thinking, speaking. setLevel(0..1) drives the speaking pulse.
const LIME = [200, 243, 107];
const WHITE = [245, 245, 243];

export function createCore(canvas, { nodes = [], onNode, onCore } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0, t = 0, state = 'online', level = 0, smooth = 0;
  // Fibonacci sphere
  const N = 360, pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  // Link each point to its two nearest neighbours once.
  const links = [];
  for (let i = 0; i < N; i++) {
    const d = pts.map((p, j) => [j, (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2 + (p[2] - pts[i][2]) ** 2]).sort((a, b) => a[1] - b[1]);
    for (const [j] of d.slice(1, 3)) if (j > i) links.push([i, j]);
  }
  const sparks = nodes.map((_, i) => ({ k: Math.random(), speed: 0.0025 + Math.random() * 0.003, dir: i % 2 ? 1 : -1 }));

  function layout() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Place nodes on two arcs, left and right of the core.
    const left = nodes.filter((n) => n.side === 'left'), right = nodes.filter((n) => n.side !== 'left');
    const place = (list, side) => list.forEach((n, i) => {
      const f = list.length === 1 ? 0.5 : i / (list.length - 1);
      const y = H * (0.13 + f * 0.72);
      const bow = Math.sin(f * Math.PI);
      n.x = side === 'left' ? W * (0.08 + bow * 0.14) : W * (0.92 - bow * 0.14);
      n.y = y;
      if (n.el) { n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; }
    });
    if (W < 640) { nodes.forEach((n) => { if (n.el) n.el.style.display = 'none'; }); } else { nodes.forEach((n) => { if (n.el) n.el.style.display = ''; }); place(left, 'left'); place(right, 'right'); }
  }

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function frame() {
    t += reduce ? 0.2 : 1;
    smooth += (level - smooth) * 0.2;
    const cx = W / 2, cy = H / 2;
    const base = Math.min(W, H) * (W < 640 ? 0.36 : 0.27);
    const pulse = state === 'speaking' ? 1 + smooth * 0.14 : state === 'listening' ? 1 + Math.sin(t * 0.08) * 0.03 : 1 + Math.sin(t * 0.02) * 0.012;
    const R = base * pulse;
    const spin = (state === 'thinking' ? 0.012 : 0.0035) * (reduce ? 0.3 : 1);
    const ay = t * spin, ax = 0.35 + Math.sin(t * 0.004) * 0.12;
    ctx.clearRect(0, 0, W, H);

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    const g = state === 'online' ? 0.22 : 0.38 + smooth * 0.3;
    glow.addColorStop(0, rgba(LIME, g)); glow.addColorStop(0.35, rgba(LIME, g * 0.35)); glow.addColorStop(1, rgba(LIME, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2); ctx.fill();

    // Links from nodes to core, with travelling sparks.
    nodes.forEach((n, i) => {
      if (n.x == null || W < 640) return;
      const ex = cx + (n.x < cx ? -1 : 1) * R * 0.98, ey = cy + (n.y - cy) * 0.25;
      const c1x = n.x + (ex - n.x) * 0.5, c1y = n.y, c2x = n.x + (ex - n.x) * 0.6, c2y = ey;
      ctx.strokeStyle = rgba(WHITE, n.active ? 0.22 : 0.1); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey); ctx.stroke();
      const s = sparks[i];
      s.k += s.speed * (state === 'thinking' ? 3 : 1) * (reduce ? 0.3 : 1);
      if (s.k > 1) s.k = 0;
      const k = s.dir > 0 ? s.k : 1 - s.k, m = 1 - k;
      const px = m ** 3 * n.x + 3 * m * m * k * c1x + 3 * m * k * k * c2x + k ** 3 * ex;
      const py = m ** 3 * n.y + 3 * m * m * k * c1y + 3 * m * k * k * c2y + k ** 3 * ey;
      const sg = ctx.createRadialGradient(px, py, 0, px, py, 6);
      sg.addColorStop(0, rgba(LIME, 0.95)); sg.addColorStop(1, rgba(LIME, 0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    });

    // Sphere
    const cyA = Math.cos(ay), syA = Math.sin(ay), cxA = Math.cos(ax), sxA = Math.sin(ax);
    const proj = pts.map(([x, y, z]) => {
      const x1 = x * cyA + z * syA, z1 = -x * syA + z * cyA;
      const y1 = y * cxA - z1 * sxA, z2 = y * sxA + z1 * cxA;
      const wob = state === 'speaking' ? 1 + Math.sin(x * 6 + t * 0.2) * smooth * 0.05 : 1;
      return [cx + x1 * R * wob, cy + y1 * R * wob, z2];
    });
    ctx.lineWidth = 0.6;
    for (const [i, j] of links) {
      const a = proj[i], b = proj[j], depth = (a[2] + b[2]) / 2;
      ctx.strokeStyle = rgba(WHITE, 0.05 + (depth + 1) * 0.11);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (const [x, y, z] of proj) {
      const f = (z + 1) / 2;
      ctx.fillStyle = f > 0.72 ? rgba(LIME, 0.55 + f * 0.45) : rgba(WHITE, 0.2 + f * 0.6);
      ctx.beginPath(); ctx.arc(x, y, 0.7 + f * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // Orbit ring while thinking or listening
    if (state !== 'online') {
      ctx.strokeStyle = rgba(LIME, 0.75); ctx.lineWidth = 2;
      const st = t * (state === 'thinking' ? 0.06 : 0.025);
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, st, st + (state === 'thinking' ? 1.4 : 0.6)); ctx.stroke();
      if (state === 'listening') { ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, st + Math.PI, st + Math.PI + 0.6); ctx.stroke(); }
    }
    if (canvas.isConnected) raf = requestAnimationFrame(frame); else stop();
  }

  const ro = new ResizeObserver(layout);
  ro.observe(canvas);
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - W / 2, dy = e.clientY - r.top - H / 2;
    if (Math.hypot(dx, dy) < Math.min(W, H) * 0.32) onCore && onCore();
  });
  nodes.forEach((n) => n.el && n.el.addEventListener('click', () => onNode && onNode(n)));
  function stop() { cancelAnimationFrame(raf); ro.disconnect(); }
  layout(); frame();
  return { setState: (s) => { state = s; }, setLevel: (v) => { level = Math.max(0, Math.min(1, v)); }, stop };
}
