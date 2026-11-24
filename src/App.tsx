import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CleanResult, CleanupItem, Drive, Progress, ScanResult, TreeNode, Verdict } from "./types";
import { formatBytes, formatCount } from "./lib";
import Treemap from "./Treemap";
import CleanupPanel from "./CleanupPanel";

type Theme = "system" | "light" | "dark";
type View = { kind: "drives" } | { kind: "scanning"; drive: Drive } | { kind: "results"; drive: Drive };

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const cycle = () => setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  return [theme, cycle];
}

export default function App() {
  const [theme, cycleTheme] = useTheme();
  const [view, setView] = useState<View>({ kind: "drives" });
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [trail, setTrail] = useState<TreeNode[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<CleanupItem[] | null>(null);
  const [cleanupErr, setCleanupErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDrives = useCallback(() => {
    invoke<Drive[]>("list_drives").then(setDrives).catch((e) => setError(String(e)));
  }, []);
  useEffect(loadDrives, [loadDrives]);

  useEffect(() => {
    const un = listen<Progress>("scan-progress", (e) => setProgress(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const loadCleanup = useCallback((drive: Drive) => {
    setCleanup(null);
    setCleanupErr(null);
    invoke<CleanupItem[]>("find_cleanup", { drive: drive.mount })
      .then(setCleanup)
      .catch((e) => setCleanupErr(String(e)));
  }, []);

  const startScan = async (drive: Drive) => {
    setError(null);
    setProgress(null);
    setResult(null);
    setView({ kind: "scanning", drive });
    try {
      const r = await invoke<ScanResult>("scan_drive", { root: drive.mount, minMb: 100 });
      setResult(r);
      setTrail([r.root]);
      setView({ kind: "results", drive });
      loadCleanup(drive);
    } catch (e) {
      setError(String(e));
      setView({ kind: "drives" });
    }
  };

  const openInExplorer = (path: string) => {
    invoke("open_in_explorer", { path }).catch((e) => setError(String(e)));
  };

  const clean = async (item: CleanupItem): Promise<string> => {
    try {
      const r = await invoke<CleanResult>("clean_item", { ruleId: item.rule.id, path: item.path });
      if (view.kind === "results") loadCleanup(view.drive);
      loadDrives();
      return `Freed ${formatBytes(r.freed)}${r.failed ? ` · ${r.failed} item(s) were in use and skipped` : ""}.`;
    } catch (e) {
      return `Couldn't clean: ${e}`;
    }
  };

  const verdicts = useMemo(() => {
    const m = new Map<string, Verdict>();
    cleanup?.forEach((c) => m.set(c.path.toLowerCase(), c.rule.verdict));
    return m;
  }, [cleanup]);
  const verdictFor = useCallback((p: string) => verdicts.get(p.toLowerCase()), [verdicts]);

  const current = trail[trail.length - 1];

  return (
    <div className="app">
      <header>
        <div className="brand" onClick={() => view.kind !== "scanning" && setView({ kind: "drives" })}>
          <span className="logo" aria-hidden /> Disk Heatmap
        </div>
        <div className="spacer" />
        {view.kind === "results" && (
          <>
            <button onClick={() => startScan(view.drive)}>Rescan</button>
            <button onClick={() => { setView({ kind: "drives" }); loadDrives(); }}>Change drive</button>
          </>
        )}
        <button className="ghost" onClick={cycleTheme} title="Theme">
          {theme === "system" ? "◐ System" : theme === "light" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {view.kind === "drives" && (
        <main className="drives">
          <h1>Which drive should we look at?</h1>
          <p className="muted">We'll map what's using space and point out what's safe to delete.</p>
          {!drives && <p className="muted">Loading drives…</p>}
          <div className="drive-list">
            {drives?.map((d) => {
              const used = d.total - d.free;
              const pct = d.total ? used / d.total : 0;
              return (
                <button key={d.mount} className="drive" onClick={() => startScan(d)}>
                  <div className="drive-top">
                    <span className="drive-letter">{d.mount.replace(/\\$/, "")}</span>
                    <span className="drive-name">{d.name || (d.removable ? "Removable drive" : "Local disk")}</span>
                    <span className="muted small">{d.fs}</span>
                  </div>
                  <div className="bar">
                    <div className={`fill ${pct > 0.9 ? "crit" : pct > 0.75 ? "warn" : ""}`} style={{ width: `${pct * 100}%` }} />
                  </div>
                  <div className="drive-bottom">
                    <span>{formatBytes(used)} used</span>
                    <span className="muted">{formatBytes(d.free)} free of {formatBytes(d.total)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      )}

      {view.kind === "scanning" && (
        <main className="scanning">
          <h1>Scanning {view.drive.mount}</h1>
          <div className="bar big">
            <div
              className="fill"
              style={{
                width: `${Math.min(100, ((progress?.bytes ?? 0) / Math.max(1, view.drive.total - view.drive.free)) * 100)}%`,
              }}
            />
          </div>
          <div className="stats">
            <div><b>{formatBytes(progress?.bytes ?? 0)}</b><span>of ~{formatBytes(view.drive.total - view.drive.free)}</span></div>
            <div><b>{formatCount(progress?.files ?? 0)}</b><span>files</span></div>
            <div><b>{formatCount(progress?.dirs ?? 0)}</b><span>folders</span></div>
            <div><b>{((progress?.elapsed_ms ?? 0) / 1000).toFixed(1)}s</b><span>elapsed</span></div>
          </div>
          <div className="current" title={progress?.current}>{progress?.current || "Starting…"}</div>
          <button onClick={() => invoke("cancel_scan")}>Stop and show results so far</button>
        </main>
      )}

      {view.kind === "results" && result && current && (
        <main className="results">
          <section className="map-area">
            <div className="crumbs">
              {trail.map((n, i) => (
                <span key={n.path}>
                  {i > 0 && <span className="sep">›</span>}
                  <button className="crumb" disabled={i === trail.length - 1} onClick={() => setTrail(trail.slice(0, i + 1))}>
                    {n.name}
                  </button>
                </span>
              ))}
              <span className="crumb-size">{formatBytes(current.size)}</span>
              <div className="spacer" />
              <button className="small" onClick={() => openInExplorer(current.path)}>Open in Explorer</button>
            </div>
            <Treemap
              node={current}
              onDrill={(c) => setTrail([...trail, c])}
              onOpen={openInExplorer}
              onHover={setHover}
              verdictFor={verdictFor}
            />
            <div className="statusbar">
              {hover ?? (
                <>
                  {result.cancelled && <b>Stopped early · </b>}
                  Scanned {formatBytes(result.root.size)} in {formatCount(result.files)} files, {(result.elapsed_ms / 1000).toFixed(1)}s
                  {result.errors > 0 && ` · ${formatCount(result.errors)} folders not readable (run as admin to include them)`}
                  {" · Showing items ≥ 100 MB · Bigger and redder = more space"}
                </>
              )}
            </div>
          </section>
          <CleanupPanel items={cleanup} error={cleanupErr} onOpen={openInExplorer} onClean={clean} />
        </main>
      )}
    </div>
  );
}
