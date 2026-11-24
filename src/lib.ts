export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (Bruls, Huizing, van Wijk). Items should be sorted desc. */
export function squarify<T>(items: { value: number; data: T }[], rect: Rect): (Rect & { data: T })[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const nodes = items
    .filter((i) => i.value > 0)
    .map((i) => ({ area: i.value * scale, data: i.data }))
    .sort((a, b) => b.area - a.area);

  const out: (Rect & { data: T })[] = [];
  let r = { ...rect };
  let row: typeof nodes = [];

  const worst = (row: typeof nodes, side: number) => {
    if (row.length === 0) return Infinity;
    let s = 0, max = 0, min = Infinity;
    for (const n of row) {
      s += n.area;
      if (n.area > max) max = n.area;
      if (n.area < min) min = n.area;
    }
    const s2 = s * s, side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const layoutRow = (row: typeof nodes, r: Rect): Rect => {
    const s = row.reduce((a, n) => a + n.area, 0);
    if (r.w >= r.h) {
      const w = s / r.h;
      let y = r.y;
      for (const n of row) {
        const h = n.area / w;
        out.push({ x: r.x, y, w, h, data: n.data });
        y += h;
      }
      return { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    }
    const h = s / r.w;
    let x = r.x;
    for (const n of row) {
      const w = n.area / h;
      out.push({ x, y: r.y, w, h, data: n.data });
      x += w;
    }
    return { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  };

  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(r.w, r.h);
    const n = nodes[i];
    if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) {
      row.push(n);
      i++;
    } else {
      r = layoutRow(row, r);
      row = [];
    }
  }
  if (row.length) layoutRow(row, r);
  return out;
}

// Pale yellow -> orange -> deep red.
const STOPS: [number, number, number][] = [
  [255, 244, 194],
  [253, 211, 107],
  [249, 154, 62],
  [232, 85, 44],
  [179, 18, 42],
];

/** t in [0,1] -> heat colour. */
export function heat(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(Math.floor(x), STOPS.length - 2);
  const f = x - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Log-scale position of `size` between min and max. */
export function heatT(size: number, min: number, max: number): number {
  if (max <= min) return 1;
  const l = Math.log(Math.max(size, 1));
  return (l - Math.log(Math.max(min, 1))) / (Math.log(max) - Math.log(Math.max(min, 1)));
}

export const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
