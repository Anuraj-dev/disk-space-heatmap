import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CleanResult, CleanupItem, Drive, Progress, ScanResult, TreeNode, Verdict } from "./types";
import { CATEGORIES, CATEGORY_LABEL, classify, findChain, formatBytes, formatCompact, formatCount, type Category } from "./lib";
import Treemap, { type Focus } from "./Treemap";
import Panel from "./Panel";
import * as I from "./icons";

const MIN_MB = 100;
const FLOOR = MIN_MB * 1024 * 1024;
const MIN_DEPTH = 1;
const MAX_DEPTH = 6;

type Theme = "system" | "light" | "dark";
type View = { kind: "drives" } | { kind: "scanning"; drive: Drive } | { kind: "results"; drive: Drive };

function useStored<T extends string | number>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return (typeof initial === "number" ? Number(raw) : raw) as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* storage unavailable: keep in memory */
    }
  }, [key, v]);
  return [v, setV];
}

/** Browser-style history over trails (scan root → folder on screen). */
function useTrailHistory() {
  const [h, setH] = useState<{ stack: TreeNode[][]; i: number }>({ stack: [], i: -1 });
  const go = useCallback(
    (trail: TreeNode[]) =>
      setH((h) => {
        const cur = h.stack[h.i];
        if (cur && cur[cur.length - 1] === trail[trail.length - 1]) return h;
        return { stack: [...h.stack.slice(0, h.i + 1), trail], i: h.i + 1 };
      }),
    [],
  );
  const reset = useCallback((trail: TreeNode[]) => setH({ stack: [trail], i: 0 }), []);
  const back = useCallback(() => setH((h) => (h.i > 0 ? { ...h, i: h.i - 1 } : h)), []);
  const forward = useCallback(() => setH((h) => (h.i < h.stack.length - 1 ? { ...h, i: h.i + 1 } : h)), []);
  return {
    trail: h.stack[h.i] ?? [],
    canBack: h.i > 0,
    canForward: h.i < h.stack.length - 1,
    go,
    reset,
    back,
    forward,
  };
}

export default function App() {
  const [theme, setTheme] = useStored<Theme>("theme", "system");
  const [depth, setDepth] = useStored<number>("depth", 3);
  const [view, setView] = useState<View>({ kind: "drives" });
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [cleanup, setCleanup] = useState<CleanupItem[] | null>(null);
  const [cleanupErr, setCleanupErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<{ version: string; installing: boolean } | null>(null);
  const nav = useTrailHistory();
  const { trail } = nav;
  const current = trail[trail.length - 1];

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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

  // A verified update downloads in the background; ask too, in case it
  // finished before this listener existed.
  useEffect(() => {
    const ready = (version: string | null) => version && setUpdate((u) => u ?? { version, installing: false });
    const un = listen<string>("update-ready", (e) => ready(e.payload));
    invoke<string | null>("pending_update").then(ready).catch(() => {});
    return () => {
      un.then((f) => f());
    };
  }, []);

  const installUpdate = () => {
    if (!update) return;
    setUpdate({ ...update, installing: true });
    // On success the installer closes this window, so only failure returns.
    invoke("install_update").catch((e) => {
      setUpdate({ ...update, installing: false });
      setError(String(e));
    });
  };

  const loadCleanup = useCallback((drive: Drive) => {
    setCleanup(null);
    setCleanupErr(null);
    invoke<CleanupItem[]>("find_cleanup", { drive: drive.mount })
      .then(setCleanup)
      .catch((e) => setCleanupErr(String(e)));
  }, []);

  const startScan = async (drive: Drive) => {
    // A rescan comes back to the same folder when it still exists.
    const keepPath = view.kind === "results" && current ? current.path : null;
    setError(null);
    setProgress(null);
    setResult(null);
    setFocus(null);
    setView({ kind: "scanning", drive });
    try {
      const r = await invoke<ScanResult>("scan_drive", { root: drive.mount, minMb: MIN_MB });
      setResult(r);
      nav.reset((keepPath && findChain(r.root, keepPath)) || [r.root]);
      setView({ kind: "results", drive });
      loadCleanup(drive);
    } catch (e) {
      setError(String(e));
      setView({ kind: "drives" });
    }
  };

  const reveal = useCallback((path: string) => {
    invoke("open_in_explorer", { path }).catch((e) => setError(String(e)));
  }, []);

  const clean = async (item: CleanupItem): Promise<string> => {
    try {
      const r = await invoke<CleanResult>("clean_item", { ruleId: item.rule.id, path: item.path });
      if (view.kind === "results") loadCleanup(view.drive);
      loadDrives();
      return `Freed ${formatBytes(r.freed)}.${r.failed ? ` ${formatCount(r.failed)} in-use items were skipped.` : ""}`;
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

  // Category and verdict of the folder on screen, from the scan root down.
  const [currentCat, currentVerdict] = useMemo((): [Category, Verdict | undefined] => {
    let cat: Category = "other";
    let v: Verdict | undefined;
    for (const n of trail) {
      cat = classify(n, cat);
      v = verdictFor(n.path) ?? v;
    }
    return [cat, v];
  }, [trail, verdictFor]);

  // Leaving a folder drops whatever was pointed at inside it.
  useEffect(() => setFocus(null), [current]);

  const drill = useCallback((chain: TreeNode[]) => nav.go(chain), [nav.go]);
  const up = useCallback(() => {
    if (trail.length > 1) nav.go(trail.slice(0, -1));
  }, [trail, nav.go]);

  // Mouse side buttons, Alt+arrows and the browser keys move through history, as in Chrome.
  useEffect(() => {
    if (view.kind !== "results") return;
    const isSide = (e: MouseEvent) => e.button === 3 || e.button === 4;
    // Swallow the press too, or WebView2 runs its own (empty) history navigation.
    const down = (e: MouseEvent) => isSide(e) && e.preventDefault();
    const release = (e: MouseEvent) => {
      if (!isSide(e)) return;
      e.preventDefault();
      if (e.button === 3) nav.back();
      else nav.forward();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.altKey && e.key === "ArrowLeft") || e.key === "BrowserBack") nav.back();
      else if ((e.altKey && e.key === "ArrowRight") || e.key === "BrowserForward") nav.forward();
      else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) up();
      else if (e.key === "[") setDepth((d) => Math.max(MIN_DEPTH, d - 1));
      else if (e.key === "]") setDepth((d) => Math.min(MAX_DEPTH, d + 1));
      else if (e.key === "Escape") setFocus(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", release);
    window.addEventListener("auxclick", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", release);
      window.removeEventListener("auxclick", down);
      window.removeEventListener("keydown", key);
    };
  }, [view.kind, nav.back, nav.forward, up, setDepth]);

  const liveDrive = (d: Drive) => drives?.find((x) => x.mount === d.mount) ?? d;
  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const themeName: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

  return (
    <div className="app">
      <header className="top">
        <button
          className="brand"
          disabled={view.kind === "scanning"}
          onClick={() => {
            setView({ kind: "drives" });
            loadDrives();
          }}
          title="Choose a drive"
        >
          <I.Mark /> Disk Heatmap
        </button>

        {view.kind === "results" && current && (
          <>
            <nav className="history" aria-label="History">
              <button className="icon" onClick={nav.back} disabled={!nav.canBack} title="Back (Alt+←, mouse back button)" aria-label="Back">
                <I.Back />
              </button>
              <button className="icon" onClick={nav.forward} disabled={!nav.canForward} title="Forward (Alt+→, mouse forward button)" aria-label="Forward">
                <I.Forward />
              </button>
              <button className="icon" onClick={up} disabled={trail.length < 2} title="Up to parent folder (Backspace)" aria-label="Up">
                <I.Up />
              </button>
            </nav>
            <ol className="crumbs" aria-label="Location">
              {trail.map((n, i) => {
                const last = i === trail.length - 1;
                return (
                  <li key={n.path}>
                    {i > 0 && <I.Chevron />}
                    <button
                      className="crumb"
                      aria-current={last ? "location" : undefined}
                      disabled={last}
                      onClick={() => nav.go(trail.slice(0, i + 1))}
                    >
                      {i === 0 ? n.name.replace(/[\\/]$/, "") : n.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="spacer" />

        {view.kind === "results" && (
          <>
            <div className="depth" role="group" aria-label="Nesting depth">
              <span className="depth-label">Depth</span>
              <button className="icon sm" onClick={() => setDepth((d) => Math.max(MIN_DEPTH, d - 1))} disabled={depth <= MIN_DEPTH} title="Fewer levels ( [ )" aria-label="Fewer levels">
                <I.Minus />
              </button>
              <output aria-live="polite">{depth}</output>
              <button className="icon sm" onClick={() => setDepth((d) => Math.min(MAX_DEPTH, d + 1))} disabled={depth >= MAX_DEPTH} title="More levels ( ] )" aria-label="More levels">
                <I.Plus />
              </button>
            </div>
            <button className="tool" onClick={() => startScan(view.drive)} title="Scan this drive again">
              <I.Rescan /> Rescan
            </button>
          </>
        )}
        {update && (
          <button
            className="tool update"
            onClick={installUpdate}
            disabled={update.installing || view.kind === "scanning"}
            title="Install the new version and restart Disk Heatmap"
          >
            {update.installing ? "Updating…" : `Update to ${update.version}`}
          </button>
        )}
        <button
          className="icon"
          onClick={() => setTheme(nextTheme[theme])}
          title={`Theme: ${themeName[theme]} (click for ${themeName[nextTheme[theme]]})`}
          aria-label={`Theme: ${themeName[theme]}`}
        >
          {theme === "system" ? <I.System /> : theme === "light" ? <I.Sun /> : <I.Moon />}
        </button>
      </header>

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {view.kind === "drives" && (
        <main className="drives">
          <h1>Choose a drive to map</h1>
          {!drives && <ul className="drive-list" aria-busy="true">{[0, 1].map((i) => <li key={i} className="skeleton drive-skel" />)}</ul>}
          <ul className="drive-list">
            {drives?.map((d) => {
              const used = d.total - d.free;
              const pct = d.total ? used / d.total : 0;
              return (
                <li key={d.mount}>
                  <button className="drive" onClick={() => startScan(d)}>
                    <span className="drive-letter">{d.mount.replace(/\\$/, "")}</span>
                    <span className="drive-name">
                      {d.name || (d.removable ? "Removable drive" : "Local disk")}
                      <span>{d.fs}</span>
                    </span>
                    <span className="drive-free">
                      <b>{formatBytes(d.free)}</b> free of {formatBytes(d.total)}
                    </span>
                    <span className="meter">
                      <i className={pct > 0.9 ? "crit" : ""} style={{ width: `${pct * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </main>
      )}

      {view.kind === "scanning" && (
        <main className="scanning">
          <h1>
            Scanning {view.drive.mount}
          </h1>
          <div className="scan-big">
            {formatBytes(progress?.bytes ?? 0)}
            <span>of about {formatBytes(view.drive.total - view.drive.free)}</span>
          </div>
          <div className="meter big">
            <i
              style={{
                width: `${Math.min(100, ((progress?.bytes ?? 0) / Math.max(1, view.drive.total - view.drive.free)) * 100)}%`,
              }}
            />
          </div>
          <dl className="scan-stats">
            <div><dt>Files</dt><dd>{formatCount(progress?.files ?? 0)}</dd></div>
            <div><dt>Folders</dt><dd>{formatCount(progress?.dirs ?? 0)}</dd></div>
            <div><dt>Elapsed</dt><dd>{((progress?.elapsed_ms ?? 0) / 1000).toFixed(1)} s</dd></div>
          </dl>
          <div className="scan-path" title={progress?.current}>{progress?.current || "Starting…"}</div>
          <button onClick={() => invoke("cancel_scan")}>Stop and show results so far</button>
        </main>
      )}

      {view.kind === "results" && result && current && (
        <main className="results">
          <section className="map-area">
            <div className="sub">
              <span className="sub-stats">
                <b>{formatBytes(current.size)}</b>
                <span>{formatCompact(current.files)} files</span>
                <span>scanned in {(result.elapsed_ms / 1000).toFixed(1)} s</span>
                {result.cancelled && <span className="warn">stopped early</span>}
                {result.errors > 0 && (
                  <span className="warn" title="Run as administrator to include them">
                    {formatCount(result.errors)} folders unreadable
                  </span>
                )}
              </span>
              <ul className="legend" aria-label="Legend">
                <li><i className="swatch reclaim-key" />Reclaimable</li>
                {CATEGORIES.filter((c) => c !== "other").map((c) => (
                  <li key={c}><i className={`swatch c-${c}`} />{CATEGORY_LABEL[c]}</li>
                ))}
              </ul>
            </div>
            <Treemap
              trail={trail}
              depth={depth}
              floor={FLOOR}
              rootCategory={currentCat}
              verdictFor={verdictFor}
              onDrill={drill}
              onFocus={setFocus}
              onReveal={reveal}
            />
          </section>
          <Panel
            current={current}
            currentCategory={currentCat}
            currentVerdict={currentVerdict}
            focus={focus}
            scanTotal={result.root.size}
            drive={liveDrive(view.drive)}
            items={cleanup}
            itemsError={cleanupErr}
            onDrill={drill}
            onReveal={reveal}
            onClean={clean}
          />
        </main>
      )}
    </div>
  );
}
