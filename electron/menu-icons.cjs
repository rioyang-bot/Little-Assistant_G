const { PNG } = require('pngjs');

// Native menus need images: icons are drawn at 32 px for a 16 px menu slot.
// A shape is a function (x, y) => 1 (ink), -1 (cut through ink) or 0.
const SIZE = 32, SAMPLES = 4;

function draw(shape, color) {
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let covered = 0;
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
      if (shape(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES) > 0) covered++;
    }
    const offset = (y * SIZE + x) * 4;
    png.data[offset] = color[0]; png.data[offset + 1] = color[1]; png.data[offset + 2] = color[2];
    png.data[offset + 3] = Math.round(255 * covered / (SAMPLES * SAMPLES));
  }
  return PNG.sync.write(png);
}

// Combine shapes: any cut wins, otherwise any ink.
const union = (...shapes) => (x, y) => {
  let ink = 0;
  for (const shape of shapes) { const value = shape(x, y); if (value < 0) return -1; if (value > 0) ink = 1; }
  return ink;
};
const ring = (cx, cy, r, width, from = -180, to = 180) => (x, y) => {
  const angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
  return Math.abs(Math.hypot(x - cx, y - cy) - r) <= width / 2 && angle >= from && angle <= to ? 1 : 0;
};
const disc = (cx, cy, r, value = 1) => (x, y) => Math.hypot(x - cx, y - cy) <= r ? value : 0;
const box = (x0, y0, x1, y1, radius = 0, value = 1) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
  const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius)), dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
  return Math.hypot(dx, dy) <= radius ? value : 0;
};
const segment = (ax, ay, bx, by, width, value = 1) => (x, y) => {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) <= width / 2 ? value : 0;
};
const triangle = (a, b, c) => (x, y) => {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s1 = side(a, b), s2 = side(b, c), s3 = side(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0) ? 1 : 0;
};

// A padlock scaled into the box (x, y, size); `open` lifts the shackle's left leg.
function lock(x0, y0, size, open) {
  const s = size / 32, p = (x, y) => [x0 + x * s, y0 + y * s];
  const shackleY = open ? 9 : 13, stroke = 3 * s;
  const [cx, cy] = p(16, shackleY);
  return union(
    ring(cx, cy, 6 * s, stroke, -180, 0),
    segment(...p(22, shackleY), ...p(22, 16), stroke),
    segment(...p(10, shackleY), ...p(10, open ? shackleY + 1.5 : 16), stroke),
    box(...p(7, 15), ...p(25, 29), 2.5 * s),
    disc(...p(16, 21), 2 * s, -1),
    box(...p(15.1, 21), ...p(16.9, 25.5), 0, -1)
  );
}
// An almond-shaped eye; `slashed` adds a diagonal bar with a clear margin.
function eye(slashed, cx = 16, cy = 16, scale = 1) {
  const w = 13 * scale, h = 7.5 * scale, stroke = 2.4 * scale;
  const lens = inset => (x, y) => {
    const t = (x - cx) / (w - inset);
    if (Math.abs(t) > 1) return false;
    return Math.abs(y - cy) <= (h - inset) * (1 - t * t);
  };
  const outline = (x, y) => lens(0)(x, y) && !lens(stroke)(x, y) ? 1 : 0;
  if (!slashed) return union(outline, disc(cx, cy, 3.6 * scale));
  // The hidden variant keeps only the outline; a cut iris leaves stray specks.
  const drawing = outline;
  const a = [cx - 11 * scale, cy - 11 * scale], b = [cx + 11 * scale, cy + 11 * scale];
  const bar = segment(...a, ...b, 2.6 * scale), margin = segment(...a, ...b, 6 * scale);
  // The bar sits in a cleared band so it reads clearly against the outline.
  return (x, y) => bar(x, y) ? 1 : margin(x, y) ? 0 : drawing(x, y);
}

const SHAPES = {
  // Clockwise open-circle arrow (↻).
  refresh: (() => {
    const end = -95 * Math.PI / 180, tangent = [-Math.sin(end), Math.cos(end)], normal = [Math.cos(end), Math.sin(end)];
    const tip = [16 + 10 * normal[0], 16 + 10 * normal[1]];
    return union(ring(16, 16, 10, 2.6, -180, -95), ring(16, 16, 10, 2.6, -25, 180), triangle(
      [tip[0] + tangent[0] * 6, tip[1] + tangent[1] * 6],
      [tip[0] - tangent[0] * 1.5 + normal[0] * 5, tip[1] - tangent[1] * 1.5 + normal[1] * 5],
      [tip[0] - tangent[0] * 1.5 - normal[0] * 5, tip[1] - tangent[1] * 1.5 - normal[1] * 5]));
  })(),
  locked: lock(0, 0, 32, false),
  unlocked: lock(0, 0, 32, true),
  visible: eye(false),
  hidden: eye(true)
};
// Organizer list entries: eye (shown) or slashed eye (hidden), with a small
// padlock badge in the lower right when the board is locked.
function boardShape(visible, locked) {
  const base = eye(!visible, 14, 12, 0.85);
  if (!locked) return base;
  const badge = lock(15, 13, 18, false);
  const clearance = box(14, 13, 32, 32, 3, -1);
  return (x, y) => badge(x, y) > 0 ? 1 : clearance(x, y) < 0 ? 0 : base(x, y);
}

function iconPng(name, color = [255, 255, 255]) {
  const match = /^board:(visible|hidden):(locked|unlocked)$/.exec(name);
  const shape = match ? boardShape(match[1] === 'visible', match[2] === 'locked') : SHAPES[name];
  if (!shape) throw new Error('Unknown menu icon: ' + name);
  return draw(shape, color);
}
const refreshIconPng = color => iconPng('refresh', color);

const cache = new Map();
function menuIcon(nativeImage, name, dark = true) {
  if (!nativeImage) return undefined;
  const key = `${name}:${dark ? 'dark' : 'light'}`;
  if (!cache.has(key)) cache.set(key, nativeImage.createFromBuffer(iconPng(name, dark ? [255, 255, 255] : [32, 32, 32]), { scaleFactor: 2 }));
  return cache.get(key);
}

module.exports = { iconPng, refreshIconPng, menuIcon };
