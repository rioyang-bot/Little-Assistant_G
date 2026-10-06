const { PNG } = require('pngjs');

// A clockwise open-circle arrow (↻) for native menus, drawn at 32 px for a
// 16 px menu icon. Native menus need images; text glyphs would not align.
function refreshIconPng(color = [255, 255, 255]) {
  const size = 32, centre = 16, radius = 10, stroke = 2.6, samples = 4;
  const png = new PNG({ width: size, height: size });
  const end = -95 * Math.PI / 180;                       // arc ends just left of the top
  const tangent = [-Math.sin(end), Math.cos(end)];       // clockwise direction at the end
  const normal = [Math.cos(end), Math.sin(end)];
  const tip = [centre + radius * normal[0], centre + radius * normal[1]];
  const head = [
    [tip[0] + tangent[0] * 6, tip[1] + tangent[1] * 6],
    [tip[0] - tangent[0] * 1.5 + normal[0] * 5, tip[1] - tangent[1] * 1.5 + normal[1] * 5],
    [tip[0] - tangent[0] * 1.5 - normal[0] * 5, tip[1] - tangent[1] * 1.5 - normal[1] * 5]
  ];
  const side = (p, a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const inHead = p => { const s1 = side(p, head[0], head[1]), s2 = side(p, head[1], head[2]), s3 = side(p, head[2], head[0]); return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); };
  const inArc = ([x, y]) => {
    const angle = Math.atan2(y - centre, x - centre) * 180 / Math.PI;
    return Math.abs(Math.hypot(x - centre, y - centre) - radius) <= stroke / 2 && !(angle > -95 && angle < -25);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let covered = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const point = [x + (sx + 0.5) / samples, y + (sy + 0.5) / samples];
      if (inArc(point) || inHead(point)) covered++;
    }
    const offset = (y * size + x) * 4;
    png.data[offset] = color[0]; png.data[offset + 1] = color[1]; png.data[offset + 2] = color[2];
    png.data[offset + 3] = Math.round(255 * covered / (samples * samples));
  }
  return PNG.sync.write(png);
}

const cache = new Map();
function refreshMenuIcon(nativeImage, dark) {
  if (!nativeImage) return undefined;
  const key = dark ? 'dark' : 'light';
  if (!cache.has(key)) cache.set(key, nativeImage.createFromBuffer(refreshIconPng(dark ? [255, 255, 255] : [32, 32, 32]), { scaleFactor: 2 }));
  return cache.get(key);
}

module.exports = { refreshIconPng, refreshMenuIcon };
