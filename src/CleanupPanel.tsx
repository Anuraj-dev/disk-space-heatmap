import { useState } from "react";
import type { CleanupItem, Verdict } from "./types";
import { formatBytes } from "./lib";

interface Props {
  items: CleanupItem[] | null;
  error: string | null;
  onOpen: (path: string) => void;
  onClean: (item: CleanupItem) => Promise<string>;
}

const ORDER: Verdict[] = ["safe", "your-call", "keep"];
const HEADINGS: Record<Verdict, string> = {
  safe: "Safe to clean",
  "your-call": "Your call",
  keep: "Keep (managed by Windows)",
};

export default function CleanupPanel({ items, error, onOpen, onClean }: Props) {
  const [confirm, setConfirm] = useState<CleanupItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <aside className="panel"><p className="error">{error}</p></aside>;
  if (!items) return <aside className="panel"><p className="muted">Checking known caches…</p></aside>;

  const safeTotal = items.filter((i) => i.can_delete).reduce((s, i) => s + i.size, 0);

  const doClean = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      setMessage(await onClean(confirm));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <aside className="panel">
      <div className="panel-head">
        <h2>Cleanup advice</h2>
        <div className="safe-total">
          <span className="big">{formatBytes(safeTotal)}</span> safe to free
        </div>
      </div>
      {message && (
        <div className="toast" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
      {items.length === 0 && <p className="muted">None of the known caches were found on this drive.</p>}
      {ORDER.map((v) => {
        const group = items.filter((i) => i.rule.verdict === v);
        if (!group.length) return null;
        return (
          <section key={v}>
            <h3 className={`group v-${v}`}>{HEADINGS[v]}</h3>
            {group.map((i) => (
              <article key={i.path} className={`card v-${v}`}>
                <div className="card-top">
                  <div>
                    <div className="title">{i.rule.title}</div>
                    <div className="app">{i.rule.app}</div>
                  </div>
                  <div className="card-size">{formatBytes(i.size)}</div>
                </div>
                <p>{i.rule.explanation}</p>
                <details>
                  <summary>How to free it</summary>
                  <p>{i.rule.how_to_free}</p>
                </details>
                <div className="path" title={i.path}>{i.path}</div>
                <div className="actions">
                  <button onClick={() => onOpen(i.path)}>Open in Explorer</button>
                  {i.can_delete && i.size > 0 && (
                    <button className="danger" onClick={() => setConfirm(i)}>
                      {i.rule.action === "empty_recycle_bin" ? "Empty bin…" : "Clean…"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        );
      })}

      {confirm && (
        <div className="modal-back" onClick={() => !busy && setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm.rule.action === "empty_recycle_bin" ? "Empty the Recycle Bin?" : "Delete these files?"}</h3>
            <p>
              This permanently deletes <b>{formatBytes(confirm.size)}</b> ({confirm.files.toLocaleString()} files) from:
            </p>
            <div className="path">{confirm.path}</div>
            <p className="muted">
              {confirm.rule.action === "empty_recycle_bin"
                ? "Items in the bin can't be restored afterwards."
                : "The folder itself is kept; only its contents are removed. Files in use are skipped. This can't be undone."}
            </p>
            <div className="actions end">
              <button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
              <button className="danger" disabled={busy} onClick={doClean}>
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
