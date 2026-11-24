import { useEffect, useMemo, useRef, useState } from "react";
import type { TreeNode, Verdict } from "./types";
import { formatBytes, heat, heatT, squarify } from "./lib";

type Tile = { kind: "node"; node: TreeNode } | { kind: "other"; size: number; count: number };

interface Props {
  node: TreeNode;
  onDrill: (child: TreeNode) => void;
  onOpen: (path: string) => void;
  onHover: (text: string | null) => void;
  verdictFor: (path: string) => Verdict | undefined;
}

const BADGE: Record<Verdict, string> = { safe: "Safe to clean", "your-call": "Your call", keep: "Keep" };

export default function Treemap({ node, onDrill, onOpen, onHover, verdictFor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = useMemo(() => {
    const items: { value: number; data: Tile }[] = node.children.map((c) => ({
      value: c.size,
      data: { kind: "node", node: c },
    }));
    if (node.other > 0) items.push({ value: node.other, data: { kind: "other", size: node.other, count: node.other_count } });
    return squarify(items, { x: 0, y: 0, w: size.w, h: size.h });
  }, [node, size]);

  const [min, max] = useMemo(() => {
    const s = node.children.map((c) => c.size);
    return s.length ? [Math.min(...s), Math.max(...s)] : [1, 1];
  }, [node]);

  return (
    <div className="treemap" ref={ref}>
      {tiles.length === 0 && size.w > 0 && <div className="empty">Nothing here at or above the size threshold.</div>}
      {tiles.map((t) => {
        const style = { left: t.x, top: t.y, width: t.w, height: t.h };
        const showLabel = t.w > 56 && t.h > 30;
        if (t.data.kind === "other") {
          const label = `Other small items (${t.data.count.toLocaleString()})`;
          return (
            <div
              key="__other"
              className="tile other"
              style={style}
              onMouseEnter={() => onHover(`${label} — ${formatBytes(t.data.kind === "other" ? t.data.size : 0)}`)}
              onMouseLeave={() => onHover(null)}
            >
              {showLabel && (
                <div className="label">
                  <span className="name">{label}</span>
                  <span className="size">{formatBytes(t.data.size)}</span>
                </div>
              )}
            </div>
          );
        }
        const n = t.data.node;
        const tt = heatT(n.size, min, max);
        const drillable = n.is_dir && (n.children.length > 0 || n.other > 0);
        const verdict = verdictFor(n.path);
        return (
          <div
            key={n.path}
            className={`tile ${drillable ? "drill" : ""}`}
            style={{ ...style, background: heat(0.15 + tt * 0.85), color: tt > 0.5 ? "#fff" : "#3b2a00" }}
            title={`${n.path}\n${formatBytes(n.size)}${n.is_dir ? ` · ${n.files.toLocaleString()} files` : ""}\n${
              drillable ? "Click to open · " : "Click to show in Explorer · "
            }Right-click: show in Explorer`}
            onClick={() => (drillable ? onDrill(n) : onOpen(n.path))}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpen(n.path);
            }}
            onMouseEnter={() => onHover(`${n.path} — ${formatBytes(n.size)}`)}
            onMouseLeave={() => onHover(null)}
          >
            {showLabel && (
              <div className="label">
                <span className="name">
                  {n.is_dir ? "" : "📄 "}
                  {n.name}
                </span>
                <span className="size">{formatBytes(n.size)}</span>
                {verdict && t.h > 52 && <span className={`badge v-${verdict}`}>{BADGE[verdict]}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
