import type { TreeNode } from "./types";

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

/** 2_100_000 -> "2.1M". For headline counts where the exact number adds nothing. */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
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

/** Squarified treemap (Bruls, Huizing, van Wijk). */
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

/** Log-scale position of `size` between the scan threshold and the size of the folder on screen. */
export function heatT(size: number, floor: number, top: number): number {
  if (top <= floor) return 1;
  const t = Math.log(Math.max(size, floor) / floor) / Math.log(top / floor);
  return Math.max(0, Math.min(1, t));
}

// ---- Categories -------------------------------------------------------------
// A hint inferred from names, not a verdict. A folder that matches nothing
// inherits its parent's category, so `Steam\steamapps\common\Foo` stays "Games".

export type Category = "system" | "apps" | "games" | "code" | "cache" | "media" | "docs" | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  system: "System",
  apps: "Apps",
  games: "Games",
  code: "Code",
  cache: "Cache",
  media: "Media",
  docs: "Documents",
  other: "Other",
};

/** Legend order. */
export const CATEGORIES: Category[] = ["apps", "games", "code", "cache", "media", "docs", "system", "other"];

const DIR_RULES: [Category, RegExp][] = [
  // Cache first: a cache inside a game or app folder is still a cache.
  [
    "cache",
    /^(cache|caches|cache2|cache_data|code cache|gpucache|grshadercache|shadercache|dxcache|glcache|nv_cache|d3dscache|temp|tmp|crashdumps|crashpad|npm-cache|pnpm-store|\.cache|inetcache|webcache|package cache|cachedextensionvsixs|cacheddata|ota-artifacts|softwaredistribution|deliveryoptimization)$/,
  ],
  [
    "system",
    /^(windows|windows\.old|\$recycle\.bin|system volume information|recovery|\$windows\.~bt|\$winreagent|programdata|winsxs|driverstore|perflogs)$/,
  ],
  [
    "games",
    /^(steam|steamapps|steamlibrary|epic games|xboxgames|riot games|gog galaxy|gog games|ubisoft|ubisoft game launcher|battle\.net|ea games|ea app|origin games|games|rockstar games)$/,
  ],
  [
    "code",
    /^(source|repos|projects|dev|code|node_modules|\.git|\.cargo|\.rustup|\.gradle|\.m2|\.nuget|\.android|android|sdk|\.vscode|\.vscode-server|jetbrains|microsoft visual studio|windows kits|docker|wsl|python\d*|go|devtools|\.npm|\.bun)$/,
  ],
  ["media", /^(videos|pictures|music|photos|camera roll|movies|obs|captures|screenshots|recordings)$/],
  ["docs", /^(documents|desktop|downloads|onedrive.*|dropbox|google drive|books)$/],
  ["apps", /^(program files|program files \(x86\)|programs|windowsapps|appdata|applications)$/],
];

const FILE_RULES: [Category, RegExp][] = [
  ["system", /^(pagefile|hiberfil|swapfile)\.sys$|\.(sys|vhdx?|etl|dmp)$/],
  ["media", /\.(mp4|mkv|mov|avi|wmv|webm|m4v|mts|mp3|flac|wav|aac|ogg|m4a|jpe?g|png|gif|heic|raw|cr2|nef|arw|psd|tiff?)$/],
  ["docs", /\.(pdf|docx?|xlsx?|pptx?|txt|epub|zip|7z|rar|tar|gz)$/],
  ["apps", /\.(exe|msi|msix|appx|iso|dll)$/],
  ["games", /\.(pak|vpk|bundle|bsa|ba2|forge)$/],
];

export function classify(node: TreeNode, inherited: Category): Category {
  const name = node.name.toLowerCase();
  for (const [cat, re] of node.is_dir ? DIR_RULES : FILE_RULES) if (re.test(name)) return cat;
  return inherited;
}

const norm = (p: string) => p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

/** Chain of nodes from `root` down to the node at `path`, or null if it isn't in this tree. */
export function findChain(root: TreeNode, path: string): TreeNode[] | null {
  const want = norm(path);
  const chain = [root];
  let cur = root;
  while (norm(cur.path) !== want) {
    const next = cur.children.find((c) => {
      const p = norm(c.path);
      return want === p || want.startsWith(p + "\\");
    });
    if (!next) return null;
    chain.push(next);
    cur = next;
  }
  return chain;
}
