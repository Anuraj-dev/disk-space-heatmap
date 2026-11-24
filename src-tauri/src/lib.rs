mod drives;
mod rules;
mod scan;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct AppState {
    current_scan: Mutex<Option<Arc<scan::Counters>>>,
}

#[derive(Serialize, Clone)]
struct Progress {
    files: u64,
    dirs: u64,
    bytes: u64,
    errors: u64,
    current: String,
    elapsed_ms: u64,
}

#[derive(Serialize)]
struct ScanResult {
    root: scan::Node,
    files: u64,
    dirs: u64,
    errors: u64,
    elapsed_ms: u64,
    cancelled: bool,
}

#[tauri::command]
fn list_drives() -> Vec<drives::DriveInfo> {
    drives::list()
}

#[tauri::command]
async fn scan_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    root: String,
    min_mb: Option<u64>,
) -> Result<ScanResult, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("{root} is not a folder"));
    }
    let min = min_mb.unwrap_or(100) * 1024 * 1024;
    let counters = Arc::new(scan::Counters::default());
    *state.current_scan.lock().unwrap() = Some(counters.clone());

    // Progress emitter: ~8 updates per second.
    let done = Arc::new(AtomicBool::new(false));
    let start = Instant::now();
    {
        let (c, done, app) = (counters.clone(), done.clone(), app.clone());
        std::thread::spawn(move || {
            while !done.load(Relaxed) {
                std::thread::sleep(Duration::from_millis(125));
                let p = Progress {
                    files: c.files.load(Relaxed),
                    dirs: c.dirs.load(Relaxed),
                    bytes: c.bytes.load(Relaxed),
                    errors: c.errors.load(Relaxed),
                    current: c.current.lock().map(|s| s.clone()).unwrap_or_default(),
                    elapsed_ms: start.elapsed().as_millis() as u64,
                };
                let _ = app.emit("scan-progress", p);
            }
        });
    }

    let c = counters.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // Deep folder trees recurse; give worker threads generous stacks.
        let pool = rayon::ThreadPoolBuilder::new()
            .stack_size(16 * 1024 * 1024)
            .build()
            .map_err(|e| e.to_string())?;
        let mut node = pool.install(|| scan::scan_dir(&root_path, min, &c));
        node.name = root_path.to_string_lossy().into_owned();
        Ok::<_, String>(node)
    })
    .await
    .map_err(|e| e.to_string());
    done.store(true, Relaxed);
    *state.current_scan.lock().unwrap() = None;

    let root = result??;
    Ok(ScanResult {
        root,
        files: counters.files.load(Relaxed),
        dirs: counters.dirs.load(Relaxed),
        errors: counters.errors.load(Relaxed),
        elapsed_ms: start.elapsed().as_millis() as u64,
        cancelled: counters.cancel.load(Relaxed),
    })
}

#[tauri::command]
fn cancel_scan(state: State<'_, AppState>) {
    if let Some(c) = state.current_scan.lock().unwrap().as_ref() {
        c.cancel.store(true, Relaxed);
    }
}

#[tauri::command]
async fn find_cleanup(drive: String) -> Result<Vec<rules::CleanupItem>, String> {
    tauri::async_runtime::spawn_blocking(move || rules::find(&drive))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clean_item(rule_id: String, path: String) -> Result<rules::CleanResult, String> {
    tauri::async_runtime::spawn_blocking(move || rules::clean(&rule_id, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if std::fs::symlink_metadata(p).is_err() && !p.exists() {
        return Err("That path no longer exists".into());
    }
    let mut cmd = std::process::Command::new("explorer.exe");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if p.is_dir() {
            cmd.raw_arg(format!("\"{path}\""));
        } else {
            cmd.raw_arg(format!("/select,\"{path}\""));
        }
    }
    #[cfg(not(windows))]
    cmd.arg(&path);
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_drives,
            scan_drive,
            cancel_scan,
            find_cleanup,
            clean_item,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running Disk Heatmap");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_and_finds_rules() {
        let c = scan::Counters::default();
        let t = Instant::now();
        let home = std::env::var("USERPROFILE").unwrap();
        let root = scan::scan_dir(Path::new(&home), 100 * 1024 * 1024, &c);
        println!("scanned {} in {:?}: {} bytes, {} files, {} errors, {} big children",
            root.path, t.elapsed(), root.size, root.files, c.errors.load(Relaxed), root.children.len());
        for ch in root.children.iter().take(5) { println!("  {:>12} {}", ch.size, ch.name); }
        let kids: u64 = root.children.iter().map(|c| c.size).sum();
        assert_eq!(kids + root.other, root.size);
        for i in rules::find("C:") {
            println!("rule {:<16} {:<10} {:>14} {}", i.rule.id, i.rule.verdict, i.size, i.path);
        }
    }
}
