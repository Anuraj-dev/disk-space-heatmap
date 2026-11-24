//! Self-update from GitHub Releases.
//!
//! At start, a release build fetches the latest release's `latest.json`. It
//! downloads a newer installer in the background (the plugin checks the
//! installer's signature against `plugins.updater.pubkey`) and tells the
//! window, which then shows "Update to X.Y.Z". Clicking that runs the
//! installer, which closes the app and relaunches it.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Emitted with the version once an update is downloaded and verified.
pub const UPDATE_READY: &str = "update-ready";

/// A downloaded, signature-verified installer waiting for the user.
struct Ready {
    update: Update,
    bytes: Vec<u8>,
}

#[derive(Default)]
pub struct UpdaterState {
    ready: Mutex<Option<Ready>>,
}

/// One check per launch: the app is opened for a scan, not left running.
/// Debug builds never check, so `tauri dev` does not fetch installers.
pub fn start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // No network or no release yet is not worth telling the user about.
        if let Err(error) = check(&app).await {
            eprintln!("update check failed: {error}");
        }
    });
}

async fn check(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    let version = update.version.clone();
    *app.state::<UpdaterState>().ready.lock().unwrap() = Some(Ready { update, bytes });
    let _ = app.emit(UPDATE_READY, &version);
    Ok(())
}

/// The downloaded update's version, if one waits. The window asks on load
/// in case the event fired before it was listening.
pub fn pending_version(app: &AppHandle) -> Option<String> {
    let state = app.state::<UpdaterState>();
    let ready = state.ready.lock().unwrap();
    ready.as_ref().map(|ready| ready.update.version.clone())
}

/// Runs the downloaded installer, which ends this process and relaunches
/// the new version. Does nothing when no update waits. A failed start
/// keeps the update so the button can retry.
pub fn install(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<UpdaterState>();
    let Some(ready) = state.ready.lock().unwrap().take() else {
        return Ok(());
    };
    if let Err(error) = ready.update.install(&ready.bytes) {
        eprintln!("update install failed: {error}");
        state.ready.lock().unwrap().get_or_insert(ready);
        return Err("The update couldn't start. Try again, or restart Disk Heatmap.".into());
    }
    Ok(())
}
