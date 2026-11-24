import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TreeNode, Verdict } from "./types";
import { classify, formatBytes, heatT, squarify, type Category, type Rect } from "./lib";

/** What the pointer is on. Folders and files carry the chain from the scan root down to them. */
export type Focus =
  | { kind: "node"; node: TreeNode; chain: TreeNode[]; cat: Category; verdict?: Verdict }
  | { kind: "other"; parent: TreeNode; size: number; count: number };

interface Tile extends Rect {
  key: string;
  depth: number;
  group: boolean;
  t: number;
  cat: Category;
  verdict?: Verdict;
  focus: Focus;
}

interface Props {
  /** Scan root down to the folder on screen. */
  trail: TreeNode[];
  /** How many folder levels to draw inside each other. */
  depth: number;
  /** Scan threshold; the faintest heat. */
  floor: number;
  rootCategory: Category;
  verdictFor: (path: string) => Verdict | undefined;
  onDrill: (chain: TreeNode[]) => void;
  onFocus: (f: Focus) => void;
  onReveal: (path: string) => void;
}

const HEADER = 18; // folder title strip
const MIN_GROUP_W = 52;
const MIN_GROUP_H = HEADER + 22;

function layout(
  trail: TreeNode[],
  box: Rect,
  maxDepth: number,
  floor: number,
  rootCat: Category,
  verdictFor: Props["verdictFor"],
): Tile[] {
  const out: Tile[] = [];
  const current = trail[trail.length - 1];
  const top = current.size;

  const visit = (node: TreeNode, chain: TreeNode[], rect: Rect, depth: number, cat: Category, verdict?: Verdict) => {
    const items: { value: number; data: TreeNode | null }[] = node.children.map((c) => ({ value: c.size, data: c }));
    if (node.other > 0) items.push({ value: node.other, data: null });
    const gap = depth === 0 ? 3 : 1;

    for (const r of squarify(items, rect)) {
      const w = r.w - gap;
      const h = r.h - gap;
      if (w < 2 || h < 2) continue;
      const c = r.data;
      if (!c) {
        out.push({
          x: r.x, y: r.y, w, h,
          key: node.path + "\0other",
          depth, group: false, t: 0, cat, verdict,
          focus: { kind: "other", parent: node, size: node.other, count: node.other_count },
        });
        continue;
      }
      const cCat = classify(c, cat);
      const cVerdict = verdictFor(c.path) ?? verdict;
      const cChain = [...chain, c];
      const nest = c.is_dir && c.children.length > 0 && depth + 1 < maxDepth && w >= MIN_GROUP_W && h >= MIN_GROUP_H;
      out.push({
        x: r.x, y: r.y, w, h,
        key: c.path,
        depth, group: nest, t: heatT(c.size, floor, top), cat: cCat, verdict: cVerdict,
        focus: { kind: "node", node: c, chain: cChain, cat: cCat, verdict: cVerdict },
      });
      if (nest) {
        visit(c, cChain, { x: r.x + 2, y: r.y + HEADER, w: w - 3, h: h - HEADER - 1 }, depth + 1, cCat, cVerdict);
      }
    }
  };

  visit(current, trail, box, 0, rootCat, verdictFor(current.path));
  return out;
}

function Treemap({ trail, depth, floor, rootCategory, verdictFor, onDrill, onFocus, onReveal }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const zoomFrom = useRef<Rect | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const current = trail[trail.length - 1];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = useMemo(
    () => (size.w > 0 ? layout(trail, { x: 0, y: 0, w: size.w, h: size.h }, depth, floor, rootCategory, verdictFor) : []),
    [trail, size, depth, floor, rootCategory, verdictFor],
  );

  // Drilling in grows the clicked tile to fill the map; going back or up settles in place.
  const shown = useRef(current);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || shown.current === current) return;
    shown.current = current;
    const from = zoomFrom.current;
    zoomFrom.current = null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !size.w) return;
    if (from) {
      layer.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(${from.w / size.w}, ${from.h / size.h})`, opacity: 0.55 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    } else {
      layer.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 140, easing: "ease-out" });
    }
  }, [current, size]);

  const tileAt = (target: EventTarget | null): Tile | undefined => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-i]");
    return el ? tiles[Number(el.dataset.i)] : undefined;
  };

  const lastFocus = useRef<string | null>(null);

  return (
    <div className="treemap" ref={ref} aria-label={`Contents of ${current.name}`}>
      {size.w > 0 && tiles.length === 0 && (
        <div className="empty">Nothing in this folder is 100 MB or larger.</div>
      )}
      <div
        className="layer"
        ref={layerRef}
        onMouseMove={(e) => {
          const t = tileAt(e.target);
          if (!t || t.key === lastFocus.current) return;
          lastFocus.current = t.key;
          onFocus(t.focus);
        }}
        onClick={(e) => {
          const t = tileAt(e.target);
          if (!t || t.focus.kind !== "node") return;
          const n = t.focus.node;
          if (n.is_dir && (n.children.length > 0 || n.other > 0)) {
            zoomFrom.current = { x: t.x, y: t.y, w: t.w, h: t.h };
            onDrill(t.focus.chain);
          } else {
            onReveal(n.path);
          }
        }}
        onContextMenu={(e) => {
          const t = tileAt(e.target);
          if (!t) return;
          e.preventDefault();
          onReveal(t.focus.kind === "node" ? t.focus.node.path : t.focus.parent.path);
        }}
      >
        {tiles.map((t, i) => {
          const f = t.focus;
          const cls = [
            "tile",
            `c-${t.cat}`,
            t.group ? "group" : "leaf",
            f.kind === "other" ? "other" : f.node.is_dir ? "dir" : "file",
            t.verdict === "safe" ? "reclaim" : t.verdict === "your-call" ? "maybe" : "",
          ].join(" ");
          const style = { left: t.x, top: t.y, width: t.w, height: t.h, "--t": t.t.toFixed(3) } as React.CSSProperties;
          const name = f.kind === "node" ? f.node.name : `${f.count.toLocaleString()} small items`;
          const bytes = formatBytes(f.kind === "node" ? f.node.size : f.size);

          let label = null;
          if (t.group) {
            label = (
              <div className="hd">
                <span className="n">{name}</span>
                {t.w > 96 && <span className="s">{bytes}</span>}
              </div>
            );
          } else if (t.w >= 44 && t.h >= 32) {
            label = (
              <div className="lb">
                <span className="n">{name}</span>
                <span className="s">{bytes}</span>
              </div>
            );
          } else if (t.w >= 36 && t.h >= 17) {
            label = (
              <div className="lb">
                <span className="n">{name}</span>
              </div>
            );
          }
          return (
            <div key={t.key} data-i={i} className={cls} style={style}>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(Treemap);
