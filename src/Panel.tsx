import { useState } from "react";
import type { CleanupItem, Drive, TreeNode, Verdict } from "./types";
import type { Focus } from "./Treemap";
import { CATEGORY_LABEL, formatBytes, formatCount, type Category } from "./lib";
import * as I from "./icons";

interface Props {
  current: TreeNode;
  currentCategory: Category;
  currentVerdict?: Verdict;
  focus: Focus | null;
  scanTotal: number;
  drive: Drive;
  items: CleanupItem[] | null;
  itemsError: string | null;
  onDrill: (chain: TreeNode[]) => void;
  onReveal: (path: string) => void;
  onClean: (item: CleanupItem) => Promise<string>;
}

const VERDICT: Record<Verdict, string> = { safe: "Safe to clean", "your-call": "Your call", keep: "Keep" };

export default function Panel(p: Props) {
  return (
    <aside className="panel">
      <div className="panel-scroll">
        <Selection {...p} />
        <Worth items={p.items} error={p.itemsError} onReveal={p.onReveal} onClean={p.onClean} />
      </div>
      <Disk drive={p.drive} />
    </aside>
  );
}

function Selection({ current, currentCategory, currentVerdict, focus, scanTotal, onDrill, onReveal }: Props) {
  if (focus?.kind === "other") {
    const share = focus.parent.size ? focus.size / focus.parent.size : 0;
    return (
      <section className="sel" aria-live="polite">
        <h2>Selection</h2>
        <div className="sel-name">{formatCount(focus.count)} small items</div>
        <div className="sel-path">{focus.parent.path}</div>
        <Size bytes={focus.size} share={share} />
        <p className="sel-note">Files and folders under 100 MB each, grouped so the map stays readable.</p>
      </section>
    );
  }

  const node = focus?.node ?? current;
  const cat = focus?.cat ?? currentCategory;
  const verdict = focus ? focus.verdict : currentVerdict;
  const parent = focus ? focus.chain[focus.chain.length - 2] : undefined;
  const share = parent?.size ? node.size / parent.size : 1;
  const drillable = node.is_dir && (node.children.length > 0 || node.other > 0) && focus;

  return (
    <section className="sel" aria-live="polite">
      <h2>{focus ? "Selection" : "This folder"}</h2>
      <div className="sel-name">{node.name}</div>
      <div className="sel-path">{node.path}</div>
      <Size bytes={node.size} share={share} />
      <dl className="facts">
        <div>
          <dt>{parent ? `Of ${parent.name.replace(/[\\/]$/, "")}` : "Of scan"}</dt>
          <dd>{pct(parent ? share : node.size / Math.max(1, scanTotal))}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{node.is_dir ? formatCount(node.files) : "1"}</dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>
            <i className={`swatch c-${cat}`} />
            {CATEGORY_LABEL[cat]}
          </dd>
        </div>
        <div>
          <dt>Cleanup</dt>
          <dd>{verdict ? VERDICT[verdict] : "No advice"}</dd>
        </div>
      </dl>
      <div className="row-actions">
        {drillable && (
          <button onClick={() => onDrill(focus.chain)}>Open</button>
        )}
        <button onClick={() => onReveal(node.path)}>
          <I.Reveal /> Show in Explorer
        </button>
      </div>
    </section>
  );
}

function Size({ bytes, share }: { bytes: number; share: number }) {
  const [v, unit] = formatBytes(bytes).split(" ");
  return (
    <div className="sel-size">
      <div className="num">
        {v}
        <span>{unit}</span>
      </div>
      <div className="meter" role="presentation">
        <i style={{ width: `${Math.max(0.5, share * 100)}%` }} />
      </div>
    </div>
  );
}

const pct = (x: number) => (x >= 0.995 ? "100%" : x >= 0.1 ? `${Math.round(x * 100)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : "<0.1%");

/** Shortens a long path from the middle, keeping the drive and the folders nearest the end. */
function shortPath(p: string, max = 40): string {
  if (p.length <= max) return p;
  const parts = p.split("\\");
  let tail = parts[parts.length - 1];
  for (let i = parts.length - 2; i > 0; i--) {
    const next = parts[i] + "\\" + tail;
    if (parts[0].length + 3 + next.length > max) break;
    tail = next;
  }
  return `${parts[0]}\\…\\${tail}`;
}

function Worth({
  items,
  error,
  onReveal,
  onClean,
}: {
  items: CleanupItem[] | null;
  error: string | null;
  onReveal: (path: string) => void;
  onClean: (item: CleanupItem) => Promise<string>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ path: string; text: string } | null>(null);

  if (error) {
    return (
      <section className="worth">
        <h2>Cleanup</h2>
        <p className="err">Couldn't check the known caches: {error}</p>
      </section>
    );
  }
  if (!items) {
    return (
      <section className="worth">
        <h2>Cleanup</h2>
        <ul className="worth-list" aria-busy="true">
          {[0, 1, 2].map((i) => <li key={i} className="skeleton" />)}
        </ul>
      </section>
    );
  }

  const bySize = (v: Verdict) => items.filter((i) => i.rule.verdict === v && i.size > 0).sort((a, b) => b.size - a.size);
  const total = (list: CleanupItem[]) => list.reduce((s, i) => s + i.size, 0);
  const safe = bySize("safe");
  const maybe = bySize("your-call");
  const kept = bySize("keep");

  const clean = async (item: CleanupItem) => {
    setBusy(true);
    try {
      setMessage({ path: item.path, text: await onClean(item) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const row = (i: CleanupItem) => {
    const isOpen = open === i.path;
    return (
      <li key={i.path} className={`worth-item ${isOpen ? "open" : ""}`}>
        <button className="worth-row" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : i.path); setConfirm(null); }}>
          <span className="w-title">{i.rule.title}</span>
          <span className="w-size">{formatBytes(i.size)}</span>
          <span className="w-path" title={i.path}>{shortPath(i.path)}</span>
        </button>
        {isOpen && (
          <div className="worth-detail">
            <p>{i.rule.explanation}</p>
            {/* With a Clean button there's nothing to explain; without one, say how to free it by hand. */}
            {!i.can_delete && <p className="how">{i.rule.how_to_free}</p>}
            {message?.path === i.path && <p className="done" role="status">{message.text}</p>}
            {confirm === i.path ? (
              <div className="confirm" role="alertdialog" aria-label="Confirm clean">
                <p>
                  {i.rule.action === "empty_recycle_bin"
                    ? <>Empty the Recycle Bin? <b>{formatBytes(i.size)}</b> can't be restored afterwards.</>
                    : <>Permanently delete <b>{formatBytes(i.size)}</b> ({formatCount(i.files)} files)? The folder stays; files in use are skipped.</>}
                </p>
                <div className="row-actions">
                  <button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="danger" disabled={busy} onClick={() => clean(i)} autoFocus>
                    {busy ? "Cleaning…" : i.rule.action === "empty_recycle_bin" ? "Empty bin" : "Clean"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row-actions">
                <button onClick={() => onReveal(i.path)}>
                  <I.Reveal /> Show in Explorer
                </button>
                {i.can_delete && (
                  <button className="danger-outline" onClick={() => setConfirm(i.path)}>
                    {i.rule.action === "empty_recycle_bin" ? "Empty bin…" : "Clean…"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const group = (v: Verdict, list: CleanupItem[]) =>
    list.length > 0 && (
      <section className={`worth-group g-${v}`}>
        <h2>
          <span className="g-name">
            <i className={`vmark v-${v}`} />
            {VERDICT[v]}
          </span>
          <span className="h-aside">{formatBytes(total(list))}</span>
        </h2>
        <ul className="worth-list">{list.map(row)}</ul>
      </section>
    );

  return (
    <div className="worth">
      {safe.length + maybe.length + kept.length === 0 && (
        <>
          <h2>Cleanup</h2>
          <p className="quiet">No known caches on this drive.</p>
        </>
      )}
      {group("safe", safe)}
      {group("your-call", maybe)}
      {kept.length > 0 && (
        <details className="kept">
          <summary>
            Managed by Windows <span>{formatBytes(total(kept))}</span>
          </summary>
          <ul className="worth-list">{kept.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

function Disk({ drive }: { drive: Drive }) {
  const used = drive.total - drive.free;
  const [v, unit] = formatBytes(drive.free).split(" ");
  return (
    <section className="disk">
      <h2>
        Disk <span className="h-aside">{drive.mount.replace(/\\$/, "")}</span>
      </h2>
      <div className="disk-free">
        {v}
        <span>{unit} free</span>
      </div>
      <div className="meter disk-meter" role="meter" aria-valuemin={0} aria-valuemax={drive.total} aria-valuenow={used} aria-label="Space used">
        <i className={used / drive.total > 0.9 ? "crit" : ""} style={{ width: `${(used / Math.max(1, drive.total)) * 100}%` }} />
      </div>
      <div className="disk-foot">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(drive.total)} total</span>
      </div>
    </section>
  );
}
